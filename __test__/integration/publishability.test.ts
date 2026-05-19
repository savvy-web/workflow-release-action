/**
 * Publishability fixture harness.
 *
 * Runs the composed publish-target resolution path
 * (`SilkPublishabilityDetectorLive` + the private-build filter in
 * `resolvePublishableTargets`) against the hand-authored fixture-workspaces
 * under `fixtures/`, asserting each fixture's resolved
 * `{ publishTargets, versionable }` disposition.
 *
 * The fixtures cover every `silkDetect` permutation and the
 * `privatePackages.version` interaction. `private-target-with-directory`
 * guards the `42cc7e2` regression (per-target `directory` discarded, target
 * resolved to the private dev build and dropped); `private-shorthand-targets`
 * guards shorthand-string expansion.
 */

import { join } from "node:path";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { WorkspacePackage } from "workspaces-effect";
import { ChangesetConfig, ChangesetConfigLive } from "../../src/release/changeset-config.js";
import { SilkPublishabilityDetectorLive } from "../../src/release/publishability.js";
import { resolvePublishableTargets } from "../../src/release/resolve-targets.js";

const FIXTURES = join(__dirname, "fixtures");

/**
 * Resolve `{ publishTargets, versionable }` for a fixture-workspace directory.
 *
 * Builds a minimal `WorkspacePackage` whose `path` is the fixture directory
 * (the silk detector reads `package.json` from disk), runs the composed
 * `resolvePublishableTargets`, and derives `versionable` from the targets and
 * the fixture's `.changeset/config.json` `privatePackages.version`.
 */
const resolveFixture = (name: string) =>
	Effect.gen(function* () {
		const dir = join(FIXTURES, name);
		const pkg = new WorkspacePackage({
			name: `@fixture/${name}`,
			version: "1.0.0",
			path: dir,
			packageJsonPath: join(dir, "package.json"),
			relativePath: ".",
		});
		const config = yield* ChangesetConfig;
		const publishTargets = yield* resolvePublishableTargets(pkg, dir);
		const versionPrivate = yield* config.versionPrivate(dir);
		return { publishTargets, versionable: publishTargets.length > 0 || versionPrivate };
	}).pipe(Effect.provide(Layer.mergeAll(SilkPublishabilityDetectorLive, ChangesetConfigLive)));

describe("publishability fixture harness", () => {
	it("public-package → 1 target from package root, versionable", async () => {
		const { publishTargets, versionable } = await Effect.runPromise(resolveFixture("public-package"));
		expect(publishTargets).toHaveLength(1);
		expect(publishTargets[0].registry).toBe("https://registry.npmjs.org/");
		expect(publishTargets[0].directory).toBe(".");
		expect(publishTargets[0].access).toBe("public");
		expect(publishTargets[0].provenance).toBe(false);
		expect(versionable).toBe(true);
	});

	it("private-fully-private → no targets, not versionable", async () => {
		const { publishTargets, versionable } = await Effect.runPromise(resolveFixture("private-fully-private"));
		expect(publishTargets).toHaveLength(0);
		expect(versionable).toBe(false);
	});

	it("private-versiononly → no targets, versionable via privatePackages.version", async () => {
		const { publishTargets, versionable } = await Effect.runPromise(resolveFixture("private-versiononly"));
		expect(publishTargets).toHaveLength(0);
		expect(versionable).toBe(true);
	});

	it("private-access-public → 1 public target resolved to dist/npm, versionable", async () => {
		const { publishTargets, versionable } = await Effect.runPromise(resolveFixture("private-access-public"));
		expect(publishTargets).toHaveLength(1);
		expect(publishTargets[0].registry).toBe("https://registry.npmjs.org/");
		expect(publishTargets[0].directory).toBe("dist/npm");
		expect(publishTargets[0].access).toBe("public");
		expect(publishTargets[0].provenance).toBe(false);
		expect(versionable).toBe(true);
	});

	it("private-access-restricted → 1 restricted target resolved to dist/npm, versionable", async () => {
		const { publishTargets, versionable } = await Effect.runPromise(resolveFixture("private-access-restricted"));
		expect(publishTargets).toHaveLength(1);
		expect(publishTargets[0].registry).toBe("https://registry.npmjs.org/");
		expect(publishTargets[0].directory).toBe("dist/npm");
		expect(publishTargets[0].access).toBe("restricted");
		expect(versionable).toBe(true);
	});

	it("private-access-no-build → silkDetect says publishable, filter drops it (private root), versionable via privatePackages.version", async () => {
		const { publishTargets, versionable } = await Effect.runPromise(resolveFixture("private-access-no-build"));
		expect(publishTargets).toHaveLength(0);
		expect(versionable).toBe(true);
	});

	it("private-target-with-directory → 1 target resolved to dist/npm with provenance (42cc7e2 regression guard)", async () => {
		const { publishTargets, versionable } = await Effect.runPromise(resolveFixture("private-target-with-directory"));
		expect(publishTargets).toHaveLength(1);
		expect(publishTargets[0].directory).toMatch(/dist\/npm$/);
		expect(publishTargets[0].registry).toBe("https://npm.pkg.github.com/");
		expect(publishTargets[0].access).toBe("public");
		expect(publishTargets[0].provenance).toBe(true);
		expect(versionable).toBe(true);
	});

	it("private-multi-target → 2 targets (npm + GitHub Packages), versionable", async () => {
		const { publishTargets, versionable } = await Effect.runPromise(resolveFixture("private-multi-target"));
		expect(publishTargets).toHaveLength(2);
		const registries = publishTargets.map((t) => t.registry).sort();
		expect(registries).toEqual(["https://npm.pkg.github.com/", "https://registry.npmjs.org/"]);
		for (const target of publishTargets) {
			expect(target.directory).toBe("dist/npm");
			expect(target.access).toBe("public");
		}
		expect(versionable).toBe(true);
	});

	it("private-shorthand-targets → 2 targets with expanded registries (shorthand-expansion guard)", async () => {
		const { publishTargets, versionable } = await Effect.runPromise(resolveFixture("private-shorthand-targets"));
		expect(publishTargets).toHaveLength(2);
		const registries = publishTargets.map((t) => t.registry).sort();
		expect(registries).toEqual(["https://npm.pkg.github.com/", "https://registry.npmjs.org/"]);
		for (const target of publishTargets) {
			expect(target.directory).toBe("dist/npm");
			expect(target.access).toBe("public");
		}
		expect(versionable).toBe(true);
	});

	it("private-mixed-access → 1 target (access-less one skipped), versionable", async () => {
		const { publishTargets, versionable } = await Effect.runPromise(resolveFixture("private-mixed-access"));
		expect(publishTargets).toHaveLength(1);
		expect(publishTargets[0].directory).toBe("dist/npm");
		expect(publishTargets[0].access).toBe("public");
		expect(versionable).toBe(true);
	});

	it("private-target-built-private → target resolved then dropped by the private filter, not versionable", async () => {
		const { publishTargets, versionable } = await Effect.runPromise(resolveFixture("private-target-built-private"));
		expect(publishTargets).toHaveLength(0);
		expect(versionable).toBe(false);
	});
});
