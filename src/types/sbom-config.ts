/**
 * SBOM metadata configuration types for NTIA-compliant SBOM generation
 *
 * @remarks
 * These types support a layered configuration system:
 * 1. Auto-infer from package.json (author, repository, bugs, homepage)
 * 2. Load explicit config from .github/silk-release.json
 * 3. Merge config over inferred values (config wins)
 *
 * @see https://www.ntia.gov/files/ntia/publications/sbom_minimum_elements_report.pdf
 */

/**
 * Contact information for supplier or security
 */
export interface SBOMContact {
	/** Contact name (inferred from package.json author) */
	name?: string;
	/** Contact email (inferred from package.json author or security contact) */
	email?: string;
	/** Contact phone */
	phone?: string;
}

/**
 * Supplier configuration for SBOM metadata
 *
 * @remarks
 * The supplier field is required for NTIA minimum elements compliance.
 * This information identifies who supplies/distributes the software.
 */
export interface SBOMSupplierConfig {
	/** Organization or company name (required for NTIA compliance) */
	name: string;
	/** Organization website URLs */
	url?: string | string[];
	/** Contact information (security contact recommended) */
	contact?: SBOMContact | SBOMContact[];
}

/**
 * Copyright configuration for SBOM metadata
 */
export interface SBOMCopyrightConfig {
	/** Copyright holder name (defaults to supplier.name) */
	holder?: string;
	/**
	 * Copyright start year
	 *
	 * @remarks
	 * If not provided, will be auto-detected by:
	 * 1. Querying npm registry for time.created on existing packages
	 * 2. Falling back to current year for new packages
	 */
	startYear?: number;
}

/**
 * External reference types in CycloneDX format
 *
 * @see https://cyclonedx.org/docs/1.5/json/#components_items_externalReferences_items_type
 */
export type SBOMExternalReferenceType =
	| "vcs"
	| "issue-tracker"
	| "website"
	| "advisories"
	| "bom"
	| "mailing-list"
	| "social"
	| "chat"
	| "documentation"
	| "support"
	| "source-distribution"
	| "distribution"
	| "distribution-intake"
	| "license"
	| "build-meta"
	| "build-system"
	| "release-notes"
	| "security-contact"
	| "model-card"
	| "log"
	| "configuration"
	| "evidence"
	| "formulation"
	| "attestation"
	| "threat-model"
	| "adversary-model"
	| "risk-assessment"
	| "vulnerability-assertion"
	| "exploitability-statement"
	| "pentest-report"
	| "static-analysis-report"
	| "dynamic-analysis-report"
	| "runtime-analysis-report"
	| "component-analysis-report"
	| "maturity-report"
	| "certification-report"
	| "quality-metrics"
	| "codified-infrastructure"
	| "poam"
	| "other";

/**
 * External reference for SBOM component metadata
 */
export interface SBOMExternalReference {
	/** Type of external reference */
	type: SBOMExternalReferenceType;
	/** URL of the reference */
	url: string;
	/** Optional comment describing the reference */
	comment?: string;
}

/**
 * Complete SBOM metadata configuration
 *
 * @remarks
 * This configuration is loaded from .github/silk-release.json and merged
 * with auto-inferred values from package.json. Explicit config values take
 * precedence over inferred values.
 *
 * @example
 * ```json
 * {
 *   "supplier": {
 *     "name": "Savvy Web Systems",
 *     "url": "https://savvyweb.systems",
 *     "contact": {
 *       "email": "security@savvyweb.systems"
 *     }
 *   },
 *   "copyright": {
 *     "holder": "Savvy Web Systems LLC",
 *     "startYear": 2024
 *   },
 *   "documentationUrl": "https://rslib-builder.savvyweb.systems"
 * }
 * ```
 */
export interface SBOMMetadataConfig {
	/** Supplier information (required for NTIA compliance) */
	supplier?: SBOMSupplierConfig;
	/** Copyright configuration */
	copyright?: SBOMCopyrightConfig;
	/**
	 * Publisher name for component metadata
	 *
	 * @remarks
	 * If not specified, defaults to supplier.name or author name from package.json
	 */
	publisher?: string;
	/**
	 * Documentation URL (overrides homepage from package.json)
	 */
	documentationUrl?: string;
}

/**
 * Release configuration file structure
 *
 * @remarks
 * This is the structure of .github/silk-release.json which configures
 * release-related settings including SBOM metadata.
 */
export interface ReleaseConfig {
	/** SBOM metadata configuration */
	sbom?: SBOMMetadataConfig;
}

/**
 * Inferred SBOM metadata from package.json
 *
 * @remarks
 * These values are auto-detected from package.json fields and used as defaults.
 * Explicit configuration from silk-release.json takes precedence.
 */
export interface InferredSBOMMetadata {
	/** Author name parsed from package.json author field */
	authorName?: string;
	/** Author email parsed from package.json author field */
	authorEmail?: string;
	/** VCS URL from package.json repository field */
	vcsUrl?: string;
	/** Issue tracker URL from package.json bugs field */
	issueTrackerUrl?: string;
	/** Documentation/homepage URL from package.json homepage field */
	documentationUrl?: string;
	/** Package license from package.json license field */
	license?: string;
}

/**
 * Resolved SBOM metadata after merging inferred and explicit config
 *
 * @remarks
 * This represents the final, merged metadata ready for injection into
 * the CycloneDX SBOM document.
 */
export interface ResolvedSBOMMetadata {
	/** Supplier information */
	supplier?: {
		name: string;
		url?: string[];
		contact?: Array<{ name?: string; email?: string; phone?: string }>;
	};
	/** Component metadata */
	component?: {
		publisher?: string;
		copyright?: string;
		externalReferences?: SBOMExternalReference[];
	};
	/** Author of the component */
	author?: string;
}

/**
 * NTIA minimum elements compliance result
 *
 * @see https://www.ntia.gov/files/ntia/publications/sbom_minimum_elements_report.pdf
 */
export interface NTIAComplianceResult {
	/** Whether all minimum elements are present */
	compliant: boolean;
	/** Number of fields that pass */
	passedCount: number;
	/** Total number of required fields */
	totalCount: number;
	/** Compliance percentage */
	percentage: number;
	/** Individual field results */
	fields: NTIAFieldResult[];
}

/**
 * NTIA minimum element field result
 */
export interface NTIAFieldResult {
	/** Field name */
	name: string;
	/** Human-readable description */
	description: string;
	/** Whether the field passes compliance */
	passed: boolean;
	/** Value found (if any) */
	value?: string;
	/** Suggestion for how to fix if missing */
	suggestion?: string;
}

/**
 * Enhanced CycloneDX metadata with supplier and component info
 *
 * @remarks
 * Extends the basic CycloneDX metadata structure to include all fields
 * needed for NTIA compliance.
 */
export interface EnhancedCycloneDXMetadata {
	/** Timestamp when SBOM was generated */
	timestamp?: string;
	/** Supplier/distributor information */
	supplier?: {
		name: string;
		url?: string[];
		contact?: Array<{ name?: string; email?: string; phone?: string }>;
	};
	/** Component being described */
	component?: {
		type?: string;
		name: string;
		version?: string;
		publisher?: string;
		copyright?: string;
		purl?: string;
		externalReferences?: SBOMExternalReference[];
	};
	/** Tool that generated the SBOM */
	tools?: {
		components?: Array<{
			type: string;
			name: string;
			version?: string;
		}>;
	};
}

/**
 * CycloneDX component with enhanced metadata
 */
export interface EnhancedCycloneDXComponent {
	type: string;
	name: string;
	version?: string;
	purl?: string;
	publisher?: string;
	copyright?: string;
	licenses?: Array<{
		license?: {
			id?: string;
			name?: string;
			url?: string;
		};
		expression?: string;
	}>;
	externalReferences?: SBOMExternalReference[];
}

/**
 * Enhanced CycloneDX document with full metadata support
 */
export interface EnhancedCycloneDXDocument {
	bomFormat: "CycloneDX";
	specVersion: string;
	version: number;
	serialNumber?: string;
	metadata?: EnhancedCycloneDXMetadata;
	components?: EnhancedCycloneDXComponent[];
	dependencies?: Array<{
		ref: string;
		dependsOn?: string[];
	}>;
}
