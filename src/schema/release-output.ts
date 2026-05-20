/**
 * The release action's structured JSON output contract.
 *
 * @remarks
 * `ReleaseOutput` is a `Schema.Union` of three phase structs, discriminated by
 * the `phase` literal. It is the single source of truth: the committed
 * `silk-release-action.output.schema.json` is generated from it, and
 * `main.ts` emits a Schema-encoded instance as the `result` action output.
 *
 * Field order matters — `setJson` serialises in declaration order, so `$schema`
 * is declared first in every phase struct.
 */

import { Schema } from "effect";

/** Hosted JSON Schema URL; the emitted `result` carries this as `$schema`. */
export const SCHEMA_URL =
	"https://raw.githubusercontent.com/savvy-web/silk-release-action/main/silk-release-action.output.schema.json";

/**
 * In-band schema version. Bumped only on a breaking JSON-shape change
 * (removed/renamed field, changed type) — additive fields do not bump it.
 */
export const SCHEMA_VERSION = "1";

const StatusLiteral = Schema.Literal("no-op", "success", "partial", "failed").annotations({
	identifier: "ReleaseStatus",
	title: "Release status",
	description:
		"Coarse human-readable status label, derived from the machine flags. `no-op`: nothing to do this run; `success`: the phase completed cleanly; `partial`: the phase completed but with at least one failure; `failed`: the phase did not succeed and did not produce partial results. Consumers needing failure granularity should read `succeeded`/`hasFailures` and the phase payload instead.",
});

/** The three orthogonal machine flags every phase derives. */
export interface ReleaseFlags {
	readonly noop: boolean;
	readonly succeeded: boolean;
	readonly hasFailures: boolean;
}

/** Human-readable status label — derived from the flags, never the contract. */
export type ReleaseStatus = Schema.Schema.Type<typeof StatusLiteral>;

/**
 * Derive the human-readable `status` label from the machine flags.
 *
 * @remarks
 * Precedence: no-op wins, then success, then partial, then failed. `status` is
 * a coarse label for logs and summaries only — the three flags (`noop`,
 * `succeeded`, `hasFailures`) are the machine contract.
 *
 * Because the projections set `hasFailures` on *any* failure, `"partial"`
 * here means "completed with failures" — it does not distinguish a fully
 * failed run from a mixed one (the three booleans carry no "some work landed"
 * signal). The `"failed"` arm is therefore a defensive fallthrough that the
 * current projections never reach; a consumer that needs failure granularity
 * should read `succeeded`/`hasFailures` and the phase payload, not `status`.
 */
export const deriveStatus = (flags: ReleaseFlags): ReleaseStatus => {
	if (flags.noop) return "no-op";
	if (flags.succeeded) return "success";
	if (flags.hasFailures) return "partial";
	return "failed";
};

// --- shared top-level field annotations ----------------------------------

/**
 * Reusable annotated `$schema` field — the URL of the hosted JSON Schema
 * the `result` output conforms to.
 *
 * Inlined per-phase because `Schema.Literal(SCHEMA_URL)` must remain a literal
 * for the union discriminator to narrow correctly; only the annotations are
 * factored out via a helper.
 */
const annotatedSchemaUrlField = Schema.Literal(SCHEMA_URL).annotations({
	title: "JSON Schema URL",
	description:
		"URL of the hosted JSON Schema this output conforms to. Editors and json-schema-aware consumers use this for hover docs and validation.",
});

const annotatedSchemaVersionField = Schema.Literal(SCHEMA_VERSION).annotations({
	title: "Schema version",
	description:
		"In-band schema version. Bumped only on a breaking JSON-shape change (removed/renamed field, changed type) — additive fields do not bump it.",
});

const annotatedSucceededField = Schema.Boolean.annotations({
	title: "Succeeded",
	description: "True when the phase completed cleanly with no failures.",
});

const annotatedHasFailuresField = Schema.Boolean.annotations({
	title: "Has failures",
	description: "True when at least one operation in the phase failed. Set on any failure, including partial ones.",
});

const annotatedDryRunField = Schema.Boolean.annotations({
	title: "Dry run",
	description:
		"True when the action ran with `dry-run: true`. Phase 3 publishes nothing in dry-run mode; Phases 1 and 2 still observe and report, but mutations (branch updates, PR creation/updating) are suppressed.",
});

// --- branch-management phase ---------------------------------------------

const BranchManagementPayload = Schema.Struct({
	releaseBranch: Schema.Struct({
		name: Schema.String.annotations({
			title: "Release branch name",
			description: "The git branch name the release PR targets and changeset versioning lands on.",
			examples: ["changeset-release/main"],
		}),
		existed: Schema.Boolean.annotations({
			title: "Branch existed",
			description: "True when the release branch already existed before this run; false when it was just created.",
		}),
		created: Schema.Boolean.annotations({
			title: "Branch created",
			description: "True when this run created the release branch.",
		}),
		updated: Schema.Boolean.annotations({
			title: "Branch updated",
			description: "True when this run pushed new commits to the release branch (changeset version bumps, etc.).",
		}),
		hasConflicts: Schema.Boolean.annotations({
			title: "Has conflicts",
			description:
				"True when the release branch could not be cleanly fast-forwarded over the target branch and a merge conflict was detected. When true, the release branch needs manual conflict resolution before subsequent runs can complete; the action will keep failing on this branch until the conflict is resolved.",
		}),
	}).annotations({
		identifier: "BranchManagementReleaseBranch",
		title: "Release branch state",
		description:
			"The state of the release branch after Phase 1 — whether it existed, was created/updated, and any conflicts.",
	}),
	releasePr: Schema.NullOr(
		Schema.Struct({
			number: Schema.Number.annotations({
				title: "Release PR number",
				description: "The GitHub PR number for the release PR.",
			}),
			url: Schema.String.annotations({
				title: "Release PR URL",
				description: "The HTML URL of the release PR on GitHub.",
				examples: ["https://github.com/owner/repo/pull/123"],
			}),
			action: Schema.Literal("created", "updated").annotations({
				title: "Release PR action",
				description: "Whether this run created the release PR or updated an existing one.",
			}),
		}).annotations({
			identifier: "BranchManagementReleasePr",
			title: "Release PR state",
			description:
				"The release PR's number, URL, and the action this run took on it. Null when no PR was created (no changesets to release).",
		}),
	),
	changesets: Schema.Struct({
		count: Schema.Number.annotations({
			title: "Changeset count",
			description: "The number of changeset files observed in the `.changeset/` directory.",
		}),
		packages: Schema.Array(
			Schema.Struct({
				name: Schema.String.annotations({
					title: "Package name",
					description: "The npm package name the changeset bumps.",
				}),
				bumpType: Schema.Literal("major", "minor", "patch").annotations({
					identifier: "ChangesetsBumpType",
					title: "Changeset bump type",
					description:
						"Phase 1's declared bump type, read from changeset frontmatter: `major`, `minor`, or `patch`. The validation phase emits an extended set under `ValidationBumpType` that adds `new` and `unknown`.",
				}),
			}).annotations({
				identifier: "BranchManagementChangesetPackage",
				title: "Changeset package",
				description: "One package affected by the observed changesets, with its derived semver bump.",
			}),
		).annotations({
			title: "Changeset packages",
			description:
				"The set of packages the observed changesets bump, with the derived semver bump per package. Empty array when no changesets were found; the action emits a no-op in that case.",
		}),
	}).annotations({
		identifier: "BranchManagementChangesets",
		title: "Changesets observed",
		description: "Summary of the changesets observed this run — total count and the per-package bump types.",
	}),
}).annotations({
	identifier: "BranchManagementPayload",
	title: "Branch Management payload",
	description:
		"Phase 1 outcome — the release-branch ensure/create result, the release PR (created or updated, null when no changesets), and the changesets observed in `.changeset/` with their derived per-package bumps.",
});

export const BranchManagementOutput = Schema.Struct({
	$schema: annotatedSchemaUrlField,
	schemaVersion: annotatedSchemaVersionField,
	phase: Schema.Literal("branch-management").annotations({
		title: "Phase discriminator",
		description: "`branch-management` identifies this as a Phase 1 output.",
	}),
	status: StatusLiteral,
	noop: Schema.Boolean.annotations({
		title: "No-op",
		description:
			"True when no changesets were found and no release-branch updates were necessary; the phase exits without touching the branch or opening a PR.",
	}),
	succeeded: annotatedSucceededField,
	hasFailures: annotatedHasFailuresField,
	dryRun: annotatedDryRunField,
	branchManagement: BranchManagementPayload,
}).annotations({
	identifier: "BranchManagementOutput",
	title: "Branch Management output (Phase 1)",
	description:
		"The structured `result` output emitted when the action runs in the branch-management phase (Phase 1). Triggered by a push to the target branch; ensures/creates the release branch and the release PR.",
	examples: [
		{
			$schema: SCHEMA_URL,
			schemaVersion: SCHEMA_VERSION,
			phase: "branch-management",
			status: "success",
			noop: false,
			succeeded: true,
			hasFailures: false,
			dryRun: false,
			branchManagement: {
				releaseBranch: {
					name: "changeset-release/main",
					existed: true,
					created: false,
					updated: true,
					hasConflicts: false,
				},
				releasePr: {
					number: 42,
					url: "https://github.com/savvy-web/example-repo/pull/42",
					action: "updated",
				},
				changesets: {
					count: 1,
					packages: [{ name: "@savvy-web/example", bumpType: "minor" }],
				},
			},
		},
	],
});
export type BranchManagementOutput = Schema.Schema.Type<typeof BranchManagementOutput>;

// --- validation phase ----------------------------------------------------

/** The build-validation step's per-row checks table outcome. */
const ValidationCheck = Schema.Struct({
	name: Schema.String.annotations({
		title: "Check name",
		description:
			"Row label for the Validation Checks table. Canonical five-row set today: 'Build Validation', 'Link Issues', 'Publish Validation', 'Release Notes Preview', 'SBOM Preview'.",
		examples: ["Build Validation", "Link Issues", "Publish Validation", "Release Notes Preview", "SBOM Preview"],
	}),
	status: Schema.Literal("pass", "warning", "error").annotations({
		title: "Check status",
		description:
			"`pass` — the check passed; `warning` — the check raised a non-blocking warning; `error` — the check failed and blocks the release.",
	}),
	outcome: Schema.String.annotations({
		title: "Outcome message",
		description: "Short human-readable summary of the check's outcome (e.g. counts, registry names, error class).",
	}),
	url: Schema.NullOr(
		Schema.String.annotations({
			title: "Check URL",
			description:
				"URL pointing to detail for this check (a check-run URL or external report). Null when no URL applies.",
		}),
	),
}).annotations({
	identifier: "ValidationCheck",
	title: "Validation check row",
	description:
		"One row of the five-row Validation Checks table shown in the release PR comment and the unified check-run summary.",
});

/** A non-pass outcome — the package / build directory it concerns. */
const ValidationFindingScope = Schema.Struct({
	package: Schema.NullOr(
		Schema.String.annotations({
			title: "Package name",
			description:
				"The npm package name the finding concerns. When non-null, equals the `name` of an entry in `publish.packages[]`. When null, the finding is global to the validation run rather than tied to a specific package.",
		}),
	),
	directory: Schema.NullOr(
		Schema.String.annotations({
			title: "Build directory",
			description:
				"The build output directory the finding concerns, package-relative. When non-null, equals the `directory` of an entry in the owning package's `builds[]`. When null, the finding concerns the package as a whole rather than a specific build.",
			examples: ["dist/npm", "dist/jsr"],
		}),
	),
}).annotations({
	identifier: "ValidationFindingScope",
	title: "Validation finding scope",
	description:
		"What a non-pass finding concerns: which package and which of its build directories. `package` is null for global findings; `directory` is null for findings not tied to a specific build directory.",
});

/** Every non-pass validation outcome, projected for the comment / consumers. */
const ValidationFinding = Schema.Struct({
	severity: Schema.Literal("error", "warning").annotations({
		title: "Finding severity",
		description:
			"`error` — fails the validation phase; the release PR is blocked from merging until resolved. `warning` — advisory only and does not block the release; the comment surfaces it for the author to read.",
	}),
	check: Schema.String.annotations({
		title: "Owning check",
		description:
			"The validation check that produced this finding (e.g. `Build Validation`, `Publish Validation`). Equal to the `name` of an entry in `checks[]`. Consumers can group findings under their owning check by joining on this value.",
	}),
	scope: Schema.NullOr(ValidationFindingScope),
	message: Schema.String.annotations({
		title: "Finding message",
		description: "Human-readable description of the finding, suitable for direct display in the release PR comment.",
	}),
}).annotations({
	identifier: "ValidationFinding",
	title: "Validation finding",
	description:
		"Every non-pass validation outcome — `error` fails the check and blocks the release; `warning` is advisory. Findings are projected for the release PR comment and for downstream consumers of the `result` output.",
});

/** The SBOM preview for one build directory. */
const ValidationBuildSbom = Schema.Struct({
	componentCount: Schema.Number.annotations({
		title: "Component count",
		description:
			"Number of components (direct + transitive dependencies) in the BOM. 0 is legitimate for a dependency-free package.",
	}),
	ntiaCompliant: Schema.Boolean.annotations({
		title: "NTIA compliant",
		description:
			"True when the BOM satisfies every NTIA minimum-elements field. False when at least one field is missing — see `missingNtiaFields`.",
	}),
	missingNtiaFields: Schema.Array(Schema.String).annotations({
		title: "Missing NTIA fields",
		description: "Names of the NTIA minimum-elements fields the BOM is missing. Empty when `ntiaCompliant` is true.",
		examples: [["Supplier Name", "Author"], ["Timestamp"]],
	}),
}).annotations({
	identifier: "ValidationBuildSbom",
	title: "SBOM preview",
	description:
		"Per-build SBOM preview: component count, NTIA minimum-elements compliance, and the list of missing NTIA fields when not compliant.",
});

/** A single registry target under a build — its per-registry publish readiness. */
const ValidationBuildTarget = Schema.Struct({
	registry: Schema.String.annotations({
		title: "Registry URL",
		description: "The registry endpoint this target would publish to.",
		examples: ["https://registry.npmjs.org/", "https://npm.pkg.github.com/", "https://jsr.io"],
	}),
	status: Schema.Literal("ready", "skipped", "failed").annotations({
		title: "Target readiness",
		description:
			"`ready` — the dry-run publish probe succeeded and the target is ready to publish; `skipped` — the target was intentionally not probed (e.g. unconfigured or filtered out); `failed` — the dry-run probe failed and the target would not publish.",
	}),
	access: Schema.Literal("public", "restricted").annotations({
		title: "Access level",
		description:
			"`public` — the package would publish publicly; `restricted` — the package would publish privately (scoped, restricted access).",
	}),
	provenance: Schema.Boolean.annotations({
		title: "Provenance",
		description: "True when the target supports and would emit npm OIDC sigstore provenance attestations.",
	}),
}).annotations({
	identifier: "ValidationBuildTarget",
	title: "Publish target",
	description:
		"Per-registry publish readiness for a single build directory: `ready` / `skipped` / `failed`, plus access level and provenance support.",
});

/** A build — one per unique target directory of a released package. */
const ValidationBuild = Schema.Struct({
	directory: Schema.String.annotations({
		title: "Build directory",
		description:
			"Package-relative path to the build's output directory. One build is produced per unique output directory; the tarball is packed once and shared across all targets publishing this directory.",
		examples: ["dist/npm", "dist/jsr"],
	}),
	packedBytes: Schema.NullOr(
		Schema.Number.annotations({
			title: "Packed size (bytes)",
			description: "Size of the packed tarball in bytes. Null when the dry-run did not report it.",
		}),
	),
	unpackedBytes: Schema.NullOr(
		Schema.Number.annotations({
			title: "Unpacked size (bytes)",
			description: "Size of the unpacked contents in bytes. Null when the dry-run did not report it.",
		}),
	),
	fileCount: Schema.NullOr(
		Schema.Number.annotations({
			title: "File count",
			description: "Number of files in the packed tarball. Null when the dry-run did not report it.",
		}),
	),
	sbom: Schema.NullOr(ValidationBuildSbom),
	targets: Schema.Array(ValidationBuildTarget).annotations({
		title: "Publish targets",
		description: "The registry targets this build would publish to, with per-target readiness.",
	}),
}).annotations({
	identifier: "ValidationBuild",
	title: "Build",
	description:
		"One unique output directory of a released package. The tarball is packed once and shared across all registry targets publishing this directory; per-target readiness is enumerated in `targets`.",
});

/**
 * The CHANGELOG.md section extracted for the new version.
 *
 * @remarks
 * Discriminated by `status`. The validation phase reads each released
 * package's `CHANGELOG.md` (already populated by `changeset version`) and
 * locates the section for the new version. The shape mirrors the
 * `ReleaseNotesExtraction` type in `utils/extract-release-notes.ts` so the
 * pure extractor and the schema-encoded output share one wire format.
 */
const ValidationReleaseNotes = Schema.Union(
	Schema.Struct({
		status: Schema.Literal("found").annotations({
			title: "Found",
			description: "The CHANGELOG.md was found and the section for the new version was successfully extracted.",
		}),
		content: Schema.String.annotations({
			title: "Release notes content",
			description: "The extracted Markdown content of the CHANGELOG.md section for the new version.",
		}),
	}).annotations({
		identifier: "ReleaseNotesFound",
		title: "Release notes found",
		description: "The CHANGELOG.md exists and the section for the new version was located and extracted.",
	}),
	Schema.Struct({
		status: Schema.Literal("no-changelog").annotations({
			title: "No CHANGELOG.md",
			description: "The package has no CHANGELOG.md file — no release notes can be extracted.",
		}),
	}).annotations({
		identifier: "ReleaseNotesNoChangelog",
		title: "Release notes — no CHANGELOG.md",
		description:
			"The package has no CHANGELOG.md file. This is non-fatal; the GitHub release is created with the version-bump summary instead.",
	}),
	Schema.Struct({
		status: Schema.Literal("version-not-found").annotations({
			title: "Version not found",
			description: "The CHANGELOG.md exists but no section for the new version was found.",
		}),
		reason: Schema.String.annotations({
			title: "Reason",
			description:
				"Human-readable explanation of why the version section was not located (e.g. parser couldn't find a matching heading).",
		}),
	}).annotations({
		identifier: "ReleaseNotesVersionNotFound",
		title: "Release notes — version not found",
		description: "The CHANGELOG.md exists but no section for the new version was found.",
	}),
	Schema.Struct({
		status: Schema.Literal("error").annotations({
			title: "Error",
			description: "An error occurred while attempting to read or parse the CHANGELOG.md.",
		}),
		message: Schema.String.annotations({
			title: "Error message",
			description: "The error message from the failed read/parse operation.",
		}),
	}).annotations({
		identifier: "ReleaseNotesError",
		title: "Release notes — error",
		description:
			"An error occurred while attempting to read or parse the CHANGELOG.md. Non-fatal — the release still proceeds; the GitHub Release body falls back to an auto-generated bump summary.",
	}),
).annotations({
	identifier: "ValidationReleaseNotes",
	title: "Release notes extraction",
	description:
		"Discriminated outcome of reading the package's CHANGELOG.md (already populated by `changeset version`) and locating the section for the new version: `found`, `no-changelog`, `version-not-found`, or `error`.",
});

/** A released package and the builds it produces. */
const ValidationPublishPackage = Schema.Struct({
	name: Schema.String.annotations({
		title: "Package name",
		description: "The npm package name being released.",
	}),
	version: Schema.String.annotations({
		title: "New version",
		description: "The new semver version this release would publish.",
		examples: ["1.2.3", "0.4.0-beta.1"],
	}),
	baseVersion: Schema.NullOr(
		Schema.String.annotations({
			title: "Base version",
			description: "The previously published version this release is bumped from. Null when this is the first publish.",
		}),
	),
	bumpType: Schema.Literal("major", "minor", "patch", "new", "unknown").annotations({
		identifier: "ValidationBumpType",
		title: "Bump type",
		description:
			"The validation phase's package bump type, derived by diffing the release-branch version against the target-branch version. A superset of `ChangesetsBumpType` (Phase 1 declared bumps): `major`/`minor`/`patch` are the standard semver bumps, and this enum adds `new` (no prior published version exists on the target branch) and `unknown` (could not be determined, typically when the prior version was a pre-release tag).",
	}),
	changesetCount: Schema.NullOr(
		Schema.Number.annotations({
			title: "Changeset count",
			description: "Number of changesets contributing to this package's bump. Null when unknown.",
		}),
	),
	ready: Schema.Boolean.annotations({
		title: "Ready",
		description: "True when every publish target for this package's builds passed its dry-run probe.",
	}),
	versionOnly: Schema.Boolean.annotations({
		title: "Version-only",
		description:
			"True when the package has no publish targets — only a GitHub release (and tag) is produced. Used for repos that version a package but don't publish it to a registry.",
	}),
	builds: Schema.Array(ValidationBuild).annotations({
		title: "Builds",
		description: "The unique output directories this package produces, one entry per build.",
	}),
	releaseNotes: ValidationReleaseNotes,
}).annotations({
	identifier: "ValidationPublishPackage",
	title: "Released package",
	description:
		"A package being released this run, with its bump type, builds, per-target readiness, and the extracted release notes.",
});

const ValidationPayload = Schema.Struct({
	// The action's build-validation step (renamed from `builds` to free that
	// name for the per-package build directories below).
	buildValidation: Schema.Struct({
		passed: Schema.Boolean.annotations({
			title: "Build validation passed",
			description: "True when every released package built successfully.",
		}),
		packageCount: Schema.Number.annotations({
			title: "Package count",
			description: "Number of packages built and validated.",
		}),
	}).annotations({
		identifier: "ValidationBuildValidation",
		title: "Build validation summary",
		description: "Summary of the build-validation step: whether every package built, and how many were built.",
	}),
	checks: Schema.Array(ValidationCheck).annotations({
		title: "Validation checks",
		description:
			"The five-row Validation Checks table — one entry per validation step run this phase. Canonical names: 'Build Validation', 'Link Issues', 'Publish Validation', 'Release Notes Preview', 'SBOM Preview'.",
	}),
	findings: Schema.Array(ValidationFinding).annotations({
		title: "Findings",
		description:
			"Every non-pass outcome surfaced by the validation checks, projected for the release PR comment. Empty array when no checks produced an error or warning. Findings preserve the order the checks ran in; the comment renderer reorders errors-before-warnings for display.",
	}),
	publish: Schema.Struct({
		npmReady: Schema.Boolean.annotations({
			title: "npm ready",
			description: "True when every npm publish target passed its dry-run probe.",
		}),
		githubPackagesReady: Schema.Boolean.annotations({
			title: "GitHub Packages ready",
			description: "True when every GitHub Packages publish target passed its dry-run probe.",
		}),
		totalTargets: Schema.Number.annotations({
			title: "Total targets",
			description: "Total number of publish targets across every released package and every registry.",
		}),
		readyTargets: Schema.Number.annotations({
			title: "Ready targets",
			description: "Number of publish targets that passed their dry-run probe.",
		}),
		packages: Schema.Array(ValidationPublishPackage).annotations({
			title: "Released packages",
			description:
				"The packages being released this run, with their builds and per-target readiness. Empty array only when no packages had version differences against the target branch — in that case the run is a noop and a warning-severity finding is emitted to explain why. A release that bumps only private/version-only packages still populates this array, with empty `builds` per package.",
		}),
	}).annotations({
		identifier: "ValidationPublish",
		title: "Publish preview",
		description:
			"Build-centric publish preview — per-registry readiness rollup plus the full per-package, per-build, per-target breakdown.",
	}),
	checkRun: Schema.NullOr(
		Schema.Struct({
			url: Schema.String.annotations({
				title: "Check-run URL",
				description: "The HTML URL of the unified Release Validation Summary check-run.",
				examples: ["https://github.com/owner/repo/runs/123456789"],
			}),
			conclusion: Schema.Literal(
				"success",
				"failure",
				"neutral",
				"cancelled",
				"skipped",
				"timed_out",
				"action_required",
			).annotations({
				title: "Check-run conclusion",
				description:
					"The GitHub check-run conclusion enum: `success`, `failure`, `neutral`, `cancelled`, `skipped`, `timed_out`, or `action_required`.",
			}),
		}).annotations({
			identifier: "ValidationCheckRun",
			title: "Validation check-run",
			description:
				"The unified Release Validation Summary check-run produced by the validation phase. Null when no check-run was created.",
		}),
	),
}).annotations({
	identifier: "ValidationPayload",
	title: "Validation payload",
	description:
		"Phase 2 outcome — the build-validation result, the Validation Checks table, every non-pass finding, the build-centric publish preview (per-package, per-build, per-target readiness), and the unified Release Validation Summary check-run URL.",
});

export const ValidationOutput = Schema.Struct({
	$schema: annotatedSchemaUrlField,
	schemaVersion: annotatedSchemaVersionField,
	phase: Schema.Literal("validation").annotations({
		title: "Phase discriminator",
		description: "`validation` identifies this as a Phase 2 output.",
	}),
	status: StatusLiteral,
	noop: Schema.Boolean.annotations({
		title: "No-op",
		description:
			"True when no packages had version differences against the target branch — either the release has already merged into the target branch, or Phase 1 did not commit the expected version bumps. A run with only version-only packages is NOT a noop; those packages still appear in `publish.packages` with empty `builds`. When this flag is true, a warning-severity finding is also emitted on the `Publish Validation` check so the situation is surfaced to reviewers.",
	}),
	succeeded: annotatedSucceededField,
	hasFailures: annotatedHasFailuresField,
	dryRun: annotatedDryRunField,
	validation: ValidationPayload,
}).annotations({
	identifier: "ValidationOutput",
	title: "Validation output (Phase 2)",
	description:
		"The structured `result` output emitted when the action runs in the validation phase (Phase 2). Triggered by a push to the release branch; runs build validation, publish dry-runs, release-notes extraction, and emits the unified Release Validation Summary check-run.",
	examples: [
		{
			$schema: SCHEMA_URL,
			schemaVersion: SCHEMA_VERSION,
			phase: "validation",
			status: "success",
			noop: false,
			succeeded: true,
			hasFailures: false,
			dryRun: false,
			validation: {
				buildValidation: { passed: true, packageCount: 1 },
				checks: [
					{ name: "Build Validation", status: "pass", outcome: "1/1 package(s) built", url: null },
					{
						name: "Link Issues",
						status: "pass",
						outcome: "Linked 2 issue(s)",
						url: "https://github.com/savvy-web/example-repo/runs/123",
					},
					{
						name: "Publish Validation",
						status: "pass",
						outcome: "2/2 target(s) ready",
						url: "https://github.com/savvy-web/example-repo/runs/123",
					},
					{
						name: "Release Notes Preview",
						status: "pass",
						outcome: "Found release notes for 1 package(s)",
						url: "https://github.com/savvy-web/example-repo/runs/123",
					},
					{
						name: "SBOM Preview",
						status: "pass",
						outcome: "1/1 SBOM(s) NTIA-compliant",
						url: "https://github.com/savvy-web/example-repo/runs/123",
					},
				],
				findings: [],
				publish: {
					npmReady: true,
					githubPackagesReady: true,
					totalTargets: 2,
					readyTargets: 2,
					packages: [
						{
							name: "@savvy-web/example",
							version: "1.2.0",
							baseVersion: "1.1.0",
							bumpType: "minor",
							changesetCount: 1,
							ready: true,
							versionOnly: false,
							builds: [
								{
									directory: "dist/npm",
									packedBytes: 716,
									unpackedBytes: 2300,
									fileCount: 5,
									sbom: {
										componentCount: 3,
										ntiaCompliant: true,
										missingNtiaFields: [],
									},
									targets: [
										{
											registry: "https://registry.npmjs.org/",
											status: "ready",
											access: "public",
											provenance: true,
										},
										{
											registry: "https://npm.pkg.github.com/",
											status: "ready",
											access: "public",
											provenance: false,
										},
									],
								},
							],
							releaseNotes: {
								status: "found",
								content: "### Minor Changes\n\n- Added the springLaunch API.",
							},
						},
					],
				},
				checkRun: {
					url: "https://github.com/savvy-web/example-repo/runs/124",
					conclusion: "success",
				},
			},
		},
	],
});
export type ValidationOutput = Schema.Schema.Type<typeof ValidationOutput>;

// --- publishing phase ----------------------------------------------------

/**
 * Per-target digest pair recorded when the orchestrator made a recovery
 * decision against the target's registry. Carries the local pack digest
 * and the digest the registry already has so consumers can render
 * "recovered after partial publish" without re-deriving the state.
 */
const PublishTargetRecovery = Schema.Struct({
	localDigest: Schema.String.annotations({
		title: "Local digest",
		description:
			"Integrity digest of the locally-packed tarball, in npm's `dist.integrity` format (`sha512-<base64>`). Equals what the orchestrator would have uploaded for this target.",
	}),
	remoteDigest: Schema.String.annotations({
		title: "Remote digest",
		description:
			"Integrity digest the target registry already has on file for this package version, in npm's `dist.integrity` format (`sha512-<base64>`). Equals `localDigest` on the `skipped` (`already-published-identical`) branch; differs on the `failed` integrity-mismatch branch.",
	}),
}).annotations({
	identifier: "PublishTargetRecovery",
	title: "Recovery digest pair",
	description:
		"Pair of digests recorded when the orchestrator probed the target's registry and made a recovery decision. Present on `skipped` (`skipReason: already-published-identical`) and on `failed` integrity-mismatch outcomes; null when the publish flowed straight through to upload.",
});

const PublishTarget = Schema.Struct({
	registry: Schema.String.annotations({
		title: "Registry URL",
		description: "The registry endpoint this target published to.",
		examples: ["https://registry.npmjs.org/", "https://npm.pkg.github.com/", "https://jsr.io"],
	}),
	status: Schema.Literal("published", "skipped", "failed").annotations({
		title: "Publish status",
		description:
			"`published` — the package was successfully published to this target; `skipped` — the publish was intentionally not attempted (e.g. dry-run, no token, already-published); `failed` — the publish call returned an error and the package was not published to this target. A `failed` target means the underlying error is in the per-target `error` field, and the run's overall `hasFailures` flag is set.",
	}),
	skipReason: Schema.NullOr(
		Schema.Literal("already-published-identical").annotations({
			identifier: "PublishTargetSkipReason",
			title: "Target skip reason",
			description:
				"`already-published-identical` — the version was already on this specific registry and the registry's stored integrity matched the locally-packed digest, so the orchestrator recovered the target rather than re-uploading. Null when the target was not skipped. Finer-grained than the package-level `skipReason`: this fires per target, so a mixed result (one target published, one recovered) records the recovery on the target itself.",
		}),
	),
	recovery: Schema.NullOr(PublishTargetRecovery).annotations({
		title: "Recovery digests",
		description:
			"Digest pair recorded when the orchestrator made a recovery decision against this target's registry — both the recovery-skip (`skipReason: already-published-identical`) and the fatal integrity-mismatch (`status: failed`) outcomes carry it. Null when the publish flowed straight through to upload.",
	}),
	registryUrl: Schema.NullOr(
		Schema.String.annotations({
			title: "Published artifact URL",
			description:
				"URL of the published artifact on the registry. Null when the publish did not produce a discoverable URL.",
		}),
	),
	error: Schema.NullOr(
		Schema.String.annotations({
			title: "Error message",
			description: "Error message when `status` is `failed`. Null on `published` or `skipped`.",
		}),
	),
	attestationRecovered: Schema.NullOr(Schema.Boolean).annotations({
		title: "Provenance attestation recovered",
		description:
			"True when the provenance attestation already existed for this tarball's sha256 and the orchestrator reused the existing URL instead of writing a new one. False when a new attestation was written this run. Null when no attestation step was attempted (provenance: false on every target in the group, or the target itself was not in a successful state).",
	}),
	sbomAttestationRecovered: Schema.NullOr(Schema.Boolean).annotations({
		title: "SBOM attestation recovered",
		description:
			"True when the SBOM attestation already existed for this tarball's sha256 and the orchestrator reused the existing URL instead of writing a new one. False when a new attestation was written this run. Null when no SBOM attestation was attempted.",
	}),
}).annotations({
	identifier: "PublishTarget",
	title: "Published target",
	description:
		"Per-registry publish outcome — what was attempted, whether it succeeded, and the URL of the published artifact.",
});

const PublishPackage = Schema.Struct({
	name: Schema.String.annotations({
		title: "Package name",
		description: "The npm package name that was (or would have been) published.",
	}),
	version: Schema.String.annotations({
		title: "Published version",
		description: "The semver version this run published.",
	}),
	status: Schema.Literal("published", "skipped", "failed").annotations({
		title: "Package publish status",
		description:
			"`published` — at least one target accepted the publish; `skipped` — every target was skipped (no work landed); `failed` — every target either failed or skipped, but at least one failed.",
	}),
	skipReason: Schema.NullOr(
		Schema.Literal("already-published-identical", "already-published-unknown").annotations({
			identifier: "PublishPackageSkipReason",
			title: "Skip reason",
			description:
				"`already-published-identical` — the version is already published and the tarball digest matches what would be published; `already-published-unknown` — the version is already published but the on-registry tarball digest could not be confirmed (advisory only — verify by hand if tarball-digest parity matters; the publish was skipped because the registry has the version but its identity could not be confirmed). Null when the package was not skipped.",
		}),
	),
	targets: Schema.Array(PublishTarget).annotations({
		title: "Publish targets",
		description: "The per-registry publish outcomes for this package.",
	}),
	attestations: Schema.Struct({
		provenanceUrl: Schema.NullOr(
			Schema.String.annotations({
				title: "Provenance attestation URL",
				description: "URL of the npm OIDC sigstore provenance attestation. Null when no provenance was emitted.",
			}),
		),
		sbomUrl: Schema.NullOr(
			Schema.String.annotations({
				title: "SBOM attestation URL",
				description:
					"URL of the CycloneDX SBOM attestation uploaded to the artifact store. Null when no SBOM attestation was emitted.",
			}),
		),
		githubAttestationUrl: Schema.NullOr(
			Schema.String.annotations({
				title: "GitHub attestation URL",
				description:
					"URL of the GitHub artifact-attestation (`gh attestation verify`). Null when no GitHub attestation was emitted.",
			}),
		),
	}).annotations({
		identifier: "PublishPackageAttestations",
		title: "Attestations",
		description:
			"Per-package attestation URLs emitted during publishing — provenance, SBOM, and the GitHub attestation.",
	}),
	tarballDigest: Schema.NullOr(
		Schema.String.annotations({
			title: "Tarball digest",
			description:
				"Integrity hash of the published tarball, expressed as Subresource-Integrity-style `sha512-<base64>`. `null` for skipped or failed publishes.",
			examples: ["sha512-Vb1g8tXp4l8a9bC..."],
		}),
	),
}).annotations({
	identifier: "PublishPackage",
	title: "Published package",
	description:
		"A package that was processed by the publishing phase, with its per-target outcomes, attestation URLs, and the integrity digest of the published tarball.",
});

/** A git tag created by the publishing phase. */
export const PublishingTag = Schema.Struct({
	name: Schema.String.annotations({
		title: "Tag name",
		description: "The git tag name created for the release.",
		examples: ["v1.2.3", "@savvy-web/example@1.2.3"],
	}),
	sha: Schema.String.annotations({
		title: "Tag SHA",
		description: "The commit SHA the tag points at.",
	}),
	packageName: Schema.NullOr(
		Schema.String.annotations({
			title: "Package name",
			description:
				"The package name this tag belongs to. Non-null for per-package tags in multi-package release mode (the tag name itself is the npm-style `@scope/pkg@version`). Null for an aggregated tag covering every released package (the `vSEMVER` shape in fixed-release mode).",
		}),
	),
}).annotations({
	identifier: "PublishingTag",
	title: "Release tag",
	description: "A git tag created for the release.",
});

/** A GitHub release created by the publishing phase. */
export const PublishingRelease = Schema.Struct({
	tag: Schema.String.annotations({
		title: "Tag",
		description: "The git tag the GitHub release is attached to.",
	}),
	url: Schema.String.annotations({
		title: "Release URL",
		description: "The HTML URL of the GitHub release.",
	}),
	id: Schema.Number.annotations({
		title: "Release ID",
		description: "The numeric GitHub release ID.",
	}),
	packageName: Schema.NullOr(
		Schema.String.annotations({
			title: "Package name",
			description:
				"The package name this release belongs to. Non-null for per-package releases in multi-package release mode (the release pairs with the tag of the same `tag` value). Null for an aggregated release covering every released package (the `vSEMVER` shape in fixed-release mode).",
		}),
	),
}).annotations({
	identifier: "PublishingRelease",
	title: "GitHub release",
	description: "A GitHub release created by the publishing phase.",
});

const PublishingPayload = Schema.Struct({
	packages: Schema.Array(PublishPackage).annotations({
		title: "Published packages",
		description:
			"The packages processed by the publishing phase, with their per-target outcomes. Empty array when there were no packages to publish (the action emits a no-op). In a dry-run, the array is populated with simulated results — each package's `status` is the outcome the action would produce on a real run.",
	}),
	tags: Schema.Array(PublishingTag).annotations({
		title: "Release tags",
		description:
			"Git tags created by the publishing phase (one per released package or one for the whole release, depending on workflow). Empty array when no git tags were created — either the run was a no-op, or it failed before reaching the tagging step. A populated array means tags were created on the release commit.",
	}),
	releases: Schema.Array(PublishingRelease).annotations({
		title: "GitHub releases",
		description:
			"GitHub releases created by the publishing phase. Empty array when no GitHub Releases were created — same conditions as `tags`. The release entries pair 1:1 with tags by `tag` name (and `packageName`).",
	}),
}).annotations({
	identifier: "PublishingPayload",
	title: "Publishing payload",
	description:
		"Phase 3 outcome — the per-package publish results (with attestation URLs and tarball digests), the git tags created, and the GitHub releases created.",
});

export const PublishingOutput = Schema.Struct({
	$schema: annotatedSchemaUrlField,
	schemaVersion: annotatedSchemaVersionField,
	phase: Schema.Literal("publishing").annotations({
		title: "Phase discriminator",
		description: "`publishing` identifies this as a Phase 3 output.",
	}),
	status: StatusLiteral,
	noop: Schema.Boolean.annotations({
		title: "No-op",
		description:
			"True when there were no publish targets resolved — every released package was version-only or was already published at the same digest; nothing was sent to any registry.",
	}),
	succeeded: annotatedSucceededField,
	hasFailures: annotatedHasFailuresField,
	dryRun: annotatedDryRunField,
	publishing: PublishingPayload,
}).annotations({
	identifier: "PublishingOutput",
	title: "Publishing output (Phase 3)",
	description:
		"The structured `result` output emitted when the action runs in the publishing phase (Phase 3). Triggered by the merge of the release PR; publishes to every configured registry, generates SBOM/provenance attestations, and creates GitHub releases and tags.",
	examples: [
		{
			$schema: SCHEMA_URL,
			schemaVersion: SCHEMA_VERSION,
			phase: "publishing",
			status: "success",
			noop: false,
			succeeded: true,
			hasFailures: false,
			dryRun: false,
			publishing: {
				packages: [
					{
						name: "@savvy-web/example",
						version: "1.2.0",
						status: "published",
						skipReason: null,
						targets: [
							{
								registry: "https://registry.npmjs.org/",
								status: "published",
								skipReason: null,
								recovery: null,
								registryUrl: "https://www.npmjs.com/package/@savvy-web/example/v/1.2.0",
								error: null,
								attestationRecovered: false,
								sbomAttestationRecovered: false,
							},
							{
								registry: "https://npm.pkg.github.com/",
								status: "published",
								skipReason: null,
								recovery: null,
								registryUrl: "https://github.com/savvy-web/example-repo/packages/12345",
								error: null,
								attestationRecovered: false,
								sbomAttestationRecovered: false,
							},
						],
						attestations: {
							provenanceUrl: "https://search.sigstore.dev/?logIndex=12345",
							sbomUrl: "https://github.com/savvy-web/example-repo/attestations/123",
							githubAttestationUrl: "https://github.com/savvy-web/example-repo/attestations/124",
						},
						tarballDigest: "sha512-Vb1g8tXp4l8a9bC...",
					},
				],
				tags: [
					{
						name: "@savvy-web/example@1.2.0",
						sha: "abc123def456abc123def456abc123def456abc1",
						packageName: "@savvy-web/example",
					},
				],
				releases: [
					{
						tag: "@savvy-web/example@1.2.0",
						url: "https://github.com/savvy-web/example-repo/releases/tag/@savvy-web/example@1.2.0",
						id: 12345678,
						packageName: "@savvy-web/example",
					},
				],
			},
		},
	],
});
export type PublishingOutput = Schema.Schema.Type<typeof PublishingOutput>;

// --- the union -----------------------------------------------------------

/** The phase-discriminated release output contract. */
export const ReleaseOutput = Schema.Union(BranchManagementOutput, ValidationOutput, PublishingOutput).annotations({
	identifier: "ReleaseOutput",
	title: "Silk Release Action output",
	description:
		'The phase-discriminated release output contract. Use `phase` to discriminate to the right variant. Four orthogonal state signals (`status`, `noop`, `succeeded`, `hasFailures`) are derived from the same underlying outcome and obey a fixed relationship: `noop` is true when the phase had nothing to do (no changesets, no release-branch updates pending, or no publish targets resolved) — in this case `succeeded` is true and `hasFailures` is false; `status` is `"no-op"`. When the phase produced its intended work without errors, `noop` is false, `succeeded` is true, `hasFailures` is false, and `status` is `"success"`. When the phase produced any failure, `noop` is false, `succeeded` is false, `hasFailures` is true, and `status` is `"partial"`. The `status` value `"failed"` is reserved for an impossible flag combination and is never emitted by the current projections; treat `"partial"` as the canonical failure label. `status` is a coarse label for logs and summaries; the three booleans are the machine contract. Every variant carries the same shared top-level fields (`$schema`, `schemaVersion`, `phase`, `status`, `noop`, `succeeded`, `hasFailures`, `dryRun`) plus a phase-specific payload.',
});
export type ReleaseOutput = Schema.Schema.Type<typeof ReleaseOutput>;
