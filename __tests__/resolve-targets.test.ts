import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { PackageJson } from "../src/types/publish-config.js";
import { getRegistryDisplayName, registryToEnvName, resolveTargets } from "../src/utils/resolve-targets.js";

describe("resolve-targets", () => {
	const testPackagePath = "/workspace/packages/test-package";

	describe("registryToEnvName", () => {
		it("converts npmjs registry URL to env name", () => {
			expect(registryToEnvName("https://registry.npmjs.org/")).toBe("REGISTRY_NPMJS_ORG_TOKEN");
		});

		it("converts GitHub Packages registry URL to env name", () => {
			expect(registryToEnvName("https://npm.pkg.github.com/")).toBe("NPM_PKG_GITHUB_COM_TOKEN");
		});

		it("converts custom registry URL to env name", () => {
			expect(registryToEnvName("https://registry.savvyweb.dev/")).toBe("REGISTRY_SAVVYWEB_DEV_TOKEN");
		});

		it("handles registry with http protocol", () => {
			expect(registryToEnvName("http://localhost:4873/")).toBe("LOCALHOST_4873_TOKEN");
		});

		it("removes leading/trailing underscores", () => {
			expect(registryToEnvName("https://npm.example.com")).toBe("NPM_EXAMPLE_COM_TOKEN");
		});
	});

	describe("getRegistryDisplayName", () => {
		it("returns 'npm' for npmjs registry", () => {
			expect(getRegistryDisplayName("https://registry.npmjs.org/")).toBe("npm");
		});

		it("returns 'GitHub Packages' for GitHub registry", () => {
			expect(getRegistryDisplayName("https://npm.pkg.github.com/")).toBe("GitHub Packages");
		});

		it("returns 'jsr.io' for null registry", () => {
			expect(getRegistryDisplayName(null)).toBe("jsr.io");
		});

		it("returns hostname for custom registry", () => {
			expect(getRegistryDisplayName("https://registry.savvyweb.dev/")).toBe("registry.savvyweb.dev");
		});

		it("returns raw string for invalid URL", () => {
			expect(getRegistryDisplayName("not-a-url")).toBe("not-a-url");
		});
	});

	describe("resolveTargets", () => {
		describe("no publishConfig", () => {
			it("returns empty array for private package", () => {
				const packageJson: PackageJson = { private: true };
				const targets = resolveTargets(testPackagePath, packageJson);
				expect(targets).toEqual([]);
			});

			it("returns default npm target for public package (uses OIDC)", () => {
				const packageJson: PackageJson = { private: false };
				const targets = resolveTargets(testPackagePath, packageJson);

				expect(targets).toHaveLength(1);
				expect(targets[0]).toEqual({
					protocol: "npm",
					registry: "https://registry.npmjs.org/",
					directory: testPackagePath,
					access: "restricted",
					provenance: true,
					tag: "latest",
					tokenEnv: null, // npm uses OIDC trusted publishing
				});
			});

			it("returns default npm target when private is undefined", () => {
				const packageJson: PackageJson = {};
				const targets = resolveTargets(testPackagePath, packageJson);

				expect(targets).toHaveLength(1);
				expect(targets[0].protocol).toBe("npm");
			});
		});

		describe("publishConfig without targets (legacy mode)", () => {
			it("uses default npm registry when no registry specified", () => {
				const packageJson: PackageJson = {
					publishConfig: {
						access: "public",
					},
				};
				const targets = resolveTargets(testPackagePath, packageJson);

				expect(targets).toHaveLength(1);
				expect(targets[0].registry).toBe("https://registry.npmjs.org/");
				expect(targets[0].access).toBe("public");
			});

			it("uses specified registry", () => {
				const packageJson: PackageJson = {
					publishConfig: {
						registry: "https://npm.pkg.github.com/",
						access: "restricted",
					},
				};
				const targets = resolveTargets(testPackagePath, packageJson);

				expect(targets).toHaveLength(1);
				expect(targets[0].registry).toBe("https://npm.pkg.github.com/");
				expect(targets[0].tokenEnv).toBe("GITHUB_TOKEN");
			});

			it("resolves directory relative to package path", () => {
				const packageJson: PackageJson = {
					publishConfig: {
						directory: "dist/npm",
					},
				};
				const targets = resolveTargets(testPackagePath, packageJson);

				expect(targets).toHaveLength(1);
				expect(targets[0].directory).toBe(path.resolve(testPackagePath, "dist/npm"));
			});

			it("uses package root when no directory specified", () => {
				const packageJson: PackageJson = {
					publishConfig: {
						access: "public",
					},
				};
				const targets = resolveTargets(testPackagePath, packageJson);

				expect(targets[0].directory).toBe(testPackagePath);
			});
		});

		describe("publishConfig with targets", () => {
			it("expands 'npm' shorthand (uses OIDC)", () => {
				const packageJson: PackageJson = {
					publishConfig: {
						targets: ["npm"],
					},
				};
				const targets = resolveTargets(testPackagePath, packageJson);

				expect(targets).toHaveLength(1);
				expect(targets[0]).toMatchObject({
					protocol: "npm",
					registry: "https://registry.npmjs.org/",
					provenance: true,
					tokenEnv: null, // npm uses OIDC trusted publishing
				});
			});

			it("expands 'github' shorthand", () => {
				const packageJson: PackageJson = {
					publishConfig: {
						targets: ["github"],
					},
				};
				const targets = resolveTargets(testPackagePath, packageJson);

				expect(targets).toHaveLength(1);
				expect(targets[0]).toMatchObject({
					protocol: "npm",
					registry: "https://npm.pkg.github.com/",
					provenance: true,
					tokenEnv: "GITHUB_TOKEN",
				});
			});

			it("expands 'jsr' shorthand (uses OIDC)", () => {
				const packageJson: PackageJson = {
					publishConfig: {
						targets: ["jsr"],
					},
				};
				const targets = resolveTargets(testPackagePath, packageJson);

				expect(targets).toHaveLength(1);
				expect(targets[0]).toMatchObject({
					protocol: "jsr",
					registry: null,
					provenance: false,
					tokenEnv: null, // JSR uses OIDC
				});
			});

			it("expands URL shorthand as custom npm registry", () => {
				const packageJson: PackageJson = {
					publishConfig: {
						targets: ["https://registry.savvyweb.dev/"],
					},
				};
				const targets = resolveTargets(testPackagePath, packageJson);

				expect(targets).toHaveLength(1);
				expect(targets[0]).toMatchObject({
					protocol: "npm",
					registry: "https://registry.savvyweb.dev/",
					provenance: false,
					tokenEnv: "REGISTRY_SAVVYWEB_DEV_TOKEN",
				});
			});

			it("handles full target objects", () => {
				const packageJson: PackageJson = {
					publishConfig: {
						targets: [
							{
								protocol: "npm",
								registry: "https://registry.npmjs.org/",
								directory: "dist/npm",
								access: "public",
								provenance: true,
								tag: "next",
								tokenEnv: "CUSTOM_NPM_TOKEN",
							},
						],
					},
				};
				const targets = resolveTargets(testPackagePath, packageJson);

				expect(targets).toHaveLength(1);
				expect(targets[0]).toEqual({
					protocol: "npm",
					registry: "https://registry.npmjs.org/",
					directory: path.resolve(testPackagePath, "dist/npm"),
					access: "public",
					provenance: true,
					tag: "next",
					tokenEnv: "CUSTOM_NPM_TOKEN",
				});
			});

			it("handles multiple targets", () => {
				const packageJson: PackageJson = {
					publishConfig: {
						targets: ["npm", "github", "jsr"],
					},
				};
				const targets = resolveTargets(testPackagePath, packageJson);

				expect(targets).toHaveLength(3);
				expect(targets[0].registry).toBe("https://registry.npmjs.org/");
				expect(targets[1].registry).toBe("https://npm.pkg.github.com/");
				expect(targets[2].registry).toBeNull();
			});

			it("inherits access from publishConfig when not specified in target", () => {
				const packageJson: PackageJson = {
					publishConfig: {
						access: "public",
						targets: ["npm"],
					},
				};
				const targets = resolveTargets(testPackagePath, packageJson);

				expect(targets[0].access).toBe("public");
			});

			it("target access overrides publishConfig access", () => {
				const packageJson: PackageJson = {
					publishConfig: {
						access: "public",
						targets: [{ protocol: "npm", access: "restricted" }],
					},
				};
				const targets = resolveTargets(testPackagePath, packageJson);

				expect(targets[0].access).toBe("restricted");
			});

			it("inherits directory from publishConfig when not specified in target", () => {
				const packageJson: PackageJson = {
					publishConfig: {
						directory: "dist",
						targets: ["npm"],
					},
				};
				const targets = resolveTargets(testPackagePath, packageJson);

				expect(targets[0].directory).toBe(path.resolve(testPackagePath, "dist"));
			});

			it("target directory overrides publishConfig directory", () => {
				const packageJson: PackageJson = {
					publishConfig: {
						directory: "dist/default",
						targets: [{ protocol: "npm", directory: "dist/npm" }],
					},
				};
				const targets = resolveTargets(testPackagePath, packageJson);

				expect(targets[0].directory).toBe(path.resolve(testPackagePath, "dist/npm"));
			});

			it("uses default tag 'latest' when not specified", () => {
				const packageJson: PackageJson = {
					publishConfig: {
						targets: ["npm"],
					},
				};
				const targets = resolveTargets(testPackagePath, packageJson);

				expect(targets[0].tag).toBe("latest");
			});
		});

		describe("error cases", () => {
			it("throws for unknown shorthand", () => {
				const packageJson: PackageJson = {
					publishConfig: {
						targets: ["unknown" as "npm"],
					},
				};

				expect(() => resolveTargets(testPackagePath, packageJson)).toThrow("Unknown target shorthand: unknown");
			});
		});
	});
});
