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

import type { PackagePublishResult, PublishPackagesResult, ReleaseInfo, TagInfo } from "../release/types.js";
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

/** Input for {@link toValidationOutput}. */
export interface ValidationInput {
	readonly buildsPassed: boolean;
	readonly packageCount: number;
	readonly npmReady: boolean;
	readonly githubPackagesReady: boolean;
	readonly publishOk: boolean;
	readonly packages: ReadonlyArray<{ readonly name: string; readonly version: string; readonly ready: boolean }>;
	readonly checkRun: { readonly url: string; readonly conclusion: string } | null;
	readonly dryRun: boolean;
}

/**
 * Project a validation run into a {@link ValidationOutput}.
 *
 * @param input - The validation run facts to project.
 * @returns The phase-discriminated validation output struct.
 */
export const toValidationOutput = (input: ValidationInput): ValidationOutput => {
	const noop = input.packageCount === 0;
	// The three flags are orthogonal by design — noop does not clamp hasFailures;
	// deriveStatus precedence resolves the human-facing label.
	const flags: ReleaseFlags = {
		noop,
		succeeded: !noop && input.buildsPassed && input.publishOk,
		hasFailures: !input.buildsPassed || !input.publishOk,
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
			builds: { passed: input.buildsPassed, packageCount: input.packageCount },
			publish: {
				npmReady: input.npmReady,
				githubPackagesReady: input.githubPackagesReady,
				packages: input.packages.map((p) => ({ name: p.name, version: p.version, ready: p.ready })),
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
 * @param input - The publishing run results to project.
 * @returns The phase-discriminated publishing output struct.
 */
export const toPublishingOutput = (input: PublishingInput): PublishingOutput => {
	const packages = input.publishResult.packages.map((pkg) => {
		const targets = pkg.targets.map((t) => {
			const status = classifyTarget(t);
			return {
				registry: t.target.registry ?? "jsr",
				status,
				registryUrl: t.registryUrl ?? null,
				error: status === "failed" ? (t.error ?? null) : null,
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
				? pkg.targets.some((t) => t.alreadyPublishedReason === "identical")
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
			tags: input.tags.map((t) => ({ name: t.name, sha: input.tagShas[t.name] ?? "" })),
			releases: input.releases.map((r) => ({ tag: r.tag, url: r.url, id: r.id })),
		},
	};
};
