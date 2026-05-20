/**
 * Pure projection functions: internal release-pipeline result types in,
 * `ReleaseOutput` phase structs out.
 *
 * @remarks
 * Each projection takes an explicit input interface — the deliberate seam
 * between sprawling internal types and the published `ReleaseOutput` contract.
 * `main.ts` adapts internal results into these inputs; the projections stay
 * pure and independently testable. Curation (dropping internal noise,
 * normalising per-target status) happens here.
 */

import type {
	PackagePublishResult,
	PublishPackagesResult,
	ReleaseInfo,
	TagInfo,
	ValidationFinding,
	ValidationPackageResult,
} from "../release/types.js";
import type { BranchManagementOutput, PublishingOutput, ReleaseFlags, ValidationOutput } from "./release-output.js";
import { SCHEMA_URL, SCHEMA_VERSION, deriveStatus } from "./release-output.js";

/** Input for {@link toBranchManagementOutput}. */
export interface BranchManagementInput {
	readonly releaseBranchName: string;
	readonly existed: boolean;
	readonly created: boolean;
	readonly updated: boolean;
	readonly hasConflicts: boolean;
	readonly releasePr: { readonly number: number; readonly url: string; readonly action: "created" | "updated" } | null;
	readonly changesets: ReadonlyArray<{ readonly name: string; readonly bumpType: "major" | "minor" | "patch" }>;
	readonly dryRun: boolean;
}

/**
 * Project a branch-management run into a {@link BranchManagementOutput}.
 *
 * @param input - The branch-management run facts to project.
 * @returns The phase-discriminated branch-management output struct.
 */
export const toBranchManagementOutput = (input: BranchManagementInput): BranchManagementOutput => {
	const flags: ReleaseFlags = {
		noop: input.changesets.length === 0,
		succeeded: !input.hasConflicts,
		hasFailures: input.hasConflicts,
	};
	return {
		$schema: SCHEMA_URL,
		schemaVersion: SCHEMA_VERSION,
		phase: "branch-management",
		status: deriveStatus(flags),
		noop: flags.noop,
		succeeded: flags.succeeded,
		hasFailures: flags.hasFailures,
		dryRun: input.dryRun,
		branchManagement: {
			releaseBranch: {
				name: input.releaseBranchName,
				existed: input.existed,
				created: input.created,
				updated: input.updated,
				hasConflicts: input.hasConflicts,
			},
			releasePr: input.releasePr,
			changesets: {
				count: input.changesets.length,
				// Explicit projection — only forward the fields the schema declares.
				packages: input.changesets.map((c) => ({ name: c.name, bumpType: c.bumpType })),
			},
		},
	};
};

/** One row of the validation checks table, as the projection input. */
export interface ValidationCheckInput {
	readonly name: string;
	readonly status: "pass" | "warning" | "error";
	readonly outcome: string;
	readonly url: string | null;
}

/** Input for {@link toValidationOutput}. */
export interface ValidationInput {
	/** Whether the build-validation step passed. */
	readonly buildsPassed: boolean;
	/** Number of released packages the build-validation step covered. */
	readonly packageCount: number;
	/** Whether every npm target is publish-ready. */
	readonly npmReady: boolean;
	/** Whether every GitHub Packages target is publish-ready. */
	readonly githubPackagesReady: boolean;
	/** Total number of registry targets across every build. */
	readonly totalTargets: number;
	/** Number of registry targets that passed dry-run. */
	readonly readyTargets: number;
	/** The five-row checks table outcomes. */
	readonly checks: ReadonlyArray<ValidationCheckInput>;
	/** Every non-pass outcome the validation checks produced. */
	readonly findings: ReadonlyArray<ValidationFinding>;
	/** Build-centric per-package validation results (builds → SBOM + targets). */
	readonly validationPackages: ReadonlyArray<ValidationPackageResult>;
	/** The unified validation check run, or `null` when none was created. */
	readonly checkRun: {
		readonly url: string;
		readonly conclusion: "success" | "failure" | "neutral" | "cancelled" | "skipped" | "timed_out" | "action_required";
	} | null;
	readonly dryRun: boolean;
}

/**
 * Derive the semver bump type for a released package.
 *
 * @remarks
 * A `null` base version means the package is brand-new on the target branch
 * (`"new"`). Otherwise the major/minor/patch deltas are compared; a version
 * that is not a three-part semver string yields `"unknown"`.
 */
const deriveBumpType = (
	baseVersion: string | null,
	version: string,
): "major" | "minor" | "patch" | "new" | "unknown" => {
	if (baseVersion === null) return "new";
	const oldParts = baseVersion.split(".").map(Number);
	const newParts = version.split(".").map(Number);
	if (oldParts.length < 3 || newParts.length < 3 || [...oldParts, ...newParts].some(Number.isNaN)) {
		return "unknown";
	}
	if ((newParts[0] ?? 0) > (oldParts[0] ?? 0)) return "major";
	if (newParts[0] === oldParts[0] && (newParts[1] ?? 0) > (oldParts[1] ?? 0)) return "minor";
	return "patch";
};

/**
 * Project one build-centric {@link ValidationPackageResult} into the schema's
 * publish-package struct. A package with no builds is version-only.
 */
const toValidationPublishPackage = (
	pkg: ValidationPackageResult,
): ValidationOutput["validation"]["publish"]["packages"][number] => {
	const versionOnly = pkg.builds.length === 0;
	return {
		name: pkg.name,
		version: pkg.version,
		baseVersion: pkg.baseVersion,
		bumpType: deriveBumpType(pkg.baseVersion, pkg.version),
		changesetCount: pkg.changesetCount,
		// A version-only package is ready; a package with builds is ready when
		// every registry target of every build passed dry-run.
		ready: versionOnly || pkg.builds.every((b) => b.targets.every((t) => t.status !== "failed")),
		versionOnly,
		builds: pkg.builds.map((build) => ({
			directory: build.directory,
			packedBytes: build.packedBytes,
			unpackedBytes: build.unpackedBytes,
			fileCount: build.fileCount,
			sbom:
				build.sbom === null
					? null
					: {
							componentCount: build.sbom.componentCount,
							ntiaCompliant: build.sbom.ntiaCompliant,
							missingNtiaFields: build.sbom.missingNtiaFields,
						},
			targets: build.targets.map((t) => ({
				registry: t.registry,
				status: t.status,
				access: t.access,
				provenance: t.provenance,
			})),
		})),
		releaseNotes: pkg.releaseNotes,
	};
};

/**
 * Project a validation run into a {@link ValidationOutput}.
 *
 * @remarks
 * This is the single curation seam between the internal build-centric
 * validation results and the published, build-centric `ValidationOutput`
 * contract — internal results in, schema struct out.
 *
 * @param input - The validation run facts to project.
 * @returns The phase-discriminated validation output struct.
 */
export const toValidationOutput = (input: ValidationInput): ValidationOutput => {
	const noop = input.packageCount === 0;
	const publishOk = !input.findings.some((f) => f.severity === "error");
	// The three flags are orthogonal by design — noop does not clamp hasFailures;
	// deriveStatus precedence resolves the human-facing label.
	const flags: ReleaseFlags = {
		noop,
		succeeded: !noop && input.buildsPassed && publishOk,
		hasFailures: !input.buildsPassed || !publishOk,
	};
	return {
		$schema: SCHEMA_URL,
		schemaVersion: SCHEMA_VERSION,
		phase: "validation",
		status: deriveStatus(flags),
		noop: flags.noop,
		succeeded: flags.succeeded,
		hasFailures: flags.hasFailures,
		dryRun: input.dryRun,
		validation: {
			buildValidation: { passed: input.buildsPassed, packageCount: input.packageCount },
			checks: input.checks.map((c) => ({ name: c.name, status: c.status, outcome: c.outcome, url: c.url })),
			findings: input.findings.map((f) => ({
				severity: f.severity,
				check: f.check,
				scope: f.scope === null ? null : { package: f.scope.package, directory: f.scope.directory },
				message: f.message,
			})),
			publish: {
				npmReady: input.npmReady,
				githubPackagesReady: input.githubPackagesReady,
				totalTargets: input.totalTargets,
				readyTargets: input.readyTargets,
				packages: input.validationPackages.map(toValidationPublishPackage),
			},
			checkRun: input.checkRun,
		},
	};
};

/** Input for {@link toPublishingOutput}. */
export interface PublishingInput {
	readonly publishResult: PublishPackagesResult;
	readonly tags: ReadonlyArray<TagInfo>;
	readonly releases: ReadonlyArray<ReleaseInfo>;
	/** Resolved tag-name → commit SHA, keyed by `TagInfo.name`. */
	readonly tagShas: Readonly<Record<string, string>>;
	readonly dryRun: boolean;
}

type TargetStatus = "published" | "skipped" | "failed";

/** Classify one internal target result into the published/skipped/failed enum. */
const classifyTarget = (t: PackagePublishResult["targets"][number]): TargetStatus => {
	// Prefer the explicit `status` field when the orchestrator set it.
	if (t.status !== undefined) return t.status;
	// Content mismatch is a failure, never a skip (curation rule 1).
	if (t.alreadyPublished === true && t.alreadyPublishedReason === "different") return "failed";
	if (t.alreadyPublished === true) return "skipped";
	return t.success ? "published" : "failed";
};

/** Pick the first non-empty string a target yields, scanning targets in order. */
const firstNonEmpty = (
	targets: PackagePublishResult["targets"],
	pick: (t: PackagePublishResult["targets"][number]) => string | undefined,
): string | null => targets.map(pick).find((u) => u !== undefined && u !== "") ?? null;

/**
 * Project a publishing run into a {@link PublishingOutput}.
 *
 * @remarks
 * The `packageName` field on each emitted tag and release is provisionally
 * `null`: the publishing pipeline does not yet propagate the package-to-tag
 * association through the internal `TagInfo` and `ReleaseInfo` types. The
 * schema's `packageName: NullOr(string)` admits this, and the publish-chain
 * port will populate it once the upstream plumbing carries the association.
 *
 * @param input - The publishing run results to project.
 * @returns The phase-discriminated publishing output struct.
 */
export const toPublishingOutput = (input: PublishingInput): PublishingOutput => {
	const packages = input.publishResult.packages.map((pkg) => {
		const targets = pkg.targets.map((t) => {
			const status = classifyTarget(t);
			// Per-target skip reason: only the "already-published-identical"
			// literal is on the wire today. The orchestrator may set it
			// directly (`t.skipReason`); legacy results infer it from the
			// `alreadyPublishedReason: "identical"` field.
			const skipReason: "already-published-identical" | null =
				status === "skipped" &&
				(t.skipReason === "already-published-identical" || t.alreadyPublishedReason === "identical")
					? "already-published-identical"
					: null;
			const recovery =
				t.recovery !== undefined
					? { localDigest: t.recovery.localDigest, remoteDigest: t.recovery.remoteDigest }
					: null;
			// `recovered: undefined` → both fields null (no attestation step
			// ran for this group). `recovered: { provenance, sbom }` →
			// project each leg verbatim onto its scalar schema field.
			const attestationRecovered = t.recovered !== undefined ? t.recovered.provenance : null;
			const sbomAttestationRecovered = t.recovered !== undefined ? t.recovered.sbom : null;
			return {
				registry: t.target.registry ?? "jsr",
				status,
				skipReason,
				recovery,
				registryUrl: t.registryUrl ?? null,
				error: status === "failed" ? (t.error ?? null) : null,
				attestationRecovered,
				sbomAttestationRecovered,
			};
		});
		// Package status: failed if any target failed; skipped if every target
		// skipped; published otherwise (including version-only, targets === []).
		const anyFailed = targets.some((t) => t.status === "failed");
		const allSkipped = targets.length > 0 && targets.every((t) => t.status === "skipped");
		const status: TargetStatus = anyFailed ? "failed" : allSkipped ? "skipped" : "published";
		// skipReason only when the package is skipped; "identical" maps to the
		// identical reason, every other skip reason to "unknown" (curation rules 2/3).
		const skipReason =
			status === "skipped"
				? pkg.targets.some(
						(t) => t.skipReason === "already-published-identical" || t.alreadyPublishedReason === "identical",
					)
					? ("already-published-identical" as const)
					: ("already-published-unknown" as const)
				: null;
		// Attestation URLs: the internal model carries them per target; take the
		// first non-empty across targets, plus the package-level GitHub attestation.
		return {
			name: pkg.name,
			version: pkg.version,
			status,
			skipReason,
			targets,
			attestations: {
				provenanceUrl: firstNonEmpty(pkg.targets, (t) => t.attestationUrl),
				sbomUrl: firstNonEmpty(pkg.targets, (t) => t.sbomAttestationUrl),
				githubAttestationUrl: pkg.githubAttestationUrl ?? null,
			},
			tarballDigest: firstNonEmpty(pkg.targets, (t) => t.tarballDigest),
		};
	});

	const flags: ReleaseFlags = {
		noop: input.publishResult.totalPackages === 0,
		succeeded: input.publishResult.success === true && !packages.some((p) => p.status === "failed"),
		hasFailures: packages.some((p) => p.status === "failed"),
	};

	return {
		$schema: SCHEMA_URL,
		schemaVersion: SCHEMA_VERSION,
		phase: "publishing",
		status: deriveStatus(flags),
		noop: flags.noop,
		succeeded: flags.succeeded,
		hasFailures: flags.hasFailures,
		dryRun: input.dryRun,
		publishing: {
			packages,
			// `packageName` is provisionally null: the publish-chain port will
			// thread the per-tag/per-release package association once upstream.
			tags: input.tags.map((t) => ({ name: t.name, sha: input.tagShas[t.name] ?? "", packageName: null })),
			releases: input.releases.map((r) => ({ tag: r.tag, url: r.url, id: r.id, packageName: null })),
		},
	};
};
