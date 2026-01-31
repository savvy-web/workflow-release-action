export default {
	extends: ["@commitlint/config-conventional"],
	rules: {
		"body-max-line-length": [2, "always", 300],
		"type-enum": [
			2,
			"always",
			["build", "chore", "ci", "docs", "feat", "fix", "perf", "refactor", "release", "revert", "style", "test"],
		],
	},
};
