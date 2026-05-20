/**
 * Extract a version section from a package's `CHANGELOG.md`.
 *
 * @remarks
 * Pure function — file I/O via `node:fs`, no GitHub or Effect dependencies.
 * The version-heading regex matches every common heading shape changesets and
 * release-please emit:
 *
 * - `## [1.0.0] - 2024-01-01`
 * - `## 1.0.0`
 * - `# [1.0.0]`
 * - `### 1.0.0 (2024-01-01)`
 *
 * Returns a discriminated result so the caller can render `found` content,
 * an explanatory "no CHANGELOG" or "version not found" status, or an error
 * (e.g. unreadable file) without throwing.
 *
 * @module utils/extract-release-notes
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Discriminated outcome of {@link extractReleaseNotes}.
 *
 * @public
 */
export type ReleaseNotesExtraction =
	| { readonly status: "found"; readonly content: string }
	| { readonly status: "no-changelog" }
	| { readonly status: "version-not-found"; readonly reason: string }
	| { readonly status: "error"; readonly message: string };

/**
 * Escape all regex metacharacters in a string so it can be embedded in a
 * `new RegExp(...)` pattern without unintended pattern semantics.
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract the section of `changelogContent` that belongs to `version`.
 *
 * @param changelogContent - The full `CHANGELOG.md` text.
 * @param version - The version string to locate (e.g. `5.0.13`).
 * @returns The extracted section without its heading, or an error sentinel
 *   `"Could not find version section in CHANGELOG"` when no matching heading
 *   exists.
 *
 * @internal
 */
function extractVersionSection(changelogContent: string, version: string): string {
	// Match heading shapes: `## [1.0.0] - 2024-01-01`, `## 1.0.0`,
	// `# [1.0.0]`, `### 1.0.0 (2024-01-01)`. Brackets and trailing text are
	// optional; the version itself is anchored.
	const versionPattern = new RegExp(`^#+\\s+\\[?${escapeRegex(version)}\\]?.*$`, "im");
	const match = changelogContent.match(versionPattern);

	if (!match || match.index === undefined) {
		return "Could not find version section in CHANGELOG";
	}

	const startIndex = match.index;
	const lines = changelogContent.slice(startIndex).split("\n");

	// The next heading of the SAME or HIGHER level (fewer `#`s) terminates
	// this version's section. `match[0]` is guaranteed to start with `#+`.
	const headingLevel = (match[0].match(/^#+/) ?? ["##"])[0].length;
	const endPattern = new RegExp(`^#{1,${headingLevel}}\\s+`);

	let endIndex = lines.length;
	for (let i = 1; i < lines.length; i++) {
		if (endPattern.test(lines[i] ?? "")) {
			endIndex = i;
			break;
		}
	}

	// Drop the heading itself — callers want just the section body.
	const section = lines.slice(0, endIndex).join("\n").trim();
	const contentLines = section.split("\n").slice(1);
	return contentLines.join("\n").trim();
}

/**
 * Read `packagePath/CHANGELOG.md` and return the section for `version`.
 *
 * @param packagePath - Absolute path to the package directory.
 * @param version - The version being released (e.g. `5.0.13`).
 * @returns Discriminated extraction result.
 *
 * @public
 */
export function extractReleaseNotes(packagePath: string, version: string): ReleaseNotesExtraction {
	const changelogPath = join(packagePath, "CHANGELOG.md");

	if (!existsSync(changelogPath)) {
		return { status: "no-changelog" };
	}

	let changelogContent: string;
	try {
		changelogContent = readFileSync(changelogPath, "utf-8");
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		return { status: "error", message };
	}

	const section = extractVersionSection(changelogContent, version);
	if (section.startsWith("Could not find")) {
		return { status: "version-not-found", reason: section };
	}

	if (section.trim() === "") {
		// The heading matched but the section is empty — treat as version-not-
		// found rather than `found`-with-empty-content so the renderer can show
		// an honest "no notes for this version" warning instead of an empty
		// block that looks like a generation bug.
		return { status: "version-not-found", reason: `Version ${version} heading present but section is empty` };
	}

	return { status: "found", content: section };
}
