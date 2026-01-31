import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { debug } from "@actions/core";
import type { PackageJson, PreValidationResult, ResolvedTarget } from "../types/publish-config.js";
import { getRegistryDisplayName, isGitHubPackagesRegistry } from "./registry-utils.js";

/**
 * Validate package.json for npm-compatible registries
 */
function validateNpmPackageJson(
	target: ResolvedTarget,
	pkg: PackageJson,
	expectedName: string,
	_expectedVersion: string,
): PreValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	// Must NOT be private for publishing
	if (pkg.private === true) {
		errors.push(
			`Built package.json has "private": true - cannot publish to ${getRegistryDisplayName(target.registry)}`,
		);
	}

	// Must have name
	if (!pkg.name) {
		errors.push("Built package.json missing 'name' field");
	} else if (pkg.name !== expectedName) {
		warnings.push(`Package name mismatch: expected "${expectedName}", got "${pkg.name}"`);
	}

	// Must have version
	if (!pkg.version) {
		errors.push("Built package.json missing 'version' field");
	} else {
		// This might be okay during validation before version bump
		debug(`Version in built package: ${pkg.version}`);
	}

	// For GitHub Packages, name must be scoped
	if (isGitHubPackagesRegistry(target.registry) && pkg.name && !pkg.name.startsWith("@")) {
		errors.push(`GitHub Packages requires scoped package names (@org/name), got: ${pkg.name}`);
	}

	return {
		valid: errors.length === 0,
		directoryExists: true,
		packageJsonExists: true,
		packageJsonValid: errors.length === 0,
		errors,
		warnings,
		builtPackageJson: pkg,
	};
}

/**
 * Validate package.json for JSR
 */
function validateJsrPackageJson(
	_target: ResolvedTarget,
	pkg: PackageJson,
	_expectedName: string,
	_expectedVersion: string,
): PreValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	// JSR requires name in @scope/name format
	if (!pkg.name) {
		errors.push("Built package.json missing 'name' field");
	} else if (!pkg.name.startsWith("@")) {
		errors.push(`JSR requires scoped package names (@scope/name), got: ${pkg.name}`);
	}

	// Must have version
	if (!pkg.version) {
		errors.push("Built package.json missing 'version' field");
	}

	// JSR requires exports field
	if (!pkg.exports) {
		errors.push("JSR requires 'exports' field in package.json");
	}

	// private field doesn't matter for JSR - it uses its own logic

	return {
		valid: errors.length === 0,
		directoryExists: true,
		packageJsonExists: true,
		packageJsonValid: errors.length === 0,
		errors,
		warnings,
		builtPackageJson: pkg,
	};
}

/**
 * Validate jsr.json for JSR publishing
 */
function preValidateJsrJson(
	_target: ResolvedTarget,
	jsrJsonPath: string,
	_expectedName: string,
	_expectedVersion: string,
): PreValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	try {
		const content = readFileSync(jsrJsonPath, "utf-8");
		const jsrJson = JSON.parse(content) as { name?: string; version?: string; exports?: unknown };

		if (!jsrJson.name) {
			errors.push("jsr.json missing 'name' field");
		} else if (!jsrJson.name.startsWith("@")) {
			errors.push(`JSR requires scoped names (@scope/name), got: ${jsrJson.name}`);
		}

		if (!jsrJson.version) {
			errors.push("jsr.json missing 'version' field");
		}

		if (!jsrJson.exports) {
			errors.push("jsr.json missing 'exports' field");
		}

		return {
			valid: errors.length === 0,
			directoryExists: true,
			packageJsonExists: true, // jsr.json counts
			packageJsonValid: errors.length === 0,
			errors,
			warnings,
		};
	} catch (error) {
		return {
			valid: false,
			directoryExists: true,
			packageJsonExists: true,
			packageJsonValid: false,
			errors: [`Failed to parse jsr.json: ${error instanceof Error ? error.message : String(error)}`],
			warnings,
		};
	}
}

/**
 * Pre-validate a publish target before attempting dry-run
 *
 * Checks:
 * - Target directory exists
 * - package.json exists in target directory
 * - package.json is valid for the target protocol
 *
 * @param target - Resolved target to validate
 * @param expectedName - Expected package name
 * @param expectedVersion - Expected package version
 * @returns Pre-validation result
 */
export async function preValidateTarget(
	target: ResolvedTarget,
	expectedName: string,
	expectedVersion: string,
): Promise<PreValidationResult> {
	const errors: string[] = [];
	const warnings: string[] = [];

	// Check directory exists
	const directoryExists = existsSync(target.directory);
	if (!directoryExists) {
		return {
			valid: false,
			directoryExists: false,
			packageJsonExists: false,
			packageJsonValid: false,
			errors: [`Target directory does not exist: ${target.directory}`],
			warnings,
		};
	}

	// Check package.json exists
	const packageJsonPath = join(target.directory, "package.json");
	const packageJsonExists = existsSync(packageJsonPath);

	if (!packageJsonExists) {
		// For JSR, check for jsr.json instead
		if (target.protocol === "jsr") {
			const jsrJsonPath = join(target.directory, "jsr.json");
			if (existsSync(jsrJsonPath)) {
				return preValidateJsrJson(target, jsrJsonPath, expectedName, expectedVersion);
			}
		}

		return {
			valid: false,
			directoryExists: true,
			packageJsonExists: false,
			packageJsonValid: false,
			errors: [`package.json not found in: ${target.directory}`],
			warnings,
		};
	}

	// Read and parse package.json
	let builtPackageJson: PackageJson;
	try {
		const content = readFileSync(packageJsonPath, "utf-8");
		builtPackageJson = JSON.parse(content) as PackageJson;
	} catch (error) {
		return {
			valid: false,
			directoryExists: true,
			packageJsonExists: true,
			packageJsonValid: false,
			errors: [`Failed to parse package.json: ${error instanceof Error ? error.message : String(error)}`],
			warnings,
		};
	}

	// Validate based on protocol
	if (target.protocol === "npm") {
		return validateNpmPackageJson(target, builtPackageJson, expectedName, expectedVersion);
	} else if (target.protocol === "jsr") {
		return validateJsrPackageJson(target, builtPackageJson, expectedName, expectedVersion);
	}

	return {
		valid: true,
		directoryExists: true,
		packageJsonExists: true,
		packageJsonValid: true,
		errors,
		warnings,
		builtPackageJson,
	};
}
