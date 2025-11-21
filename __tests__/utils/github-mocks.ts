import { vi } from "vitest";
import type { AsyncFunctionArguments } from "../../.github/actions/shared/types.js";

/**
 * Type for mocked @actions/core module
 */
export interface MockCore {
	getInput: ReturnType<typeof vi.fn>;
	setOutput: ReturnType<typeof vi.fn>;
	info: ReturnType<typeof vi.fn>;
	notice: ReturnType<typeof vi.fn>;
	warning: ReturnType<typeof vi.fn>;
	error: ReturnType<typeof vi.fn>;
	debug: ReturnType<typeof vi.fn>;
	setFailed: ReturnType<typeof vi.fn>;
	startGroup: ReturnType<typeof vi.fn>;
	endGroup: ReturnType<typeof vi.fn>;
	summary: {
		addHeading: ReturnType<typeof vi.fn>;
		addRaw: ReturnType<typeof vi.fn>;
		addEOL: ReturnType<typeof vi.fn>;
		addTable: ReturnType<typeof vi.fn>;
		addCodeBlock: ReturnType<typeof vi.fn>;
		stringify: ReturnType<typeof vi.fn>;
		write: ReturnType<typeof vi.fn>;
	};
}

/**
 * Type for mocked @actions/exec module
 */
export interface MockExec {
	exec: ReturnType<typeof vi.fn>;
}

/**
 * Type for mocked GitHub client
 */
export interface MockGithub {
	rest: {
		checks: {
			create: ReturnType<typeof vi.fn>;
		};
		issues: {
			listComments: ReturnType<typeof vi.fn>;
			createComment: ReturnType<typeof vi.fn>;
			updateComment: ReturnType<typeof vi.fn>;
		};
	};
}

/**
 * Type for mocked GitHub context
 */
export interface MockContext {
	repo: {
		owner: string;
		repo: string;
	};
	sha: string;
}

/**
 * Creates a mock @actions/core module with all commonly used methods
 *
 * @returns Mock core module with chainable summary methods
 *
 * @example
 * ```typescript
 * const mockCore = createMockCore();
 * await myAction({ core: mockCore as never });
 * expect(mockCore.setOutput).toHaveBeenCalledWith("result", "success");
 * ```
 */
export function createMockCore(): MockCore {
	// Create chainable summary mock that builds a simple markdown string
	let summaryContent = "";
	const summaryChain = {
		addHeading: vi.fn().mockImplementation((text: string) => {
			summaryContent += `## ${text}\n`;
			return summaryChain;
		}),
		addRaw: vi.fn().mockImplementation((text: string) => {
			summaryContent += `${text}\n`;
			return summaryChain;
		}),
		addEOL: vi.fn().mockImplementation(() => {
			summaryContent += "\n";
			return summaryChain;
		}),
		addTable: vi.fn().mockImplementation((table: unknown[][]) => {
			summaryContent += `Table with ${table.length} rows\n`;
			return summaryChain;
		}),
		addCodeBlock: vi.fn().mockImplementation((code: string) => {
			summaryContent += `\`\`\`\n${code}\n\`\`\`\n`;
			return summaryChain;
		}),
		addList: vi.fn().mockImplementation((items: string[]) => {
			summaryContent += `${items.map((item) => `- ${item}`).join("\n")}\n`;
			return summaryChain;
		}),
		stringify: vi.fn().mockImplementation(() => summaryContent),
		write: vi.fn().mockResolvedValue(undefined),
	};

	return {
		getInput: vi.fn(),
		setOutput: vi.fn(),
		info: vi.fn(),
		notice: vi.fn(),
		warning: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		setFailed: vi.fn(),
		startGroup: vi.fn(),
		endGroup: vi.fn(),
		summary: summaryChain,
	};
}

/**
 * Creates a mock @actions/exec module
 *
 * @param defaultReturnValue - Default return value for exec (default: 0)
 * @returns Mock exec module
 *
 * @example
 * ```typescript
 * const mockExec = createMockExec();
 * await myAction({ exec: mockExec as never });
 * expect(mockExec.exec).toHaveBeenCalledWith("npm", ["build"]);
 * ```
 */
export function createMockExec(defaultReturnValue: number = 0): MockExec {
	return {
		exec: vi.fn().mockResolvedValue(defaultReturnValue),
	};
}

/**
 * Creates a mock GitHub client with checks and issues APIs
 *
 * @param options - Optional configuration for mock responses
 * @param options.checkId - Check run ID to return (default: 12345)
 * @param options.checkUrl - Check run URL to return
 * @param options.commentId - Comment ID to return (default: 67890)
 * @param options.commentUrl - Comment URL to return
 * @returns Mock GitHub client
 *
 * @example
 * ```typescript
 * const mockGithub = createMockGithub({ checkId: 999 });
 * await myAction({ github: mockGithub as never });
 * expect(mockGithub.rest.checks.create).toHaveBeenCalled();
 * ```
 */
export function createMockGithub(
	options: { checkId?: number; checkUrl?: string; commentId?: number; commentUrl?: string } = {},
): MockGithub {
	const checkId = options.checkId ?? 12345;
	const checkUrl = options.checkUrl ?? `https://github.com/owner/repo/runs/${checkId}`;
	const commentId = options.commentId ?? 67890;
	const commentUrl = options.commentUrl ?? `https://github.com/owner/repo/issues/1#issuecomment-${commentId}`;

	return {
		rest: {
			checks: {
				create: vi.fn().mockResolvedValue({
					data: {
						id: checkId,
						html_url: checkUrl,
					},
				}),
			},
			issues: {
				listComments: vi.fn().mockResolvedValue({
					data: [],
				}),
				createComment: vi.fn().mockResolvedValue({
					data: {
						id: commentId,
						html_url: commentUrl,
					},
				}),
				updateComment: vi.fn().mockResolvedValue({
					data: {
						id: commentId,
						html_url: commentUrl,
					},
				}),
			},
		},
	};
}

/**
 * Creates a mock GitHub context
 *
 * @param options - Optional configuration for context
 * @param options.owner - Repository owner (default: "test-owner")
 * @param options.repo - Repository name (default: "test-repo")
 * @param options.sha - Commit SHA (default: "abc123")
 * @returns Mock GitHub context
 *
 * @example
 * ```typescript
 * const mockContext = createMockContext({ owner: "my-org", repo: "my-repo" });
 * await myAction({ context: mockContext as never });
 * ```
 */
export function createMockContext(options: { owner?: string; repo?: string; sha?: string } = {}): MockContext {
	return {
		repo: {
			owner: options.owner ?? "test-owner",
			repo: options.repo ?? "test-repo",
		},
		sha: options.sha ?? "abc123",
	};
}

/**
 * Suppresses console output during tests
 *
 * Mocks process.stdout.write and process.stderr.write to prevent
 * test output noise from actions that log to console.
 *
 * @remarks
 * This should be called in beforeEach() to suppress output for all tests.
 * The mocks are automatically restored by vi.restoreAllMocks() in afterEach().
 *
 * @example
 * ```typescript
 * beforeEach(() => {
 *   suppressConsoleOutput();
 * });
 * ```
 */
export function suppressConsoleOutput(): void {
	vi.spyOn(process.stdout, "write").mockImplementation(() => true);
	vi.spyOn(process.stderr, "write").mockImplementation(() => true);
}

/**
 * Sets up test environment with common configurations
 *
 * Clears all mocks and optionally suppresses console output.
 *
 * @param options - Configuration options
 * @param options.suppressOutput - Whether to suppress console output (default: false)
 *
 * @remarks
 * Call this in beforeEach() to ensure clean test state.
 *
 * @example
 * ```typescript
 * beforeEach(() => {
 *   setupTestEnvironment({ suppressOutput: true });
 * });
 * ```
 */
export function setupTestEnvironment(options: { suppressOutput?: boolean } = {}): void {
	vi.clearAllMocks();

	if (options.suppressOutput) {
		suppressConsoleOutput();
	}
}

/**
 * Cleans up test environment
 *
 * Restores all mocked functions to their original implementations.
 *
 * @remarks
 * Call this in afterEach() to ensure clean state between tests.
 *
 * @example
 * ```typescript
 * afterEach(() => {
 *   cleanupTestEnvironment();
 * });
 * ```
 */
export function cleanupTestEnvironment(): void {
	vi.restoreAllMocks();
}

/**
 * Creates a complete mock AsyncFunctionArguments object
 *
 * @param overrides - Optional overrides for specific properties
 * @returns Mock AsyncFunctionArguments with all required properties
 *
 * @example
 * ```typescript
 * const args = createMockAsyncFunctionArguments({
 *   core: customMockCore,
 *   context: createMockContext({ owner: "my-org" })
 * });
 * await myAction(args as never);
 * ```
 */
/* v8 ignore next -- @preserve */
export function createMockAsyncFunctionArguments(
	overrides: Partial<AsyncFunctionArguments> = {},
): AsyncFunctionArguments {
	const defaultArgs: AsyncFunctionArguments = {
		context: createMockContext() as never,
		core: createMockCore() as never,
		github: createMockGithub() as never,
		octokit: createMockGithub() as never,
		exec: createMockExec() as never,
		glob: { create: vi.fn() } as never,
		io: { cp: vi.fn(), mv: vi.fn(), rmRF: vi.fn(), mkdirP: vi.fn(), which: vi.fn() } as never,
	};

	return {
		...defaultArgs,
		...overrides,
	};
}
