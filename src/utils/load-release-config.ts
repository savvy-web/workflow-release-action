import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ParseResult } from "effect";
import { Config, Effect, Either, Schema } from "effect";
import { ArrayFormatter } from "effect/ParseResult";
import { parse as parseJsonc } from "jsonc-parser";
import { SilkReleaseConfig } from "../schema/silk-release-config.js";
import type { ReleaseConfig, SBOMMetadataConfig } from "../types/sbom-config.js";

/**
 * Config file names to search for (in order of preference)
 */
const CONFIG_FILE_NAMES = ["silk-release.json", "silk-release.jsonc"] as const;

/**
 * Environment variable name for variable-based configuration
 */
const CONFIG_ENV_VAR = "SILK_RELEASE_SBOM_TEMPLATE";

/**
 * Action input name for SBOM configuration
 */
const CONFIG_INPUT_NAME = "sbom-config";

/**
 * SBOM config fields that indicate an unwrapped configuration
 */
const SBOM_CONFIG_FIELDS = ["supplier", "copyright", "publisher", "documentationUrl", "authors"] as const;

/**
 * Check if a parsed config appears to be an unwrapped SBOMMetadataConfig
 *
 * @remarks
 * Detects if the config contains SBOM fields at the root level rather than
 * being wrapped in an `sbom` key. This is used to surface a structured error
 * rather than silently dropping the config.
 *
 * @param config - Parsed configuration object
 * @returns Array of SBOM field names found at root level, empty if none
 */
function detectUnwrappedSBOMFields(config: Record<string, unknown>): string[] {
	return SBOM_CONFIG_FIELDS.filter((field) => config[field] !== undefined);
}

/**
 * Format a Schema decode error as a human-readable, multi-path message.
 *
 * @remarks
 * `ArrayFormatter` walks the parse error and emits one entry per failing
 * path; we join the path, message, and tag into a compact form so the
 * finding consumer sees exactly which key was wrong.
 */
function formatDecodeError(error: ParseResult.ParseError): string {
	const issues = ArrayFormatter.formatErrorSync(error);
	if (issues.length === 0) {
		return error.message;
	}
	return issues
		.map((issue) => {
			const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
			return `${path}: ${issue.message}`;
		})
		.join("; ");
}

const decodeSilkReleaseConfig = Schema.decodeUnknownEither(SilkReleaseConfig);

/**
 * Parse and decode a raw config string into a typed {@link ReleaseConfig}.
 *
 * @remarks
 * Two failure modes surface as `Left`:
 * 1. The string is not valid JSON/JSONC.
 * 2. The parsed shape does not match {@link SilkReleaseConfig} — the message
 *    contains the path of the failing field (e.g. `sbom.supplier.name: …`).
 *
 * Configs that put SBOM fields at the root rather than under `sbom` produce
 * a dedicated error message naming the misplaced fields — that mistake would
 * otherwise just decode to an empty config and silently drop everything.
 *
 * @param content - Raw JSON/JSONC content
 * @param source - Source description for error messages
 * @returns `Right(config)` on success, `Left(error)` on parse or decode failure
 */
function parseConfigContent(content: string, source: string): Either.Either<ReleaseConfig, string> {
	const jsonErrors: Array<{ error: number; offset: number; length: number }> = [];
	let parsed: unknown;
	try {
		parsed = parseJsonc(content, jsonErrors);
	} catch (e) {
		// jsonc-parser populates the `jsonErrors` array for syntax errors and
		// does not throw — the `errors.length > 0` check below handles the
		// expected failure mode. This catch only fires on an extraordinary
		// runtime failure (e.g. a host-environment defect) and is here so the
		// loader cannot tear down the validation phase.
		const message = e instanceof Error ? e.message : String(e);
		return Either.left(`failed to parse ${source} as JSON: ${message}`);
	}

	if (jsonErrors.length > 0) {
		return Either.left(`failed to parse ${source} as JSON (${jsonErrors.length} syntax error(s))`);
	}

	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
		return Either.left(`${source} must be a JSON object`);
	}

	const unwrappedFields = detectUnwrappedSBOMFields(parsed as Record<string, unknown>);
	if (unwrappedFields.length > 0 && (parsed as Record<string, unknown>).sbom === undefined) {
		return Either.left(
			`${source} has SBOM fields at the root (${unwrappedFields.join(", ")}); wrap them in an "sbom" key`,
		);
	}

	const decoded = decodeSilkReleaseConfig(parsed);
	if (Either.isLeft(decoded)) {
		return Either.left(`${source}: ${formatDecodeError(decoded.left)}`);
	}

	return Either.right(decoded.right);
}

/**
 * Outcome of a local-repo config lookup that carries the matched path on
 * both the success and failure branches — so the caller's `source.location`
 * agrees with the file the error refers to.
 */
type LocalRepoLookup =
	| { readonly kind: "found"; readonly config: ReleaseConfig; readonly path: string }
	| { readonly kind: "error"; readonly error: string; readonly path: string }
	| { readonly kind: "absent" };

/**
 * Load release configuration from a local file
 *
 * @param configPath - Path to the configuration file
 * @returns Discriminated `LocalRepoLookup` carrying the matched path on both
 *   `found` and `error` branches; `absent` when the file does not exist.
 */
function loadConfigFromFile(configPath: string): LocalRepoLookup {
	if (!existsSync(configPath)) {
		return { kind: "absent" };
	}

	const content = readFileSync(configPath, "utf-8");
	const parsed = parseConfigContent(content, configPath);
	if (Either.isLeft(parsed)) {
		return { kind: "error", error: parsed.left, path: configPath };
	}
	return { kind: "found", config: parsed.right, path: configPath };
}

/**
 * Load configuration from local repository
 *
 * @param rootDir - Repository root directory
 * @returns First config file found (with the matched path), the matched path
 *   on a decode failure (so the caller can report the specific `.json` /
 *   `.jsonc` file), or `absent` when neither file exists.
 */
function loadConfigFromLocalRepo(rootDir: string): LocalRepoLookup {
	for (const fileName of CONFIG_FILE_NAMES) {
		const configPath = join(rootDir, ".github", fileName);
		const result = loadConfigFromFile(configPath);
		if (result.kind !== "absent") {
			return result;
		}
	}

	return { kind: "absent" };
}

/**
 * Load configuration from SILK_RELEASE_SBOM_TEMPLATE environment variable
 *
 * @remarks
 * This allows organizations to store the configuration as a GitHub variable
 * and pass it to the workflow as an environment variable. The variable can
 * be defined at the repository or organization level.
 *
 * **Important:** Organization/repository variables must be explicitly passed
 * to the action as environment variables in the workflow:
 *
 * ```yaml
 * - uses: savvy-web/workflow-release-action@main
 *   env:
 *     SILK_RELEASE_SBOM_TEMPLATE: ${{ vars.SILK_RELEASE_SBOM_TEMPLATE }}
 * ```
 *
 * The variable must contain a valid ReleaseConfig with the SBOM config
 * wrapped in an `sbom` key: `{ "sbom": { "supplier": {...} } }`
 *
 * @returns `Right(config)` when set and valid, `Right(undefined)` when unset,
 *   `Left(error)` when set but malformed.
 */
function loadConfigFromEnvVar(): Either.Either<ReleaseConfig | undefined, string> {
	const envValue = process.env[CONFIG_ENV_VAR];

	if (!envValue) {
		return Either.right(undefined);
	}

	return parseConfigContent(envValue, `${CONFIG_ENV_VAR} variable`);
}

/**
 * Load configuration from the `sbom-config` action input.
 *
 * @remarks
 * Reads via `Config.string` so the ambient `ActionsConfigProvider`
 * (`main.ts`'s default provider) handles the GitHub Actions env-var
 * convention — `core.getInput("sbom-config")` reads `INPUT_SBOM-CONFIG`,
 * with **hyphens preserved** (only spaces are mapped to underscores). The
 * prior direct `process.env["INPUT_SBOM_CONFIG"]` read silently missed the
 * input because the actual env-var name is `INPUT_SBOM-CONFIG` — a
 * single-character bug that produced exactly the "no template supplied"
 * symptom this loader was meant to handle.
 *
 * @returns Effect yielding `Right(config)` when set and valid,
 *   `Right(undefined)` when unset, `Left(error)` when set but malformed.
 */
// `Config.withDefault` covers the `MissingData` case; any other `ConfigError`
// (e.g. an unparseable primitive — impossible for a free-form string) is
// surfaced as a defect via `Effect.orDie` so the loader's success type stays
// pure and `loadReleaseConfig`'s caller does not have to thread `ConfigError`
// through its error channel.
const loadConfigFromInput: Effect.Effect<Either.Either<ReleaseConfig | undefined, string>> = Effect.gen(function* () {
	const inputValue = (yield* Config.string(CONFIG_INPUT_NAME).pipe(Config.withDefault(""))).trim();

	if (!inputValue) {
		return Either.right(undefined);
	}

	return parseConfigContent(inputValue, `${CONFIG_INPUT_NAME} input`);
}).pipe(Effect.orDie);

/**
 * Configuration source information
 */
export interface ConfigSource {
	/** Where the configuration was loaded from */
	source: "local" | "input" | "variable" | "none";
	/** Path or identifier of the config location */
	location?: string;
}

/**
 * Successful result of loading release configuration.
 *
 * @remarks
 * `config` is `undefined` when no config source supplied one — every
 * `LoadReleaseConfigOk` is "no decode error happened", but only those with a
 * defined `config` actually fed metadata into the validation phase.
 */
export interface LoadReleaseConfigOk {
	readonly ok: true;
	readonly config: ReleaseConfig | undefined;
	readonly source: ConfigSource;
}

/**
 * Failure result of loading release configuration.
 *
 * @remarks
 * `error` is a human-readable description suitable for a validation finding
 * message; `source` indicates which loader produced the failure.
 */
export interface LoadReleaseConfigError {
	readonly ok: false;
	readonly error: string;
	readonly source: ConfigSource;
}

/**
 * Result of loading release configuration.
 */
export type LoadReleaseConfigResult = LoadReleaseConfigOk | LoadReleaseConfigError;

/**
 * Load release configuration with fallback lookup
 *
 * @remarks
 * Searches for Silk release configuration in the following order:
 *
 * 1. **Local repository**: `.github/silk-release.json` or `.github/silk-release.jsonc`
 *    in the repository being released
 *
 * 2. **Action input**: `sbom-config` input parameter (useful for reusable workflows)
 *
 * 3. **Environment variable**: `SILK_RELEASE_SBOM_TEMPLATE` environment variable
 *
 * The first configuration source that yields a value is used. A present-but-
 * malformed config short-circuits the search with a structured error rather
 * than silently falling through — a typo'd local file should not be masked by
 * a global env var, since the caller needs to know the local config did not
 * apply. The reported `source.location` for the local-repo path is the
 * specific file that matched (e.g. `.../silk-release.jsonc`) so the error and
 * the source line up.
 *
 * @param rootDir - Repository root directory (defaults to process.cwd())
 * @returns Discriminated result the caller can branch on.
 */
export function loadReleaseConfig(rootDir?: string): Effect.Effect<LoadReleaseConfigResult> {
	return Effect.gen(function* () {
		const root = rootDir || process.cwd();

		const local = loadConfigFromLocalRepo(root);
		if (local.kind === "error") {
			// `local.path` is the specific file that matched (`.json` or `.jsonc`),
			// so the reported `source.location` always agrees with the file the
			// parse error refers to.
			return { ok: false, error: local.error, source: { source: "local", location: local.path } } as const;
		}
		if (local.kind === "found") {
			return {
				ok: true,
				config: local.config,
				source: { source: "local", location: local.path },
			} as const;
		}

		const input = yield* loadConfigFromInput;
		if (Either.isLeft(input)) {
			return { ok: false, error: input.left, source: { source: "input", location: CONFIG_INPUT_NAME } } as const;
		}
		if (input.right !== undefined) {
			return { ok: true, config: input.right, source: { source: "input", location: CONFIG_INPUT_NAME } } as const;
		}

		const env = loadConfigFromEnvVar();
		if (Either.isLeft(env)) {
			return { ok: false, error: env.left, source: { source: "variable", location: CONFIG_ENV_VAR } } as const;
		}
		if (env.right !== undefined) {
			return { ok: true, config: env.right, source: { source: "variable", location: CONFIG_ENV_VAR } } as const;
		}

		return { ok: true, config: undefined, source: { source: "none" } } as const;
	});
}

/**
 * Successful result of {@link loadSBOMConfig}.
 */
export interface LoadSBOMConfigOk {
	readonly ok: true;
	readonly config: SBOMMetadataConfig | undefined;
	readonly source: ConfigSource;
}

/**
 * Failure result of {@link loadSBOMConfig} — a present config did not decode.
 */
export interface LoadSBOMConfigError {
	readonly ok: false;
	readonly error: string;
	readonly source: ConfigSource;
}

/**
 * Discriminated result of {@link loadSBOMConfig}.
 */
export type LoadSBOMConfigResult = LoadSBOMConfigOk | LoadSBOMConfigError;

/**
 * Load SBOM metadata configuration
 *
 * @remarks
 * Convenience wrapper around {@link loadReleaseConfig} that surfaces only the
 * `sbom` sub-section. The result is discriminated so callers can render parse
 * failures as warning findings rather than silently dropping the supplier /
 * author metadata — the failure mode the prior untyped cast exhibited.
 *
 * @param rootDir - Repository root directory (defaults to process.cwd())
 * @returns Discriminated result; on success, `config` is the SBOM sub-section
 *   or `undefined` when no source supplied one.
 */
export function loadSBOMConfig(rootDir?: string): Effect.Effect<LoadSBOMConfigResult> {
	return Effect.map(loadReleaseConfig(rootDir), (result) => {
		if (!result.ok) {
			return result;
		}
		return { ok: true, config: result.config?.sbom, source: result.source } as const;
	});
}
