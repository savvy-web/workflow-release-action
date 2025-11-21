import type * as core from "@actions/core";
import type * as exec from "@actions/exec";
import type { Context } from "@actions/github/lib/context";
import type { GitHub } from "@actions/github/lib/utils";
import type * as glob from "@actions/glob";
import type * as io from "@actions/io";

/**
 * Arguments passed to the main action function from github-script
 *
 * @remarks
 * This interface defines the standard parameters available to all TypeScript actions
 * when using `actions/github-script@v8`. Matches the official github-script type definition.
 *
 * All modules (core, exec, glob, io, etc.) are always provided by github-script,
 * even if your action doesn't use them all.
 *
 * @see https://github.com/actions/github-script/blob/main/types/async-function.d.ts
 *
 * @example
 * ```typescript
 * export default async ({ core, github, context }: AsyncFunctionArguments): Promise<void> => {
 *   const repo = await github.rest.repos.get({
 *     owner: context.repo.owner,
 *     repo: context.repo.repo,
 *   });
 *   core.info(`Repository: ${repo.data.full_name}`);
 * };
 * ```
 */
export interface AsyncFunctionArguments {
	/** GitHub Actions context */
	context: Context;
	/** GitHub Actions core module for logging and setting outputs */
	core: typeof core;
	/** GitHub API client (Octokit instance) */
	github: InstanceType<typeof GitHub>;
	/** GitHub API client (alias for github) */
	octokit: InstanceType<typeof GitHub>;
	/** GitHub Actions exec module for running commands */
	exec: typeof exec;
	/** GitHub Actions glob module for file pattern matching */
	glob: typeof glob;
	/** GitHub Actions io module for file operations */
	io: typeof io;
	/** A proxy wrapper around the normal Node.js require to enable requiring relative paths
	 * (relative to the current working directory) and requiring npm packages installed in the current working directory.
	 *  If for some reason you need the non-wrapped require, there is an escape hatch available:
	//  * */
	// require: NodeJS.Require;
	// /** The original value of require without our wrapping applied. */
	// __original_require__: NodeJS.Require;
}

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
 * Used by both `validate-publish-npm.ts` and `validate-publish-github-packages.ts`
 * to track validation status for individual packages.
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
