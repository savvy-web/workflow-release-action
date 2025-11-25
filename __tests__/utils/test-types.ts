import type { ExecOptions } from "@actions/exec";
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
		};
		git?: {
			getRef: ReturnType<typeof vi.fn>;
		};
		repos: {
			getBranch: ReturnType<typeof vi.fn>;
		};
		pulls: {
			list: ReturnType<typeof vi.fn>;
		};
		issues: {
			listComments: ReturnType<typeof vi.fn>;
			createComment: ReturnType<typeof vi.fn>;
			updateComment: ReturnType<typeof vi.fn>;
		};
	};
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
