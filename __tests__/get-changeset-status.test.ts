import * as fs from "node:fs";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getChangesetStatus } from "../src/utils/get-changeset-status.js";
import { cleanupTestEnvironment, setupTestEnvironment } from "./utils/github-mocks.js";
import type { ExecOptionsWithListeners } from "./utils/test-types.js";

// Mock modules
vi.mock("@actions/core");
vi.mock("@actions/exec");
vi.mock("node:fs");

describe("get-changeset-status", () => {
	beforeEach(() => {
		setupTestEnvironment({ suppressOutput: true });
		vi.mocked(exec.exec).mockResolvedValue(0);

		// Default fs mocks
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ releases: [], changesets: [] }));
		vi.mocked(fs.unlinkSync).mockImplementation(() => {});
	});

	afterEach(() => {
		cleanupTestEnvironment();
	});

	it("should return changeset status on success", async () => {
		const expectedStatus = {
			releases: [{ name: "@test/pkg", newVersion: "1.0.0", type: "minor" }],
			changesets: [{ summary: "Added feature" }],
		};

		vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(expectedStatus));

		const result = await getChangesetStatus("pnpm", "main");

		expect(result).toEqual(expectedStatus);
		expect(exec.exec).toHaveBeenCalledWith("pnpm", expect.arrayContaining(["changeset", "status"]), expect.any(Object));
	});

	it("should use yarn command for yarn package manager", async () => {
		vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ releases: [], changesets: [] }));

		await getChangesetStatus("yarn", "main");

		expect(exec.exec).toHaveBeenCalledWith("yarn", expect.arrayContaining(["changeset", "status"]), expect.any(Object));
	});

	it("should use npm run for npm package manager", async () => {
		vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ releases: [], changesets: [] }));

		await getChangesetStatus("npm", "main");

		expect(exec.exec).toHaveBeenCalledWith(
			"npm",
			expect.arrayContaining(["run", "changeset", "status"]),
			expect.any(Object),
		);
	});

	it("should use bun x for bun package manager", async () => {
		vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ releases: [], changesets: [] }));

		await getChangesetStatus("bun", "main");

		expect(exec.exec).toHaveBeenCalledWith(
			"bun",
			expect.arrayContaining(["x", "changeset", "status"]),
			expect.any(Object),
		);
	});

	it("should fallback to merge base when no changesets found", async () => {
		// First call (changeset status on HEAD) - no output, changesets consumed
		// Git rev-parse HEAD
		// Git merge-base
		// Git checkout merge-base
		// Changeset status at merge-base (succeeds with releases)
		// Git checkout back to HEAD
		let callCount = 0;
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			callCount++;
			// First changeset status call - no output
			if (cmd === "pnpm" && args?.includes("changeset") && callCount === 1) {
				// No output file created (simulating consumed changesets)
				return 0;
			}
			// git rev-parse HEAD
			if (cmd === "git" && args?.[0] === "rev-parse") {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("abc123def456\n"));
				}
				return 0;
			}
			// git merge-base
			if (cmd === "git" && args?.[0] === "merge-base") {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("789xyz012\n"));
				}
				return 0;
			}
			// git checkout
			if (cmd === "git" && args?.[0] === "checkout") {
				return 0;
			}
			// Second changeset status call (at merge base) - has releases
			if (cmd === "pnpm" && args?.includes("changeset")) {
				return 0;
			}
			return 0;
		});

		// First existsSync returns false (no output from first call)
		// Then returns true for merge-base output
		let existsCount = 0;
		vi.mocked(fs.existsSync).mockImplementation(() => {
			existsCount++;
			return existsCount > 1; // First call false, subsequent calls true
		});

		vi.mocked(fs.readFileSync).mockReturnValue(
			JSON.stringify({
				releases: [{ name: "@test/pkg", newVersion: "1.0.0", type: "minor" }],
				changesets: [],
			}),
		);

		const result = await getChangesetStatus("pnpm", "main");

		expect(result.releases).toHaveLength(1);
		expect(core.info).toHaveBeenCalledWith(expect.stringContaining("merge base"));
	});

	it("should return empty when merge base cannot be found", async () => {
		// Changeset status succeeds but no output (changesets consumed)
		// Git rev-parse succeeds
		// Git merge-base fails
		let callCount = 0;
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			callCount++;
			// First changeset status call - no changesets
			if (cmd === "pnpm" && args?.includes("changeset") && callCount === 1) {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from("no changesets were found"));
				}
				return 0;
			}
			// git rev-parse HEAD
			if (cmd === "git" && args?.[0] === "rev-parse") {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("abc123\n"));
				}
				return 0;
			}
			// git merge-base fails
			if (cmd === "git" && args?.[0] === "merge-base") {
				throw new Error("fatal: Not a valid object name main");
			}
			return 0;
		});

		vi.mocked(fs.existsSync).mockReturnValue(false);

		const result = await getChangesetStatus("pnpm", "main");

		expect(result.releases).toEqual([]);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to find merge base"));
	});

	it("should throw on changeset status error", async () => {
		vi.mocked(exec.exec).mockImplementation(async (_cmd, _args, options?: ExecOptionsWithListeners) => {
			if (options?.listeners?.stderr) {
				options.listeners.stderr(Buffer.from("Some unexpected error"));
			}
			return 1;
		});

		vi.mocked(fs.existsSync).mockReturnValue(false);

		await expect(getChangesetStatus("pnpm", "main")).rejects.toThrow("changeset status failed");
	});

	it("should handle failure to get current HEAD", async () => {
		// Changeset status with no changesets message
		// git rev-parse fails
		let callCount = 0;
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			callCount++;
			// First changeset status call
			if (cmd === "pnpm" && callCount === 1) {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from("no changesets were found"));
				}
				return 0;
			}
			// git rev-parse fails
			if (cmd === "git" && args?.[0] === "rev-parse") {
				throw new Error("Not a git repository");
			}
			return 0;
		});

		vi.mocked(fs.existsSync).mockReturnValue(false);

		const result = await getChangesetStatus("pnpm", "main");

		expect(result.releases).toEqual([]);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to get current HEAD"));
	});

	it("should handle failure to checkout merge base", async () => {
		let callCount = 0;
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			callCount++;
			// First changeset status call
			if (cmd === "pnpm" && callCount === 1) {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from("no changesets were found"));
				}
				return 0;
			}
			// git rev-parse HEAD succeeds
			if (cmd === "git" && args?.[0] === "rev-parse") {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("abc123\n"));
				}
				return 0;
			}
			// git merge-base succeeds
			if (cmd === "git" && args?.[0] === "merge-base") {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("xyz789\n"));
				}
				return 0;
			}
			// git checkout fails
			if (cmd === "git" && args?.[0] === "checkout") {
				throw new Error("error: pathspec does not match");
			}
			return 0;
		});

		vi.mocked(fs.existsSync).mockReturnValue(false);

		const result = await getChangesetStatus("pnpm", "main");

		expect(result.releases).toEqual([]);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to checkout merge base"));
	});

	it("should handle changeset status failure at merge base", async () => {
		let checkoutCount = 0;
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			// First changeset status call - no changesets
			if (cmd === "pnpm" && args?.includes("changeset")) {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from("no changesets were found"));
				}
				return 1; // Both calls fail
			}
			// git rev-parse HEAD succeeds
			if (cmd === "git" && args?.[0] === "rev-parse") {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("abc123\n"));
				}
				return 0;
			}
			// git merge-base succeeds
			if (cmd === "git" && args?.[0] === "merge-base") {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("xyz789\n"));
				}
				return 0;
			}
			// git checkout succeeds
			if (cmd === "git" && args?.[0] === "checkout") {
				checkoutCount++;
				return 0;
			}
			return 0;
		});

		// File doesn't exist for first call, exists for cleanup check
		let existsCount = 0;
		vi.mocked(fs.existsSync).mockImplementation(() => {
			existsCount++;
			return existsCount > 2;
		});

		const result = await getChangesetStatus("pnpm", "main");

		expect(result.releases).toEqual([]);
		// Should have called checkout twice (to merge-base and back)
		expect(checkoutCount).toBe(2);
	});

	it("should handle restore HEAD failure with fallback", async () => {
		let checkoutCount = 0;
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			// First changeset status call - no changesets
			if (cmd === "pnpm" && args?.includes("changeset")) {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from("No changesets present"));
				}
				return 0;
			}
			// git rev-parse HEAD succeeds
			if (cmd === "git" && args?.[0] === "rev-parse") {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("abc123\n"));
				}
				return 0;
			}
			// git merge-base succeeds
			if (cmd === "git" && args?.[0] === "merge-base") {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("xyz789\n"));
				}
				return 0;
			}
			// git checkout
			if (cmd === "git" && args?.[0] === "checkout") {
				checkoutCount++;
				// First checkout (to merge-base) succeeds
				if (checkoutCount === 1) {
					return 0;
				}
				// Second checkout (restore HEAD) fails
				if (checkoutCount === 2) {
					throw new Error("HEAD detached");
				}
				// Third checkout (fallback with -) succeeds
				return 0;
			}
			return 0;
		});

		// File doesn't exist initially, exists for merge-base output
		let existsCount = 0;
		vi.mocked(fs.existsSync).mockImplementation(() => {
			existsCount++;
			return existsCount === 2; // Only exists for merge-base output read
		});

		vi.mocked(fs.readFileSync).mockReturnValue(
			JSON.stringify({
				releases: [{ name: "@test/pkg", newVersion: "1.0.0", type: "patch" }],
				changesets: [],
			}),
		);

		const result = await getChangesetStatus("pnpm", "main");

		expect(result.releases).toHaveLength(1);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Failed to restore HEAD"));
		// Should have attempted fallback checkout
		expect(checkoutCount).toBe(3);
	});

	it("should clean up temp file after reading", async () => {
		vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ releases: [], changesets: [] }));

		await getChangesetStatus("pnpm", "main");

		expect(fs.unlinkSync).toHaveBeenCalled();
	});

	it("should use yarn for merge base changeset status", async () => {
		// Changeset status fails on HEAD (no changesets)
		// Then succeeds at merge base using yarn
		let callCount = 0;
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			callCount++;
			// First changeset status call - no changesets
			if (cmd === "yarn" && args?.includes("changeset") && callCount === 1) {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from("no changesets were found"));
				}
				return 0;
			}
			// git rev-parse HEAD
			if (cmd === "git" && args?.[0] === "rev-parse") {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("abc123\n"));
				}
				return 0;
			}
			// git merge-base
			if (cmd === "git" && args?.[0] === "merge-base") {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("xyz789\n"));
				}
				return 0;
			}
			// git checkout
			if (cmd === "git" && args?.[0] === "checkout") {
				return 0;
			}
			// Second changeset status call at merge base using yarn
			if (cmd === "yarn" && args?.includes("changeset")) {
				return 0;
			}
			return 0;
		});

		// First existsSync returns false (no output from first call)
		// Then returns true for merge-base output
		let existsCount = 0;
		vi.mocked(fs.existsSync).mockImplementation(() => {
			existsCount++;
			return existsCount > 1;
		});

		vi.mocked(fs.readFileSync).mockReturnValue(
			JSON.stringify({
				releases: [{ name: "@test/pkg", newVersion: "1.0.0", type: "minor" }],
				changesets: [],
			}),
		);

		const result = await getChangesetStatus("yarn", "main");

		expect(result.releases).toHaveLength(1);
		expect(exec.exec).toHaveBeenCalledWith("yarn", expect.arrayContaining(["changeset", "status"]), expect.any(Object));
	});

	it("should use npm run for merge base changeset status", async () => {
		// Changeset status fails on HEAD (no changesets)
		// Then succeeds at merge base using npm
		let callCount = 0;
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			callCount++;
			// First changeset status call - no changesets
			if (cmd === "npm" && args?.includes("run") && callCount === 1) {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from("no changesets were found"));
				}
				return 0;
			}
			// git rev-parse HEAD
			if (cmd === "git" && args?.[0] === "rev-parse") {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("abc123\n"));
				}
				return 0;
			}
			// git merge-base
			if (cmd === "git" && args?.[0] === "merge-base") {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("xyz789\n"));
				}
				return 0;
			}
			// git checkout
			if (cmd === "git" && args?.[0] === "checkout") {
				return 0;
			}
			// Second changeset status call at merge base using npm
			if (cmd === "npm" && args?.includes("run")) {
				return 0;
			}
			return 0;
		});

		// First existsSync returns false (no output from first call)
		// Then returns true for merge-base output
		let existsCount = 0;
		vi.mocked(fs.existsSync).mockImplementation(() => {
			existsCount++;
			return existsCount > 1;
		});

		vi.mocked(fs.readFileSync).mockReturnValue(
			JSON.stringify({
				releases: [{ name: "@test/pkg", newVersion: "1.0.0", type: "minor" }],
				changesets: [],
			}),
		);

		const result = await getChangesetStatus("npm", "main");

		expect(result.releases).toHaveLength(1);
		expect(exec.exec).toHaveBeenCalledWith(
			"npm",
			expect.arrayContaining(["run", "changeset", "status"]),
			expect.any(Object),
		);
	});

	it("should use bun x for merge base changeset status", async () => {
		// Changeset status fails on HEAD (no changesets)
		// Then succeeds at merge base using bun
		let callCount = 0;
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			callCount++;
			// First changeset status call - no changesets
			if (cmd === "bun" && args?.includes("x") && callCount === 1) {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from("no changesets were found"));
				}
				return 0;
			}
			// git rev-parse HEAD
			if (cmd === "git" && args?.[0] === "rev-parse") {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("abc123\n"));
				}
				return 0;
			}
			// git merge-base
			if (cmd === "git" && args?.[0] === "merge-base") {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("xyz789\n"));
				}
				return 0;
			}
			// git checkout
			if (cmd === "git" && args?.[0] === "checkout") {
				return 0;
			}
			// Second changeset status call at merge base using bun
			if (cmd === "bun" && args?.includes("x")) {
				return 0;
			}
			return 0;
		});

		// First existsSync returns false (no output from first call)
		// Then returns true for merge-base output
		let existsCount = 0;
		vi.mocked(fs.existsSync).mockImplementation(() => {
			existsCount++;
			return existsCount > 1;
		});

		vi.mocked(fs.readFileSync).mockReturnValue(
			JSON.stringify({
				releases: [{ name: "@test/pkg", newVersion: "1.0.0", type: "minor" }],
				changesets: [],
			}),
		);

		const result = await getChangesetStatus("bun", "main");

		expect(result.releases).toHaveLength(1);
		expect(exec.exec).toHaveBeenCalledWith(
			"bun",
			expect.arrayContaining(["x", "changeset", "status"]),
			expect.any(Object),
		);
	});

	it("should handle empty output at merge base", async () => {
		// Changeset status returns empty output at merge base
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			// First changeset status call - no changesets
			if (cmd === "pnpm" && args?.includes("changeset")) {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from("no changesets were found"));
				}
				return 0;
			}
			// git rev-parse HEAD
			if (cmd === "git" && args?.[0] === "rev-parse") {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("abc123\n"));
				}
				return 0;
			}
			// git merge-base
			if (cmd === "git" && args?.[0] === "merge-base") {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("xyz789\n"));
				}
				return 0;
			}
			// git checkout
			if (cmd === "git" && args?.[0] === "checkout") {
				return 0;
			}
			return 0;
		});

		// File exists at merge base but has empty content
		let existsCount = 0;
		vi.mocked(fs.existsSync).mockImplementation(() => {
			existsCount++;
			return existsCount === 2; // Only exists for merge-base
		});

		vi.mocked(fs.readFileSync).mockReturnValue("   "); // Empty/whitespace only

		const result = await getChangesetStatus("pnpm", "main");

		// Should return null from merge base (empty output)
		expect(result.releases).toEqual([]);
	});

	it("should handle non-Error throw at merge base", async () => {
		let checkoutCount = 0;
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			// First changeset status call - no changesets
			if (cmd === "pnpm" && args?.includes("changeset")) {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from("no changesets were found"));
				}
				// At merge base, throw a non-Error value
				if (checkoutCount > 0) {
					throw "String error thrown";
				}
				return 0;
			}
			// git rev-parse HEAD
			if (cmd === "git" && args?.[0] === "rev-parse") {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("abc123\n"));
				}
				return 0;
			}
			// git merge-base
			if (cmd === "git" && args?.[0] === "merge-base") {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("xyz789\n"));
				}
				return 0;
			}
			// git checkout
			if (cmd === "git" && args?.[0] === "checkout") {
				checkoutCount++;
				return 0;
			}
			return 0;
		});

		vi.mocked(fs.existsSync).mockReturnValue(false);

		const result = await getChangesetStatus("pnpm", "main");

		expect(result.releases).toEqual([]);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("String error thrown"));
	});

	it("should ignore cleanup errors for temp file", async () => {
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			// First changeset status call - no changesets
			if (cmd === "pnpm" && args?.includes("changeset")) {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from("no changesets were found"));
				}
				return 0;
			}
			// git rev-parse HEAD
			if (cmd === "git" && args?.[0] === "rev-parse") {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("abc123\n"));
				}
				return 0;
			}
			// git merge-base
			if (cmd === "git" && args?.[0] === "merge-base") {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("xyz789\n"));
				}
				return 0;
			}
			// git checkout
			if (cmd === "git" && args?.[0] === "checkout") {
				return 0;
			}
			return 0;
		});

		// File exists at merge base
		let existsCount = 0;
		vi.mocked(fs.existsSync).mockImplementation(() => {
			existsCount++;
			return existsCount >= 2; // Exists for merge base read and cleanup
		});

		vi.mocked(fs.readFileSync).mockReturnValue(
			JSON.stringify({
				releases: [{ name: "@test/pkg", newVersion: "1.0.0", type: "minor" }],
				changesets: [],
			}),
		);

		// Cleanup throws
		vi.mocked(fs.unlinkSync).mockImplementation(() => {
			throw new Error("Cannot delete file");
		});

		const result = await getChangesetStatus("pnpm", "main");

		// Should still succeed despite cleanup error
		expect(result.releases).toHaveLength(1);
	});

	it("should handle file read errors gracefully", async () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockImplementation(() => {
			throw new Error("Permission denied");
		});

		// Should fall through to merge-base handling
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, _options?: ExecOptionsWithListeners) => {
			if (cmd === "git" && args?.[0] === "rev-parse") {
				throw new Error("Not a git repo");
			}
			return 0;
		});

		const result = await getChangesetStatus("pnpm", "main");

		expect(result.releases).toEqual([]);
		expect(core.debug).toHaveBeenCalledWith(expect.stringContaining("Failed to read changeset output file"));
	});

	it("should handle restore HEAD complete failure", async () => {
		let checkoutCount = 0;
		vi.mocked(exec.exec).mockImplementation(async (cmd, args, options?: ExecOptionsWithListeners) => {
			// First changeset status call - no changesets
			if (cmd === "pnpm" && args?.includes("changeset")) {
				if (options?.listeners?.stderr) {
					options.listeners.stderr(Buffer.from("No changesets present"));
				}
				return 0;
			}
			// git rev-parse HEAD succeeds
			if (cmd === "git" && args?.[0] === "rev-parse") {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("abc123\n"));
				}
				return 0;
			}
			// git merge-base succeeds
			if (cmd === "git" && args?.[0] === "merge-base") {
				if (options?.listeners?.stdout) {
					options.listeners.stdout(Buffer.from("xyz789\n"));
				}
				return 0;
			}
			// git checkout
			if (cmd === "git" && args?.[0] === "checkout") {
				checkoutCount++;
				// First checkout (to merge-base) succeeds
				if (checkoutCount === 1) {
					return 0;
				}
				// All other checkouts fail (both restore attempts)
				throw new Error("Checkout failed");
			}
			return 0;
		});

		// File exists for merge-base output
		let existsCount = 0;
		vi.mocked(fs.existsSync).mockImplementation(() => {
			existsCount++;
			return existsCount === 2;
		});

		vi.mocked(fs.readFileSync).mockReturnValue(
			JSON.stringify({
				releases: [{ name: "@test/pkg", newVersion: "1.0.0", type: "patch" }],
				changesets: [],
			}),
		);

		const result = await getChangesetStatus("pnpm", "main");

		expect(result.releases).toHaveLength(1);
		expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("Could not restore git state"));
	});
});
