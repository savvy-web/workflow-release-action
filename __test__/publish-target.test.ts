import { existsSync, readFileSync } from "node:fs";
import * as exec from "@actions/exec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrePackedTarball, ResolvedTarget } from "../src/types/publish-config.js";
import { getLocalTarballIntegrity, packAndComputeDigest, publishToTarget } from "../src/utils/publish-target.js";
import { cleanupTestEnvironment, setupTestEnvironment } from "./utils/github-mocks.js";

vi.mock("@actions/core", () => ({
	info: vi.fn(),
	warning: vi.fn(),
	error: vi.fn(),
	debug: vi.fn(),
}));

vi.mock("@actions/exec", () => ({
	exec: vi.fn(),
}));

vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn(),
}));

vi.mock("node:crypto", async () => {
	const actual = await vi.importActual<typeof import("node:crypto")>("node:crypto");
	return {
		...actual,
		createHash: vi.fn().mockReturnValue({
			update: vi.fn().mockReturnValue({
				digest: vi.fn().mockReturnValue("abcdef1234567890"),
			}),
		}),
	};
});

function createTarget(overrides: Partial<ResolvedTarget> = {}): ResolvedTarget {
	return {
		protocol: "npm",
		registry: "https://registry.npmjs.org/",
		directory: "/workspace/packages/my-pkg",
		access: "public",
		provenance: false,
		tag: "latest",
		tokenEnv: null,
		...overrides,
	};
}

describe("publishToTarget", () => {
	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });
	});

	afterEach(() => {
		cleanupTestEnvironment();
	});

	describe("dry-run mode", () => {
		it("should skip publishing in dry-run mode for npm", async () => {
			const target = createTarget();

			const result = await publishToTarget(target, true, "pnpm");

			expect(result.success).toBe(true);
			expect(result.output).toContain("[DRY RUN]");
			expect(result.exitCode).toBe(0);
			expect(exec.exec).not.toHaveBeenCalled();
		});

		it("should skip publishing in dry-run mode for JSR", async () => {
			const target = createTarget({ protocol: "jsr", registry: null });

			const result = await publishToTarget(target, true, "pnpm");

			expect(result.success).toBe(true);
			expect(result.output).toContain("[DRY RUN]");
		});
	});

	describe("npm protocol publishing", () => {
		it("should return error when package.json is not found", async () => {
			const target = createTarget();
			vi.mocked(existsSync).mockReturnValue(false);

			// Mock checkVersionExists exec call to return not found, but the publishToNpmCompatible
			// will fail at package.json check first
			const result = await publishToTarget(target, false, "pnpm");

			expect(result.success).toBe(false);
			expect(result.error).toContain("package.json not found");
		});

		it("should return error when package.json is missing name or version", async () => {
			const target = createTarget();
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ name: "@test/pkg" }));

			const result = await publishToTarget(target, false, "pnpm");

			expect(result.success).toBe(false);
			expect(result.error).toContain("missing name or version");
		});

		it("should skip publish when identical version already exists", async () => {
			const target = createTarget();
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ name: "@test/pkg", version: "1.0.0" }));

			// First exec call: checkVersionExists - version exists
			const versionResponse = JSON.stringify({
				name: "@test/pkg",
				version: "1.0.0",
				versions: ["1.0.0"],
				"dist-tags": { latest: "1.0.0" },
				dist: { shasum: "abc123" },
			});

			let execCallCount = 0;
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;
				if (execCallCount === 1) {
					// checkVersionExists
					options?.listeners?.stdout?.(Buffer.from(versionResponse));
				} else if (execCallCount === 2) {
					// getLocalTarballIntegrity
					options?.listeners?.stdout?.(Buffer.from(JSON.stringify([{ shasum: "abc123" }])));
				}
				return 0;
			});

			const result = await publishToTarget(target, false, "pnpm");

			expect(result.success).toBe(true);
			expect(result.alreadyPublished).toBe(true);
			expect(result.alreadyPublishedReason).toBe("identical");
		});

		it("should fail when version exists with different content", async () => {
			const target = createTarget();
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ name: "@test/pkg", version: "1.0.0" }));

			const versionResponse = JSON.stringify({
				name: "@test/pkg",
				version: "1.0.0",
				versions: ["1.0.0"],
				"dist-tags": { latest: "1.0.0" },
				dist: { shasum: "remote-sha" },
			});

			let execCallCount = 0;
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;
				if (execCallCount === 1) {
					options?.listeners?.stdout?.(Buffer.from(versionResponse));
				} else if (execCallCount === 2) {
					options?.listeners?.stdout?.(Buffer.from(JSON.stringify([{ shasum: "local-sha" }])));
				}
				return 0;
			});

			const result = await publishToTarget(target, false, "pnpm");

			expect(result.success).toBe(false);
			expect(result.alreadyPublished).toBe(true);
			expect(result.alreadyPublishedReason).toBe("different");
		});

		it("should skip publish when version exists but integrity cannot be compared", async () => {
			const target = createTarget();
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ name: "@test/pkg", version: "1.0.0" }));

			const versionResponse = JSON.stringify({
				name: "@test/pkg",
				version: "1.0.0",
				versions: ["1.0.0"],
				"dist-tags": { latest: "1.0.0" },
				dist: {},
			});

			let execCallCount = 0;
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;
				if (execCallCount === 1) {
					options?.listeners?.stdout?.(Buffer.from(versionResponse));
				} else if (execCallCount === 2) {
					// getLocalTarballIntegrity fails
					return 1;
				}
				return 0;
			});

			const result = await publishToTarget(target, false, "pnpm");

			expect(result.success).toBe(true);
			expect(result.alreadyPublished).toBe(true);
			expect(result.alreadyPublishedReason).toBe("unknown");
		});

		it("should publish successfully when version does not exist", async () => {
			const target = createTarget();
			vi.mocked(existsSync).mockImplementation((p) => {
				const path = String(p);
				return path.endsWith("package.json") || path.endsWith(".tgz");
			});
			vi.mocked(readFileSync).mockImplementation((p) => {
				const path = String(p);
				if (path.endsWith("package.json")) {
					return JSON.stringify({ name: "@test/pkg", version: "1.0.0" });
				}
				return Buffer.from("tarball-content");
			});

			let execCallCount = 0;
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;
				if (execCallCount === 1) {
					// checkVersionExists - not found
					options?.listeners?.stderr?.(Buffer.from("npm ERR! code E404"));
					return 1;
				}
				if (execCallCount === 2) {
					// packAndComputeDigest
					options?.listeners?.stdout?.(Buffer.from(JSON.stringify([{ filename: "test-pkg-1.0.0.tgz" }])));
					return 0;
				}
				if (execCallCount === 3) {
					// publish
					options?.listeners?.stdout?.(Buffer.from("Published @test/pkg@1.0.0"));
					return 0;
				}
				return 0;
			});

			const result = await publishToTarget(target, false, "pnpm");

			expect(result.success).toBe(true);
			expect(result.alreadyPublished).toBeUndefined();
		});

		it("should include provenance flag when target has provenance", async () => {
			const target = createTarget({ provenance: true });
			vi.mocked(existsSync).mockImplementation((p) => {
				const path = String(p);
				return path.endsWith("package.json") || path.endsWith(".tgz");
			});
			vi.mocked(readFileSync).mockImplementation((p) => {
				const path = String(p);
				if (path.endsWith("package.json")) {
					return JSON.stringify({ name: "@test/pkg", version: "1.0.0" });
				}
				return Buffer.from("tarball-content");
			});

			let publishArgs: string[] = [];
			let execCallCount = 0;
			vi.mocked(exec.exec).mockImplementation(async (_cmd, args, options) => {
				execCallCount++;
				if (execCallCount === 1) {
					options?.listeners?.stderr?.(Buffer.from("E404"));
					return 1;
				}
				if (execCallCount === 2) {
					options?.listeners?.stdout?.(Buffer.from(JSON.stringify([{ filename: "test-pkg-1.0.0.tgz" }])));
					return 0;
				}
				if (execCallCount === 3) {
					publishArgs = args as string[];
					return 0;
				}
				return 0;
			});

			await publishToTarget(target, false, "pnpm");

			expect(publishArgs).toContain("--provenance");
		});

		it("should include access flag when target has access", async () => {
			const target = createTarget({ access: "restricted" });
			vi.mocked(existsSync).mockImplementation((p) => {
				const path = String(p);
				return path.endsWith("package.json") || path.endsWith(".tgz");
			});
			vi.mocked(readFileSync).mockImplementation((p) => {
				const path = String(p);
				if (path.endsWith("package.json")) {
					return JSON.stringify({ name: "@test/pkg", version: "1.0.0" });
				}
				return Buffer.from("tarball-content");
			});

			let publishArgs: string[] = [];
			let execCallCount = 0;
			vi.mocked(exec.exec).mockImplementation(async (_cmd, args, options) => {
				execCallCount++;
				if (execCallCount === 1) {
					options?.listeners?.stderr?.(Buffer.from("E404"));
					return 1;
				}
				if (execCallCount === 2) {
					options?.listeners?.stdout?.(Buffer.from(JSON.stringify([{ filename: "test-pkg-1.0.0.tgz" }])));
					return 0;
				}
				if (execCallCount === 3) {
					publishArgs = args as string[];
					return 0;
				}
				return 0;
			});

			await publishToTarget(target, false, "pnpm");

			expect(publishArgs).toContain("--access");
			expect(publishArgs).toContain("restricted");
		});

		it("should include tag flag when target has non-latest tag", async () => {
			const target = createTarget({ tag: "next" });
			vi.mocked(existsSync).mockImplementation((p) => {
				const path = String(p);
				return path.endsWith("package.json") || path.endsWith(".tgz");
			});
			vi.mocked(readFileSync).mockImplementation((p) => {
				const path = String(p);
				if (path.endsWith("package.json")) {
					return JSON.stringify({ name: "@test/pkg", version: "1.0.0" });
				}
				return Buffer.from("tarball-content");
			});

			let publishArgs: string[] = [];
			let execCallCount = 0;
			vi.mocked(exec.exec).mockImplementation(async (_cmd, args, options) => {
				execCallCount++;
				if (execCallCount === 1) {
					options?.listeners?.stderr?.(Buffer.from("E404"));
					return 1;
				}
				if (execCallCount === 2) {
					options?.listeners?.stdout?.(Buffer.from(JSON.stringify([{ filename: "test-pkg-1.0.0.tgz" }])));
					return 0;
				}
				if (execCallCount === 3) {
					publishArgs = args as string[];
					return 0;
				}
				return 0;
			});

			await publishToTarget(target, false, "pnpm");

			expect(publishArgs).toContain("--tag");
			expect(publishArgs).toContain("next");
		});

		it("should not include tag flag for latest", async () => {
			const target = createTarget({ tag: "latest" });
			vi.mocked(existsSync).mockImplementation((p) => {
				const path = String(p);
				return path.endsWith("package.json") || path.endsWith(".tgz");
			});
			vi.mocked(readFileSync).mockImplementation((p) => {
				const path = String(p);
				if (path.endsWith("package.json")) {
					return JSON.stringify({ name: "@test/pkg", version: "1.0.0" });
				}
				return Buffer.from("tarball-content");
			});

			let publishArgs: string[] = [];
			let execCallCount = 0;
			vi.mocked(exec.exec).mockImplementation(async (_cmd, args, options) => {
				execCallCount++;
				if (execCallCount === 1) {
					options?.listeners?.stderr?.(Buffer.from("E404"));
					return 1;
				}
				if (execCallCount === 2) {
					options?.listeners?.stdout?.(Buffer.from(JSON.stringify([{ filename: "test-pkg-1.0.0.tgz" }])));
					return 0;
				}
				if (execCallCount === 3) {
					publishArgs = args as string[];
					return 0;
				}
				return 0;
			});

			await publishToTarget(target, false, "pnpm");

			expect(publishArgs).not.toContain("--tag");
		});

		it("should use pre-packed tarball when provided", async () => {
			const target = createTarget();
			const prePackedTarball: PrePackedTarball = {
				path: "/workspace/packages/my-pkg/test-pkg-1.0.0.tgz",
				digest: "sha256:abc123",
				filename: "test-pkg-1.0.0.tgz",
			};

			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ name: "@test/pkg", version: "1.0.0" }));

			let publishArgs: string[] = [];
			let execCallCount = 0;
			vi.mocked(exec.exec).mockImplementation(async (_cmd, args, options) => {
				execCallCount++;
				if (execCallCount === 1) {
					// checkVersionExists - not found
					options?.listeners?.stderr?.(Buffer.from("E404"));
					return 1;
				}
				if (execCallCount === 2) {
					// publish (should skip packing since pre-packed)
					publishArgs = args as string[];
					return 0;
				}
				return 0;
			});

			const result = await publishToTarget(target, false, "pnpm", prePackedTarball);

			expect(result.success).toBe(true);
			// Should use the pre-packed tarball path in publish args
			expect(publishArgs).toContain(prePackedTarball.path);
			// Should NOT have called pack (only 2 exec calls: version check + publish)
			expect(execCallCount).toBe(2);
		});

		it("should handle publish failure and detect already-published race condition", async () => {
			const target = createTarget();
			vi.mocked(existsSync).mockImplementation((p) => {
				const path = String(p);
				return path.endsWith("package.json") || path.endsWith(".tgz");
			});
			vi.mocked(readFileSync).mockImplementation((p) => {
				const path = String(p);
				if (path.endsWith("package.json")) {
					return JSON.stringify({ name: "@test/pkg", version: "1.0.0" });
				}
				return Buffer.from("tarball-content");
			});

			let execCallCount = 0;
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;
				if (execCallCount === 1) {
					// checkVersionExists - not found
					options?.listeners?.stderr?.(Buffer.from("E404"));
					return 1;
				}
				if (execCallCount === 2) {
					// pack
					options?.listeners?.stdout?.(Buffer.from(JSON.stringify([{ filename: "test-pkg-1.0.0.tgz" }])));
					return 0;
				}
				if (execCallCount === 3) {
					// publish fails with already published
					options?.listeners?.stderr?.(Buffer.from("cannot publish over previously published version"));
					return 1;
				}
				// compareTarballIntegrity calls - getLocalTarballIntegrity and getRemoteTarballIntegrity
				if (execCallCount === 4) {
					options?.listeners?.stdout?.(Buffer.from(JSON.stringify([{ shasum: "abc123" }])));
					return 0;
				}
				if (execCallCount === 5) {
					options?.listeners?.stdout?.(Buffer.from("abc123"));
					return 0;
				}
				return 0;
			});

			const result = await publishToTarget(target, false, "pnpm");

			expect(result.alreadyPublished).toBe(true);
			expect(result.alreadyPublishedReason).toBe("identical");
			expect(result.success).toBe(true);
		});

		it("should handle publish failure for non-version-conflict reasons", async () => {
			const target = createTarget();
			vi.mocked(existsSync).mockImplementation((p) => {
				const path = String(p);
				return path.endsWith("package.json") || path.endsWith(".tgz");
			});
			vi.mocked(readFileSync).mockImplementation((p) => {
				const path = String(p);
				if (path.endsWith("package.json")) {
					return JSON.stringify({ name: "@test/pkg", version: "1.0.0" });
				}
				return Buffer.from("tarball-content");
			});

			let execCallCount = 0;
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;
				if (execCallCount === 1) {
					options?.listeners?.stderr?.(Buffer.from("E404"));
					return 1;
				}
				if (execCallCount === 2) {
					options?.listeners?.stdout?.(Buffer.from(JSON.stringify([{ filename: "test-pkg-1.0.0.tgz" }])));
					return 0;
				}
				if (execCallCount === 3) {
					// publish fails with auth error
					options?.listeners?.stderr?.(Buffer.from("npm ERR! 401 Unauthorized"));
					return 1;
				}
				return 0;
			});

			const result = await publishToTarget(target, false, "pnpm");

			expect(result.success).toBe(false);
			expect(result.error).toContain("401 Unauthorized");
		});

		it("should handle exec throwing during publish", async () => {
			const target = createTarget();
			vi.mocked(existsSync).mockImplementation((p) => {
				const path = String(p);
				return path.endsWith("package.json") || path.endsWith(".tgz");
			});
			vi.mocked(readFileSync).mockImplementation((p) => {
				const path = String(p);
				if (path.endsWith("package.json")) {
					return JSON.stringify({ name: "@test/pkg", version: "1.0.0" });
				}
				return Buffer.from("tarball-content");
			});

			let execCallCount = 0;
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;
				if (execCallCount === 1) {
					options?.listeners?.stderr?.(Buffer.from("E404"));
					return 1;
				}
				if (execCallCount === 2) {
					options?.listeners?.stdout?.(Buffer.from(JSON.stringify([{ filename: "test-pkg-1.0.0.tgz" }])));
					return 0;
				}
				if (execCallCount === 3) {
					throw new Error("spawn ENOENT");
				}
				return 0;
			});

			const result = await publishToTarget(target, false, "pnpm");

			expect(result.success).toBe(false);
			expect(result.error).toBe("spawn ENOENT");
		});

		it("should extract provenance URL from output", async () => {
			const target = createTarget({ provenance: true });
			vi.mocked(existsSync).mockImplementation((p) => {
				const path = String(p);
				return path.endsWith("package.json") || path.endsWith(".tgz");
			});
			vi.mocked(readFileSync).mockImplementation((p) => {
				const path = String(p);
				if (path.endsWith("package.json")) {
					return JSON.stringify({ name: "@test/pkg", version: "1.0.0" });
				}
				return Buffer.from("tarball-content");
			});

			let execCallCount = 0;
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;
				if (execCallCount === 1) {
					options?.listeners?.stderr?.(Buffer.from("E404"));
					return 1;
				}
				if (execCallCount === 2) {
					options?.listeners?.stdout?.(Buffer.from(JSON.stringify([{ filename: "test-pkg-1.0.0.tgz" }])));
					return 0;
				}
				if (execCallCount === 3) {
					options?.listeners?.stdout?.(
						Buffer.from("Provenance statement published to https://search.sigstore.dev/?logIndex=123"),
					);
					return 0;
				}
				return 0;
			});

			const result = await publishToTarget(target, false, "pnpm");

			expect(result.success).toBe(true);
			expect(result.attestationUrl).toBe("https://search.sigstore.dev/?logIndex=123");
		});

		it("should handle pack failure", async () => {
			const target = createTarget();
			vi.mocked(existsSync).mockImplementation((p) => {
				const path = String(p);
				if (path.endsWith("package.json")) return true;
				return false;
			});
			vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ name: "@test/pkg", version: "1.0.0" }));

			let execCallCount = 0;
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;
				if (execCallCount === 1) {
					options?.listeners?.stderr?.(Buffer.from("E404"));
					return 1;
				}
				if (execCallCount === 2) {
					// pack fails
					throw new Error("pack failed");
				}
				return 0;
			});

			const result = await publishToTarget(target, false, "pnpm");

			expect(result.success).toBe(false);
			expect(result.error).toContain("Failed to create tarball");
		});

		it("should proceed when version check fails (network issue)", async () => {
			const target = createTarget();
			vi.mocked(existsSync).mockImplementation((p) => {
				const path = String(p);
				return path.endsWith("package.json") || path.endsWith(".tgz");
			});
			vi.mocked(readFileSync).mockImplementation((p) => {
				const path = String(p);
				if (path.endsWith("package.json")) {
					return JSON.stringify({ name: "@test/pkg", version: "1.0.0" });
				}
				return Buffer.from("tarball-content");
			});

			let execCallCount = 0;
			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;
				if (execCallCount === 1) {
					// checkVersionExists - network error
					options?.listeners?.stderr?.(Buffer.from("npm ERR! network timeout"));
					return 1;
				}
				if (execCallCount === 2) {
					// pack
					options?.listeners?.stdout?.(Buffer.from(JSON.stringify([{ filename: "test-pkg-1.0.0.tgz" }])));
					return 0;
				}
				if (execCallCount === 3) {
					// publish succeeds
					return 0;
				}
				return 0;
			});

			const result = await publishToTarget(target, false, "pnpm");

			expect(result.success).toBe(true);
		});
	});

	describe("JSR protocol publishing", () => {
		it("should publish to JSR successfully", async () => {
			const target = createTarget({ protocol: "jsr", registry: null });

			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				options?.listeners?.stdout?.(Buffer.from("Published https://jsr.io/@test/pkg@1.0.0"));
				return 0;
			});

			const result = await publishToTarget(target, false, "pnpm");

			expect(result.success).toBe(true);
			expect(result.registryUrl).toBe("https://jsr.io/@test/pkg@1.0.0");
		});

		it("should handle JSR already published", async () => {
			const target = createTarget({ protocol: "jsr", registry: null });

			vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
				options?.listeners?.stderr?.(Buffer.from("Version 1.0.0 already exists"));
				return 1;
			});

			const result = await publishToTarget(target, false, "pnpm");

			expect(result.success).toBe(false);
			expect(result.alreadyPublished).toBe(true);
		});

		it("should use correct JSR command for pnpm", async () => {
			const target = createTarget({ protocol: "jsr", registry: null });

			vi.mocked(exec.exec).mockResolvedValue(0);

			await publishToTarget(target, false, "pnpm");

			expect(exec.exec).toHaveBeenCalledWith("pnpm", ["dlx", "jsr", "publish", "--allow-dirty"], expect.any(Object));
		});

		it("should use correct JSR command for yarn", async () => {
			const target = createTarget({ protocol: "jsr", registry: null });

			vi.mocked(exec.exec).mockResolvedValue(0);

			await publishToTarget(target, false, "yarn");

			expect(exec.exec).toHaveBeenCalledWith("yarn", ["dlx", "jsr", "publish", "--allow-dirty"], expect.any(Object));
		});

		it("should use correct JSR command for bun", async () => {
			const target = createTarget({ protocol: "jsr", registry: null });

			vi.mocked(exec.exec).mockResolvedValue(0);

			await publishToTarget(target, false, "bun");

			expect(exec.exec).toHaveBeenCalledWith("bun", ["x", "jsr", "publish", "--allow-dirty"], expect.any(Object));
		});

		it("should use correct JSR command for npm (default)", async () => {
			const target = createTarget({ protocol: "jsr", registry: null });

			vi.mocked(exec.exec).mockResolvedValue(0);

			await publishToTarget(target, false, "npm");

			expect(exec.exec).toHaveBeenCalledWith("npx", ["jsr", "publish", "--allow-dirty"], expect.any(Object));
		});

		it("should handle JSR exec throwing", async () => {
			const target = createTarget({ protocol: "jsr", registry: null });

			vi.mocked(exec.exec).mockRejectedValue(new Error("spawn ENOENT"));

			const result = await publishToTarget(target, false, "pnpm");

			expect(result.success).toBe(false);
			expect(result.error).toBe("spawn ENOENT");
		});
	});

	describe("unknown protocol", () => {
		it("should throw for unknown protocol", async () => {
			const target = createTarget({ protocol: "unknown" as "npm" });

			await expect(publishToTarget(target, false, "pnpm")).rejects.toThrow("Unknown protocol");
		});
	});

	describe("package manager command mapping", () => {
		it("should use correct publish command for npm", async () => {
			const target = createTarget();
			vi.mocked(existsSync).mockImplementation((p) => {
				const path = String(p);
				return path.endsWith("package.json") || path.endsWith(".tgz");
			});
			vi.mocked(readFileSync).mockImplementation((p) => {
				const path = String(p);
				if (path.endsWith("package.json")) {
					return JSON.stringify({ name: "@test/pkg", version: "1.0.0" });
				}
				return Buffer.from("tarball-content");
			});

			let publishCmd = "";
			let execCallCount = 0;
			vi.mocked(exec.exec).mockImplementation(async (cmd, _args, options) => {
				execCallCount++;
				if (execCallCount === 1) {
					options?.listeners?.stderr?.(Buffer.from("E404"));
					return 1;
				}
				if (execCallCount === 2) {
					options?.listeners?.stdout?.(Buffer.from(JSON.stringify([{ filename: "test-pkg-1.0.0.tgz" }])));
					return 0;
				}
				if (execCallCount === 3) {
					publishCmd = cmd;
					return 0;
				}
				return 0;
			});

			await publishToTarget(target, false, "npm");

			expect(publishCmd).toBe("npx");
		});

		it("should use correct publish command for yarn", async () => {
			const target = createTarget();
			vi.mocked(existsSync).mockImplementation((p) => {
				const path = String(p);
				return path.endsWith("package.json") || path.endsWith(".tgz");
			});
			vi.mocked(readFileSync).mockImplementation((p) => {
				const path = String(p);
				if (path.endsWith("package.json")) {
					return JSON.stringify({ name: "@test/pkg", version: "1.0.0" });
				}
				return Buffer.from("tarball-content");
			});

			let publishCmd = "";
			let publishArgs: string[] = [];
			let execCallCount = 0;
			vi.mocked(exec.exec).mockImplementation(async (cmd, args, options) => {
				execCallCount++;
				if (execCallCount === 1) {
					options?.listeners?.stderr?.(Buffer.from("E404"));
					return 1;
				}
				if (execCallCount === 2) {
					options?.listeners?.stdout?.(Buffer.from(JSON.stringify([{ filename: "test-pkg-1.0.0.tgz" }])));
					return 0;
				}
				if (execCallCount === 3) {
					publishCmd = cmd;
					publishArgs = args as string[];
					return 0;
				}
				return 0;
			});

			await publishToTarget(target, false, "yarn");

			expect(publishCmd).toBe("yarn");
			expect(publishArgs[0]).toBe("npm");
		});
	});
});

describe("getLocalTarballIntegrity", () => {
	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });
	});

	afterEach(() => {
		cleanupTestEnvironment();
	});

	it("should return shasum from npm pack output", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			options?.listeners?.stdout?.(Buffer.from(JSON.stringify([{ shasum: "abc123def456" }])));
			return 0;
		});

		const result = await getLocalTarballIntegrity("/workspace/pkg", "pnpm");

		expect(result).toBe("abc123def456");
	});

	it("should return undefined when pack fails", async () => {
		vi.mocked(exec.exec).mockRejectedValue(new Error("pack failed"));

		const result = await getLocalTarballIntegrity("/workspace/pkg", "pnpm");

		expect(result).toBeUndefined();
	});

	it("should use correct command for pnpm", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			options?.listeners?.stdout?.(Buffer.from("[]"));
			return 0;
		});

		await getLocalTarballIntegrity("/workspace/pkg", "pnpm");

		expect(exec.exec).toHaveBeenCalledWith("pnpm", ["dlx", "npm", "pack", "--json", "--dry-run"], expect.any(Object));
	});
});

describe("packAndComputeDigest", () => {
	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });
	});

	afterEach(() => {
		cleanupTestEnvironment();
	});

	it("should return tarball info with digest", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			options?.listeners?.stdout?.(Buffer.from(JSON.stringify([{ filename: "pkg-1.0.0.tgz" }])));
			return 0;
		});
		vi.mocked(existsSync).mockReturnValue(true);
		vi.mocked(readFileSync).mockReturnValue(Buffer.from("tarball-content"));

		const result = await packAndComputeDigest("/workspace/pkg", "pnpm");

		expect(result).toBeDefined();
		expect(result?.filename).toBe("pkg-1.0.0.tgz");
		expect(result?.digest).toMatch(/^sha256:/);
	});

	it("should return undefined when pack fails", async () => {
		vi.mocked(exec.exec).mockRejectedValue(new Error("pack failed"));

		const result = await packAndComputeDigest("/workspace/pkg", "pnpm");

		expect(result).toBeUndefined();
	});

	it("should return undefined when pack output is empty", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			options?.listeners?.stdout?.(Buffer.from("[]"));
			return 0;
		});

		const result = await packAndComputeDigest("/workspace/pkg", "pnpm");

		expect(result).toBeUndefined();
	});

	it("should return undefined when tarball file does not exist", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			options?.listeners?.stdout?.(Buffer.from(JSON.stringify([{ filename: "pkg-1.0.0.tgz" }])));
			return 0;
		});
		vi.mocked(existsSync).mockReturnValue(false);

		const result = await packAndComputeDigest("/workspace/pkg", "pnpm");

		expect(result).toBeUndefined();
	});
});
