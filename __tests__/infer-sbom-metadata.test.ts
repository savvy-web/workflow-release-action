import { existsSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	formatCopyright,
	inferSBOMMetadata,
	parseAuthor,
	parseBugs,
	parseRepository,
	resolveSBOMMetadata,
} from "../src/utils/infer-sbom-metadata.js";

// Mock fs modules
vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn(),
}));

vi.mock("@actions/core", () => ({
	debug: vi.fn(),
	info: vi.fn(),
	warning: vi.fn(),
}));

describe("infer-sbom-metadata", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("parseAuthor", () => {
		it("should parse author object with name and email", () => {
			const result = parseAuthor({
				name: "John Doe",
				email: "john@example.com",
			});
			expect(result).toEqual({
				name: "John Doe",
				email: "john@example.com",
			});
		});

		it("should parse author string with name and email", () => {
			const result = parseAuthor("John Doe <john@example.com>");
			expect(result).toEqual({
				name: "John Doe",
				email: "john@example.com",
			});
		});

		it("should parse author string with name only", () => {
			const result = parseAuthor("John Doe");
			expect(result).toEqual({
				name: "John Doe",
				email: undefined,
			});
		});

		it("should parse author string with email only", () => {
			const result = parseAuthor("<john@example.com>");
			expect(result).toEqual({
				name: undefined,
				email: "john@example.com",
			});
		});

		it("should parse author string with name, email, and URL", () => {
			const result = parseAuthor("John Doe <john@example.com> (https://johndoe.com)");
			expect(result).toEqual({
				name: "John Doe",
				email: "john@example.com",
			});
		});

		it("should handle undefined author", () => {
			const result = parseAuthor(undefined);
			expect(result).toEqual({});
		});

		it("should handle empty author object", () => {
			const result = parseAuthor({});
			expect(result).toEqual({
				name: undefined,
				email: undefined,
			});
		});
	});

	describe("parseRepository", () => {
		it("should parse repository object with URL", () => {
			const result = parseRepository({
				type: "git",
				url: "https://github.com/owner/repo.git",
			});
			expect(result).toBe("https://github.com/owner/repo");
		});

		it("should parse repository string", () => {
			const result = parseRepository("https://github.com/owner/repo");
			expect(result).toBe("https://github.com/owner/repo");
		});

		it("should normalize git+https URL", () => {
			const result = parseRepository("git+https://github.com/owner/repo.git");
			expect(result).toBe("https://github.com/owner/repo");
		});

		it("should normalize git:// URL", () => {
			const result = parseRepository("git://github.com/owner/repo.git");
			expect(result).toBe("https://github.com/owner/repo");
		});

		it("should normalize git@host:path URL", () => {
			const result = parseRepository("git@github.com:owner/repo.git");
			expect(result).toBe("https://github.com/owner/repo");
		});

		it("should handle undefined repository", () => {
			const result = parseRepository(undefined);
			expect(result).toBeUndefined();
		});

		it("should handle repository object without URL", () => {
			const result = parseRepository({ type: "git" });
			expect(result).toBeUndefined();
		});
	});

	describe("parseBugs", () => {
		it("should parse bugs object with URL", () => {
			const result = parseBugs({
				url: "https://github.com/owner/repo/issues",
			});
			expect(result).toBe("https://github.com/owner/repo/issues");
		});

		it("should parse bugs string", () => {
			const result = parseBugs("https://github.com/owner/repo/issues");
			expect(result).toBe("https://github.com/owner/repo/issues");
		});

		it("should handle undefined bugs", () => {
			const result = parseBugs(undefined);
			expect(result).toBeUndefined();
		});

		it("should handle bugs object without URL", () => {
			const result = parseBugs({ email: "bugs@example.com" });
			expect(result).toBeUndefined();
		});
	});

	describe("inferSBOMMetadata", () => {
		it("should infer metadata from package.json", () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(
				JSON.stringify({
					author: "John Doe <john@example.com>",
					repository: "https://github.com/owner/repo",
					bugs: "https://github.com/owner/repo/issues",
					homepage: "https://example.com/docs",
					license: "MIT",
				}),
			);

			const result = inferSBOMMetadata("/path/to/package");

			expect(result).toEqual({
				authorName: "John Doe",
				authorEmail: "john@example.com",
				vcsUrl: "https://github.com/owner/repo",
				issueTrackerUrl: "https://github.com/owner/repo/issues",
				documentationUrl: "https://example.com/docs",
				license: "MIT",
			});
		});

		it("should handle missing package.json", () => {
			vi.mocked(existsSync).mockReturnValue(false);

			const result = inferSBOMMetadata("/path/to/package");

			expect(result).toEqual({});
		});

		it("should handle malformed package.json", () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue("invalid json");

			const result = inferSBOMMetadata("/path/to/package");

			expect(result).toEqual({});
		});

		it("should handle package.json with no metadata fields", () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(
				JSON.stringify({
					name: "my-package",
					version: "1.0.0",
				}),
			);

			const result = inferSBOMMetadata("/path/to/package");

			expect(result).toEqual({
				authorName: undefined,
				authorEmail: undefined,
				vcsUrl: undefined,
				issueTrackerUrl: undefined,
				documentationUrl: undefined,
				license: undefined,
			});
		});
	});

	describe("formatCopyright", () => {
		it("should format copyright with current year only", () => {
			const currentYear = new Date().getFullYear();
			const result = formatCopyright("Company Name", currentYear);
			expect(result).toBe(`Copyright ${currentYear} Company Name`);
		});

		it("should format copyright with year range", () => {
			const result = formatCopyright("Company Name", 2020, 2024);
			expect(result).toBe("Copyright 2020-2024 Company Name");
		});

		it("should format copyright without start year", () => {
			const currentYear = new Date().getFullYear();
			const result = formatCopyright("Company Name");
			expect(result).toBe(`Copyright ${currentYear} Company Name`);
		});

		it("should format single year when start equals end", () => {
			const result = formatCopyright("Company Name", 2024, 2024);
			expect(result).toBe("Copyright 2024 Company Name");
		});
	});

	describe("resolveSBOMMetadata", () => {
		it("should resolve supplier from config", () => {
			const inferred = { authorName: "John Doe" };
			const config = {
				supplier: {
					name: "My Company",
					url: "https://mycompany.com",
					contact: { email: "security@mycompany.com" },
				},
			};

			const result = resolveSBOMMetadata(inferred, config, "pkg", "1.0.0");

			expect(result.supplier).toEqual({
				name: "My Company",
				url: ["https://mycompany.com"],
				contact: [{ email: "security@mycompany.com", name: undefined, phone: undefined }],
			});
		});

		it("should resolve publisher from config", () => {
			const inferred = { authorName: "John Doe" };
			const config = { publisher: "Custom Publisher" };

			const result = resolveSBOMMetadata(inferred, config, "pkg", "1.0.0");

			expect(result.component?.publisher).toBe("Custom Publisher");
		});

		it("should fall back to supplier name for publisher", () => {
			const inferred = {};
			const config = {
				supplier: { name: "My Company" },
			};

			const result = resolveSBOMMetadata(inferred, config, "pkg", "1.0.0");

			expect(result.component?.publisher).toBe("My Company");
		});

		it("should fall back to author name for publisher", () => {
			const inferred = { authorName: "John Doe" };

			const result = resolveSBOMMetadata(inferred, undefined, "pkg", "1.0.0");

			expect(result.component?.publisher).toBe("John Doe");
		});

		it("should build external references from inferred data", () => {
			const inferred = {
				vcsUrl: "https://github.com/owner/repo",
				issueTrackerUrl: "https://github.com/owner/repo/issues",
				documentationUrl: "https://docs.example.com",
			};

			const result = resolveSBOMMetadata(inferred, undefined, "pkg", "1.0.0");

			expect(result.component?.externalReferences).toContainEqual({
				type: "vcs",
				url: "https://github.com/owner/repo",
			});
			expect(result.component?.externalReferences).toContainEqual({
				type: "issue-tracker",
				url: "https://github.com/owner/repo/issues",
			});
			expect(result.component?.externalReferences).toContainEqual({
				type: "documentation",
				url: "https://docs.example.com",
			});
		});

		it("should add website from supplier URL", () => {
			const inferred = {};
			const config = {
				supplier: {
					name: "My Company",
					url: "https://mycompany.com",
				},
			};

			const result = resolveSBOMMetadata(inferred, config, "pkg", "1.0.0");

			expect(result.component?.externalReferences).toContainEqual({
				type: "website",
				url: "https://mycompany.com",
			});
		});

		it("should not duplicate website when same as documentation", () => {
			const inferred = {
				documentationUrl: "https://mycompany.com",
			};
			const config = {
				supplier: {
					name: "My Company",
					url: "https://mycompany.com",
				},
			};

			const result = resolveSBOMMetadata(inferred, config, "pkg", "1.0.0");

			const websiteRefs = result.component?.externalReferences?.filter((r) => r.type === "website");
			expect(websiteRefs?.length).toBe(0);
		});

		it("should resolve copyright with config start year", () => {
			const inferred = {};
			const config = {
				copyright: { holder: "My Company LLC", startYear: 2020 },
			};
			const currentYear = new Date().getFullYear();

			const result = resolveSBOMMetadata(inferred, config, "pkg", "1.0.0", 2020);

			expect(result.component?.copyright).toBe(`Copyright 2020-${currentYear} My Company LLC`);
		});

		it("should use supplier name as copyright holder fallback", () => {
			const inferred = {};
			const config = {
				supplier: { name: "My Company" },
			};
			const currentYear = new Date().getFullYear();

			const result = resolveSBOMMetadata(inferred, config, "pkg", "1.0.0");

			expect(result.component?.copyright).toBe(`Copyright ${currentYear} My Company`);
		});

		it("should handle supplier with multiple URLs", () => {
			const inferred = {};
			const config = {
				supplier: {
					name: "My Company",
					url: ["https://mycompany.com", "https://alt.mycompany.com"],
				},
			};

			const result = resolveSBOMMetadata(inferred, config, "pkg", "1.0.0");

			expect(result.supplier?.url).toEqual(["https://mycompany.com", "https://alt.mycompany.com"]);
		});

		it("should handle supplier with multiple contacts", () => {
			const inferred = {};
			const config = {
				supplier: {
					name: "My Company",
					contact: [{ email: "security@mycompany.com" }, { email: "support@mycompany.com" }],
				},
			};

			const result = resolveSBOMMetadata(inferred, config, "pkg", "1.0.0");

			expect(result.supplier?.contact).toHaveLength(2);
		});

		it("should override documentation URL from config", () => {
			const inferred = {
				documentationUrl: "https://homepage.com",
			};
			const config = {
				documentationUrl: "https://docs.example.com",
			};

			const result = resolveSBOMMetadata(inferred, config, "pkg", "1.0.0");

			expect(result.component?.externalReferences).toContainEqual({
				type: "documentation",
				url: "https://docs.example.com",
			});
		});
	});
});
