import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["**/__tests__/**/*.test.ts"],
		exclude: ["**/node_modules/**", "**/dist/**"],
		globalSetup: "./vitest.setup.ts",
		testTimeout: 240000,
		reporters: ["default"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", ["html", { subdir: "report" }]],
			reportsDirectory: "./.coverage",
			// ...coverage,
			// // Merge exclusions from VitestConfig and workspace-specific ones
			exclude: [
				"__tests__/utils/**/*.ts",
				// Anthropic SDK integration is hard to mock in vitest
				"src/utils/generate-pr-description.ts",
				// API commit utility needs GitHub API mocking
				"src/utils/create-api-commit.ts",
				// Publish target is tested indirectly via publish-packages tests (mocked)
				// Direct testing requires complex fs/exec mocking for all code paths
				"src/utils/publish-target.ts",
			],
			enabled: true,
			thresholds: {
				perFile: true, // Enforce thresholds per file instead of globally
				lines: 85,
				functions: 85,
				branches: 85,
				statements: 85,
			},
		},
	},
});
