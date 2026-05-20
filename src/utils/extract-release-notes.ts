/**
 * Extract the topmost release section from a package's `CHANGELOG.md`.
 *
 * @remarks
 * Pure function — file I/O via `node:fs`, no GitHub or Effect dependencies.
 *
 * Rule: the **first H2** in `CHANGELOG.md` is the newest entry (changeset
 * version always inserts new versions at the top), and the content runs to
 * the **next H2** (or end-of-file when this is the package's first release).
 * The H2 heading shape itself can be either:
 *
 * - `## 5.0.13` (fixed-release mode), or
 * - `## @savvy-web/standalone-package@0.9.5` (multi-package tagged mode).
 *
 * Both formats are accepted — the extractor only locates the H2 boundaries.
 * GitHub Releases later inserts the same H2 heading verbatim when posting the
 * release notes, so the body extracted here is exactly what the consumer
 * will see on the release page.
 *
 * Returns a discriminated result so the caller can render `found` content,
 * an explanatory "no CHANGELOG" or "no version section" status, or a read
 * error without throwing.
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
 * Read `packagePath/CHANGELOG.md` and return the body of its first H2 section.
 *
 * @param packagePath - Absolute path to the package directory.
 * @returns Discriminated extraction result.
 *
 * @public
 */
export function extractReleaseNotes(packagePath: string): ReleaseNotesExtraction {
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

	const lines = changelogContent.split("\n");
	let firstH2 = -1;
	let secondH2 = -1;
	for (let i = 0; i < lines.length; i++) {
		// `^## ` (exactly two `#` then a space) — H1 (a single `#`) is the
		// CHANGELOG title and never a release section; H3+ are sub-sections
		// inside a release and must not terminate it.
		if (/^## /.test(lines[i] ?? "")) {
			if (firstH2 === -1) {
				firstH2 = i;
			} else {
				secondH2 = i;
				break;
			}
		}
	}

	if (firstH2 === -1) {
		return { status: "version-not-found", reason: "CHANGELOG has no H2 section" };
	}

	const endIndex = secondH2 === -1 ? lines.length : secondH2;
	const content = lines
		.slice(firstH2 + 1, endIndex)
		.join("\n")
		.trim();

	if (content === "") {
		return {
			status: "version-not-found",
			reason: "First H2 section has no content",
		};
	}

	return { status: "found", content };
}
