import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { context, getOctokit } from "@actions/github";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectPublishableChanges } from "../src/utils/detect-publishable-changes.js";
import { cleanupTestEnvironment, createMockOctokit, setupTestEnvironment } from "./utils/github-mocks.js";
import type { ExecOptionsWithListeners, MockOctokit } from "./utils/test-types.js";

// Mock modules
vi.mock("@actions/core");
vi.mock("@actions/exec");
vi.mock("@actions/github");
vi.mock("node:fs");
vi.mock("node:fs/promises");

describe("detect-publishable-changes", () => {
	let mockOctokit: MockOctokit;

	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });

		// Mock core.summary
		const mockSummary = {
			addHeading: vi.fn().mockReturnThis(),
			addEOL: vi.fn().mockReturnThis(),
			addTable: vi.fn().mockReturnThis(),
			addRaw: vi.fn().mockReturnThis(),
			addCodeBlock: vi.fn().mockReturnThis(),
			write: vi.fn().mockResolvedValue(undefined),
			stringify: vi.fn().mockReturnValue(""),
		};
		Object.defineProperty(core, "summary", { value: mockSummary, writable: true });

		// Setup core mocks
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "token") return "test-token";
			return "";
		});

		// Setup octokit mock
		mockOctokit = createMockOctokit();
		vi.mocked(getOctokit).mockReturnValue(mockOctokit as unknown as ReturnType<typeof getOctokit>);
		Object.defineProperty(vi.mocked(context), "repo", {
			value: { owner: "test-owner", repo: "test-repo" },
			writable: true,
		});
		Object.defineProperty(vi.mocked(context), "sha", { value: "abc123", writable: true });

		// Mock file system
		vi.mocked(existsSync).mockReturnValue(false);
		vi.mocked(readFile).mockResolvedValue('{"name": "@test/pkg"}');
	});

	afterEach(() => {
		cleanupTestEnvironment();
	});

	it("should detect no changes when changeset has no releases", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
			if (options?.listeners?.stdout) {
				options.listeners.stdout(Buffer.from(JSON.stringify({ releases: [], changesets: [] })));
			}
			return 0;
		});

		const result = await detectPublishableChanges("pnpm", false);

		expect(result.hasChanges).toBe(false);
		expect(result.packages).toEqual([]);
		expect(result.checkId).toBe(12345);
		expect(mockOctokit.rest.checks.create).toHaveBeenCalled();
	});

	it("should detect changes for packages with publishConfig.access", async () => {
		const changesetStatus = {
			releases: [
				{ name: "@test/pkg-a", newVersion: "1.0.0", type: "minor" },
				{ name: "@test/pkg-b", newVersion: "2.0.0", type: "major" },
			],
			changesets: [{ id: "change-1", summary: "Test change", releases: [] }],
		};

		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
			if (options?.listeners?.stdout) {
				options.listeners.stdout(Buffer.from(JSON.stringify(changesetStatus)));
			}
			return 0;
		});

		vi.mocked(existsSync).mockReturnValue(true);
		vi.mocked(readFile).mockImplementation(async (path) => {
			const pathStr = String(path);
			if (pathStr.includes("pkg-a")) {
				return JSON.stringify({ name: "@test/pkg-a", publishConfig: { access: "public" } });
			}
			if (pathStr.includes("pkg-b")) {
				return JSON.stringify({ name: "@test/pkg-b", publishConfig: { access: "public" } });
			}
			return '{"name": "@test/unknown"}';
		});

		const result = await detectPublishableChanges("pnpm", false);

		expect(result.hasChanges).toBe(true);
		expect(result.packages.length).toBe(2);
		expect(result.packages[0].name).toBe("@test/pkg-a");
		expect(result.packages[1].name).toBe("@test/pkg-b");
	});

	it("should skip packages with type 'none'", async () => {
		const changesetStatus = {
			releases: [
				{ name: "@test/pkg-a", newVersion: "1.0.0", type: "none" },
				{ name: "@test/pkg-b", newVersion: "2.0.0", type: "patch" },
			],
			changesets: [],
		};

		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
			if (options?.listeners?.stdout) {
				options.listeners.stdout(Buffer.from(JSON.stringify(changesetStatus)));
			}
			return 0;
		});

		vi.mocked(existsSync).mockReturnValue(true);
		vi.mocked(readFile).mockImplementation(async (path) => {
			const pathStr = String(path);
			if (pathStr.includes("pkg-a")) {
				return JSON.stringify({ name: "@test/pkg-a", publishConfig: { access: "public" } });
			}
			if (pathStr.includes("pkg-b")) {
				return JSON.stringify({ name: "@test/pkg-b", publishConfig: { access: "public" } });
			}
			return '{"name": "@test/unknown"}';
		});

		const result = await detectPublishableChanges("pnpm", false);

		expect(result.packages.length).toBe(1);
		expect(result.packages[0].name).toBe("@test/pkg-b");
	});

	it("should use correct changeset command for different package managers", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
			if (options?.listeners?.stdout) {
				options.listeners.stdout(Buffer.from(JSON.stringify({ releases: [], changesets: [] })));
			}
			return 0;
		});

		await detectPublishableChanges("pnpm", false);
		expect(exec.exec).toHaveBeenCalledWith(
			"pnpm",
			["exec", "changeset", "status", "--output=json"],
			expect.any(Object),
		);

		await detectPublishableChanges("yarn", false);
		expect(exec.exec).toHaveBeenCalledWith("yarn", ["changeset", "status", "--output=json"], expect.any(Object));

		await detectPublishableChanges("npm", false);
		expect(exec.exec).toHaveBeenCalledWith("npx", ["changeset", "status", "--output=json"], expect.any(Object));
	});

	it("should handle invalid JSON from changeset status", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
			if (options?.listeners?.stdout) {
				options.listeners.stdout(Buffer.from("invalid json output"));
			}
			return 0;
		});

		const result = await detectPublishableChanges("pnpm", false);

		expect(result.hasChanges).toBe(false);
		expect(result.packages).toEqual([]);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to parse changeset status"));
	});

	it("should skip packages without publishConfig.access", async () => {
		const changesetStatus = {
			releases: [{ name: "@test/no-access", newVersion: "1.0.0", type: "minor" }],
			changesets: [],
		};

		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
			if (options?.listeners?.stdout) {
				options.listeners.stdout(Buffer.from(JSON.stringify(changesetStatus)));
			}
			return 0;
		});

		vi.mocked(existsSync).mockReturnValue(true);
		vi.mocked(readFile).mockResolvedValue(JSON.stringify({ name: "@test/no-access" }));

		const result = await detectPublishableChanges("pnpm", false);

		expect(result.hasChanges).toBe(false);
		expect(result.packages).toEqual([]);
	});

	it("should warn when package.json is not found", async () => {
		const changesetStatus = {
			releases: [{ name: "@test/not-found", newVersion: "1.0.0", type: "minor" }],
			changesets: [],
		};

		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
			if (options?.listeners?.stdout) {
				options.listeners.stdout(Buffer.from(JSON.stringify(changesetStatus)));
			}
			return 0;
		});

		vi.mocked(existsSync).mockReturnValue(false);

		const result = await detectPublishableChanges("pnpm", false);

		expect(result.hasChanges).toBe(false);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Could not find package.json"));
	});

	it("should include dry-run mode in output", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
			if (options?.listeners?.stdout) {
				options.listeners.stdout(Buffer.from(JSON.stringify({ releases: [], changesets: [] })));
			}
			return 0;
		});

		const result = await detectPublishableChanges("pnpm", true);

		expect(result.checkId).toBe(12345);
		expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith(
			expect.objectContaining({
				name: expect.stringContaining("Dry Run"),
			}),
		);
	});

	it("should handle packages with changesets in output", async () => {
		const changesetStatus = {
			releases: [{ name: "@test/pkg-a", newVersion: "1.0.0", type: "minor" }],
			changesets: [
				{ id: "change-1", summary: "Add feature", releases: [{ name: "@test/pkg-a", type: "minor" }] },
				{ id: "change-2", summary: "Fix bug", releases: [{ name: "@test/pkg-a", type: "patch" }] },
			],
		};

		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
			if (options?.listeners?.stdout) {
				options.listeners.stdout(Buffer.from(JSON.stringify(changesetStatus)));
			}
			return 0;
		});

		vi.mocked(existsSync).mockReturnValue(true);
		vi.mocked(readFile).mockResolvedValue(JSON.stringify({ name: "@test/pkg-a", publishConfig: { access: "public" } }));

		const result = await detectPublishableChanges("pnpm", false);

		expect(result.hasChanges).toBe(true);
		expect(result.packages.length).toBe(1);
	});

	it("should handle read errors for package.json", async () => {
		const changesetStatus = {
			releases: [{ name: "@test/error-pkg", newVersion: "1.0.0", type: "minor" }],
			changesets: [],
		};

		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
			if (options?.listeners?.stdout) {
				options.listeners.stdout(Buffer.from(JSON.stringify(changesetStatus)));
			}
			return 0;
		});

		vi.mocked(existsSync).mockReturnValue(true);
		vi.mocked(readFile).mockRejectedValue(new Error("Permission denied"));

		const result = await detectPublishableChanges("pnpm", false);

		expect(result.hasChanges).toBe(false);
	});

	it("should capture stderr output from changeset command", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
			if (options?.listeners?.stderr) {
				options.listeners.stderr(Buffer.from("Warning: Some changeset issue\n"));
			}
			if (options?.listeners?.stdout) {
				options.listeners.stdout(Buffer.from(JSON.stringify({ releases: [], changesets: [] })));
			}
			return 0;
		});

		const result = await detectPublishableChanges("pnpm", false);

		expect(result.hasChanges).toBe(false);
	});
});
