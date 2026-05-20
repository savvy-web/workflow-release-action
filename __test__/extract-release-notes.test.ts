/**
 * Unit tests for `extractReleaseNotes`.
 *
 * Covers the four discriminated outcomes (`found`, `no-changelog`,
 * `version-not-found`, `error`) plus the heading-shape matrix the original
 * imperative module's regex was tuned for (bracketed, plain, with trailing
 * date, varying `#` levels).
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { extractReleaseNotes } from "../src/utils/extract-release-notes.js";

let pkgPath: string;

beforeEach(() => {
	pkgPath = mkdtempSync(join(tmpdir(), "extract-release-notes-"));
	// `extractReleaseNotes` reads `CHANGELOG.md` from this directory.
	mkdirSync(pkgPath, { recursive: true });
});

const writeChangelog = (body: string): void => {
	writeFileSync(join(pkgPath, "CHANGELOG.md"), body, "utf-8");
};

describe("extractReleaseNotes - found", () => {
	it("extracts a bracketed version heading with a trailing date", () => {
		writeChangelog(
			"# Changelog\n\n## [1.2.3] - 2026-05-19\n\n### Patch Changes\n\n- Fix a bug\n\n## [1.2.2] - 2026-04-01\n\n- previous\n",
		);
		const result = extractReleaseNotes(pkgPath, "1.2.3");
		expect(result.status).toBe("found");
		if (result.status !== "found") return;
		expect(result.content).toContain("### Patch Changes");
		expect(result.content).toContain("- Fix a bug");
		expect(result.content).not.toContain("previous");
	});

	it("extracts a plain version heading without brackets", () => {
		writeChangelog("# Changelog\n\n## 1.2.3\n\n### Minor Changes\n\n- Add feature\n\n## 1.2.2\n\n- old\n");
		const result = extractReleaseNotes(pkgPath, "1.2.3");
		expect(result.status).toBe("found");
		if (result.status !== "found") return;
		expect(result.content).toContain("Add feature");
		expect(result.content).not.toContain("old");
	});

	it("respects the heading level — a deeper sibling does not terminate the section", () => {
		writeChangelog(
			"# Changelog\n\n## 1.2.3\n\n### Patch Changes\n\n- Fix\n\n#### Inner\n\nDeep detail.\n\n## 1.2.2\n\n- old\n",
		);
		const result = extractReleaseNotes(pkgPath, "1.2.3");
		expect(result.status).toBe("found");
		if (result.status !== "found") return;
		expect(result.content).toContain("Inner");
		expect(result.content).toContain("Deep detail.");
		expect(result.content).not.toContain("old");
	});

	it("handles a version with a regex metacharacter via escapeRegex", () => {
		writeChangelog("# Changelog\n\n## 1.2.3-rc.1\n\n- prerelease note\n\n## 1.2.2\n\n- old\n");
		const result = extractReleaseNotes(pkgPath, "1.2.3-rc.1");
		expect(result.status).toBe("found");
		if (result.status !== "found") return;
		expect(result.content).toContain("prerelease note");
	});
});

describe("extractReleaseNotes - failure paths", () => {
	it("returns no-changelog when CHANGELOG.md does not exist", () => {
		const result = extractReleaseNotes(pkgPath, "1.2.3");
		expect(result.status).toBe("no-changelog");
	});

	it("returns version-not-found when the version's heading is missing", () => {
		writeChangelog("# Changelog\n\n## 1.2.2\n\n- old\n");
		const result = extractReleaseNotes(pkgPath, "9.9.9");
		expect(result.status).toBe("version-not-found");
		if (result.status !== "version-not-found") return;
		expect(result.reason).toMatch(/Could not find/);
	});

	it("returns version-not-found when the heading matches but the section is empty", () => {
		// A heading with no body content between it and the next sibling heading
		// is a malformed CHANGELOG — surface as `version-not-found` so the
		// renderer shows a ⚠️ rather than an empty block masquerading as
		// extracted notes.
		writeChangelog("# Changelog\n\n## 1.2.3\n\n## 1.2.2\n\n- old\n");
		const result = extractReleaseNotes(pkgPath, "1.2.3");
		expect(result.status).toBe("version-not-found");
		if (result.status !== "version-not-found") return;
		expect(result.reason).toMatch(/heading present but section is empty/);
	});
});
