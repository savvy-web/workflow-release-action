import { existsSync, readFileSync } from "node:fs";
import * as exec from "@actions/exec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CycloneDXDocument } from "../src/utils/create-attestation.js";
import { enhanceSBOMMetadata, enhanceSBOMWithMetadata, generatePurl } from "../src/utils/enhance-sbom-metadata.js";

// Type for exec options with listeners
interface ExecOptionsWithListeners {
	silent?: boolean;
	ignoreReturnCode?: boolean;
	listeners?: {
		stdout?: (data: Buffer) => void;
		stderr?: (data: Buffer) => void;
	};
}

// Mock modules
vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn(),
}));

vi.mock("@actions/exec");
vi.mock("@actions/core", () => ({
	debug: vi.fn(),
	info: vi.fn(),
	warning: vi.fn(),
}));

describe("enhance-sbom-metadata", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("generatePurl", () => {
		it("should generate PURL for unscoped package", () => {
			const result = generatePurl("my-package", "1.0.0");
			expect(result).toBe("pkg:npm/my-package@1.0.0");
		});

		it("should generate PURL for scoped package", () => {
			const result = generatePurl("@org/my-package", "1.0.0");
			expect(result).toBe("pkg:npm/%40org/my-package@1.0.0");
		});

		it("should handle prerelease versions", () => {
			const result = generatePurl("my-package", "1.0.0-beta.1");
			expect(result).toBe("pkg:npm/my-package@1.0.0-beta.1");
		});
	});

	describe("enhanceSBOMMetadata", () => {
		const baseSBOM: CycloneDXDocument = {
			bomFormat: "CycloneDX",
			specVersion: "1.5",
			version: 1,
			metadata: {
				timestamp: "2024-01-15T10:00:00.000Z",
				component: {
					name: "test-package",
					version: "1.0.0",
				},
			},
			components: [{ type: "library", name: "dep-a", version: "1.0.0" }],
		};

		it("should enhance SBOM with basic metadata", async () => {
			// No config file, no package.json metadata
			vi.mocked(existsSync).mockReturnValue(false);

			// npm view returns 404 (new package)
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
				options?.listeners?.stderr?.(Buffer.from("E404"));
				return 1;
			});

			const result = await enhanceSBOMMetadata(baseSBOM, {
				packageName: "test-package",
				packageVersion: "1.0.0",
				packageDirectory: "/path/to/package",
			});

			expect(result.bomFormat).toBe("CycloneDX");
			expect(result.metadata?.component?.name).toBe("test-package");
			expect(result.metadata?.component?.version).toBe("1.0.0");
			expect(result.metadata?.component?.purl).toBe("pkg:npm/test-package@1.0.0");
			expect(result.metadata?.timestamp).toBe("2024-01-15T10:00:00.000Z");
		});

		it("should add timestamp if missing", async () => {
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
				options?.listeners?.stderr?.(Buffer.from("E404"));
				return 1;
			});

			const sbomWithoutTimestamp: CycloneDXDocument = {
				...baseSBOM,
				metadata: {
					component: { name: "test", version: "1.0.0" },
				},
			};

			const result = await enhanceSBOMMetadata(sbomWithoutTimestamp, {
				packageName: "test-package",
				packageVersion: "1.0.0",
				packageDirectory: "/path/to/package",
			});

			expect(result.metadata?.timestamp).toBeDefined();
			const timestamp = result.metadata?.timestamp ?? "";
			expect(new Date(timestamp).toString()).not.toBe("Invalid Date");
		});

		it("should add supplier from config", async () => {
			// Config file exists with supplier
			vi.mocked(existsSync).mockImplementation((path) => {
				return String(path).includes("silk-release.json") || String(path).endsWith("package.json");
			});
			vi.mocked(readFileSync).mockImplementation((path) => {
				if (String(path).includes("silk-release.json")) {
					return JSON.stringify({
						sbom: {
							supplier: {
								name: "My Company",
								url: "https://mycompany.com",
								contact: { email: "security@mycompany.com" },
							},
						},
					});
				}
				return JSON.stringify({ name: "test-package", version: "1.0.0" });
			});
			vi.mocked(exec.exec).mockResolvedValue(0);

			const result = await enhanceSBOMMetadata(baseSBOM, {
				packageName: "test-package",
				packageVersion: "1.0.0",
				packageDirectory: "/path/to/package",
				rootDirectory: "/path/to/repo",
			});

			expect(result.metadata?.supplier?.name).toBe("My Company");
			expect(result.metadata?.supplier?.url).toEqual(["https://mycompany.com"]);
			expect(result.metadata?.supplier?.contact).toEqual([
				{ email: "security@mycompany.com", name: undefined, phone: undefined },
			]);
		});

		it("should infer metadata from package.json", async () => {
			vi.mocked(existsSync).mockImplementation((path) => {
				return String(path).endsWith("package.json");
			});
			vi.mocked(readFileSync).mockReturnValue(
				JSON.stringify({
					name: "test-package",
					version: "1.0.0",
					author: "John Doe <john@example.com>",
					repository: "https://github.com/owner/repo",
					bugs: "https://github.com/owner/repo/issues",
					homepage: "https://docs.example.com",
				}),
			);
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
				options?.listeners?.stderr?.(Buffer.from("E404"));
				return 1;
			});

			const result = await enhanceSBOMMetadata(baseSBOM, {
				packageName: "test-package",
				packageVersion: "1.0.0",
				packageDirectory: "/path/to/package",
			});

			expect(result.metadata?.component?.publisher).toBe("John Doe");
			// Check external references
			const refs = result.metadata?.component?.externalReferences;
			expect(refs).toContainEqual({ type: "vcs", url: "https://github.com/owner/repo" });
			expect(refs).toContainEqual({ type: "issue-tracker", url: "https://github.com/owner/repo/issues" });
			expect(refs).toContainEqual({ type: "documentation", url: "https://docs.example.com" });
		});

		it("should use pre-loaded config", async () => {
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
				options?.listeners?.stderr?.(Buffer.from("E404"));
				return 1;
			});

			const result = await enhanceSBOMMetadata(baseSBOM, {
				packageName: "test-package",
				packageVersion: "1.0.0",
				packageDirectory: "/path/to/package",
				sbomConfig: {
					supplier: { name: "Pre-loaded Company" },
				},
			});

			expect(result.metadata?.supplier?.name).toBe("Pre-loaded Company");
		});

		it("should detect copyright year from npm registry", async () => {
			vi.mocked(existsSync).mockImplementation((path) => String(path).endsWith("package.json"));
			vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ name: "test", version: "1.0.0" }));
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
				options?.listeners?.stdout?.(Buffer.from(JSON.stringify({ created: "2022-01-15T10:00:00.000Z" })));
				return 0;
			});

			const currentYear = new Date().getFullYear();
			const result = await enhanceSBOMMetadata(baseSBOM, {
				packageName: "test-package",
				packageVersion: "1.0.0",
				packageDirectory: "/path/to/package",
				sbomConfig: {
					copyright: { holder: "Test Company" },
				},
			});

			expect(result.metadata?.component?.copyright).toBe(`Copyright 2022-${currentYear} Test Company`);
		});

		it("should add tools metadata for NTIA compliance", async () => {
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
				options?.listeners?.stderr?.(Buffer.from("E404"));
				return 1;
			});

			const sbomWithoutTools: CycloneDXDocument = {
				...baseSBOM,
				metadata: {
					component: { name: "test", version: "1.0.0" },
				},
			};

			const result = await enhanceSBOMMetadata(sbomWithoutTools, {
				packageName: "test-package",
				packageVersion: "1.0.0",
				packageDirectory: "/path/to/package",
			});

			expect(result.metadata?.tools?.components).toBeDefined();
			expect(result.metadata?.tools?.components).toContainEqual({
				type: "application",
				name: "workflow-release-action",
				version: "1.0.0",
			});
		});

		it("should preserve existing tools metadata", async () => {
			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
				options?.listeners?.stderr?.(Buffer.from("E404"));
				return 1;
			});

			const sbomWithTools: CycloneDXDocument = {
				...baseSBOM,
				metadata: {
					component: { name: "test", version: "1.0.0" },
					tools: {
						components: [{ type: "application", name: "cdxgen", version: "10.0.0" }],
					},
				},
			} as CycloneDXDocument;

			const result = await enhanceSBOMMetadata(sbomWithTools, {
				packageName: "test-package",
				packageVersion: "1.0.0",
				packageDirectory: "/path/to/package",
			});

			// Should preserve existing tools
			expect(result.metadata?.tools?.components).toContainEqual({
				type: "application",
				name: "cdxgen",
				version: "10.0.0",
			});
		});
	});

	describe("enhanceSBOMWithMetadata", () => {
		const baseSBOM: CycloneDXDocument = {
			bomFormat: "CycloneDX",
			specVersion: "1.5",
			version: 1,
			metadata: {
				component: {
					name: "test-package",
					version: "1.0.0",
				},
			},
			components: [],
		};

		it("should enhance SBOM with resolved metadata", () => {
			const metadata = {
				supplier: {
					name: "Test Company",
					url: ["https://test.com"],
				},
				component: {
					publisher: "Test Publisher",
					copyright: "Copyright 2024 Test Company",
					externalReferences: [{ type: "vcs" as const, url: "https://github.com/test/repo" }],
				},
			};

			const result = enhanceSBOMWithMetadata(baseSBOM, "test-package", "1.0.0", metadata);

			expect(result.metadata?.supplier?.name).toBe("Test Company");
			expect(result.metadata?.component?.publisher).toBe("Test Publisher");
			expect(result.metadata?.component?.copyright).toBe("Copyright 2024 Test Company");
			expect(result.metadata?.component?.purl).toBe("pkg:npm/test-package@1.0.0");
		});

		it("should add timestamp if missing", () => {
			const result = enhanceSBOMWithMetadata(baseSBOM, "test-package", "1.0.0", {});

			expect(result.metadata?.timestamp).toBeDefined();
		});

		it("should preserve existing timestamp", () => {
			const sbomWithTimestamp: CycloneDXDocument = {
				...baseSBOM,
				metadata: {
					...baseSBOM.metadata,
					timestamp: "2024-01-15T10:00:00.000Z",
				},
			};

			const result = enhanceSBOMWithMetadata(sbomWithTimestamp, "test-package", "1.0.0", {});

			expect(result.metadata?.timestamp).toBe("2024-01-15T10:00:00.000Z");
		});

		it("should merge external references without duplicates", () => {
			const sbomWithRefs: CycloneDXDocument = {
				...baseSBOM,
				metadata: {
					component: {
						name: "test",
						version: "1.0.0",
						externalReferences: [{ type: "vcs", url: "https://github.com/test/repo" }],
					},
				},
			} as CycloneDXDocument;

			const metadata = {
				component: {
					externalReferences: [
						{ type: "vcs" as const, url: "https://github.com/test/repo" }, // duplicate
						{ type: "documentation" as const, url: "https://docs.test.com" }, // new
					],
				},
			};

			const result = enhanceSBOMWithMetadata(sbomWithRefs, "test-package", "1.0.0", metadata);

			const refs = result.metadata?.component?.externalReferences;
			expect(refs?.filter((r) => r.type === "vcs")).toHaveLength(1);
			expect(refs).toContainEqual({ type: "documentation", url: "https://docs.test.com" });
		});

		it("should handle empty metadata", () => {
			const result = enhanceSBOMWithMetadata(baseSBOM, "test-package", "1.0.0", {});

			expect(result.metadata?.component?.name).toBe("test-package");
			expect(result.metadata?.component?.version).toBe("1.0.0");
			expect(result.metadata?.component?.purl).toBe("pkg:npm/test-package@1.0.0");
		});

		it("should set type to library by default", () => {
			const result = enhanceSBOMWithMetadata(baseSBOM, "test-package", "1.0.0", {});

			expect(result.metadata?.component?.type).toBe("library");
		});

		it("should preserve existing component type", () => {
			const sbomWithType: CycloneDXDocument = {
				...baseSBOM,
				metadata: {
					component: {
						name: "test",
						version: "1.0.0",
						type: "application",
					},
				},
			} as CycloneDXDocument;

			const result = enhanceSBOMWithMetadata(sbomWithType, "test-package", "1.0.0", {});

			expect(result.metadata?.component?.type).toBe("application");
		});
	});
});
