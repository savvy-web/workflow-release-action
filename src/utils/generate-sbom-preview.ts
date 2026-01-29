import { debug, endGroup, info, startGroup, warning } from "@actions/core";
import type { PackagePublishValidation } from "../types/publish-config.js";
import type {
	EnhancedCycloneDXComponent,
	EnhancedCycloneDXDocument,
	NTIAComplianceResult,
} from "../types/sbom-config.js";
import type { CycloneDXDocument, SBOMValidationResult } from "./create-attestation.js";
import { validateSBOMGeneration } from "./create-attestation.js";
import { formatNTIAComplianceMarkdown, validateNTIACompliance } from "./validate-ntia-compliance.js";

/**
 * SBOM preview for a single package
 */
interface PackageSBOMPreview {
	/** Package name */
	name: string;
	/** Package version */
	version: string;
	/** Whether SBOM generation succeeded */
	success: boolean;
	/** Number of production dependencies */
	dependencyCount: number;
	/** Number of components in the SBOM */
	componentCount: number;
	/** The generated SBOM document */
	sbom?: CycloneDXDocument | EnhancedCycloneDXDocument;
	/** NTIA compliance result */
	ntiaCompliance?: NTIAComplianceResult;
	/** Error message if generation failed */
	error?: string;
	/** Warning message */
	warning?: string;
}

/**
 * Result of generating SBOM previews
 */
export interface SBOMPreviewResult {
	/** SBOM previews for each package */
	packages: PackageSBOMPreview[];
	/** Summary markdown content for check run output */
	summaryContent: string;
	/** Check title for the output */
	checkTitle: string;
	/** Whether all SBOMs generated successfully */
	success: boolean;
}

/**
 * License information extracted from SBOM
 */
interface LicenseInfo {
	/** License identifier (SPDX or name) */
	id: string;
	/** Number of components with this license */
	count: number;
}

/**
 * Group components by type for better display
 */
function groupComponentsByType(
	components: Array<{ type: string; name: string; version?: string; purl?: string }>,
): Map<string, Array<{ name: string; version?: string }>> {
	const groups = new Map<string, Array<{ name: string; version?: string }>>();

	for (const component of components) {
		const type = component.type || "unknown";
		if (!groups.has(type)) {
			groups.set(type, []);
		}
		groups.get(type)?.push({ name: component.name, version: component.version });
	}

	return groups;
}

/**
 * Extract license summary from SBOM components
 */
function extractLicenses(components: EnhancedCycloneDXComponent[]): LicenseInfo[] {
	const licenseCounts = new Map<string, number>();

	for (const component of components) {
		if (component.licenses) {
			for (const licenseEntry of component.licenses) {
				let licenseId = "Unknown";
				if (licenseEntry.license?.id) {
					licenseId = licenseEntry.license.id;
				} else if (licenseEntry.license?.name) {
					licenseId = licenseEntry.license.name;
				} else if (licenseEntry.expression) {
					licenseId = licenseEntry.expression;
				}

				licenseCounts.set(licenseId, (licenseCounts.get(licenseId) || 0) + 1);
			}
		}
	}

	// Sort by count descending
	return Array.from(licenseCounts.entries())
		.map(([id, count]) => ({ id, count }))
		.sort((a, b) => b.count - a.count);
}

/**
 * Generate SBOM preview for packages during validation
 *
 * This function generates SBOMs for packages with npm targets that have
 * provenance enabled, and returns a formatted preview for the PR check.
 * Includes NTIA compliance analysis and enhanced metadata preview.
 *
 * @param packageManager - Package manager to use
 * @param validations - Package validation results from validatePublish
 * @param rootDirectory - Repository root directory (for config loading)
 * @returns SBOM preview result with summary content
 */
export async function generateSBOMPreview(
	packageManager: string,
	validations: PackagePublishValidation[],
	rootDirectory?: string,
): Promise<SBOMPreviewResult> {
	startGroup("Generating SBOM Preview");

	const packages: PackageSBOMPreview[] = [];
	let allSuccess = true;

	for (const validation of validations) {
		// Skip packages without publishable targets
		if (!validation.hasPublishableTargets) {
			debug(`Skipping ${validation.name} - no publishable targets`);
			continue;
		}

		// Find npm targets with provenance (these need SBOMs)
		const npmTargetWithProvenance = validation.targets.find((t) => t.target.protocol === "npm" && t.target.provenance);

		if (!npmTargetWithProvenance) {
			debug(`Skipping ${validation.name} - no npm target with provenance`);
			continue;
		}

		// Use existing SBOM validation result if available, otherwise generate
		let sbomResult: SBOMValidationResult;

		if (validation.sbomValidation?.generatedSbom) {
			info(`Using existing SBOM for ${validation.name}`);
			sbomResult = {
				valid: validation.sbomValidation.valid,
				hasDependencies: validation.sbomValidation.hasDependencies,
				dependencyCount: validation.sbomValidation.dependencyCount,
				warning: validation.sbomValidation.warning,
				error: validation.sbomValidation.error,
				generatedSbom: validation.sbomValidation.generatedSbom as CycloneDXDocument,
			};
		} else {
			info(`Generating SBOM for ${validation.name}`);
			sbomResult = await validateSBOMGeneration({
				directory: npmTargetWithProvenance.target.directory,
				packageManager,
				packageName: validation.name,
				packageVersion: validation.version,
				rootDirectory,
				enhanceMetadata: true,
			});
		}

		const componentCount = sbomResult.generatedSbom?.components?.length || 0;

		if (!sbomResult.valid) {
			warning(`SBOM generation failed for ${validation.name}: ${sbomResult.error}`);
			allSuccess = false;
		}

		// Run NTIA compliance check on the SBOM
		let ntiaCompliance: NTIAComplianceResult | undefined;
		if (sbomResult.generatedSbom) {
			ntiaCompliance = validateNTIACompliance(sbomResult.generatedSbom as EnhancedCycloneDXDocument);
			if (!ntiaCompliance.compliant) {
				debug(
					`NTIA compliance check for ${validation.name}: ${ntiaCompliance.passedCount}/${ntiaCompliance.totalCount}`,
				);
			}
		}

		packages.push({
			name: validation.name,
			version: validation.version,
			success: sbomResult.valid,
			dependencyCount: sbomResult.dependencyCount,
			componentCount,
			sbom: sbomResult.generatedSbom,
			ntiaCompliance,
			error: sbomResult.error,
			warning: sbomResult.warning,
		});
	}

	endGroup();

	// Generate summary content
	const summaryContent = generateSummaryContent(packages, packageManager);

	const successCount = packages.filter((p) => p.success).length;
	const checkTitle =
		packages.length === 0
			? "No packages require SBOM"
			: allSuccess
				? `${packages.length} SBOM(s) generated successfully`
				: `${successCount}/${packages.length} SBOM(s) generated`;

	return {
		packages,
		summaryContent,
		checkTitle,
		success: allSuccess,
	};
}

/**
 * Generate markdown summary content for the SBOM preview
 */
function generateSummaryContent(packages: PackageSBOMPreview[], packageManager: string): string {
	const lines: string[] = [];

	lines.push("## SBOM Preview");
	lines.push("");

	if (packages.length === 0) {
		lines.push("No packages with npm provenance targets found. SBOMs are generated for npm packages ");
		lines.push("that have `provenance: true` in their publish configuration.");
		lines.push("");
		return lines.join("\n");
	}

	// Summary table
	lines.push("| Package | Status | Dependencies | Components | NTIA |");
	lines.push("|---------|--------|--------------|------------|------|");

	for (const pkg of packages) {
		const status = pkg.success ? "✅ Ready" : "❌ Failed";
		const deps = pkg.dependencyCount.toString();
		const components = pkg.componentCount.toString();
		const ntia = pkg.ntiaCompliance
			? pkg.ntiaCompliance.compliant
				? "✅ 100%"
				: `⚠️ ${pkg.ntiaCompliance.percentage}%`
			: "—";
		lines.push(`| \`${pkg.name}@${pkg.version}\` | ${status} | ${deps} | ${components} | ${ntia} |`);
	}

	lines.push("");

	// Detailed SBOM content for each package
	for (const pkg of packages) {
		lines.push(`### 📦 ${pkg.name}@${pkg.version}`);
		lines.push("");

		if (pkg.error) {
			lines.push(`**Error:** ${pkg.error}`);
			lines.push("");
			continue;
		}

		if (pkg.warning) {
			lines.push(`**Warning:** ${pkg.warning}`);
			lines.push("");
		}

		if (!pkg.sbom) {
			lines.push("*No SBOM content available*");
			lines.push("");
			continue;
		}

		// Type cast for enhanced SBOM
		const sbom = pkg.sbom as EnhancedCycloneDXDocument;

		// SBOM metadata summary
		const supplierName = sbom.metadata?.supplier?.name;
		const publisher = sbom.metadata?.component?.publisher;

		lines.push(`**SBOM Format:** CycloneDX ${sbom.specVersion}`);
		if (supplierName) {
			lines.push(`**Supplier:** ${supplierName}`);
		}
		if (publisher) {
			lines.push(`**Publisher:** ${publisher}`);
		}
		lines.push("");

		// External references
		const externalRefs = sbom.metadata?.component?.externalReferences;
		if (externalRefs && externalRefs.length > 0) {
			lines.push("**External References:**");
			for (const ref of externalRefs) {
				const icon = getExternalRefIcon(ref.type);
				const label = capitalizeFirst(ref.type.replace(/-/g, " "));
				lines.push(`- ${icon} [${label}](${ref.url})`);
			}
			lines.push("");
		}

		// License summary
		const components = (sbom.components || []) as EnhancedCycloneDXComponent[];
		const licenses = extractLicenses(components);
		if (licenses.length > 0) {
			lines.push("**License Summary:**");
			lines.push("");
			lines.push("| License | Count |");
			lines.push("|---------|-------|");
			// Show top 10 licenses
			for (const license of licenses.slice(0, 10)) {
				lines.push(`| ${license.id} | ${license.count} |`);
			}
			if (licenses.length > 10) {
				lines.push(`| *... ${licenses.length - 10} more* | |`);
			}
			lines.push("");
		}

		// NTIA compliance section
		if (pkg.ntiaCompliance) {
			lines.push(formatNTIAComplianceMarkdown(pkg.ntiaCompliance));
		}

		// Components grouped by type
		if (components.length === 0) {
			lines.push("*No components found in SBOM*");
			lines.push("");
		} else {
			const groups = groupComponentsByType(components);

			for (const [type, typeComponents] of groups) {
				lines.push(`#### ${getTypeIcon(type)} ${capitalizeFirst(type)} (${typeComponents.length})`);
				lines.push("");

				// Show up to 20 components, then summarize
				const maxDisplay = 20;
				const displayComponents = typeComponents.slice(0, maxDisplay);

				lines.push("<details>");
				lines.push(`<summary>View ${typeComponents.length} ${type} components</summary>`);
				lines.push("");
				lines.push("```");
				for (const comp of displayComponents) {
					lines.push(`${comp.name}@${comp.version || "unknown"}`);
				}
				if (typeComponents.length > maxDisplay) {
					lines.push(`... and ${typeComponents.length - maxDisplay} more`);
				}
				lines.push("```");
				lines.push("");
				lines.push("</details>");
				lines.push("");
			}
		}
	}

	// Footer with info about SBOM
	lines.push("---");
	lines.push(
		`*SBOMs are generated using [CycloneDX](https://cyclonedx.org/) format via \`${packageManager}\` and will be attached as attestations during publish.*`,
	);
	lines.push("");

	return lines.join("\n");
}

/**
 * Get icon for component type
 */
function getTypeIcon(type: string): string {
	switch (type.toLowerCase()) {
		case "library":
			return "📚";
		case "application":
			return "🚀";
		case "framework":
			return "🏗️";
		case "file":
			return "📄";
		case "container":
			return "📦";
		case "device":
			return "🖥️";
		case "firmware":
			return "💾";
		case "operating-system":
			return "🖥️";
		default:
			return "📦";
	}
}

/**
 * Get icon for external reference type
 */
function getExternalRefIcon(type: string): string {
	switch (type.toLowerCase()) {
		case "vcs":
			return "🔗";
		case "issue-tracker":
			return "🐛";
		case "documentation":
			return "📚";
		case "website":
			return "🌐";
		case "support":
			return "💬";
		case "license":
			return "📜";
		case "release-notes":
			return "📝";
		case "security-contact":
			return "🔒";
		default:
			return "🔗";
	}
}

/**
 * Capitalize first letter
 */
function capitalizeFirst(str: string): string {
	return str.charAt(0).toUpperCase() + str.slice(1);
}
