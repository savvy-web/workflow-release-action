import type { ExecOptions } from "@actions/exec";
// biome-ignore lint/correctness/noUndeclaredDependencies: only used for type definitions in tests
import type { vi } from "vitest";

/**
 * Mock Octokit type for tests
 * Only includes the API methods we actually mock in tests
 * All properties are required to ensure mocks are properly set up
 */
export interface MockOctokit {
	rest: {
		checks: {
			create: ReturnType<typeof vi.fn>;
			update: ReturnType<typeof vi.fn>;
			get: ReturnType<typeof vi.fn>;
		};
		git?: {
			getRef: ReturnType<typeof vi.fn>;
		};
		repos: {
			get: ReturnType<typeof vi.fn>;
			getBranch: ReturnType<typeof vi.fn>;
			compareCommits: ReturnType<typeof vi.fn>;
			listPullRequestsAssociatedWithCommit: ReturnType<typeof vi.fn>;
			listTags: ReturnType<typeof vi.fn>;
			listCommits: ReturnType<typeof vi.fn>;
		};
		pulls: {
			list: ReturnType<typeof vi.fn>;
			get: ReturnType<typeof vi.fn>;
			create: ReturnType<typeof vi.fn>;
			update: ReturnType<typeof vi.fn>;
		};
		issues: {
			listComments: ReturnType<typeof vi.fn>;
			createComment: ReturnType<typeof vi.fn>;
			updateComment: ReturnType<typeof vi.fn>;
			addLabels: ReturnType<typeof vi.fn>;
			get: ReturnType<typeof vi.fn>;
			update: ReturnType<typeof vi.fn>;
		};
	};
	/** GraphQL API method */
	graphql: ReturnType<typeof vi.fn>;
}

/**
 * Exec options with listeners for testing
 */
export type ExecOptionsWithListeners = ExecOptions & {
	listeners?: {
		stdout?: (data: Buffer) => void;
		stderr?: (data: Buffer) => void;
	};
};

/**
 * Type guard to check if return value is Octokit
 */
export function isMockOctokit(value: unknown): value is MockOctokit {
	return typeof value === "object" && value !== null && "rest" in value;
}
