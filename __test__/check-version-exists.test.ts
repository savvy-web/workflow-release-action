import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock modules before imports
vi.mock("@actions/core", () => ({
	info: vi.fn(),
	warning: vi.fn(),
	error: vi.fn(),
	debug: vi.fn(),
}));

vi.mock("@actions/exec", () => ({
	exec: vi.fn(),
}));

import * as exec from "@actions/exec";
import { checkVersionExists } from "../src/utils/publish-target.js";

describe("checkVersionExists", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns versionExists=true when version is found", async () => {
		const mockResponse = JSON.stringify({
			name: "@savvy-web/test-package",
			version: "1.0.0",
			versions: ["0.9.0", "1.0.0"],
			"dist-tags": { latest: "1.0.0" },
			dist: {
				integrity: "sha512-abc123...",
				shasum: "a1b2c3d4e5f6",
				tarball: "https://registry.npmjs.org/@savvy-web/test-package/-/test-package-1.0.0.tgz",
			},
		});

		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			options?.listeners?.stdout?.(Buffer.from(mockResponse));
			return 0;
		});

		const result = await checkVersionExists("@savvy-web/test-package", "1.0.0", "https://registry.npmjs.org/", "pnpm");

		expect(result.success).toBe(true);
		expect(result.versionExists).toBe(true);
		expect(result.versionInfo).toBeDefined();
		expect(result.versionInfo?.name).toBe("@savvy-web/test-package");
		expect(result.versionInfo?.version).toBe("1.0.0");
		expect(result.versionInfo?.dist?.shasum).toBe("a1b2c3d4e5f6");
		expect(result.versionInfo?.distTags).toEqual({ latest: "1.0.0" });
	});

	it("returns versionExists=false for E404 errors", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			options?.listeners?.stderr?.(Buffer.from("npm ERR! code E404\nnpm ERR! 404 Not Found"));
			return 1;
		});

		const result = await checkVersionExists(
			"@savvy-web/nonexistent-package",
			"1.0.0",
			"https://registry.npmjs.org/",
			"npm",
		);

		expect(result.success).toBe(true);
		expect(result.versionExists).toBe(false);
		expect(result.versionInfo).toBeUndefined();
	});

	it("returns versionExists=false for 'not in this registry' errors", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			options?.listeners?.stderr?.(Buffer.from("package @savvy-web/pkg is not in this registry"));
			return 1;
		});

		const result = await checkVersionExists("@savvy-web/pkg", "1.0.0", "https://custom-registry.example.com/", "pnpm");

		expect(result.success).toBe(true);
		expect(result.versionExists).toBe(false);
	});

	it("returns success=false for network errors", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			options?.listeners?.stderr?.(Buffer.from("npm ERR! network timeout"));
			return 1;
		});

		const result = await checkVersionExists("@savvy-web/pkg", "1.0.0", "https://registry.npmjs.org/", "pnpm");

		expect(result.success).toBe(false);
		expect(result.versionExists).toBe(false);
		expect(result.error).toContain("network timeout");
	});

	it("handles JSON parsing errors gracefully", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			options?.listeners?.stdout?.(Buffer.from("not valid json"));
			return 0;
		});

		const result = await checkVersionExists("@savvy-web/pkg", "1.0.0", "https://registry.npmjs.org/", "pnpm");

		expect(result.success).toBe(false);
		expect(result.versionExists).toBe(false);
		expect(result.error).toContain("Failed to parse npm view output");
	});

	it("constructs correct command for npm", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			options?.listeners?.stderr?.(Buffer.from("E404"));
			return 1;
		});

		await checkVersionExists("@savvy-web/pkg", "1.0.0", "https://registry.npmjs.org/", "npm");

		expect(exec.exec).toHaveBeenCalledWith(
			"npx",
			["npm", "view", "@savvy-web/pkg@1.0.0", "--json", "--registry", "https://registry.npmjs.org/"],
			expect.any(Object),
		);
	});

	it("constructs correct command for pnpm", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			options?.listeners?.stderr?.(Buffer.from("E404"));
			return 1;
		});

		await checkVersionExists("@savvy-web/pkg", "1.0.0", "https://registry.npmjs.org/", "pnpm");

		expect(exec.exec).toHaveBeenCalledWith(
			"pnpm",
			["dlx", "npm", "view", "@savvy-web/pkg@1.0.0", "--json", "--registry", "https://registry.npmjs.org/"],
			expect.any(Object),
		);
	});

	it("constructs correct command for yarn", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			options?.listeners?.stderr?.(Buffer.from("E404"));
			return 1;
		});

		await checkVersionExists("@savvy-web/pkg", "1.0.0", "https://registry.npmjs.org/", "yarn");

		expect(exec.exec).toHaveBeenCalledWith(
			"yarn",
			["npm", "view", "@savvy-web/pkg@1.0.0", "--json", "--registry", "https://registry.npmjs.org/"],
			expect.any(Object),
		);
	});

	it("constructs correct command for bun", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			options?.listeners?.stderr?.(Buffer.from("E404"));
			return 1;
		});

		await checkVersionExists("@savvy-web/pkg", "1.0.0", "https://registry.npmjs.org/", "bun");

		expect(exec.exec).toHaveBeenCalledWith(
			"bun",
			["x", "npm", "view", "@savvy-web/pkg@1.0.0", "--json", "--registry", "https://registry.npmjs.org/"],
			expect.any(Object),
		);
	});

	it("omits registry flag when registry is null", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			options?.listeners?.stderr?.(Buffer.from("E404"));
			return 1;
		});

		await checkVersionExists("@savvy-web/pkg", "1.0.0", null, "npm");

		expect(exec.exec).toHaveBeenCalledWith(
			"npx",
			["npm", "view", "@savvy-web/pkg@1.0.0", "--json"],
			expect.any(Object),
		);
	});

	it("parses real-world npm view response correctly", async () => {
		// Real response from npm view with dist-tags
		const mockResponse = JSON.stringify({
			name: "@savvy-web/fixed-1",
			version: "0.2.3",
			versions: ["0.0.1", "0.1.0", "0.2.0", "0.2.1", "0.2.2", "0.2.3"],
			"dist-tags": {
				latest: "0.2.3",
			},
			time: {
				modified: "2025-12-03T07:10:16.124Z",
				created: "2025-12-03T01:51:15.737Z",
				"0.0.1": "2025-12-03T01:51:15.737Z",
				"0.2.3": "2025-12-03T07:10:16.124Z",
			},
			dist: {
				integrity: "sha512-abc123...",
				shasum: "a791ed199069c8977766b0bd2c5869f3b56433b3",
				tarball: "https://registry.savvyweb.dev/@savvy-web/fixed-1/-/fixed-1-0.2.3.tgz",
			},
		});

		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			options?.listeners?.stdout?.(Buffer.from(mockResponse));
			return 0;
		});

		const result = await checkVersionExists("@savvy-web/fixed-1", "0.2.3", "https://registry.savvyweb.dev/", "pnpm");

		expect(result.success).toBe(true);
		expect(result.versionExists).toBe(true);
		expect(result.versionInfo?.name).toBe("@savvy-web/fixed-1");
		expect(result.versionInfo?.versions).toEqual(["0.0.1", "0.1.0", "0.2.0", "0.2.1", "0.2.2", "0.2.3"]);
		expect(result.versionInfo?.distTags).toEqual({ latest: "0.2.3" });
		expect(result.versionInfo?.dist?.shasum).toBe("a791ed199069c8977766b0bd2c5869f3b56433b3");
		expect(result.versionInfo?.time).toHaveProperty("0.2.3", "2025-12-03T07:10:16.124Z");
	});

	it("handles empty JSON response as version not found", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			options?.listeners?.stdout?.(Buffer.from("{}"));
			return 0;
		});

		const result = await checkVersionExists("@savvy-web/pkg", "1.0.0", "https://registry.npmjs.org/", "pnpm");

		expect(result.success).toBe(true);
		expect(result.versionExists).toBe(false);
	});

	it("handles E404 in JSON error response", async () => {
		const errorResponse = JSON.stringify({
			error: {
				code: "E404",
				summary: "Not found",
			},
		});

		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options) => {
			options?.listeners?.stdout?.(Buffer.from(errorResponse));
			return 1;
		});

		const result = await checkVersionExists("@savvy-web/pkg", "1.0.0", "https://registry.npmjs.org/", "pnpm");

		expect(result.success).toBe(true);
		expect(result.versionExists).toBe(false);
	});

	it("handles exec throwing an exception", async () => {
		vi.mocked(exec.exec).mockRejectedValue(new Error("spawn ENOENT"));

		const result = await checkVersionExists("@savvy-web/pkg", "1.0.0", "https://registry.npmjs.org/", "pnpm");

		expect(result.success).toBe(false);
		expect(result.versionExists).toBe(false);
		expect(result.error).toBe("spawn ENOENT");
	});
});
