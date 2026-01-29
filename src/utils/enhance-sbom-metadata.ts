import { debug, info } from "@actions/core";
import type {
	EnhancedCycloneDXDocument,
	ResolvedSBOMMetadata,
	SBOMExternalReference,
	SBOMMetadataConfig,
} from "../types/sbom-config.js";
import type { CycloneDXDocument } from "./create-attestation.js";
import { detectCopyrightYear } from "./detect-copyright-year.js";
import { inferSBOMMetadata, resolveSBOMMetadata } from "./infer-sbom-metadata.js";
import { loadSBOMConfig } from "./load-release-config.js";

/**
 * Existing component from base CycloneDX document
 * (may have externalReferences if it was enhanced previously)
 */
interface ExistingComponent {
	name?: string;
	version?: string;
	type?: string;
	purl?: string;
	publisher?: string;
	copyright?: string;
	externalReferences?: SBOMExternalReference[];
}

/**
 * Options for enhancing SBOM metadata
 */
export interface EnhanceSBOMOptions {
	/** Package name */
	packageName: string;
	/** Package version */
	packageVersion: string;
	/** Directory containing package.json (for metadata inference) */
	packageDirectory: string;
	/** Repository root directory (for config loading) */
	rootDirectory?: string;
	/** Optional pre-loaded SBOM config (avoids re-reading file) */
	sbomConfig?: SBOMMetadataConfig;
	/** Optional npm registry for copyright year detection */
	registry?: string;
}

/**
 * Generate PURL (Package URL) for an npm package
 *
 * @param packageName - Package name (may include scope)
 * @param version - Package version
 * @returns PURL string in format pkg:npm/[@scope/]name@version
 */
export function generatePurl(packageName: string, version: string): string {
	// Encode the package name properly for PURL
	// Scoped packages: @scope/name -> pkg:npm/%40scope/name@version
	const encodedName = packageName.startsWith("@") ? `%40${packageName.slice(1)}` : packageName;
	return `pkg:npm/${encodedName}@${version}`;
}

/**
 * Enhance a CycloneDX SBOM document with additional metadata
 *
 * @remarks
 * This function enriches a generated SBOM with:
 * - Supplier information (required for NTIA compliance)
 * - Component metadata (publisher, copyright, external references)
 * - PURL for unique identification
 *
 * The metadata is sourced from:
 * 1. Auto-inferred values from package.json
 * 2. Explicit configuration from .github/release-config.json
 * 3. Auto-detected copyright year from npm registry
 *
 * @param sbom - Original SBOM document from cdxgen
 * @param options - Enhancement options
 * @returns Enhanced SBOM document with additional metadata
 */
export async function enhanceSBOMMetadata(
	sbom: CycloneDXDocument,
	options: EnhanceSBOMOptions,
): Promise<EnhancedCycloneDXDocument> {
	const { packageName, packageVersion, packageDirectory, rootDirectory, registry } = options;

	info(`Enhancing SBOM metadata for ${packageName}@${packageVersion}`);

	// Load or use provided config
	const config = options.sbomConfig ?? loadSBOMConfig(rootDirectory);

	// Infer metadata from package.json
	const inferred = inferSBOMMetadata(packageDirectory);

	// Detect copyright year (from config or npm registry)
	const copyrightYearResult = await detectCopyrightYear(packageName, config?.copyright?.startYear, registry);

	debug(`Copyright year for ${packageName}: ${copyrightYearResult.startYear} (source: ${copyrightYearResult.source})`);

	// Resolve final metadata (config overrides inferred)
	const resolved = resolveSBOMMetadata(inferred, config, copyrightYearResult.startYear);

	// Create enhanced SBOM
	const enhanced: EnhancedCycloneDXDocument = {
		...sbom,
		metadata: {
			...sbom.metadata,
			timestamp: sbom.metadata?.timestamp || new Date().toISOString(),
		},
	};

	// Add supplier information
	if (resolved.supplier) {
		enhanced.metadata = {
			...enhanced.metadata,
			supplier: {
				name: resolved.supplier.name,
				url: resolved.supplier.url,
				contact: resolved.supplier.contact,
			},
		};
	}

	// Enhance component metadata
	const existingComponent = (sbom.metadata?.component || {}) as ExistingComponent;
	enhanced.metadata = {
		...enhanced.metadata,
		component: {
			...existingComponent,
			type: existingComponent.type || "library",
			name: packageName,
			version: packageVersion,
			purl: generatePurl(packageName, packageVersion),
			publisher: resolved.component?.publisher || existingComponent.name,
			copyright: resolved.component?.copyright,
			externalReferences: mergeExternalReferences(
				existingComponent.externalReferences,
				resolved.component?.externalReferences,
			),
		},
	};

	// Ensure tools are present (for NTIA author field)
	if (!enhanced.metadata?.tools?.components?.length) {
		enhanced.metadata = {
			...enhanced.metadata,
			tools: {
				components: [
					{
						type: "application",
						name: "workflow-release-action",
						version: "1.0.0",
					},
				],
			},
		};
	}

	debug(
		`Enhanced SBOM metadata: supplier=${enhanced.metadata?.supplier?.name}, purl=${enhanced.metadata?.component?.purl}`,
	);

	return enhanced;
}

/**
 * Merge external references, avoiding duplicates
 */
function mergeExternalReferences(
	existing?: SBOMExternalReference[],
	additional?: SBOMExternalReference[],
): SBOMExternalReference[] | undefined {
	if (!existing && !additional) {
		return undefined;
	}

	const merged = new Map<string, SBOMExternalReference>();

	// Add existing references first
	for (const ref of existing || []) {
		merged.set(`${ref.type}:${ref.url}`, ref);
	}

	// Add additional references (won't overwrite existing same-type refs)
	for (const ref of additional || []) {
		const key = `${ref.type}:${ref.url}`;
		if (!merged.has(key)) {
			merged.set(key, ref);
		}
	}

	const result = Array.from(merged.values());
	return result.length > 0 ? result : undefined;
}

/**
 * Quick enhancement for SBOM without async copyright detection
 *
 * @remarks
 * Use this when you already have resolved metadata or don't need
 * copyright year detection from the npm registry.
 *
 * @param sbom - Original SBOM document
 * @param packageName - Package name
 * @param packageVersion - Package version
 * @param metadata - Pre-resolved metadata
 * @returns Enhanced SBOM document
 */
export function enhanceSBOMWithMetadata(
	sbom: CycloneDXDocument,
	packageName: string,
	packageVersion: string,
	metadata: ResolvedSBOMMetadata,
): EnhancedCycloneDXDocument {
	const enhanced: EnhancedCycloneDXDocument = {
		...sbom,
		metadata: {
			...sbom.metadata,
			timestamp: sbom.metadata?.timestamp || new Date().toISOString(),
		},
	};

	// Add supplier if present
	if (metadata.supplier) {
		enhanced.metadata = {
			...enhanced.metadata,
			supplier: metadata.supplier,
		};
	}

	// Enhance component
	const existingComponent = (sbom.metadata?.component || {}) as ExistingComponent;
	enhanced.metadata = {
		...enhanced.metadata,
		component: {
			...existingComponent,
			type: existingComponent.type || "library",
			name: packageName,
			version: packageVersion,
			purl: generatePurl(packageName, packageVersion),
			publisher: metadata.component?.publisher,
			copyright: metadata.component?.copyright,
			externalReferences: mergeExternalReferences(
				existingComponent.externalReferences,
				metadata.component?.externalReferences,
			),
		},
	};

	return enhanced;
}
