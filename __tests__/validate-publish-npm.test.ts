import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import validatePublishNPM from "../.github/actions/setup-release/validate-publish-npm.js";
import type { MockContext, MockCore, MockExec, MockGithub } from "./utils/github-mocks.js";
import { createMockContext, createMockCore, createMockExec, createMockGithub } from "./utils/github-mocks.js";

describe("validate-publish-npm", () => {
	let mockCore: MockCore;
	let mockExec: MockExec;
	let mockGithub: MockGithub;
	let mockContext: MockContext;

	beforeEach(() => {
		vi.clearAllMocks();

		mockCore = createMockCore();
		mockExec = createMockExec();
		mockGithub = createMockGithub({ checkId: 888 });
		mockContext = createMockContext({
			owner: "test-owner",
			repo: "test-repo",
			sha: "abc123",
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		delete process.env.PACKAGE_MANAGER;
		delete process.env.DRY_RUN;
	});

	describe("changeset status parsing", () => {
		it("should get changeset status with pnpm", async () => {
			process.env.PACKAGE_MANAGER = "pnpm";

			mockExec.exec.mockImplementation(async (_cmd, args, options) => {
				if (args?.[0] === "changeset" && args?.[1] === "status") {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/pkg-a", newVersion: "1.0.0", type: "minor" }],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}
				return 0;
			});

			// Mock package.json read
			mockExec.exec.mockImplementation(async (_cmd, args, options) => {
				if (args?.[0]?.includes("package.json")) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg-a",
									version: "1.0.0",
									publishConfig: { access: "public" },
								}),
							),
						);
					}
					return 0;
				}
				return 0;
			});

			await validatePublishNPM({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				octokit: mockGithub as never,
				context: mockContext as never,
				glob: { create: vi.fn() } as never,
				io: { cp: vi.fn(), mv: vi.fn(), rmRF: vi.fn(), mkdirP: vi.fn(), which: vi.fn() } as never,
			});

			expect(mockExec.exec).toHaveBeenCalledWith("pnpm", ["changeset", "status", "--output=json"], expect.any(Object));
		});

		it("should get changeset status with npm", async () => {
			process.env.PACKAGE_MANAGER = "npm";

			mockExec.exec.mockImplementation(async (_cmd, args, options) => {
				if (args?.[1] === "changeset") {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									releases: [],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}
				return 0;
			});

			await validatePublishNPM({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				octokit: mockGithub as never,
				context: mockContext as never,
				glob: { create: vi.fn() } as never,
				io: { cp: vi.fn(), mv: vi.fn(), rmRF: vi.fn(), mkdirP: vi.fn(), which: vi.fn() } as never,
			});

			expect(mockExec.exec).toHaveBeenCalledWith(
				"npm",
				["run", "changeset", "status", "--output=json"],
				expect.any(Object),
			);
		});
	});

	describe("package publishability checks", () => {
		it("should detect publishable package with public access", async () => {
			process.env.PACKAGE_MANAGER = "pnpm";

			let execCallCount = 0;

			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;

				// First call: changeset status
				if (execCallCount === 1) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/pkg-public", newVersion: "1.0.0", type: "minor" }],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}

				// Second call: npm list to find package
				if (execCallCount === 2) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									dependencies: {
										"@test/pkg-public": {
											path: "packages/pkg-public",
										},
									},
								}),
							),
						);
					}
					return 0;
				}

				// Third call: cat package.json
				if (execCallCount === 3) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg-public",
									version: "1.0.0",
									publishConfig: { access: "public" },
								}),
							),
						);
					}
					return 0;
				}

				// Fourth call: npm publish --dry-run
				if (execCallCount === 4) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									id: "@test/pkg-public@1.0.0",
									provenance: true,
								}),
							),
						);
					}
					return 0;
				}

				return 0;
			});

			await validatePublishNPM({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				octokit: mockGithub as never,
				context: mockContext as never,
				glob: { create: vi.fn() } as never,
				io: { cp: vi.fn(), mv: vi.fn(), rmRF: vi.fn(), mkdirP: vi.fn(), which: vi.fn() } as never,
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "true");
			expect(mockCore.notice).toHaveBeenCalledWith("✓ All 1 package(s) ready for NPM publish");
		});

		it("should detect package with restricted access as publishable", async () => {
			process.env.PACKAGE_MANAGER = "pnpm";

			let execCallCount = 0;

			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;

				if (execCallCount === 1) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/pkg-restricted", newVersion: "1.0.0", type: "minor" }],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 2) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									dependencies: {
										"@test/pkg-restricted": {
											path: "packages/pkg-restricted",
										},
									},
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 3) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg-restricted",
									version: "1.0.0",
									publishConfig: { access: "restricted" },
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 4) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(Buffer.from(JSON.stringify({ id: "@test/pkg-restricted@1.0.0" })));
					}
					return 0;
				}

				return 0;
			});

			await validatePublishNPM({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				octokit: mockGithub as never,
				context: mockContext as never,
				glob: { create: vi.fn() } as never,
				io: { cp: vi.fn(), mv: vi.fn(), rmRF: vi.fn(), mkdirP: vi.fn(), which: vi.fn() } as never,
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "true");
		});

		it("should detect private package as not publishable", async () => {
			process.env.PACKAGE_MANAGER = "pnpm";

			let execCallCount = 0;

			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;

				if (execCallCount === 1) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/pkg-private", newVersion: "1.0.0", type: "minor" }],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 2) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									dependencies: {
										"@test/pkg-private": {
											path: "packages/pkg-private",
										},
									},
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 3) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg-private",
									version: "1.0.0",
									private: true,
								}),
							),
						);
					}
					return 0;
				}

				return 0;
			});

			await validatePublishNPM({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				octokit: mockGithub as never,
				context: mockContext as never,
				glob: { create: vi.fn() } as never,
				io: { cp: vi.fn(), mv: vi.fn(), rmRF: vi.fn(), mkdirP: vi.fn(), which: vi.fn() } as never,
			});

			const results = JSON.parse(
				mockCore.setOutput.mock.calls.find((call: string[]) => call[0] === "results")?.[1] as string,
			);
			expect(results[0].canPublish).toBe(false);
			expect(results[0].message).toContain("Not publishable");
		});

		it("should detect package without publishConfig.access as not publishable", async () => {
			process.env.PACKAGE_MANAGER = "pnpm";

			let execCallCount = 0;

			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;

				if (execCallCount === 1) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/pkg-no-config", newVersion: "1.0.0", type: "minor" }],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 2) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									dependencies: {
										"@test/pkg-no-config": {
											path: "packages/pkg-no-config",
										},
									},
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 3) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg-no-config",
									version: "1.0.0",
								}),
							),
						);
					}
					return 0;
				}

				return 0;
			});

			await validatePublishNPM({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				octokit: mockGithub as never,
				context: mockContext as never,
				glob: { create: vi.fn() } as never,
				io: { cp: vi.fn(), mv: vi.fn(), rmRF: vi.fn(), mkdirP: vi.fn(), which: vi.fn() } as never,
			});

			const results = JSON.parse(
				mockCore.setOutput.mock.calls.find((call: string[]) => call[0] === "results")?.[1] as string,
			);
			expect(results[0].canPublish).toBe(false);
			expect(results[0].message).toContain("no publishConfig.access");
		});
	});

	describe("npm publish dry-run validation", () => {
		it("should detect version conflicts", async () => {
			process.env.PACKAGE_MANAGER = "pnpm";

			let execCallCount = 0;

			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;

				if (execCallCount === 1) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/pkg-conflict", newVersion: "1.0.0", type: "minor" }],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 2) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									dependencies: {
										"@test/pkg-conflict": {
											path: "packages/pkg-conflict",
										},
									},
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 3) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg-conflict",
									version: "1.0.0",
									publishConfig: { access: "public" },
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 4) {
					// npm publish --dry-run returns error for version conflict
					const stderr = options?.listeners?.stderr;
					if (stderr) {
						stderr(Buffer.from("cannot publish over previously published version 1.0.0"));
					}
					return 0; // npm publish --dry-run still returns 0 for this
				}

				return 0;
			});

			await validatePublishNPM({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				octokit: mockGithub as never,
				context: mockContext as never,
				glob: { create: vi.fn() } as never,
				io: { cp: vi.fn(), mv: vi.fn(), rmRF: vi.fn(), mkdirP: vi.fn(), which: vi.fn() } as never,
			});

			const results = JSON.parse(
				mockCore.setOutput.mock.calls.find((call: string[]) => call[0] === "results")?.[1] as string,
			);
			expect(results[0].canPublish).toBe(false);
			expect(results[0].message).toContain("Version conflict");
			expect(mockCore.warning).toHaveBeenCalled();
		});

		it("should detect authentication errors", async () => {
			process.env.PACKAGE_MANAGER = "pnpm";

			let execCallCount = 0;

			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;

				if (execCallCount === 1) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/pkg-auth", newVersion: "1.0.0", type: "minor" }],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 2) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									dependencies: {
										"@test/pkg-auth": {
											path: "packages/pkg-auth",
										},
									},
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 3) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg-auth",
									version: "1.0.0",
									publishConfig: { access: "public" },
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 4) {
					const stderr = options?.listeners?.stderr;
					if (stderr) {
						stderr(Buffer.from("ENEEDAUTH: authentication required"));
					}
					return 1;
				}

				return 0;
			});

			await validatePublishNPM({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				octokit: mockGithub as never,
				context: mockContext as never,
				glob: { create: vi.fn() } as never,
				io: { cp: vi.fn(), mv: vi.fn(), rmRF: vi.fn(), mkdirP: vi.fn(), which: vi.fn() } as never,
			});

			const results = JSON.parse(
				mockCore.setOutput.mock.calls.find((call: string[]) => call[0] === "results")?.[1] as string,
			);
			expect(results[0].canPublish).toBe(false);
			expect(results[0].message).toContain("NPM authentication required");
		});

		it("should detect provenance configuration", async () => {
			process.env.PACKAGE_MANAGER = "pnpm";

			let execCallCount = 0;

			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;

				if (execCallCount === 1) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/pkg-prov", newVersion: "1.0.0", type: "minor" }],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 2) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									dependencies: {
										"@test/pkg-prov": {
											path: "packages/pkg-prov",
										},
									},
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 3) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg-prov",
									version: "1.0.0",
									publishConfig: { access: "public" },
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 4) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(Buffer.from(JSON.stringify({ id: "@test/pkg-prov@1.0.0", provenance: true })));
					}
					return 0;
				}

				return 0;
			});

			await validatePublishNPM({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				octokit: mockGithub as never,
				context: mockContext as never,
				glob: { create: vi.fn() } as never,
				io: { cp: vi.fn(), mv: vi.fn(), rmRF: vi.fn(), mkdirP: vi.fn(), which: vi.fn() } as never,
			});

			const results = JSON.parse(
				mockCore.setOutput.mock.calls.find((call: string[]) => call[0] === "results")?.[1] as string,
			);
			expect(results[0].hasProvenance).toBe(true);
			expect(results[0].message).toContain("provenance");
		});
	});

	describe("package path resolution", () => {
		it("should find package using npm list", async () => {
			process.env.PACKAGE_MANAGER = "pnpm";

			let execCallCount = 0;

			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;

				if (execCallCount === 1) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/pkg-found", newVersion: "1.0.0", type: "minor" }],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 2) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									dependencies: {
										"@test/pkg-found": {
											path: "custom/location/pkg-found",
										},
									},
								}),
							),
						);
					}
					return 0;
				}

				return 0;
			});

			await validatePublishNPM({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				octokit: mockGithub as never,
				context: mockContext as never,
				glob: { create: vi.fn() } as never,
				io: { cp: vi.fn(), mv: vi.fn(), rmRF: vi.fn(), mkdirP: vi.fn(), which: vi.fn() } as never,
			});

			expect(mockExec.exec).toHaveBeenCalledWith("npm", ["list", "@test/pkg-found", "--json"], expect.any(Object));
		});

		it("should skip package if path cannot be found", async () => {
			process.env.PACKAGE_MANAGER = "pnpm";

			let execCallCount = 0;

			mockExec.exec.mockImplementation(async (cmd, _args, options) => {
				execCallCount++;

				if (execCallCount === 1) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/pkg-notfound", newVersion: "1.0.0", type: "minor" }],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 2) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(Buffer.from(JSON.stringify({ dependencies: {} })));
					}
					return 0;
				}

				// All test commands for fallback paths should return non-zero
				if (cmd === "test") {
					return 1;
				}

				return 0;
			});

			await validatePublishNPM({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				octokit: mockGithub as never,
				context: mockContext as never,
				glob: { create: vi.fn() } as never,
				io: { cp: vi.fn(), mv: vi.fn(), rmRF: vi.fn(), mkdirP: vi.fn(), which: vi.fn() } as never,
			});

			expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining("Could not find path for package"));
		});
	});

	describe("dry-run mode", () => {
		it("should skip actual npm publish in dry-run mode", async () => {
			process.env.PACKAGE_MANAGER = "pnpm";
			process.env.DRY_RUN = "true";

			let execCallCount = 0;

			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;

				if (execCallCount === 1) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/pkg-dry", newVersion: "1.0.0", type: "minor" }],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 2) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									dependencies: {
										"@test/pkg-dry": {
											path: "packages/pkg-dry",
										},
									},
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 3) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg-dry",
									version: "1.0.0",
									publishConfig: { access: "public" },
								}),
							),
						);
					}
					return 0;
				}

				return 0;
			});

			await validatePublishNPM({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				octokit: mockGithub as never,
				context: mockContext as never,
				glob: { create: vi.fn() } as never,
				io: { cp: vi.fn(), mv: vi.fn(), rmRF: vi.fn(), mkdirP: vi.fn(), which: vi.fn() } as never,
			});

			expect(mockCore.notice).toHaveBeenCalledWith("🧪 Running in dry-run mode (preview only)");
			expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining("[DRY RUN]"));
			expect(mockGithub.rest.checks.create).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "🧪 NPM Publish Validation (Dry Run)",
				}),
			);
		});
	});

	describe("error handling", () => {
		it("should handle errors in changeset status", async () => {
			process.env.PACKAGE_MANAGER = "pnpm";

			mockExec.exec.mockRejectedValueOnce(new Error("Changeset command failed"));

			await validatePublishNPM({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				octokit: mockGithub as never,
				context: mockContext as never,
				glob: { create: vi.fn() } as never,
				io: { cp: vi.fn(), mv: vi.fn(), rmRF: vi.fn(), mkdirP: vi.fn(), which: vi.fn() } as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith(expect.stringContaining("Changeset command failed"));
		});

		it("should handle non-Error exceptions", async () => {
			process.env.PACKAGE_MANAGER = "pnpm";

			mockExec.exec.mockRejectedValueOnce("string error");

			await validatePublishNPM({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				octokit: mockGithub as never,
				context: mockContext as never,
				glob: { create: vi.fn() } as never,
				io: { cp: vi.fn(), mv: vi.fn(), rmRF: vi.fn(), mkdirP: vi.fn(), which: vi.fn() } as never,
			});

			expect(mockCore.setFailed).toHaveBeenCalledWith(expect.stringContaining("string error"));
		});
	});

	describe("outputs and logging", () => {
		it("should set all outputs correctly", async () => {
			process.env.PACKAGE_MANAGER = "pnpm";

			let execCallCount = 0;

			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;

				if (execCallCount === 1) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/pkg-output", newVersion: "2.0.0", type: "major" }],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 2) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									dependencies: {
										"@test/pkg-output": {
											path: "packages/pkg-output",
										},
									},
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 3) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg-output",
									version: "2.0.0",
									publishConfig: { access: "public" },
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 4) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(Buffer.from(JSON.stringify({ id: "@test/pkg-output@2.0.0", provenance: true })));
					}
					return 0;
				}

				return 0;
			});

			await validatePublishNPM({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				octokit: mockGithub as never,
				context: mockContext as never,
				glob: { create: vi.fn() } as never,
				io: { cp: vi.fn(), mv: vi.fn(), rmRF: vi.fn(), mkdirP: vi.fn(), which: vi.fn() } as never,
			});

			expect(mockCore.setOutput).toHaveBeenCalledWith("success", "true");
			expect(mockCore.setOutput).toHaveBeenCalledWith("results", expect.any(String));
			expect(mockCore.setOutput).toHaveBeenCalledWith("check_id", "888");
		});

		it("should create check run with validation results", async () => {
			process.env.PACKAGE_MANAGER = "pnpm";

			let execCallCount = 0;

			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;

				if (execCallCount === 1) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/pkg-check", newVersion: "1.5.0", type: "minor" }],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 2) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									dependencies: {
										"@test/pkg-check": {
											path: "packages/pkg-check",
										},
									},
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 3) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg-check",
									version: "1.5.0",
									publishConfig: { access: "public" },
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 4) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(Buffer.from(JSON.stringify({ id: "@test/pkg-check@1.5.0" })));
					}
					return 0;
				}

				return 0;
			});

			await validatePublishNPM({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				octokit: mockGithub as never,
				context: mockContext as never,
				glob: { create: vi.fn() } as never,
				io: { cp: vi.fn(), mv: vi.fn(), rmRF: vi.fn(), mkdirP: vi.fn(), which: vi.fn() } as never,
			});

			expect(mockGithub.rest.checks.create).toHaveBeenCalledWith({
				owner: "test-owner",
				repo: "test-repo",
				name: "NPM Publish Validation",
				head_sha: "abc123",
				status: "completed",
				conclusion: "success",
				output: {
					title: "All 1 package(s) ready for NPM publish",
					summary: expect.stringContaining("@test/pkg-check"),
				},
			});
		});

		it("should create job summary with table", async () => {
			process.env.PACKAGE_MANAGER = "pnpm";

			let execCallCount = 0;

			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;

				if (execCallCount === 1) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/pkg-summary", newVersion: "3.0.0", type: "major" }],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 2) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									dependencies: {
										"@test/pkg-summary": {
											path: "packages/pkg-summary",
										},
									},
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 3) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg-summary",
									version: "3.0.0",
									publishConfig: { access: "public" },
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 4) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(Buffer.from(JSON.stringify({ id: "@test/pkg-summary@3.0.0" })));
					}
					return 0;
				}

				return 0;
			});

			await validatePublishNPM({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				octokit: mockGithub as never,
				context: mockContext as never,
				glob: { create: vi.fn() } as never,
				io: { cp: vi.fn(), mv: vi.fn(), rmRF: vi.fn(), mkdirP: vi.fn(), which: vi.fn() } as never,
			});

			expect(mockCore.summary.addHeading).toHaveBeenCalledWith("NPM Publish Validation", 2);
			expect(mockCore.summary.addTable).toHaveBeenCalled();
			expect(mockCore.summary.write).toHaveBeenCalled();
		});
	});

	describe("default values", () => {
		it("should use default package manager when not provided", async () => {
			let execCallCount = 0;

			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;

				if (execCallCount === 1) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									releases: [],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}

				return 0;
			});

			await validatePublishNPM({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				octokit: mockGithub as never,
				context: mockContext as never,
				glob: { create: vi.fn() } as never,
				io: { cp: vi.fn(), mv: vi.fn(), rmRF: vi.fn(), mkdirP: vi.fn(), which: vi.fn() } as never,
			});

			expect(mockExec.exec).toHaveBeenCalledWith("pnpm", ["changeset", "status", "--output=json"], expect.any(Object));
		});
	});

	describe("additional error scenarios", () => {
		it("should handle E404 package not found error", async () => {
			process.env.PACKAGE_MANAGER = "pnpm";

			let execCallCount = 0;

			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;

				if (execCallCount === 1) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/pkg-404", newVersion: "1.0.0", type: "minor" }],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 2) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									dependencies: {
										"@test/pkg-404": {
											path: "packages/pkg-404",
										},
									},
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 3) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg-404",
									version: "1.0.0",
									publishConfig: { access: "public" },
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 4) {
					const stderr = options?.listeners?.stderr;
					if (stderr) {
						stderr(Buffer.from("E404 Not found"));
					}
					return 1;
				}

				return 0;
			});

			await validatePublishNPM({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				octokit: mockGithub as never,
				context: mockContext as never,
				glob: { create: vi.fn() } as never,
				io: { cp: vi.fn(), mv: vi.fn(), rmRF: vi.fn(), mkdirP: vi.fn(), which: vi.fn() } as never,
			});

			const results = JSON.parse(
				mockCore.setOutput.mock.calls.find((call: string[]) => call[0] === "results")?.[1] as string,
			);
			expect(results[0].message).toContain("Package not found in registry");
		});

		it("should handle provenance configuration error", async () => {
			process.env.PACKAGE_MANAGER = "pnpm";

			let execCallCount = 0;

			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;

				if (execCallCount === 1) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/pkg-prov-error", newVersion: "1.0.0", type: "minor" }],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 2) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									dependencies: {
										"@test/pkg-prov-error": {
											path: "packages/pkg-prov-error",
										},
									},
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 3) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg-prov-error",
									version: "1.0.0",
									publishConfig: { access: "public" },
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 4) {
					const stderr = options?.listeners?.stderr;
					if (stderr) {
						stderr(Buffer.from("provenance statement generation failed"));
					}
					return 1;
				}

				return 0;
			});

			await validatePublishNPM({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				octokit: mockGithub as never,
				context: mockContext as never,
				glob: { create: vi.fn() } as never,
				io: { cp: vi.fn(), mv: vi.fn(), rmRF: vi.fn(), mkdirP: vi.fn(), which: vi.fn() } as never,
			});

			const results = JSON.parse(
				mockCore.setOutput.mock.calls.find((call: string[]) => call[0] === "results")?.[1] as string,
			);
			expect(results[0].message).toContain("Provenance configuration issue");
		});

		it("should handle generic publish error", async () => {
			process.env.PACKAGE_MANAGER = "pnpm";

			let execCallCount = 0;

			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;

				if (execCallCount === 1) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/pkg-generic", newVersion: "1.0.0", type: "minor" }],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 2) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									dependencies: {
										"@test/pkg-generic": {
											path: "packages/pkg-generic",
										},
									},
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 3) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg-generic",
									version: "1.0.0",
									publishConfig: { access: "public" },
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 4) {
					const stderr = options?.listeners?.stderr;
					if (stderr) {
						stderr(Buffer.from("Some unexpected error occurred\nWith multiple lines"));
					}
					return 1;
				}

				return 0;
			});

			await validatePublishNPM({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				octokit: mockGithub as never,
				context: mockContext as never,
				glob: { create: vi.fn() } as never,
				io: { cp: vi.fn(), mv: vi.fn(), rmRF: vi.fn(), mkdirP: vi.fn(), which: vi.fn() } as never,
			});

			const results = JSON.parse(
				mockCore.setOutput.mock.calls.find((call: string[]) => call[0] === "results")?.[1] as string,
			);
			expect(results[0].message).toContain("Publish validation failed: Some unexpected error occurred");
		});

		it("should handle non-Error exception in npm publish", async () => {
			process.env.PACKAGE_MANAGER = "pnpm";

			let execCallCount = 0;

			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;

				if (execCallCount === 1) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/pkg-non-error", newVersion: "1.0.0", type: "minor" }],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 2) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									dependencies: {
										"@test/pkg-non-error": {
											path: "packages/pkg-non-error",
										},
									},
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 3) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg-non-error",
									version: "1.0.0",
									publishConfig: { access: "public" },
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 4) {
					throw "string error from npm publish";
				}

				return 0;
			});

			await validatePublishNPM({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				octokit: mockGithub as never,
				context: mockContext as never,
				glob: { create: vi.fn() } as never,
				io: { cp: vi.fn(), mv: vi.fn(), rmRF: vi.fn(), mkdirP: vi.fn(), which: vi.fn() } as never,
			});

			const results = JSON.parse(
				mockCore.setOutput.mock.calls.find((call: string[]) => call[0] === "results")?.[1] as string,
			);
			expect(results[0].canPublish).toBe(false);
		});

		it("should detect version conflict in stdout", async () => {
			process.env.PACKAGE_MANAGER = "pnpm";

			let execCallCount = 0;

			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;

				if (execCallCount === 1) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/pkg-conflict-stdout", newVersion: "1.0.0", type: "minor" }],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 2) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									dependencies: {
										"@test/pkg-conflict-stdout": {
											path: "packages/pkg-conflict-stdout",
										},
									},
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 3) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg-conflict-stdout",
									version: "1.0.0",
									publishConfig: { access: "public" },
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 4) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(Buffer.from("cannot publish over previously published version 1.0.0"));
					}
					return 0;
				}

				return 0;
			});

			await validatePublishNPM({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				octokit: mockGithub as never,
				context: mockContext as never,
				glob: { create: vi.fn() } as never,
				io: { cp: vi.fn(), mv: vi.fn(), rmRF: vi.fn(), mkdirP: vi.fn(), which: vi.fn() } as never,
			});

			const results = JSON.parse(
				mockCore.setOutput.mock.calls.find((call: string[]) => call[0] === "results")?.[1] as string,
			);
			expect(results[0].canPublish).toBe(false);
			expect(results[0].message).toContain("Version conflict");
		});

		it("should handle non-Error exception in npm list", async () => {
			process.env.PACKAGE_MANAGER = "pnpm";

			let execCallCount = 0;

			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;

				if (execCallCount === 1) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/pkg-list-error", newVersion: "1.0.0", type: "minor" }],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 2) {
					throw "string error from npm list";
				}

				// Fallback test commands should fail
				if (_cmd === "test") {
					return 1;
				}

				return 0;
			});

			await validatePublishNPM({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				octokit: mockGithub as never,
				context: mockContext as never,
				glob: { create: vi.fn() } as never,
				io: { cp: vi.fn(), mv: vi.fn(), rmRF: vi.fn(), mkdirP: vi.fn(), which: vi.fn() } as never,
			});

			// Should still call warning about not finding path
			expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining("Could not find path for package"));
		});

		it("should find package using fallback path with test command", async () => {
			process.env.PACKAGE_MANAGER = "pnpm";

			let execCallCount = 0;

			mockExec.exec.mockImplementation(async (cmd, _args, options) => {
				execCallCount++;

				if (execCallCount === 1) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/pkg-fallback", newVersion: "1.0.0", type: "minor" }],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 2) {
					// npm list returns empty
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(Buffer.from(JSON.stringify({ dependencies: {} })));
					}
					return 0;
				}

				// First fallback test command succeeds
				if (cmd === "test" && execCallCount === 3) {
					return 0; // Found!
				}

				// Read package.json from fallback path
				if (execCallCount === 4) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg-fallback",
									version: "1.0.0",
									publishConfig: { access: "public" },
								}),
							),
						);
					}
					return 0;
				}

				// npm publish dry-run
				if (execCallCount === 5) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(Buffer.from(JSON.stringify({ id: "@test/pkg-fallback@1.0.0" })));
					}
					return 0;
				}

				return 0;
			});

			await validatePublishNPM({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				octokit: mockGithub as never,
				context: mockContext as never,
				glob: { create: vi.fn() } as never,
				io: { cp: vi.fn(), mv: vi.fn(), rmRF: vi.fn(), mkdirP: vi.fn(), which: vi.fn() } as never,
			});

			const results = JSON.parse(
				mockCore.setOutput.mock.calls.find((call: string[]) => call[0] === "results")?.[1] as string,
			);
			expect(results[0].canPublish).toBe(true);
		});

		it("should handle yarn package manager", async () => {
			process.env.PACKAGE_MANAGER = "yarn";

			let execCallCount = 0;

			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;

				if (execCallCount === 1) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									releases: [],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}

				return 0;
			});

			await validatePublishNPM({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				octokit: mockGithub as never,
				context: mockContext as never,
				glob: { create: vi.fn() } as never,
				io: { cp: vi.fn(), mv: vi.fn(), rmRF: vi.fn(), mkdirP: vi.fn(), which: vi.fn() } as never,
			});

			expect(mockExec.exec).toHaveBeenCalledWith("yarn", ["changeset", "status", "--output=json"], expect.any(Object));
		});

		it("should find package in nested dependencies", async () => {
			process.env.PACKAGE_MANAGER = "pnpm";

			let execCallCount = 0;

			mockExec.exec.mockImplementation(async (_cmd, _args, options) => {
				execCallCount++;

				if (execCallCount === 1) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									releases: [{ name: "@test/pkg-nested", newVersion: "1.0.0", type: "minor" }],
									changesets: [],
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 2) {
					// npm list with nested dependencies
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									dependencies: {
										"some-package": {
											dependencies: {
												"@test/pkg-nested": {
													path: "node_modules/some-package/node_modules/@test/pkg-nested",
												},
											},
										},
									},
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 3) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(
							Buffer.from(
								JSON.stringify({
									name: "@test/pkg-nested",
									version: "1.0.0",
									publishConfig: { access: "public" },
								}),
							),
						);
					}
					return 0;
				}

				if (execCallCount === 4) {
					const stdout = options?.listeners?.stdout;
					if (stdout) {
						stdout(Buffer.from(JSON.stringify({ id: "@test/pkg-nested@1.0.0" })));
					}
					return 0;
				}

				return 0;
			});

			await validatePublishNPM({
				core: mockCore as never,
				exec: mockExec as never,
				github: mockGithub as never,
				octokit: mockGithub as never,
				context: mockContext as never,
				glob: { create: vi.fn() } as never,
				io: { cp: vi.fn(), mv: vi.fn(), rmRF: vi.fn(), mkdirP: vi.fn(), which: vi.fn() } as never,
			});

			const results = JSON.parse(
				mockCore.setOutput.mock.calls.find((call: string[]) => call[0] === "results")?.[1] as string,
			);
			expect(results[0].canPublish).toBe(true);
		});
	});
});
