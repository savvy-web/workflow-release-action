import { describe, expect, it } from "vitest";
import { buildChecksTable, buildFindingsTable, buildPublishSummary, getPackagePageUrl } from "./report.js";
import type { PackagePublishResult, PublishPackagesResult, TargetPublishResult, ValidationFinding } from "./types.js";

// Minimal ResolvedTarget stub — only the fields the report module touches.
const npmTarget = {
	protocol: "npm" as const,
	registry: "https://registry.npmjs.org/",
	directory: "dist/npm",
	access: "public" as const,
	provenance: true,
	tag: "latest",
	tokenEnv: "NPM_TOKEN",
};

const ghTarget = {
	protocol: "npm" as const,
	registry: "https://npm.pkg.github.com/",
	directory: "dist/npm",
	access: "public" as const,
	provenance: false,
	tag: "latest",
	tokenEnv: "NODE_AUTH_TOKEN",
};

/** Build a PublishPackagesResult around a list of packages. */
function resultOf(packages: PackagePublishResult[]): PublishPackagesResult {
	const totalTargets = packages.reduce((n, p) => n + p.targets.length, 0);
	const successfulTargets = packages.reduce(
		(n, p) => n + p.targets.filter((t) => t.success || t.alreadyPublished).length,
		0,
	);
	return {
		success: packages.every((p) => p.targets.every((t) => t.success || t.alreadyPublished)),
		packages,
		totalPackages: packages.length,
		successfulPackages: packages.filter((p) => p.targets.every((t) => t.success || t.alreadyPublished)).length,
		totalTargets,
		successfulTargets,
	};
}

describe("getPackagePageUrl", () => {
	it("returns npmjs.com URL for npm registry", () => {
		const url = getPackagePageUrl("https://registry.npmjs.org/", "@org/my-pkg", "1.2.3");
		expect(url).toBe("https://www.npmjs.com/package/@org/my-pkg/v/1.2.3");
	});

	it("returns GitHub Packages URL for github registry", () => {
		const url = getPackagePageUrl("https://npm.pkg.github.com/", "@savvy-web/my-pkg", "2.0.0", "savvy-web");
		expect(url).toBe("https://github.com/orgs/savvy-web/packages/npm/package/my-pkg");
	});

	it("returns undefined for custom registry", () => {
		const url = getPackagePageUrl("https://my-custom-registry.example.com/", "@org/pkg", "1.0.0");
		expect(url).toBeUndefined();
	});

	it("returns jsr.io URL when registry is null", () => {
		const url = getPackagePageUrl(null, "@jsr/pkg", "0.1.0");
		expect(url).toBe("https://jsr.io/@jsr/pkg@0.1.0");
	});
});

describe("buildPublishSummary", () => {
	it("frames the report as 'What will be released', never 'Published'", () => {
		const markdown = buildPublishSummary(resultOf([]));
		expect(markdown).toContain("What will be released");
		expect(markdown).not.toContain("Publish Results");
		expect(markdown).not.toContain("Published");
		expect(markdown).toContain("On merge, these packages publish:");
	});

	it("includes the dry-run indicator in the header when dryRun is true", () => {
		const markdown = buildPublishSummary(resultOf([]), { dryRun: true });
		expect(markdown).toContain("Dry Run");
	});

	it("renders the current → next version transition for a bumped package", () => {
		const pkg: PackagePublishResult = {
			name: "@savvy-web/linked-1",
			version: "5.0.13",
			baseVersion: "5.0.12",
			changesetCount: 1,
			targets: [{ target: npmTarget, success: true, packedSize: 716, unpackedSize: 2300, fileCount: 5 }],
		};

		const markdown = buildPublishSummary(resultOf([pkg]));

		expect(markdown).toContain("5.0.12 → 5.0.13");
	});

	it("renders a patch bump emoji and label", () => {
		const pkg: PackagePublishResult = {
			name: "@org/pkg-a",
			version: "1.0.1",
			baseVersion: "1.0.0",
			changesetCount: 1,
			targets: [{ target: npmTarget, success: true }],
		};

		const markdown = buildPublishSummary(resultOf([pkg]));

		expect(markdown).toContain("\u{1F7E2} patch");
	});

	it("renders a minor bump emoji and label", () => {
		const pkg: PackagePublishResult = {
			name: "@org/pkg-a",
			version: "1.1.0",
			baseVersion: "1.0.0",
			changesetCount: 2,
			targets: [{ target: npmTarget, success: true }],
		};

		const markdown = buildPublishSummary(resultOf([pkg]));

		expect(markdown).toContain("\u{1F7E1} minor");
	});

	it("renders a major bump emoji and label", () => {
		const pkg: PackagePublishResult = {
			name: "@org/pkg-a",
			version: "2.0.0",
			baseVersion: "1.5.3",
			changesetCount: 1,
			targets: [{ target: npmTarget, success: true }],
		};

		const markdown = buildPublishSummary(resultOf([pkg]));

		expect(markdown).toContain("\u{1F534} major");
	});

	it("renders a brand-new package (null baseVersion) as '— → version' with a 🆕 new bump", () => {
		const pkg: PackagePublishResult = {
			name: "@org/brand-new",
			version: "1.0.0",
			baseVersion: null,
			changesetCount: 1,
			targets: [{ target: npmTarget, success: true }],
		};

		const markdown = buildPublishSummary(resultOf([pkg]));

		expect(markdown).toContain("— → 1.0.0");
		expect(markdown).toContain("\u{1F195} new");
	});

	it("renders the changeset count, and '—' when it is absent", () => {
		const withCount: PackagePublishResult = {
			name: "@org/with-count",
			version: "1.0.1",
			baseVersion: "1.0.0",
			changesetCount: 3,
			targets: [{ target: npmTarget, success: true }],
		};
		const noCount: PackagePublishResult = {
			name: "@org/no-count",
			version: "1.0.1",
			baseVersion: "1.0.0",
			targets: [{ target: npmTarget, success: true }],
		};

		const withCountMd = buildPublishSummary(resultOf([withCount]));
		const noCountMd = buildPublishSummary(resultOf([noCount]));

		// The summary table row carries the changeset count cell.
		expect(withCountMd).toContain("| 3 |");
		expect(noCountMd).toContain("| — |");
	});

	it("renders per-target packed and unpacked sizes in the Details table", () => {
		const pkg: PackagePublishResult = {
			name: "@org/sized",
			version: "1.0.1",
			baseVersion: "1.0.0",
			changesetCount: 1,
			targets: [{ target: npmTarget, success: true, packedSize: 716, unpackedSize: 2300, fileCount: 5 }],
		};

		const markdown = buildPublishSummary(resultOf([pkg]));

		expect(markdown).toContain("0.7 kB");
		expect(markdown).toContain("2.3 kB");
		// File count appears in the Details table.
		expect(markdown).toContain("| 5 |");
	});

	it("renders a Totals line summing packed/unpacked sizes and file counts", () => {
		const pkgA: PackagePublishResult = {
			name: "@org/pkg-a",
			version: "1.0.1",
			baseVersion: "1.0.0",
			changesetCount: 1,
			targets: [{ target: npmTarget, success: true, packedSize: 716, unpackedSize: 2300, fileCount: 5 }],
		};
		const pkgB: PackagePublishResult = {
			name: "@org/pkg-b",
			version: "2.0.1",
			baseVersion: "2.0.0",
			changesetCount: 1,
			targets: [{ target: ghTarget, success: true, packedSize: 284, unpackedSize: 700, fileCount: 3 }],
		};

		const markdown = buildPublishSummary(resultOf([pkgA, pkgB]));

		// 716 + 284 = 1000 bytes → 1.0 kB; 2300 + 700 = 3000 → 3.0 kB; 5 + 3 = 8 files.
		expect(markdown).toContain("**Totals:**");
		expect(markdown).toContain("1.0 kB packed");
		expect(markdown).toContain("3.0 kB unpacked");
		expect(markdown).toContain("8 files");
		expect(markdown).toContain("2/2 targets ready");
	});

	it("omits an absent size from the Totals sum", () => {
		const pkg: PackagePublishResult = {
			name: "@org/partial-sizes",
			version: "1.0.1",
			baseVersion: "1.0.0",
			changesetCount: 1,
			// packedSize present, unpackedSize/fileCount absent.
			targets: [{ target: npmTarget, success: true, packedSize: 500 }],
		};

		const markdown = buildPublishSummary(resultOf([pkg]));

		expect(markdown).toContain("0.5 kB packed");
		expect(markdown).toContain("0 B unpacked");
		expect(markdown).toContain("0 files");
	});

	it("renders a version-only package (no targets) with the 'Version only' targets cell", () => {
		const pkg: PackagePublishResult = {
			name: "@org/version-only",
			version: "1.0.1",
			baseVersion: "1.0.0",
			changesetCount: 1,
			targets: [],
		};

		const markdown = buildPublishSummary(resultOf([pkg]));

		expect(markdown).toContain("Version only");
		expect(markdown).toContain("@org/version-only");
	});

	it("includes the Legend line", () => {
		const pkg: PackagePublishResult = {
			name: "@org/pkg-a",
			version: "1.0.1",
			baseVersion: "1.0.0",
			changesetCount: 1,
			targets: [{ target: npmTarget, success: true }],
		};

		const markdown = buildPublishSummary(resultOf([pkg]));

		expect(markdown).toContain("**Legend:**");
		expect(markdown).toContain("🔴 major");
	});

	it("renders provenance ✅ for a configured target and 🚫 for an unconfigured one", () => {
		const provPkg: PackagePublishResult = {
			name: "@org/prov",
			version: "1.0.1",
			baseVersion: "1.0.0",
			changesetCount: 1,
			targets: [{ target: npmTarget, success: true }],
		};
		const noProvPkg: PackagePublishResult = {
			name: "@org/no-prov",
			version: "1.0.1",
			baseVersion: "1.0.0",
			changesetCount: 1,
			targets: [{ target: ghTarget, success: true }],
		};

		const provMd = buildPublishSummary(resultOf([provPkg]));
		const noProvMd = buildPublishSummary(resultOf([noProvPkg]));

		expect(provMd).toContain("✅");
		expect(noProvMd).toContain("\u{1F6AB}");
	});

	it("does not render a 'Package URL' column in the Details table", () => {
		const pkg: PackagePublishResult = {
			name: "@org/pkg-a",
			version: "1.0.1",
			baseVersion: "1.0.0",
			changesetCount: 1,
			targets: [{ target: npmTarget, success: true }],
		};

		const markdown = buildPublishSummary(resultOf([pkg]));

		expect(markdown).not.toContain("Package URL");
	});
});

describe("buildChecksTable", () => {
	it("renders a linked Check cell when a row carries a url", () => {
		const table = buildChecksTable([
			{ icon: "✅", name: "Build Validation", outcome: "Build passed", url: "https://example.com/runs/1" },
		]);

		expect(table).toContain("[Build Validation](https://example.com/runs/1)");
	});

	it("renders a plain Check name when a row has no url", () => {
		const table = buildChecksTable([{ icon: "✅", name: "Build Validation", outcome: "Build passed" }]);

		expect(table).toContain("Build Validation");
		expect(table).not.toContain("](");
	});

	it("renders all three status icons", () => {
		const table = buildChecksTable([
			{ icon: "✅", name: "Build Validation", outcome: "Build passed" },
			{ icon: "⚠️", name: "SBOM Preview", outcome: "1 NTIA warning" },
			{ icon: "❌", name: "Publish Validation", outcome: "1 failed" },
		]);

		expect(table).toContain("✅");
		expect(table).toContain("⚠️");
		expect(table).toContain("❌");
	});
});

describe("buildFindingsTable", () => {
	it("returns an empty string when there are no findings", () => {
		expect(buildFindingsTable([])).toBe("");
	});

	it("orders errors before warnings regardless of discovery order", () => {
		const findings: ReadonlyArray<ValidationFinding> = [
			{ severity: "warning", check: "SBOM Preview", scope: "@org/a", message: "missing NTIA fields" },
			{ severity: "error", check: "Publish Validation", scope: "@org/b", message: "dry-run failed" },
		];

		const table = buildFindingsTable(findings);
		const errorIdx = table.indexOf("dry-run failed");
		const warningIdx = table.indexOf("missing NTIA fields");

		expect(errorIdx).toBeGreaterThan(-1);
		expect(warningIdx).toBeGreaterThan(-1);
		expect(errorIdx).toBeLessThan(warningIdx);
	});

	it("omits the error side of the heading when there are no errors", () => {
		const table = buildFindingsTable([
			{ severity: "warning", check: "SBOM Preview", scope: "@org/a", message: "missing NTIA fields" },
		]);

		expect(table).toContain("### ⚠️ 1 warning");
		expect(table).not.toContain("error");
	});

	it("omits the warning side of the heading when there are no warnings", () => {
		const table = buildFindingsTable([{ severity: "error", check: "Build Validation", message: "tsc exited 2" }]);

		expect(table).toContain("### ❌ 1 error");
		expect(table).not.toContain("warning");
	});

	it("pluralises the heading counts", () => {
		const table = buildFindingsTable([
			{ severity: "error", check: "Build Validation", message: "a" },
			{ severity: "error", check: "Publish Validation", message: "b" },
			{ severity: "warning", check: "SBOM Preview", message: "c" },
			{ severity: "warning", check: "SBOM Preview", message: "d" },
		]);

		expect(table).toContain("❌ 2 errors");
		expect(table).toContain("⚠️ 2 warnings");
	});

	it("renders '—' in the Package column for a repo-wide finding with no scope", () => {
		const table = buildFindingsTable([{ severity: "error", check: "Build Validation", message: "tsc exited 2" }]);

		expect(table).toContain("| — |");
	});

	it("renders the scope in the Package column for a package-scoped finding", () => {
		const table = buildFindingsTable([
			{ severity: "error", check: "Publish Validation", scope: "@savvy-web/linked-2", message: "dry-run failed" },
		]);

		expect(table).toContain("@savvy-web/linked-2");
	});
});
