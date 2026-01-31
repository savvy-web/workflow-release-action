/**
 * Registry detection and display utilities
 *
 * @remarks
 * This module provides URL-safe registry detection that properly parses URLs
 * before checking hostnames. Using substring matching on URLs is a security
 * issue (CWE-20) as it can be bypassed with malicious URLs like:
 * - `http://evil-npmjs.org` (prefix)
 * - `http://npmjs.org.evil.com` (suffix)
 * - `http://evil.com/npmjs.org` (path component)
 *
 * All functions in this module parse URLs and check the hostname properly.
 */

/** Known registry types */
export type RegistryType = "npm" | "github-packages" | "jsr" | "custom";

/**
 * Parse a URL and extract the hostname safely
 *
 * @param url - URL string to parse
 * @returns Lowercase hostname or null if invalid
 */
function getHostname(url: string | null | undefined): string | null {
	if (!url) return null;
	try {
		return new URL(url).hostname.toLowerCase();
	} catch {
		return null;
	}
}

/**
 * Check if a hostname matches a known registry domain
 *
 * @remarks
 * Uses exact match or subdomain match to ensure security:
 * - `registry.npmjs.org` matches `npmjs.org`
 * - `npm.pkg.github.com` matches `pkg.github.com`
 * - `evil-npmjs.org` does NOT match `npmjs.org`
 *
 * @param hostname - Parsed hostname to check
 * @param domain - Domain to match against (e.g., "npmjs.org")
 * @returns true if hostname matches the domain
 */
function matchesDomain(hostname: string | null, domain: string): boolean {
	if (!hostname) return false;
	const normalizedDomain = domain.toLowerCase();
	// Exact match or subdomain match (hostname ends with .domain)
	return hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`);
}

/**
 * Check if a registry URL is the npm public registry
 *
 * @param registry - Registry URL to check
 * @returns true if this is the npm public registry (registry.npmjs.org or subdomain)
 */
export function isNpmRegistry(registry: string | null | undefined): boolean {
	return matchesDomain(getHostname(registry), "npmjs.org");
}

/**
 * Check if a registry URL is GitHub Packages
 *
 * @param registry - Registry URL to check
 * @returns true if this is GitHub Packages (npm.pkg.github.com or subdomain)
 */
export function isGitHubPackagesRegistry(registry: string | null | undefined): boolean {
	return matchesDomain(getHostname(registry), "pkg.github.com");
}

/**
 * Check if a registry URL is JSR
 *
 * @param registry - Registry URL to check
 * @returns true if this is JSR (jsr.io or subdomain)
 */
export function isJsrRegistry(registry: string | null | undefined): boolean {
	return matchesDomain(getHostname(registry), "jsr.io");
}

/**
 * Check if a registry URL is a custom (non-standard) registry
 *
 * @param registry - Registry URL to check
 * @returns true if this is not npm, GitHub Packages, or JSR
 */
export function isCustomRegistry(registry: string | null | undefined): boolean {
	if (!registry) return false;
	return !isNpmRegistry(registry) && !isGitHubPackagesRegistry(registry) && !isJsrRegistry(registry);
}

/**
 * Detect the type of a registry from its URL
 *
 * @param registry - Registry URL to check
 * @returns The registry type
 */
export function getRegistryType(registry: string | null | undefined): RegistryType {
	if (isNpmRegistry(registry)) return "npm";
	if (isGitHubPackagesRegistry(registry)) return "github-packages";
	if (isJsrRegistry(registry)) return "jsr";
	return "custom";
}

/**
 * Get a human-readable display name for a registry URL
 *
 * @param registry - Registry URL to convert to display name
 * @returns Human-readable registry name (e.g., "npm", "GitHub Packages", or hostname)
 */
export function getRegistryDisplayName(registry: string | null | undefined): string {
	if (!registry) return "jsr.io";
	if (isNpmRegistry(registry)) return "npm";
	if (isGitHubPackagesRegistry(registry)) return "GitHub Packages";
	if (isJsrRegistry(registry)) return "jsr.io";

	// For custom registries, return the hostname
	const hostname = getHostname(registry);
	return hostname || registry;
}

/**
 * Generate a URL to view the published package on its registry
 *
 * @param registry - Registry URL
 * @param packageName - Name of the package (including scope if any)
 * @returns URL to view the package, or undefined if not supported
 */
export function generatePackageViewUrl(
	registry: string | null | undefined,
	packageName: string | null | undefined,
): string | undefined {
	if (!packageName || !registry) return undefined;

	if (isNpmRegistry(registry)) {
		return `https://www.npmjs.com/package/${packageName}`;
	}

	if (isGitHubPackagesRegistry(registry)) {
		// GitHub Packages URL format: github.com/{owner}/packages
		const scope = packageName.startsWith("@") ? packageName.split("/")[0].slice(1) : undefined;
		return scope ? `https://github.com/${scope}/packages` : undefined;
	}

	// Custom registries have no standard URL format
	return undefined;
}
