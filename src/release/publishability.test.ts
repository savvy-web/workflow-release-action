/**
 * Unit tests for SilkPublishabilityDetectorLive and
 * PublishabilityDetectorAdaptiveLive.
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import { beforeEach, describe, expect, it } from "vitest";
import { PublishConfig, PublishabilityDetector, WorkspacePackage } from "workspaces-effect";
import { ChangesetConfig } from "./changeset-config.js";
import { PublishabilityDetectorAdaptiveLive, SilkPublishabilityDetectorLive } from "./publishability.js";

const writePkg = (dir: string, content: unknown): void => {
	writeFileSync(join(dir, "package.json"), JSON.stringify(content), "utf-8");
};

const mockChangesetConfig = (mode: "silk" | "vanilla" | "none", versionPrivate = false) =>
	Layer.succeed(ChangesetConfig, {
		mode: () => Effect.succeed(mode),
		versionPrivate: () => Effect.succeed(versionPrivate),
	});

/**
 * Build a minimal WorkspacePackage for tests.
 * The silk detector reads from disk (pkg.path/package.json).
 * The vanilla detector reads from pkg.private and pkg.publishConfig fields.
 */
const makeWsPkg = (
	dir: string,
	name = "test-pkg",
	opts: { private?: boolean; publishConfig?: ConstructorParameters<typeof PublishConfig>[0] } = {},
): WorkspacePackage =>
	new WorkspacePackage({
		name,
		version: "1.0.0",
		path: dir,
		packageJsonPath: join(dir, "package.json"),
		relativePath: ".",
		private: opts.private ?? false,
		publishConfig: opts.publishConfig ? new PublishConfig(opts.publishConfig) : undefined,
	});

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const runSilk = <A>(eff: Effect.Effect<A, never, PublishabilityDetector>): Promise<A> =>
	Effect.runPromise(Effect.provide(eff, SilkPublishabilityDetectorLive));

const runAdaptive = <A>(
	eff: Effect.Effect<A, never, PublishabilityDetector>,
	mode: "silk" | "vanilla" | "none",
	versionPrivate = false,
): Promise<A> =>
	Effect.runPromise(
		Effect.provide(
			eff,
			PublishabilityDetectorAdaptiveLive.pipe(Layer.provide(mockChangesetConfig(mode, versionPrivate))),
		),
	);

// ──────────────────────────────────────────────────────────────────────────────
// SilkPublishabilityDetectorLive — silk rules (reads from disk)
// ──────────────────────────────────────────────────────────────────────────────

describe("SilkPublishabilityDetectorLive — silk rules", () => {
	let tmpDir: string;
	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "pub-"));
	});

	it("private !== true → publishable (one target)", async () => {
		writePkg(tmpDir, { name: "x", version: "1.0.0" });
		const targets = await runSilk(
			Effect.flatMap(PublishabilityDetector, (d) => d.detect(makeWsPkg(tmpDir, "x"), tmpDir)),
		);
		expect(targets.length).toBe(1);
	});

	it("private === true + publishConfig.access public, no targets → publishable", async () => {
		writePkg(tmpDir, { name: "x", version: "1.0.0", private: true, publishConfig: { access: "public" } });
		const targets = await runSilk(
			Effect.flatMap(PublishabilityDetector, (d) => d.detect(makeWsPkg(tmpDir, "x"), tmpDir)),
		);
		expect(targets.length).toBe(1);
		expect(targets[0].access).toBe("public");
	});

	it("private === true + publishConfig.targets with public target → publishable", async () => {
		writePkg(tmpDir, {
			name: "x",
			version: "1.0.0",
			private: true,
			publishConfig: { targets: [{ protocol: "npm", registry: "https://registry.npmjs.org/", access: "public" }] },
		});
		const targets = await runSilk(
			Effect.flatMap(PublishabilityDetector, (d) => d.detect(makeWsPkg(tmpDir, "x"), tmpDir)),
		);
		expect(targets.length).toBe(1);
		expect(targets[0].access).toBe("public");
	});

	it("private === true + publishConfig.targets inheriting parent access → publishable", async () => {
		writePkg(tmpDir, {
			name: "x",
			version: "1.0.0",
			private: true,
			publishConfig: { access: "restricted", targets: [{ protocol: "npm", registry: "https://x" }] },
		});
		const targets = await runSilk(
			Effect.flatMap(PublishabilityDetector, (d) => d.detect(makeWsPkg(tmpDir, "x"), tmpDir)),
		);
		expect(targets.length).toBe(1);
		expect(targets[0].access).toBe("restricted");
	});

	it("private === true + no publishConfig → not publishable", async () => {
		writePkg(tmpDir, { name: "x", version: "1.0.0", private: true });
		const targets = await runSilk(
			Effect.flatMap(PublishabilityDetector, (d) => d.detect(makeWsPkg(tmpDir, "x"), tmpDir)),
		);
		expect(targets.length).toBe(0);
	});

	it("private === true + publishConfig with no access and no targets → not publishable", async () => {
		writePkg(tmpDir, { name: "x", version: "1.0.0", private: true, publishConfig: {} });
		const targets = await runSilk(
			Effect.flatMap(PublishabilityDetector, (d) => d.detect(makeWsPkg(tmpDir, "x"), tmpDir)),
		);
		expect(targets.length).toBe(0);
	});

	it("expands shorthand 'github' target with parent access → publishable", async () => {
		writePkg(tmpDir, {
			name: "x",
			version: "1.0.0",
			private: true,
			publishConfig: { access: "public", targets: ["github"] },
		});
		const targets = await runSilk(
			Effect.flatMap(PublishabilityDetector, (d) => d.detect(makeWsPkg(tmpDir, "x"), tmpDir)),
		);
		expect(targets.length).toBe(1);
		expect(targets[0].access).toBe("public");
		expect(targets[0].registry).toBe("https://npm.pkg.github.com/");
	});

	it("private === true + object target with own directory → uses target.directory", async () => {
		writePkg(tmpDir, {
			name: "x",
			version: "1.0.0",
			private: true,
			publishConfig: {
				directory: "dist/dev",
				access: "public",
				targets: [
					{
						protocol: "npm",
						registry: "https://npm.pkg.github.com/",
						directory: "dist/npm",
						access: "public",
						provenance: true,
					},
				],
			},
		});
		const targets = await runSilk(
			Effect.flatMap(PublishabilityDetector, (d) => d.detect(makeWsPkg(tmpDir, "x"), tmpDir)),
		);
		expect(targets.length).toBe(1);
		expect(targets[0].directory).toBe("dist/npm");
		expect(targets[0].registry).toBe("https://npm.pkg.github.com/");
		expect(targets[0].access).toBe("public");
	});

	it("private === true + object target with no directory → falls back to pc.directory", async () => {
		writePkg(tmpDir, {
			name: "x",
			version: "1.0.0",
			private: true,
			publishConfig: {
				directory: "dist/dev",
				access: "public",
				targets: [{ protocol: "npm", registry: "https://registry.npmjs.org/", access: "public" }],
			},
		});
		const targets = await runSilk(
			Effect.flatMap(PublishabilityDetector, (d) => d.detect(makeWsPkg(tmpDir, "x"), tmpDir)),
		);
		expect(targets.length).toBe(1);
		expect(targets[0].directory).toBe("dist/dev");
	});

	it("private === true + string shorthand target → uses pc.directory", async () => {
		writePkg(tmpDir, {
			name: "x",
			version: "1.0.0",
			private: true,
			publishConfig: { directory: "dist/dev", access: "public", targets: ["npm"] },
		});
		const targets = await runSilk(
			Effect.flatMap(PublishabilityDetector, (d) => d.detect(makeWsPkg(tmpDir, "x"), tmpDir)),
		);
		expect(targets.length).toBe(1);
		expect(targets[0].directory).toBe("dist/dev");
	});

	it("shorthand 'npm' target → registry expands to registry.npmjs.org", async () => {
		writePkg(tmpDir, {
			name: "x",
			version: "1.0.0",
			private: true,
			publishConfig: { access: "public", targets: ["npm"] },
		});
		const targets = await runSilk(
			Effect.flatMap(PublishabilityDetector, (d) => d.detect(makeWsPkg(tmpDir, "x"), tmpDir)),
		);
		expect(targets.length).toBe(1);
		expect(targets[0].registry).toBe("https://registry.npmjs.org/");
	});

	it("shorthand 'github' target → registry expands to npm.pkg.github.com", async () => {
		writePkg(tmpDir, {
			name: "x",
			version: "1.0.0",
			private: true,
			publishConfig: { access: "public", targets: ["github"] },
		});
		const targets = await runSilk(
			Effect.flatMap(PublishabilityDetector, (d) => d.detect(makeWsPkg(tmpDir, "x"), tmpDir)),
		);
		expect(targets.length).toBe(1);
		expect(targets[0].registry).toBe("https://npm.pkg.github.com/");
	});

	it("shorthand 'jsr' target → registry expands to jsr.io", async () => {
		writePkg(tmpDir, {
			name: "x",
			version: "1.0.0",
			private: true,
			publishConfig: { access: "public", targets: ["jsr"] },
		});
		const targets = await runSilk(
			Effect.flatMap(PublishabilityDetector, (d) => d.detect(makeWsPkg(tmpDir, "x"), tmpDir)),
		);
		expect(targets.length).toBe(1);
		expect(targets[0].registry).toBe("https://jsr.io/");
	});

	it("string URL target → registry used verbatim", async () => {
		writePkg(tmpDir, {
			name: "x",
			version: "1.0.0",
			private: true,
			publishConfig: { access: "public", targets: ["https://custom.example.com/"] },
		});
		const targets = await runSilk(
			Effect.flatMap(PublishabilityDetector, (d) => d.detect(makeWsPkg(tmpDir, "x"), tmpDir)),
		);
		expect(targets.length).toBe(1);
		expect(targets[0].registry).toBe("https://custom.example.com/");
	});

	it("unknown string target → falls back to publishConfig.registry", async () => {
		writePkg(tmpDir, {
			name: "x",
			version: "1.0.0",
			private: true,
			publishConfig: { access: "public", registry: "https://fallback.example.com/", targets: ["something-unknown"] },
		});
		const targets = await runSilk(
			Effect.flatMap(PublishabilityDetector, (d) => d.detect(makeWsPkg(tmpDir, "x"), tmpDir)),
		);
		expect(targets.length).toBe(1);
		expect(targets[0].registry).toBe("https://fallback.example.com/");
	});

	it("private === true + object target with provenance → resolves provenance true", async () => {
		writePkg(tmpDir, {
			name: "x",
			version: "1.0.0",
			private: true,
			publishConfig: {
				directory: "dist/dev",
				access: "public",
				targets: [
					{
						protocol: "npm",
						registry: "https://npm.pkg.github.com/",
						directory: "dist/npm",
						access: "public",
						provenance: true,
					},
				],
			},
		});
		const targets = await runSilk(
			Effect.flatMap(PublishabilityDetector, (d) => d.detect(makeWsPkg(tmpDir, "x"), tmpDir)),
		);
		expect(targets.length).toBe(1);
		expect(targets[0].provenance).toBe(true);
	});

	it("missing package.json → not publishable", async () => {
		// no writePkg call — tmpDir exists but no package.json
		const targets = await runSilk(
			Effect.flatMap(PublishabilityDetector, (d) => d.detect(makeWsPkg(tmpDir, "x"), tmpDir)),
		);
		expect(targets.length).toBe(0);
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// PublishabilityDetectorAdaptiveLive — vanilla mode (reads from WorkspacePackage fields)
// ──────────────────────────────────────────────────────────────────────────────

describe("PublishabilityDetectorAdaptiveLive — vanilla mode", () => {
	let tmpDir: string;
	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "pub-"));
	});

	it("private === true + no publishConfig.access → not publishable", async () => {
		writePkg(tmpDir, { name: "x", version: "1.0.0", private: true });
		const targets = await runAdaptive(
			Effect.flatMap(PublishabilityDetector, (d) => d.detect(makeWsPkg(tmpDir, "x", { private: true }), tmpDir)),
			"vanilla",
		);
		expect(targets.length).toBe(0);
	});

	it("private === true + publishConfig.access set → publishable", async () => {
		writePkg(tmpDir, { name: "x", version: "1.0.0", private: true, publishConfig: { access: "public" } });
		// Pass publishConfig to the WorkspacePackage so the vanilla library can read it
		const targets = await runAdaptive(
			Effect.flatMap(PublishabilityDetector, (d) =>
				d.detect(makeWsPkg(tmpDir, "x", { private: true, publishConfig: { access: "public" } }), tmpDir),
			),
			"vanilla",
		);
		expect(targets.length).toBe(1);
	});

	it("private !== true → publishable", async () => {
		writePkg(tmpDir, { name: "x", version: "1.0.0" });
		const targets = await runAdaptive(
			Effect.flatMap(PublishabilityDetector, (d) => d.detect(makeWsPkg(tmpDir, "x"), tmpDir)),
			"vanilla",
		);
		expect(targets.length).toBe(1);
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// PublishabilityDetectorAdaptiveLive — none mode
// ──────────────────────────────────────────────────────────────────────────────

describe("PublishabilityDetectorAdaptiveLive — none mode", () => {
	let tmpDir: string;
	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "pub-"));
	});

	it("none mode treats everything as not publishable regardless of package contents", async () => {
		writePkg(tmpDir, { name: "x", version: "1.0.0" });
		const targets = await runAdaptive(
			Effect.flatMap(PublishabilityDetector, (d) => d.detect(makeWsPkg(tmpDir, "x"), tmpDir)),
			"none",
		);
		expect(targets.length).toBe(0);
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// PublishabilityDetectorAdaptiveLive — silk mode dispatches to silk rules
// ──────────────────────────────────────────────────────────────────────────────

describe("PublishabilityDetectorAdaptiveLive — silk mode dispatches to silk rules", () => {
	let tmpDir: string;
	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "pub-"));
	});

	it("silk mode: private + publishConfig.targets public → publishable", async () => {
		writePkg(tmpDir, {
			name: "x",
			version: "1.0.0",
			private: true,
			publishConfig: { targets: [{ protocol: "npm", registry: "https://registry.npmjs.org/", access: "public" }] },
		});
		const targets = await runAdaptive(
			Effect.flatMap(PublishabilityDetector, (d) => d.detect(makeWsPkg(tmpDir, "x"), tmpDir)),
			"silk",
		);
		expect(targets.length).toBe(1);
	});

	it("silk mode: private + no publishConfig → not publishable", async () => {
		writePkg(tmpDir, { name: "x", version: "1.0.0", private: true });
		const targets = await runAdaptive(
			Effect.flatMap(PublishabilityDetector, (d) => d.detect(makeWsPkg(tmpDir, "x"), tmpDir)),
			"silk",
		);
		expect(targets.length).toBe(0);
	});
});
