/**
 * Validation result from a single check
 *
 * @remarks
 * Used by `create-validation-check.ts` to aggregate multiple validation results
 * into a unified check run.
 *
 * @example
 * ```typescript
 * const validations: ValidationResult[] = [
 *   {
 *     name: "Build Validation",
 *     success: true,
 *     checkId: 12345,
 *     message: "All packages built successfully"
 *   },
 *   {
 *     name: "NPM Publish Validation",
 *     success: false,
 *     checkId: 12346,
 *     message: "Version conflict detected"
 *   }
 * ];
 * ```
 */
export interface ValidationResult {
	/** Check name */
	name: string;
	/** Whether the check passed */
	success: boolean;
	/** Check ID */
	checkId: number;
	/** Error message if failed (optional) */
	message?: string;
}

/**
 * Package publish validation result
 *
 * @remarks
 * Used by `validate-publish.ts` to track validation status for individual packages
 * across all configured registries (NPM, GitHub Packages, JSR, custom).
 *
 * @example
 * ```typescript
 * const result: PackageValidationResult = {
 *   name: "@org/package",
 *   version: "1.2.3",
 *   path: "/path/to/package",
 *   canPublish: true,
 *   message: "Package ready for publish",
 *   hasProvenance: true
 * };
 * ```
 */
export interface PackageValidationResult {
	/** Package name */
	name: string;
	/** Package version */
	version: string;
	/** Package directory path */
	path: string;
	/** Whether package can be published */
	canPublish: boolean;
	/** Validation message */
	message: string;
	/** Whether provenance is configured */
	hasProvenance: boolean;
}
