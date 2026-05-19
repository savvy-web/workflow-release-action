/**
 * The Silk release action's input configuration contract.
 *
 * @remarks
 * `SilkReleaseConfig` is the typed shape of the JSON consumed via the
 * `sbom-config` action input, the `.github/silk-release.json` file, and the
 * `SILK_RELEASE_SBOM_TEMPLATE` environment variable. It is the single source
 * of truth: the committed `silk-release-action.input.schema.json` is
 * generated from it, and `loadSBOMConfig` decodes raw JSON through it before
 * the validation phase resolves SBOM metadata.
 *
 * The schema mirrors the shape `resolveSBOMMetadata` already normalises —
 * `supplier.url` accepts a string-or-array, `supplier.contact` accepts an
 * object-or-array — so a config that worked under the prior untyped cast
 * continues to decode without change.
 *
 * Every exported sub-struct carries an `identifier` annotation so the
 * generated JSON Schema's `$defs` keys remain stable across Effect version
 * upgrades — matching the convention in `release-output.ts`.
 *
 * Only the `sbom` section is consumed by Phase 2 today; the top-level shape
 * leaves room for future release-related sections.
 */

import { Schema } from "effect";

/** Hosted JSON Schema URL for the input config; emitted as `$id` in the generated JSON Schema. */
export const INPUT_SCHEMA_URL = "https://json.schemastore.org/silk-release-action.input.schema.json";

// ─── Sub-structs ──────────────────────────────────────────────────────────

/** Contact information for a supplier, author, or security contact. */
export const SbomContact = Schema.Struct({
	name: Schema.optional(Schema.String),
	email: Schema.optional(Schema.String),
	phone: Schema.optional(Schema.String),
}).annotations({ identifier: "SbomContact" });
export type SbomContact = Schema.Schema.Type<typeof SbomContact>;

/**
 * Supplier configuration for SBOM metadata.
 *
 * @remarks
 * `name` is required when `supplier` is provided (it is the value NTIA
 * minimum-elements compliance keys on). `url` and `contact` each accept the
 * scalar-or-array form that `resolveSBOMMetadata` already normalises.
 */
export const SbomSupplier = Schema.Struct({
	name: Schema.String,
	url: Schema.optional(Schema.Union(Schema.String, Schema.Array(Schema.String))),
	contact: Schema.optional(Schema.Union(SbomContact, Schema.Array(SbomContact))),
}).annotations({ identifier: "SbomSupplier" });
export type SbomSupplier = Schema.Schema.Type<typeof SbomSupplier>;

/**
 * Copyright configuration for SBOM metadata.
 *
 * @remarks
 * Most users should NOT set `startYear`; it is auto-detected from the npm
 * registry's first-publication date. Override only when registry lookup is
 * unreliable or the copyright predates first npm publication. `startYear` is
 * a `Schema.Int` because fractional years (e.g. `2024.5`) would otherwise
 * decode through `Schema.Number` and corrupt the formatted copyright string.
 */
export const SbomCopyright = Schema.Struct({
	holder: Schema.optional(Schema.String),
	startYear: Schema.optional(Schema.Int),
}).annotations({ identifier: "SbomCopyright" });
export type SbomCopyright = Schema.Schema.Type<typeof SbomCopyright>;

/**
 * SBOM metadata configuration.
 *
 * @remarks
 * Merged over auto-inferred values from `package.json` by `resolveSBOMMetadata`
 * — explicit config wins. Field names match the prior `SBOMMetadataConfig`
 * consumers so the schema can be swapped in without a wire-format change.
 */
export const SbomConfig = Schema.Struct({
	supplier: Schema.optional(SbomSupplier),
	authors: Schema.optional(Schema.Array(SbomContact)),
	publisher: Schema.optional(Schema.String),
	copyright: Schema.optional(SbomCopyright),
	documentationUrl: Schema.optional(Schema.String),
}).annotations({ identifier: "SbomConfig" });
export type SbomConfig = Schema.Schema.Type<typeof SbomConfig>;

// ─── Top-level config ─────────────────────────────────────────────────────

/**
 * The top-level Silk release config.
 *
 * @remarks
 * `$schema` is optional — templates may reference the input schema for editor
 * tooling, but the action does not require it. `sbom` is the only section
 * Phase 2 consumes today.
 */
export const SilkReleaseConfig = Schema.Struct({
	$schema: Schema.optional(Schema.String),
	sbom: Schema.optional(SbomConfig),
}).annotations({
	identifier: "SilkReleaseConfig",
	title: "Silk Release Action input config",
});
export type SilkReleaseConfig = Schema.Schema.Type<typeof SilkReleaseConfig>;
