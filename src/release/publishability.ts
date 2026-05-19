/**
 * Publishability detector layers.
 *
 * Provides two Layer overrides for workspaces-effect's PublishabilityDetector Tag:
 *
 * - SilkPublishabilityDetectorLive: applies silk rules (publishConfig.targets,
 *   shorthand expansion, access inheritance). This is the chunk that will lift
 *   cleanly to @savvy-web/silk-effects later.
 *
 * - PublishabilityDetectorAdaptiveLive: reads ChangesetConfig.mode per-call and
 *   dispatches to the silk override (silk mode), the library default (vanilla mode),
 *   or a no-op detector (none mode).
 *
 * The versionable cascade (publishable OR versionPrivate) now lives inline in
 * Changesets.create — it is silk-changesets-specific and short enough not to
 * need its own service.
 *
 * @module services/publishability
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import type { WorkspacePackage } from "workspaces-effect";
import { PublishTarget, PublishabilityDetector, PublishabilityDetectorLive } from "workspaces-effect";

import { ChangesetConfig } from "./changeset-config.js";

// ══════════════════════════════════════════════════════════════════════════════
// Internal types — raw package.json shape for silk rules
// ══════════════════════════════════════════════════════════════════════════════

interface RawPublishConfig {
	readonly access?: "public" | "restricted";
	readonly registry?: string;
	readonly directory?: string;
	readonly targets?: ReadonlyArray<RawTargetSpec>;
}

type RawTargetSpec =
	| string
	| {
			readonly access?: "public" | "restricted";
			readonly protocol?: string;
			readonly registry?: string;
			readonly directory?: string;
			readonly provenance?: boolean;
	  };

interface RawPackageJson {
	readonly name?: string;
	readonly version?: string;
	readonly private?: boolean;
	readonly publishConfig?: RawPublishConfig;
}

// ══════════════════════════════════════════════════════════════════════════════
// Silk publishability logic
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Resolve the access level for a single target spec.
 *
 * String targets (shorthand names like "npm"/"github"/"jsr" or full registry
 * URLs) carry no inherent access — they always inherit the parent
 * publishConfig.access. Object targets may declare their own access; if not,
 * they fall back to parent access.
 */
const resolveTargetAccess = (
	target: RawTargetSpec,
	parentAccess: "public" | "restricted" | undefined,
): "public" | "restricted" | undefined => {
	if (typeof target === "string") return parentAccess;
	return target.access ?? parentAccess;
};

/**
 * Expand a shorthand string target to a registry URL.
 *
 * `"npm"` / `"github"` / `"jsr"` map to their canonical registries; a full
 * `https://` / `http://` URL is used verbatim; any other string falls back to
 * the parent `publishConfig.registry` (or the npm default).
 *
 * Note: the `"jsr"` mapping yields a `jsr.io` registry string for
 * classification only — the Effect publish path does not model JSR (it is
 * documented as unreachable in `validation.ts`).
 */
const expandShorthand = (target: string, pcRegistry: string | undefined): string => {
	if (target === "npm") return "https://registry.npmjs.org/";
	if (target === "github") return "https://npm.pkg.github.com/";
	if (target === "jsr") return "https://jsr.io/";
	if (target.startsWith("https://") || target.startsWith("http://")) return target;
	return pcRegistry ?? "https://registry.npmjs.org/";
};

const readRawPackageJson = (pkgPath: string): RawPackageJson | null => {
	try {
		const file = join(pkgPath, "package.json");
		if (!existsSync(file)) return null;
		return JSON.parse(readFileSync(file, "utf-8")) as RawPackageJson;
	} catch {
		return null;
	}
};

/**
 * Apply silk publishability rules to a raw package.json:
 *  - pkg.private !== true → publishable (one target)
 *  - pkg.private === true + publishConfig.access set + no targets → publishable (one target)
 *  - pkg.private === true + publishConfig.targets non-empty → resolve each target;
 *    return one PublishTarget per target that resolves to public/restricted access
 *  - Otherwise → not publishable ([])
 */
const silkDetect = (pkgName: string, raw: RawPackageJson): ReadonlyArray<PublishTarget> => {
	if (raw.private !== true) {
		// Public package — one target with defaults
		return [
			new PublishTarget({
				name: pkgName,
				registry: raw.publishConfig?.registry ?? "https://registry.npmjs.org/",
				directory: raw.publishConfig?.directory ?? ".",
				access: raw.publishConfig?.access ?? "public",
			}),
		];
	}

	const pc = raw.publishConfig;
	if (!pc) return [];

	// private === true with targets array
	if (pc.targets && pc.targets.length > 0) {
		const results: PublishTarget[] = [];
		for (const target of pc.targets) {
			const access = resolveTargetAccess(target, pc.access);
			if (access !== "public" && access !== "restricted") continue;
			const registry =
				typeof target === "string"
					? expandShorthand(target, pc.registry)
					: (target.registry ?? pc.registry ?? "https://registry.npmjs.org/");
			const directory = typeof target === "string" ? (pc.directory ?? ".") : (target.directory ?? pc.directory ?? ".");
			const provenance = typeof target === "string" ? undefined : target.provenance;
			results.push(
				new PublishTarget({
					name: pkgName,
					registry,
					directory,
					access,
					...(provenance !== undefined ? { provenance } : {}),
				}),
			);
		}
		return results;
	}

	// private === true + no targets + publishConfig.access set → publishable
	if (pc.access === "public" || pc.access === "restricted") {
		return [
			new PublishTarget({
				name: pkgName,
				registry: pc.registry ?? "https://registry.npmjs.org/",
				directory: pc.directory ?? ".",
				access: pc.access,
			}),
		];
	}

	return [];
};

// ══════════════════════════════════════════════════════════════════════════════
// SilkPublishabilityDetectorLive
// ══════════════════════════════════════════════════════════════════════════════

/**
 * A Layer that overrides workspaces-effect's PublishabilityDetector Tag with
 * silk rules (publishConfig.targets, shorthand expansion, access inheritance).
 *
 * This is the chunk that will lift cleanly to @savvy-web/silk-effects later.
 * Consumers provide this layer and any code yielding PublishabilityDetector
 * gets silk semantics for free.
 */
export const SilkPublishabilityDetectorLive = Layer.succeed(PublishabilityDetector, {
	detect: (pkg: WorkspacePackage, _root: string): Effect.Effect<ReadonlyArray<PublishTarget>> =>
		Effect.sync(() => {
			const raw = readRawPackageJson(pkg.path);
			if (!raw) return [];
			return silkDetect(pkg.name, raw);
		}),
});

// ══════════════════════════════════════════════════════════════════════════════
// PublishabilityDetectorAdaptiveLive
// ══════════════════════════════════════════════════════════════════════════════

/**
 * A Layer that overrides PublishabilityDetector and reads ChangesetConfig.mode
 * per-call to dispatch to the appropriate detector:
 *  - "silk"    → silk rules (SilkPublishabilityDetectorLive logic)
 *  - "vanilla" → library default rules (PublishabilityDetectorLive logic)
 *  - "none"    → always returns [] (nothing is publishable)
 *
 * Uses Option A (per-call dispatch via ChangesetConfig yield) rather than
 * Layer.unwrapEffect to handle the per-call mode lookup correctly.
 */
export const PublishabilityDetectorAdaptiveLive = Layer.effect(
	PublishabilityDetector,
	Effect.gen(function* () {
		const config = yield* ChangesetConfig;
		// Grab the vanilla detector implementation by running its layer once
		const vanilla = yield* Effect.provide(PublishabilityDetector, PublishabilityDetectorLive);

		return {
			detect: (pkg: WorkspacePackage, root: string): Effect.Effect<ReadonlyArray<PublishTarget>> =>
				Effect.gen(function* () {
					const mode = yield* config.mode(root);
					if (mode === "none") return [];
					if (mode === "silk") {
						const raw = readRawPackageJson(pkg.path);
						if (!raw) return [];
						return silkDetect(pkg.name, raw);
					}
					// vanilla
					return yield* vanilla.detect(pkg, root);
				}),
		};
	}),
);
