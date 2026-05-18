/**
 * Unit tests for ChangesetConfig service.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";
import { ChangesetConfig, ChangesetConfigLive } from "./changeset-config.js";

const writeConfig = (dir: string, content: unknown): void => {
	const cd = join(dir, ".changeset");
	mkdirSync(cd, { recursive: true });
	writeFileSync(join(cd, "config.json"), JSON.stringify(content), "utf-8");
};

const run = <A, E>(eff: Effect.Effect<A, E, ChangesetConfig>): Promise<A> =>
	Effect.runPromise(Effect.provide(eff, ChangesetConfigLive));

describe("ChangesetConfig", () => {
	let tmpDir: string;
	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "ccfg-"));
	});

	it("returns 'none' when .changeset/config.json does not exist", async () => {
		const mode = await run(Effect.flatMap(ChangesetConfig, (c) => c.mode(tmpDir)));
		expect(mode).toBe("none");
	});

	it("returns 'silk' when changelog is a string starting with @savvy-web/changesets", async () => {
		writeConfig(tmpDir, { changelog: "@savvy-web/changesets/changelog" });
		const mode = await run(Effect.flatMap(ChangesetConfig, (c) => c.mode(tmpDir)));
		expect(mode).toBe("silk");
	});

	it("returns 'silk' when changelog[0] is a string starting with @savvy-web/changesets", async () => {
		writeConfig(tmpDir, { changelog: ["@savvy-web/changesets/changelog", { repo: "x/y" }] });
		const mode = await run(Effect.flatMap(ChangesetConfig, (c) => c.mode(tmpDir)));
		expect(mode).toBe("silk");
	});

	it("returns 'vanilla' when changelog is a different string", async () => {
		writeConfig(tmpDir, { changelog: "@changesets/cli/changelog" });
		const mode = await run(Effect.flatMap(ChangesetConfig, (c) => c.mode(tmpDir)));
		expect(mode).toBe("vanilla");
	});

	it("returns 'vanilla' when changelog field is absent", async () => {
		writeConfig(tmpDir, {});
		const mode = await run(Effect.flatMap(ChangesetConfig, (c) => c.mode(tmpDir)));
		expect(mode).toBe("vanilla");
	});

	it("returns 'none' on malformed JSON", async () => {
		mkdirSync(join(tmpDir, ".changeset"), { recursive: true });
		writeFileSync(join(tmpDir, ".changeset", "config.json"), "{ not valid json", "utf-8");
		const mode = await run(Effect.flatMap(ChangesetConfig, (c) => c.mode(tmpDir)));
		expect(mode).toBe("none");
	});

	it("versionPrivate returns true when privatePackages.version is true", async () => {
		writeConfig(tmpDir, { privatePackages: { version: true } });
		const v = await run(Effect.flatMap(ChangesetConfig, (c) => c.versionPrivate(tmpDir)));
		expect(v).toBe(true);
	});

	it("versionPrivate returns false when missing", async () => {
		writeConfig(tmpDir, {});
		const v = await run(Effect.flatMap(ChangesetConfig, (c) => c.versionPrivate(tmpDir)));
		expect(v).toBe(false);
	});

	it("versionPrivate returns false when config does not exist", async () => {
		const v = await run(Effect.flatMap(ChangesetConfig, (c) => c.versionPrivate(tmpDir)));
		expect(v).toBe(false);
	});
});
