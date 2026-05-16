/**
 * Minimal drop-in replacement for the @actions/core, @actions/exec, and
 * @actions/github surface used by the still-imperative phase-2/3
 * publish utilities.
 *
 * @remarks
 * The migration to {@link "@savvy-web/github-action-effects"} is happening
 * incrementally. Until each publish helper is ported to Effect, we want
 * to call them from the Effect-based main orchestrator. They were imported
 * via dynamic `import()` to keep their @actions/* graph out of the static
 * main bundle, but the dynamic chunk itself crashed at load time because
 * the @actions/core barrel statically imports `oidc-utils.js`, which
 * pulls @actions/http-client → undici, and webpack cannot emit undici as
 * CJS without producing `Class extends value [object Module] is not a
 * constructor or null` at the Dispatcher class.
 *
 * This shim implements the GitHub Actions workflow command protocol
 * (`::group::`, `::warning::`, `INPUT_<NAME>` env reads, GITHUB_OUTPUT
 * file append, etc.) directly using node:child_process and node:fs, with
 * no dependency on http-client/undici.
 */

import { spawn } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { Octokit } from "@octokit/rest";

const escapeCmd = (s: string): string => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

// ---------------------------------------------------------------------------
// @actions/core — logging
// ---------------------------------------------------------------------------

export const info = (msg: string): void => {
	process.stdout.write(`${msg}\n`);
};

export const warning = (msg: string): void => {
	process.stdout.write(`::warning::${escapeCmd(msg)}\n`);
};

export const error = (msg: string, props?: { file?: string; startLine?: number; endLine?: number }): void => {
	const parts: string[] = [];
	if (props?.file !== undefined) parts.push(`file=${props.file}`);
	if (props?.startLine !== undefined) parts.push(`line=${props.startLine}`);
	if (props?.endLine !== undefined) parts.push(`endLine=${props.endLine}`);
	const meta = parts.length > 0 ? ` ${parts.join(",")}` : "";
	process.stdout.write(`::error${meta}::${escapeCmd(msg)}\n`);
};

export const debug = (msg: string): void => {
	process.stdout.write(`::debug::${escapeCmd(msg)}\n`);
};

export const startGroup = (name: string): void => {
	process.stdout.write(`::group::${escapeCmd(name)}\n`);
};

export const endGroup = (): void => {
	process.stdout.write("::endgroup::\n");
};

export const setSecret = (value: string): void => {
	process.stdout.write(`::add-mask::${escapeCmd(value)}\n`);
};

// ---------------------------------------------------------------------------
// @actions/core — inputs and state
// ---------------------------------------------------------------------------

export const getInput = (name: string, options?: { required?: boolean }): string => {
	const value = process.env[`INPUT_${name.replace(/-/g, "_").toUpperCase()}`] ?? "";
	if (options?.required === true && value === "") {
		throw new Error(`Input required and not supplied: ${name}`);
	}
	return value.trim();
};

export const getBooleanInput = (name: string, options?: { required?: boolean }): boolean => {
	const value = getInput(name, options);
	return ["true", "yes", "y", "1"].includes(value.toLowerCase());
};

export const getState = (name: string): string => process.env[`STATE_${name}`] ?? "";

// ---------------------------------------------------------------------------
// @actions/exec — child-process wrapper compatible with the original API
// ---------------------------------------------------------------------------

export interface ExecOptions {
	cwd?: string;
	env?: Record<string, string>;
	silent?: boolean;
	ignoreReturnCode?: boolean;
	listeners?: {
		stdout?: (data: Buffer) => void;
		stderr?: (data: Buffer) => void;
	};
}

export const exec = (command: string, args: ReadonlyArray<string> = [], options: ExecOptions = {}): Promise<number> =>
	new Promise((resolve, reject) => {
		const child = spawn(command, [...args], {
			cwd: options.cwd,
			env: { ...process.env, ...(options.env ?? {}) },
			stdio: "pipe",
		});
		child.stdout?.on("data", (data: Buffer) => {
			options.listeners?.stdout?.(data);
			if (options.silent !== true) process.stdout.write(data);
		});
		child.stderr?.on("data", (data: Buffer) => {
			options.listeners?.stderr?.(data);
			if (options.silent !== true) process.stderr.write(data);
		});
		child.on("error", (err) => reject(err));
		child.on("close", (code) => {
			const exitCode = code ?? 0;
			if (exitCode !== 0 && options.ignoreReturnCode !== true) {
				reject(new Error(`${command} exited with code ${exitCode}`));
			} else {
				resolve(exitCode);
			}
		});
	});

// ---------------------------------------------------------------------------
// @actions/github — context + getOctokit
// ---------------------------------------------------------------------------

const parsePayload = (): Record<string, unknown> => {
	const path = process.env.GITHUB_EVENT_PATH;
	if (path === undefined || path === "") return {};
	try {
		return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
	} catch {
		return {};
	}
};

const [ctxOwner, ctxRepo] = (process.env.GITHUB_REPOSITORY ?? "/").split("/");

export const context = {
	repo: { owner: ctxOwner ?? "", repo: ctxRepo ?? "" },
	sha: process.env.GITHUB_SHA ?? "",
	ref: process.env.GITHUB_REF ?? "",
	eventName: process.env.GITHUB_EVENT_NAME ?? "",
	actor: process.env.GITHUB_ACTOR ?? "",
	runId: Number(process.env.GITHUB_RUN_ID ?? "0"),
	runNumber: Number(process.env.GITHUB_RUN_NUMBER ?? "0"),
	apiUrl: process.env.GITHUB_API_URL ?? "https://api.github.com",
	serverUrl: process.env.GITHUB_SERVER_URL ?? "https://github.com",
	graphqlUrl: process.env.GITHUB_GRAPHQL_URL ?? "https://api.github.com/graphql",
	payload: parsePayload(),
} as const;

export const getOctokit = (token: string): Octokit => new Octokit({ auth: token });

// ---------------------------------------------------------------------------
// @actions/core/lib/summary — minimal compatible shim
// ---------------------------------------------------------------------------

/**
 * Builder for GitHub Actions job summaries. Matches the surface
 * `summaryWriter` and downstream callers use: addRaw() + write().
 */
class SummaryBuilder {
	private buffer = "";
	addRaw(text: string): SummaryBuilder {
		this.buffer += text;
		return this;
	}
	async write(): Promise<SummaryBuilder> {
		const path = process.env.GITHUB_STEP_SUMMARY;
		if (path !== undefined && path !== "") {
			appendFileSync(path, this.buffer);
		}
		this.buffer = "";
		return this;
	}
}

export const summary: SummaryBuilder = new SummaryBuilder();
