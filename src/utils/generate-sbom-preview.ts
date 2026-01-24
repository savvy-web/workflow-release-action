import { debug, endGroup, info, startGroup, warning } from "@actions/core";
import type { PackagePublishValidation } from "../types/publish-config.js";
import type { CycloneDXDocument, SBOMValidationResult } from "./create-attestation.js";
import { validateSBOMGeneration } from "./create-attestation.js";

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
	sbom?: CycloneDXDocument;
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
 * Generate SBOM preview for packages during validation
 *
 * This function generates SBOMs for packages with npm targets that have
 * provenance enabled, and returns a formatted preview for the PR check.
 *
 * @param packageManager - Package manager to use
 * @param validations - Package validation results from validatePublish
 * @returns SBOM preview result with summary content
 */
export async function generateSBOMPreview(
	packageManager: string,
	validations: PackagePublishValidation[],
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
			});
		}

		const componentCount = sbomResult.generatedSbom?.components?.length || 0;

		if (!sbomResult.valid) {
			warning(`SBOM generation failed for ${validation.name}: ${sbomResult.error}`);
			allSuccess = false;
		}

		packages.push({
			name: validation.name,
			version: validation.version,
			success: sbomResult.valid,
			dependencyCount: sbomResult.dependencyCount,
			componentCount,
			sbom: sbomResult.generatedSbom,
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
	lines.push("| Package | Status | Dependencies | Components |");
	lines.push("|---------|--------|--------------|------------|");

	for (const pkg of packages) {
		const status = pkg.success ? "✅ Ready" : "❌ Failed";
		const deps = pkg.dependencyCount.toString();
		const components = pkg.componentCount.toString();
		lines.push(`| \`${pkg.name}@${pkg.version}\` | ${status} | ${deps} | ${components} |`);
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

		// SBOM metadata
		lines.push(`**SBOM Format:** CycloneDX ${pkg.sbom.specVersion}`);
		lines.push("");

		// Components grouped by type
		const components = pkg.sbom.components || [];
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
 * Capitalize first letter
 */
function capitalizeFirst(str: string): string {
	return str.charAt(0).toUpperCase() + str.slice(1);
}
