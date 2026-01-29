import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { debug, info } from "@actions/core";
import type { InferredSBOMMetadata, ResolvedSBOMMetadata, SBOMMetadataConfig } from "../types/sbom-config.js";

/**
 * Extended PackageJson interface with all fields needed for SBOM inference
 */
interface PackageJsonForSBOM {
	name?: string;
	version?: string;
	description?: string;
	license?: string;
	author?: string | { name?: string; email?: string; url?: string };
	repository?: string | { type?: string; url?: string; directory?: string };
	bugs?: string | { url?: string; email?: string };
	homepage?: string;
	keywords?: string[];
}

/**
 * Parse author field from package.json
 *
 * @remarks
 * The author field can be a string in format "Name <email> (url)"
 * or an object with name, email, and url properties.
 *
 * @param author - Author field from package.json
 * @returns Parsed author name and email
 */
export function parseAuthor(author: string | { name?: string; email?: string; url?: string } | undefined): {
	name?: string;
	email?: string;
} {
	if (!author) {
		return {};
	}

	if (typeof author === "object") {
		return {
			name: author.name,
			email: author.email,
		};
	}

	// Parse string format: "Name <email> (url)"
	const nameMatch = author.match(/^([^<(]+)/);
	const emailMatch = author.match(/<([^>]+)>/);

	return {
		name: nameMatch?.[1]?.trim(),
		email: emailMatch?.[1]?.trim(),
	};
}

/**
 * Parse repository field from package.json
 *
 * @param repository - Repository field from package.json
 * @returns Normalized repository URL
 */
export function parseRepository(
	repository: string | { type?: string; url?: string; directory?: string } | undefined,
): string | undefined {
	if (!repository) {
		return undefined;
	}

	let url: string | undefined;

	if (typeof repository === "string") {
		url = repository;
	} else {
		url = repository.url;
	}

	if (!url) {
		return undefined;
	}

	// Normalize git URLs to HTTPS
	// git+https://github.com/org/repo.git -> https://github.com/org/repo
	// git://github.com/org/repo.git -> https://github.com/org/repo
	// git@github.com:org/repo.git -> https://github.com/org/repo
	url = url
		.replace(/^git\+/, "")
		.replace(/^git:\/\//, "https://")
		.replace(/^git@([^:]+):/, "https://$1/")
		.replace(/\.git$/, "");

	return url;
}

/**
 * Parse bugs field from package.json
 *
 * @param bugs - Bugs field from package.json
 * @returns Issue tracker URL
 */
export function parseBugs(bugs: string | { url?: string; email?: string } | undefined): string | undefined {
	if (!bugs) {
		return undefined;
	}

	if (typeof bugs === "string") {
		return bugs;
	}

	return bugs.url;
}

/**
 * Infer SBOM metadata from package.json
 *
 * @remarks
 * Reads package.json from the specified directory and extracts metadata
 * that can be used for SBOM generation:
 * - author (name, email)
 * - repository (VCS URL)
 * - bugs (issue tracker URL)
 * - homepage (documentation URL)
 * - license
 *
 * @param directory - Directory containing package.json
 * @returns Inferred metadata from package.json fields
 */
export function inferSBOMMetadata(directory: string): InferredSBOMMetadata {
	const pkgJsonPath = join(directory, "package.json");

	if (!existsSync(pkgJsonPath)) {
		debug(`No package.json found at ${pkgJsonPath} for SBOM metadata inference`);
		return {};
	}

	let pkgJson: PackageJsonForSBOM;
	try {
		pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8")) as PackageJsonForSBOM;
	} catch (error) {
		debug(`Failed to parse package.json for SBOM metadata: ${error instanceof Error ? error.message : String(error)}`);
		return {};
	}

	const author = parseAuthor(pkgJson.author);
	const vcsUrl = parseRepository(pkgJson.repository);
	const issueTrackerUrl = parseBugs(pkgJson.bugs);

	const result: InferredSBOMMetadata = {
		authorName: author.name,
		authorEmail: author.email,
		vcsUrl,
		issueTrackerUrl,
		documentationUrl: pkgJson.homepage,
		license: pkgJson.license,
	};

	debug(`Inferred SBOM metadata from ${directory}: ${JSON.stringify(result)}`);
	return result;
}

/**
 * Format copyright string
 *
 * @param holder - Copyright holder name
 * @param startYear - Start year
 * @param endYear - End year (defaults to current year)
 * @returns Formatted copyright string
 */
export function formatCopyright(holder: string, startYear?: number, endYear?: number): string {
	const currentYear = endYear ?? new Date().getFullYear();

	if (!startYear || startYear === currentYear) {
		return `Copyright ${currentYear} ${holder}`;
	}

	return `Copyright ${startYear}-${currentYear} ${holder}`;
}

/**
 * Merge inferred metadata with explicit configuration
 *
 * @remarks
 * Explicit configuration values take precedence over inferred values.
 * This implements the layered configuration system where:
 * 1. Auto-inferred values from package.json are the base
 * 2. Explicit config from release-config.json overrides
 *
 * @param inferred - Metadata inferred from package.json
 * @param config - Explicit configuration from release-config.json
 * @param packageName - Package name for PURL
 * @param packageVersion - Package version
 * @param copyrightStartYear - Detected copyright start year
 * @returns Resolved metadata ready for SBOM injection
 */
export function resolveSBOMMetadata(
	inferred: InferredSBOMMetadata,
	config: SBOMMetadataConfig | undefined,
	_packageName: string,
	_packageVersion: string,
	copyrightStartYear?: number,
): ResolvedSBOMMetadata {
	const result: ResolvedSBOMMetadata = {};

	// Resolve supplier
	if (config?.supplier?.name) {
		const supplierUrls = config.supplier.url
			? Array.isArray(config.supplier.url)
				? config.supplier.url
				: [config.supplier.url]
			: undefined;

		const supplierContacts = config.supplier.contact
			? Array.isArray(config.supplier.contact)
				? config.supplier.contact
				: [config.supplier.contact]
			: undefined;

		result.supplier = {
			name: config.supplier.name,
			url: supplierUrls,
			contact: supplierContacts?.map((c) => ({
				name: c.name,
				email: c.email,
				phone: c.phone,
			})),
		};
	}

	// Resolve component metadata
	const publisher = config?.publisher || config?.supplier?.name || inferred.authorName;
	const copyrightHolder = config?.copyright?.holder || config?.supplier?.name;
	const startYear = config?.copyright?.startYear || copyrightStartYear;

	// Build external references from inferred and config
	const externalReferences: ResolvedSBOMMetadata["component"] = {
		externalReferences: [],
	};

	// VCS reference (from package.json repository)
	if (inferred.vcsUrl) {
		externalReferences.externalReferences?.push({
			type: "vcs",
			url: inferred.vcsUrl,
		});
	}

	// Issue tracker reference (from package.json bugs)
	if (inferred.issueTrackerUrl) {
		externalReferences.externalReferences?.push({
			type: "issue-tracker",
			url: inferred.issueTrackerUrl,
		});
	}

	// Documentation reference (config overrides homepage)
	const docUrl = config?.documentationUrl || inferred.documentationUrl;
	if (docUrl) {
		externalReferences.externalReferences?.push({
			type: "documentation",
			url: docUrl,
		});
	}

	// Website reference (from supplier URL if different from doc URL)
	const supplierUrl = config?.supplier?.url
		? Array.isArray(config.supplier.url)
			? config.supplier.url[0]
			: config.supplier.url
		: undefined;
	if (supplierUrl && supplierUrl !== docUrl) {
		externalReferences.externalReferences?.push({
			type: "website",
			url: supplierUrl,
		});
	}

	result.component = {
		publisher,
		copyright: copyrightHolder ? formatCopyright(copyrightHolder, startYear) : undefined,
		externalReferences:
			externalReferences.externalReferences && externalReferences.externalReferences.length > 0
				? externalReferences.externalReferences
				: undefined,
	};

	// Resolve author
	result.author = inferred.authorName;

	info(
		`Resolved SBOM metadata: supplier=${result.supplier?.name || "none"}, publisher=${result.component?.publisher || "none"}`,
	);

	return result;
}
