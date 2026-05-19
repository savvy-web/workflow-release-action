/**
 * Unit tests for `loadReleaseConfig` / `loadSBOMConfig`.
 *
 * Covers Schema-decoded valid configs, structural failures (non-object root,
 * unwrapped fields, type violations), source priority across the
 * local-file / action-input / env-var chain, and that `loadSBOMConfig`
 * extracts only the `sbom` sub-section while propagating decode errors.
 *
 * Each test gets a fresh tmp dir to back the local-repo loader, and a guard
 * `beforeEach` strips the env vars the loader reads so a developer's shell
 * environment cannot contaminate the suite.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionsConfigProvider } from "@savvy-web/github-action-effects";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LoadReleaseConfigResult, LoadSBOMConfigResult } from "../src/utils/load-release-config.js";
import {
	loadReleaseConfig as loadReleaseConfigEffect,
	loadSBOMConfig as loadSBOMConfigEffect,
} from "../src/utils/load-release-config.js";

// GitHub Actions sets `INPUT_SBOM-CONFIG` (hyphen preserved) — the canonical
// convention `ActionsConfigProvider` follows. The prior tests set
// `INPUT_SBOM_CONFIG` (underscore), matching the loader's (incorrect) prior
// env-var read; that bug was a silent "no template supplied" symptom in CI.
const ENV_VARS = ["INPUT_SBOM-CONFIG", "SILK_RELEASE_SBOM_TEMPLATE"] as const;

/**
 * Synchronously evaluate `loadReleaseConfig` against the `ActionsConfigProvider`,
 * so tests exercise the same env-var convention the action uses in CI.
 */
const runLoadReleaseConfig = (rootDir?: string): LoadReleaseConfigResult =>
	Effect.runSync(loadReleaseConfigEffect(rootDir).pipe(Effect.withConfigProvider(ActionsConfigProvider)));

const runLoadSBOMConfig = (rootDir?: string): LoadSBOMConfigResult =>
	Effect.runSync(loadSBOMConfigEffect(rootDir).pipe(Effect.withConfigProvider(ActionsConfigProvider)));

// Thin sync façades so the existing tests below can keep their call shape.
const loadReleaseConfig = runLoadReleaseConfig;
const loadSBOMConfig = runLoadSBOMConfig;

let tmpRoot: string;
let savedEnv: Map<(typeof ENV_VARS)[number], string | undefined>;

beforeEach(() => {
	tmpRoot = mkdtempSync(join(tmpdir(), "load-release-config-"));
	mkdirSync(join(tmpRoot, ".github"), { recursive: true });
	savedEnv = new Map();
	for (const key of ENV_VARS) {
		savedEnv.set(key, process.env[key]);
		delete process.env[key];
	}
});

afterEach(() => {
	for (const [key, value] of savedEnv) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
});

const writeLocal = (fileName: string, body: string): string => {
	const path = join(tmpRoot, ".github", fileName);
	writeFileSync(path, body, "utf-8");
	return path;
};

describe("loadReleaseConfig - happy path", () => {
	it("decodes a full valid config from a local silk-release.json", () => {
		const path = writeLocal(
			"silk-release.json",
			JSON.stringify({
				sbom: {
					supplier: {
						name: "Savvy Web Systems",
						url: ["https://savvyweb.systems"],
						contact: [{ name: "Security", email: "security@savvyweb.systems" }],
					},
					authors: [{ name: "Author One" }],
					publisher: "Savvy Web Systems",
					copyright: { holder: "Savvy Web Systems LLC", startYear: 2024 },
					documentationUrl: "https://docs.example",
				},
			}),
		);

		const result = loadReleaseConfig(tmpRoot);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.source.source).toBe("local");
		// Source location must point at the exact file that matched.
		expect(result.source.location).toBe(path);
		expect(result.config?.sbom?.supplier?.name).toBe("Savvy Web Systems");
		expect(result.config?.sbom?.copyright?.startYear).toBe(2024);
		expect(result.config?.sbom?.authors).toEqual([{ name: "Author One" }]);
	});

	it("accepts the scalar-or-array forms for supplier.url and supplier.contact", () => {
		writeLocal(
			"silk-release.json",
			JSON.stringify({
				sbom: {
					supplier: {
						name: "S",
						url: "https://one.example",
						contact: { email: "x@example" },
					},
				},
			}),
		);

		const result = loadReleaseConfig(tmpRoot);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.config?.sbom?.supplier?.url).toBe("https://one.example");
		expect(result.config?.sbom?.supplier?.contact).toEqual({ email: "x@example" });
	});

	it("returns config: undefined and source: 'none' when no source supplies one", () => {
		const result = loadReleaseConfig(tmpRoot);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.config).toBeUndefined();
		expect(result.source.source).toBe("none");
	});
});

describe("loadReleaseConfig - structural failures", () => {
	it("rejects a non-object root", () => {
		writeLocal("silk-release.json", JSON.stringify([{ supplier: { name: "x" } }]));

		const result = loadReleaseConfig(tmpRoot);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toMatch(/must be a JSON object/);
		expect(result.source.source).toBe("local");
	});

	it("rejects misplaced SBOM fields at the root and names them", () => {
		writeLocal("silk-release.json", JSON.stringify({ supplier: { name: "x" }, publisher: "y" }));

		const result = loadReleaseConfig(tmpRoot);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toMatch(/SBOM fields at the root/);
		// Both misplaced fields appear in the message.
		expect(result.error).toMatch(/supplier/);
		expect(result.error).toMatch(/publisher/);
		expect(result.error).toMatch(/wrap them in an "sbom" key/);
	});

	it("rejects a Schema type violation with a path-prefixed message", () => {
		writeLocal("silk-release.json", JSON.stringify({ sbom: { supplier: { name: 42 } } }));

		const result = loadReleaseConfig(tmpRoot);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		// The ArrayFormatter prefix names the failing path.
		expect(result.error).toMatch(/sbom\.supplier\.name/);
	});

	it("rejects a fractional startYear (Schema.Int)", () => {
		writeLocal("silk-release.json", JSON.stringify({ sbom: { copyright: { startYear: 2024.5 } } }));

		const result = loadReleaseConfig(tmpRoot);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toMatch(/sbom\.copyright\.startYear/);
	});

	it("rejects invalid JSON syntax", () => {
		writeLocal("silk-release.json", "{ not valid json");

		const result = loadReleaseConfig(tmpRoot);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toMatch(/syntax error/);
	});

	it("reports the .jsonc path when the .jsonc variant decodes wrong", () => {
		// Only the .jsonc variant exists — the loader must surface that path,
		// not the .json filename it never read.
		const path = writeLocal("silk-release.jsonc", JSON.stringify({ sbom: { supplier: { name: 7 } } }));

		const result = loadReleaseConfig(tmpRoot);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.source.location).toBe(path);
		expect(result.error).toContain(path);
	});
});

describe("loadReleaseConfig - source priority", () => {
	it("action input wins over the env-var fallback", () => {
		process.env["INPUT_SBOM-CONFIG"] = JSON.stringify({ sbom: { supplier: { name: "from-input" } } });
		process.env.SILK_RELEASE_SBOM_TEMPLATE = JSON.stringify({ sbom: { supplier: { name: "from-env" } } });

		const result = loadReleaseConfig(tmpRoot);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.source.source).toBe("input");
		expect(result.config?.sbom?.supplier?.name).toBe("from-input");
	});

	it("env-var is used when local file and input are absent", () => {
		process.env.SILK_RELEASE_SBOM_TEMPLATE = JSON.stringify({ sbom: { supplier: { name: "from-env" } } });

		const result = loadReleaseConfig(tmpRoot);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.source.source).toBe("variable");
		expect(result.config?.sbom?.supplier?.name).toBe("from-env");
	});

	it("a malformed local file short-circuits — it does not fall through to env-var", () => {
		writeLocal("silk-release.json", JSON.stringify({ sbom: { supplier: { name: 99 } } }));
		process.env.SILK_RELEASE_SBOM_TEMPLATE = JSON.stringify({ sbom: { supplier: { name: "from-env" } } });

		const result = loadReleaseConfig(tmpRoot);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.source.source).toBe("local");
	});
});

describe("loadSBOMConfig", () => {
	it("extracts the sbom sub-section from a valid config", () => {
		writeLocal("silk-release.json", JSON.stringify({ sbom: { supplier: { name: "Savvy" }, publisher: "Savvy" } }));

		const result = loadSBOMConfig(tmpRoot);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.config?.supplier?.name).toBe("Savvy");
		expect(result.config?.publisher).toBe("Savvy");
	});

	it("returns config: undefined when no source supplies one", () => {
		const result = loadSBOMConfig(tmpRoot);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.config).toBeUndefined();
		expect(result.source.source).toBe("none");
	});

	it("returns config: undefined when the config has no sbom section", () => {
		writeLocal("silk-release.json", JSON.stringify({ $schema: "https://example/schema.json" }));

		const result = loadSBOMConfig(tmpRoot);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.config).toBeUndefined();
		// Source still reflects where the (empty) config came from.
		expect(result.source.source).toBe("local");
	});

	it("propagates the decode error from loadReleaseConfig", () => {
		writeLocal("silk-release.json", JSON.stringify({ sbom: { supplier: { name: 42 } } }));

		const result = loadSBOMConfig(tmpRoot);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toMatch(/sbom\.supplier\.name/);
		expect(result.source.source).toBe("local");
	});
});
