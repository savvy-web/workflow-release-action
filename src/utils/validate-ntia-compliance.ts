import type { EnhancedCycloneDXDocument, NTIAComplianceResult, NTIAFieldResult } from "../types/sbom-config.js";

/**
 * NTIA Minimum Elements for SBOM
 *
 * @see https://www.ntia.gov/files/ntia/publications/sbom_minimum_elements_report.pdf
 *
 * The seven minimum elements are:
 * 1. Supplier Name - Entity that creates, defines, and identifies components
 * 2. Component Name - Designation assigned to a component
 * 3. Component Version - Identifier for specific release
 * 4. Unique Identifier - A unique identifier for each component (PURL)
 * 5. Dependency Relationship - Characterizes relationship between upstream/downstream
 * 6. Author of SBOM Data - Entity that creates the SBOM
 * 7. Timestamp - Record of date/time when SBOM was assembled
 */

/**
 * Check if supplier name is present in SBOM
 */
function checkSupplierName(sbom: EnhancedCycloneDXDocument): NTIAFieldResult {
	const supplierName = sbom.metadata?.supplier?.name;
	const passed = typeof supplierName === "string" && supplierName.length > 0;

	return {
		name: "Supplier Name",
		description: "Entity that supplies the software",
		passed,
		value: passed ? supplierName : undefined,
		suggestion: passed ? undefined : "Add `supplier.name` to `.github/silk-release.json`",
	};
}

/**
 * Check if component name is present in SBOM
 */
function checkComponentName(sbom: EnhancedCycloneDXDocument): NTIAFieldResult {
	const componentName = sbom.metadata?.component?.name;
	const passed = typeof componentName === "string" && componentName.length > 0;

	return {
		name: "Component Name",
		description: "Name of the software component",
		passed,
		value: passed ? componentName : undefined,
		suggestion: passed ? undefined : "Component name should be auto-populated from package.json",
	};
}

/**
 * Check if component version is present in SBOM
 */
function checkComponentVersion(sbom: EnhancedCycloneDXDocument): NTIAFieldResult {
	const componentVersion = sbom.metadata?.component?.version;
	const passed = typeof componentVersion === "string" && componentVersion.length > 0;

	return {
		name: "Component Version",
		description: "Version of the software component",
		passed,
		value: passed ? componentVersion : undefined,
		suggestion: passed ? undefined : "Component version should be auto-populated from package.json",
	};
}

/**
 * Check if unique identifier (PURL) is present in SBOM
 */
function checkUniqueIdentifier(sbom: EnhancedCycloneDXDocument): NTIAFieldResult {
	const purl = sbom.metadata?.component?.purl;
	const passed = typeof purl === "string" && purl.startsWith("pkg:");

	return {
		name: "Unique Identifier",
		description: "Package URL (PURL) uniquely identifying the component",
		passed,
		value: passed ? purl : undefined,
		suggestion: passed ? undefined : "PURL should be auto-generated from package name and version",
	};
}

/**
 * Check if dependency relationships are present in SBOM
 */
function checkDependencyRelationship(sbom: EnhancedCycloneDXDocument): NTIAFieldResult {
	// Check for either components array or dependencies array
	const hasComponents = Array.isArray(sbom.components) && sbom.components.length > 0;
	const hasDependencies = Array.isArray(sbom.dependencies) && sbom.dependencies.length > 0;

	// A package with no dependencies should still pass (empty dependency list is valid)
	// We check if the SBOM structure is capable of representing dependencies
	const passed = hasComponents || hasDependencies || sbom.components !== undefined;

	const componentCount = sbom.components?.length ?? 0;

	return {
		name: "Dependency Relationship",
		description: "Dependencies included in the component",
		passed,
		value: passed ? `${componentCount} direct dep${componentCount === 1 ? "" : "s"}` : undefined,
		suggestion: passed ? undefined : "Run SBOM generation with dependencies installed",
	};
}

/**
 * Check if SBOM author is present
 *
 * @remarks
 * In CycloneDX, the author can be represented through:
 * 1. metadata.authors (CycloneDX 1.5+)
 * 2. metadata.supplier (as the creator of the SBOM)
 * 3. metadata.tools (tool that generated the SBOM)
 */
function checkAuthor(sbom: EnhancedCycloneDXDocument): NTIAFieldResult {
	// Check for tools (cdxgen or similar)
	const hasTools = Array.isArray(sbom.metadata?.tools?.components) && sbom.metadata.tools.components.length > 0;

	// Check for supplier (often the author of both software and SBOM)
	const hasSupplier = typeof sbom.metadata?.supplier?.name === "string" && sbom.metadata.supplier.name.length > 0;

	// Check component publisher
	const hasPublisher =
		typeof sbom.metadata?.component?.publisher === "string" && sbom.metadata.component.publisher.length > 0;

	const passed = hasTools || hasSupplier || hasPublisher;

	let value: string | undefined;
	if (hasPublisher) {
		value = sbom.metadata?.component?.publisher;
	} else if (hasSupplier) {
		value = sbom.metadata?.supplier?.name;
	} else if (hasTools) {
		const tool = sbom.metadata?.tools?.components?.[0];
		value = tool ? `${tool.name}${tool.version ? ` ${tool.version}` : ""}` : undefined;
	}

	return {
		name: "Author",
		description: "Entity that created the SBOM data",
		passed,
		value,
		suggestion: passed ? undefined : "Author is auto-populated from SBOM generation tool or package.json author",
	};
}

/**
 * Check if timestamp is present in SBOM
 */
function checkTimestamp(sbom: EnhancedCycloneDXDocument): NTIAFieldResult {
	const timestamp = sbom.metadata?.timestamp;
	const passed = typeof timestamp === "string" && timestamp.length > 0;

	// Format timestamp for display
	let displayValue: string | undefined;
	if (passed && timestamp) {
		try {
			displayValue = new Date(timestamp).toISOString();
		} catch {
			displayValue = timestamp;
		}
	}

	return {
		name: "Timestamp",
		description: "Date and time when SBOM was assembled",
		passed,
		value: displayValue,
		suggestion: passed ? undefined : "Timestamp is auto-generated during SBOM creation",
	};
}

/**
 * Validate SBOM against NTIA minimum elements
 *
 * @remarks
 * Checks the SBOM document for compliance with the seven NTIA minimum elements:
 * 1. Supplier Name
 * 2. Component Name
 * 3. Component Version
 * 4. Unique Identifier (PURL)
 * 5. Dependency Relationship
 * 6. Author of SBOM Data
 * 7. Timestamp
 *
 * @param sbom - CycloneDX SBOM document to validate
 * @returns Compliance result with field-by-field analysis
 *
 * @see https://www.ntia.gov/files/ntia/publications/sbom_minimum_elements_report.pdf
 */
export function validateNTIACompliance(sbom: EnhancedCycloneDXDocument): NTIAComplianceResult {
	const fields: NTIAFieldResult[] = [
		checkSupplierName(sbom),
		checkComponentName(sbom),
		checkComponentVersion(sbom),
		checkUniqueIdentifier(sbom),
		checkDependencyRelationship(sbom),
		checkAuthor(sbom),
		checkTimestamp(sbom),
	];

	const passedCount = fields.filter((f) => f.passed).length;
	const totalCount = fields.length;
	const percentage = Math.round((passedCount / totalCount) * 100 * 10) / 10;
	const compliant = passedCount === totalCount;

	return {
		compliant,
		passedCount,
		totalCount,
		percentage,
		fields,
	};
}

/**
 * Generate markdown summary for NTIA compliance results
 *
 * @param result - NTIA compliance validation result
 * @returns Markdown formatted compliance summary
 */
export function formatNTIAComplianceMarkdown(result: NTIAComplianceResult): string {
	const lines: string[] = [];

	// Header with overall status
	const statusIcon = result.compliant ? "✅" : "⚠️";
	lines.push(`### ${statusIcon} SBOM Compliance Check`);
	lines.push("");
	lines.push(`**NTIA Minimum Elements:** ${result.passedCount}/${result.totalCount} (${result.percentage}%)`);
	lines.push("");

	// Field results table
	lines.push("| Field | Status |");
	lines.push("|-------|--------|");

	for (const field of result.fields) {
		const statusEmoji = field.passed ? "✅" : "❌";
		const valueDisplay = field.passed && field.value ? ` ${field.value}` : field.passed ? "" : " Missing";
		lines.push(`| ${field.name} | ${statusEmoji}${valueDisplay} |`);
	}

	lines.push("");

	// Add suggestions for missing fields
	const missingFields = result.fields.filter((f) => !f.passed);
	if (missingFields.length > 0) {
		lines.push("**Action required:**");
		for (const field of missingFields) {
			if (field.suggestion) {
				lines.push(`- ${field.suggestion}`);
			}
		}
		lines.push("");
	}

	return lines.join("\n");
}
