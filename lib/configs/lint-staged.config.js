/**
 * @filename: lint-staged.config.js
 * @type {import('lint-staged').Configuration}
 */

import { execSync } from "node:child_process";

/**
 * Check if a command is available in the system
 * @param {string} command
 * @returns {boolean}
 */
function isCommandAvailable(command) {
	try {
		execSync(`command -v ${command}`, { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

export default {
	// Sort and format package.json files (excluding dist/package.json and __fixtures__)
	"**/package.json":
		/** @param {string[]} filenames */
		(filenames) => {
			const filtered = filenames.filter(
				(file) => !file.includes("dist/package.json") && !file.includes("__fixtures__"),
			);
			if (filtered.length === 0) return [];
			return ["sort-package-json", `biome check --write --max-diagnostics=none ${filtered.join(" ")}`];
		},
	// Format all other supported files with Biome (excluding package-lock.json and __fixtures__)
	"*.{js,ts,cjs,mjs,d.cts,d.mts,jsx,tsx,json,jsonc}":
		/** @param {string[]} filenames */
		(filenames) => {
			const filtered = filenames.filter(
				(file) => !file.includes("package-lock.json") && !file.includes("__fixtures__"),
			);
			return filtered.length > 0 ? `biome check --write --no-errors-on-unmatched ${filtered.join(" ")}` : [];
		},
	// Lint and fix markdown files
	"**/*.{md,mdx}": (filenames) =>
		filenames.length > 0
			? `markdownlint-cli2 --config './lib/configs/.markdownlint-cli2.jsonc' --fix ${filenames.join(" ")}`
			: [],
	// Sort pnpm-workspace.yaml with yq (if available), then format
	"pnpm-workspace.yaml": () => {
		/** @type {string[]} */
		const commands = [];
		// Only sort with yq if it's installed globally
		if (isCommandAvailable("yq")) {
			commands.push(
				'yq -i \'({"packages": .packages} * (del(.packages) | sort_keys(.))) | .packages |= sort | (select(has("onlyBuiltDependencies")) | .onlyBuiltDependencies |= sort) // . | (select(has("publicHoistPattern")) | .publicHoistPattern |= sort) // .\' pnpm-workspace.yaml',
			);
		}
		commands.push("pnpm dlx prettier --write pnpm-workspace.yaml");
		commands.push("pnpm dlx yaml-lint pnpm-workspace.yaml");
		return commands;
	},
	// Remove executable bits from shell scripts
	"**/*.sh":
		/** @param {string[]} filenames */
		(filenames) => filenames.map((file) => `chmod -x ${file}`),
	// Format and lint YAML files (excluding pnpm-lock.yaml and pnpm-workspace.yaml)
	"**/*.{yml,yaml}":
		/** @param {string[]} filenames */
		(filenames) => {
			const filtered = filenames.filter(
				(file) => !file.includes("pnpm-lock.yaml") && !file.includes("pnpm-workspace.yaml"),
			);
			if (filtered.length === 0) {
				return [];
			}
			return [`pnpm dlx prettier --write ${filtered.join(" ")}`, `pnpm dlx yaml-lint ${filtered.join(" ")}`];
		},
	// Typecheck TypeScript files after linting
	"*.{ts,cts,mts,tsx}":
		/** @param {string[]} filenames */
		(filenames) => (filenames.length > 0 ? "pnpm exec tsgo --noEmit" : []),
};
