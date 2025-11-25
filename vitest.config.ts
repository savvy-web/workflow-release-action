import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["**/__tests__/**/*.test.ts"],
		exclude: ["**/node_modules/**", "**/dist/**"],
		globalSetup: "./vitest.setup.ts",
		testTimeout: 30000,
		reporters: ["default"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", ["html", { subdir: "report" }]],
			reportsDirectory: "./.coverage",
			// ...coverage,
			// // Merge exclusions from VitestConfig and workspace-specific ones
			exclude: ["__tests__/utils/**/*.ts"],
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
