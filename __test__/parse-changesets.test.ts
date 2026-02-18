import * as fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BumpType } from "../src/utils/parse-changesets.js";
import {
	compareBumpTypes,
	countChangesets,
	getHighestBumpType,
	hasChangesets,
	parseChangesetFile,
	parseChangesets,
} from "../src/utils/parse-changesets.js";

// Mock node:fs
vi.mock("node:fs");

describe("parse-changesets", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("parseChangesetFile", () => {
		it("should parse a valid changeset file with single package", () => {
			const content = `---
"my-package": minor
---

Added a new feature`;

			const result = parseChangesetFile(content, "abc123");

			expect(result).toEqual({
				id: "abc123",
				summary: "Added a new feature",
				releases: [{ name: "my-package", type: "minor" }],
			});
		});

		it("should parse a changeset with multiple packages", () => {
			const content = `---
"@scope/package-a": major
"@scope/package-b": minor
"package-c": patch
---

Breaking change to package-a, new feature in package-b, fix in package-c`;

			const result = parseChangesetFile(content, "multi-change");

			expect(result).toEqual({
				id: "multi-change",
				summary: "Breaking change to package-a, new feature in package-b, fix in package-c",
				releases: [
					{ name: "@scope/package-a", type: "major" },
					{ name: "@scope/package-b", type: "minor" },
					{ name: "package-c", type: "patch" },
				],
			});
		});

		it("should handle single quotes around package names", () => {
			const content = `---
'my-package': patch
---

Fix bug`;

			const result = parseChangesetFile(content, "single-quotes");

			expect(result).toEqual({
				id: "single-quotes",
				summary: "Fix bug",
				releases: [{ name: "my-package", type: "patch" }],
			});
		});

		it("should handle package names without quotes", () => {
			const content = `---
my-package: minor
---

Summary`;

			const result = parseChangesetFile(content, "no-quotes");

			expect(result).toEqual({
				id: "no-quotes",
				summary: "Summary",
				releases: [{ name: "my-package", type: "minor" }],
			});
		});

		it("should return null for invalid format (no frontmatter)", () => {
			const content = `Just some text without frontmatter`;

			const result = parseChangesetFile(content, "invalid");

			expect(result).toBeNull();
		});

		it("should return null for malformed frontmatter", () => {
			const content = `---
not valid yaml format here
Summary`;

			const result = parseChangesetFile(content, "malformed");

			expect(result).toBeNull();
		});

		it("should handle empty summary", () => {
			const content = `---
"my-package": patch
---
`;

			const result = parseChangesetFile(content, "empty-summary");

			expect(result).toEqual({
				id: "empty-summary",
				summary: "",
				releases: [{ name: "my-package", type: "patch" }],
			});
		});

		it("should handle multiline summary", () => {
			const content = `---
"my-package": minor
---

This is a multiline summary.

It has multiple paragraphs.

- And a list
- With items`;

			const result = parseChangesetFile(content, "multiline");

			expect(result?.summary).toContain("This is a multiline summary.");
			expect(result?.summary).toContain("- And a list");
		});

		it("should ignore empty lines in frontmatter", () => {
			const content = `---

"my-package": minor

---

Summary`;

			const result = parseChangesetFile(content, "with-blanks");

			expect(result).toEqual({
				id: "with-blanks",
				summary: "Summary",
				releases: [{ name: "my-package", type: "minor" }],
			});
		});
	});

	describe("compareBumpTypes", () => {
		it("should return positive when first is greater", () => {
			expect(compareBumpTypes("major", "minor")).toBeGreaterThan(0);
			expect(compareBumpTypes("major", "patch")).toBeGreaterThan(0);
			expect(compareBumpTypes("minor", "patch")).toBeGreaterThan(0);
		});

		it("should return negative when first is lesser", () => {
			expect(compareBumpTypes("minor", "major")).toBeLessThan(0);
			expect(compareBumpTypes("patch", "major")).toBeLessThan(0);
			expect(compareBumpTypes("patch", "minor")).toBeLessThan(0);
		});

		it("should return zero when equal", () => {
			expect(compareBumpTypes("major", "major")).toBe(0);
			expect(compareBumpTypes("minor", "minor")).toBe(0);
			expect(compareBumpTypes("patch", "patch")).toBe(0);
		});
	});

	describe("getHighestBumpType", () => {
		it("should return null for empty map", () => {
			expect(getHighestBumpType(new Map())).toBeNull();
		});

		it("should return the single bump type", () => {
			const bumps = new Map<string, BumpType>([["pkg-a", "minor"]]);
			expect(getHighestBumpType(bumps)).toBe("minor");
		});

		it("should return major when present", () => {
			const bumps = new Map<string, BumpType>([
				["pkg-a", "patch"],
				["pkg-b", "major"],
				["pkg-c", "minor"],
			]);
			expect(getHighestBumpType(bumps)).toBe("major");
		});

		it("should return minor when no major present", () => {
			const bumps = new Map<string, BumpType>([
				["pkg-a", "patch"],
				["pkg-b", "minor"],
			]);
			expect(getHighestBumpType(bumps)).toBe("minor");
		});

		it("should return patch when only patches", () => {
			const bumps = new Map<string, BumpType>([
				["pkg-a", "patch"],
				["pkg-b", "patch"],
			]);
			expect(getHighestBumpType(bumps)).toBe("patch");
		});
	});

	describe("parseChangesets", () => {
		it("should return empty result when directory does not exist", () => {
			vi.mocked(fs.existsSync).mockReturnValue(false);

			const result = parseChangesets();

			expect(result.hasChangesets).toBe(false);
			expect(result.changesetCount).toBe(0);
			expect(result.changesets).toEqual([]);
		});

		it("should return empty result when no .md files", () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readdirSync).mockReturnValue(["config.json"] as unknown as ReturnType<typeof fs.readdirSync>);

			const result = parseChangesets();

			expect(result.hasChangesets).toBe(false);
			expect(result.changesetCount).toBe(0);
		});

		it("should exclude README.md from changeset count", () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readdirSync).mockReturnValue(["README.md", "readme.md"] as unknown as ReturnType<
				typeof fs.readdirSync
			>);

			const result = parseChangesets();

			expect(result.hasChangesets).toBe(false);
			expect(result.changesetCount).toBe(0);
		});

		it("should parse all changeset files", () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readdirSync).mockReturnValue(["abc.md", "def.md"] as unknown as ReturnType<typeof fs.readdirSync>);
			vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
				if (String(filePath).includes("abc.md")) {
					return `---
"pkg-a": major
---

Major change`;
				}
				return `---
"pkg-b": minor
---

Minor change`;
			});

			const result = parseChangesets();

			expect(result.hasChangesets).toBe(true);
			expect(result.changesetCount).toBe(2);
			expect(result.changesets).toHaveLength(2);
			expect(result.releaseType).toBe("major");
			expect(result.affectedPackages).toEqual(["pkg-a", "pkg-b"]);
		});

		it("should calculate highest bump per package across multiple changesets", () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readdirSync).mockReturnValue(["first.md", "second.md"] as unknown as ReturnType<
				typeof fs.readdirSync
			>);
			vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
				if (String(filePath).includes("first.md")) {
					return `---
"shared-pkg": patch
---

Patch in first`;
				}
				return `---
"shared-pkg": minor
---

Minor in second`;
			});

			const result = parseChangesets();

			expect(result.packageBumps.get("shared-pkg")).toBe("minor");
		});

		it("should use custom changeset path", () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readdirSync).mockReturnValue([] as unknown as ReturnType<typeof fs.readdirSync>);

			parseChangesets({ changesetPath: "custom/.changesets" });

			expect(fs.existsSync).toHaveBeenCalledWith(expect.stringContaining("custom/.changesets"));
		});

		it("should handle absolute paths", () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readdirSync).mockReturnValue([] as unknown as ReturnType<typeof fs.readdirSync>);

			// Use an actual absolute path - path.isAbsolute will return true for paths starting with /
			parseChangesets({ changesetPath: "/absolute/path/.changeset" });

			expect(fs.existsSync).toHaveBeenCalledWith("/absolute/path/.changeset");
		});

		it("should skip invalid changeset files", () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readdirSync).mockReturnValue(["valid.md", "invalid.md"] as unknown as ReturnType<
				typeof fs.readdirSync
			>);

			// Use mockReturnValueOnce for predictable ordering
			vi.mocked(fs.readFileSync)
				.mockReturnValueOnce(`---
"pkg": patch
---

Valid`)
				.mockReturnValueOnce("No frontmatter here");

			const result = parseChangesets();

			expect(result.changesetCount).toBe(2); // Both files counted
			expect(result.changesets).toHaveLength(1); // Only valid parsed
			expect(result.affectedPackages).toEqual(["pkg"]);
		});
	});

	describe("hasChangesets", () => {
		it("should return false when directory does not exist", () => {
			vi.mocked(fs.existsSync).mockReturnValue(false);

			expect(hasChangesets()).toBe(false);
		});

		it("should return false when no .md files", () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readdirSync).mockReturnValue(["config.json"] as unknown as ReturnType<typeof fs.readdirSync>);

			expect(hasChangesets()).toBe(false);
		});

		it("should return true when .md files exist (excluding README)", () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readdirSync).mockReturnValue(["README.md", "abc.md"] as unknown as ReturnType<
				typeof fs.readdirSync
			>);

			expect(hasChangesets()).toBe(true);
		});

		it("should use custom path", () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readdirSync).mockReturnValue(["change.md"] as unknown as ReturnType<typeof fs.readdirSync>);

			expect(hasChangesets("custom/path")).toBe(true);
			expect(fs.existsSync).toHaveBeenCalledWith(expect.stringContaining("custom/path"));
		});
	});

	describe("countChangesets", () => {
		it("should return 0 when directory does not exist", () => {
			vi.mocked(fs.existsSync).mockReturnValue(false);

			expect(countChangesets()).toBe(0);
		});

		it("should return count excluding README.md", () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readdirSync).mockReturnValue([
				"README.md",
				"abc.md",
				"def.md",
				"config.json",
			] as unknown as ReturnType<typeof fs.readdirSync>);

			expect(countChangesets()).toBe(2);
		});

		it("should use custom path", () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readdirSync).mockReturnValue(["a.md", "b.md", "c.md"] as unknown as ReturnType<
				typeof fs.readdirSync
			>);

			expect(countChangesets("custom")).toBe(3);
		});
	});
});
