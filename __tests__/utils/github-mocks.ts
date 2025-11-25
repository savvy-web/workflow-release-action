import { vi } from "vitest";
import type { MockOctokit } from "./test-types.js";

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
	saveState: ReturnType<typeof vi.fn>;
	getState: ReturnType<typeof vi.fn>;
	addPath: ReturnType<typeof vi.fn>;
}

/**
 * Type for mocked @actions/exec module
 */
export interface MockExec {
	exec: ReturnType<typeof vi.fn>;
}

/**
 * Type for mocked @actions/cache module
 */
export interface MockCache {
	restoreCache: ReturnType<typeof vi.fn>;
	saveCache: ReturnType<typeof vi.fn>;
}

/**
 * Type for mocked @actions/tool-cache module
 */
export interface MockToolCache {
	find: ReturnType<typeof vi.fn>;
	downloadTool: ReturnType<typeof vi.fn>;
	extractTar: ReturnType<typeof vi.fn>;
	extractZip: ReturnType<typeof vi.fn>;
	cacheDir: ReturnType<typeof vi.fn>;
	cacheFile: ReturnType<typeof vi.fn>;
}

/**
 * Type for mocked @actions/glob module
 */
export interface MockGlob {
	create: ReturnType<typeof vi.fn>;
}

/**
 * Type for globber instance returned by glob.create
 */
export interface MockGlobber {
	glob: ReturnType<typeof vi.fn>;
}

/**
 * Type for mocked @actions/http-client module
 */
export interface MockHttpClient {
	HttpClient: new (
		userAgent: string,
	) => {
		get: ReturnType<typeof vi.fn>;
	};
}

/**
 * Creates a mock @actions/core module with all commonly used methods
 *
 * @returns Mock core module
 *
 * @example
 * ```typescript
 * const mockCore = createMockCore();
 * vi.mocked(core).getInput.mockReturnValue("test-value");
 * ```
 */
export function createMockCore(): MockCore {
	return {
		getInput: vi.fn().mockReturnValue(""),
		setOutput: vi.fn(),
		info: vi.fn(),
		notice: vi.fn(),
		warning: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		setFailed: vi.fn(),
		startGroup: vi.fn(),
		endGroup: vi.fn(),
		saveState: vi.fn(),
		getState: vi.fn().mockReturnValue(""),
		addPath: vi.fn(),
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
 * await exec.exec("npm", ["install"]);
 * expect(mockExec.exec).toHaveBeenCalledWith("npm", ["install"]);
 * ```
 */
export function createMockExec(defaultReturnValue: number = 0): MockExec {
	return {
		exec: vi.fn().mockResolvedValue(defaultReturnValue),
	};
}

/**
 * Creates a mock @actions/cache module
 *
 * @returns Mock cache module
 *
 * @example
 * ```typescript
 * const mockCache = createMockCache();
 * mockCache.restoreCache.mockResolvedValue("cache-key-123");
 * ```
 */
export function createMockCache(): MockCache {
	return {
		restoreCache: vi.fn().mockResolvedValue(undefined),
		saveCache: vi.fn().mockResolvedValue(1),
	};
}

/**
 * Creates a mock @actions/tool-cache module
 *
 * @returns Mock tool-cache module
 *
 * @example
 * ```typescript
 * const mockToolCache = createMockToolCache();
 * mockToolCache.find.mockReturnValue("/path/to/cached/tool");
 * ```
 */
export function createMockToolCache(): MockToolCache {
	return {
		find: vi.fn().mockReturnValue(""),
		downloadTool: vi.fn().mockResolvedValue("/tmp/downloaded-tool"),
		extractTar: vi.fn().mockResolvedValue("/tmp/extracted"),
		extractZip: vi.fn().mockResolvedValue("/tmp/extracted"),
		cacheDir: vi.fn().mockResolvedValue("/cached/dir"),
		cacheFile: vi.fn().mockResolvedValue("/cached/file"),
	};
}

/**
 * Creates a mock globber instance
 *
 * @param files - Files to return from glob() (default: [])
 * @returns Mock globber instance
 */
export function createMockGlobber(files: string[] = []): MockGlobber {
	return {
		glob: vi.fn().mockResolvedValue(files),
	};
}

/**
 * Creates a mock @actions/glob module
 *
 * @param files - Files to return from globber.glob() (default: [])
 * @returns Mock glob module
 *
 * @example
 * ```typescript
 * const mockGlob = createMockGlob(["pnpm-lock.yaml"]);
 * const globber = await glob.create("**\/pnpm-lock.yaml");
 * const files = await globber.glob();
 * expect(files).toEqual(["pnpm-lock.yaml"]);
 * ```
 */
export function createMockGlob(files: string[] = []): MockGlob {
	return {
		create: vi.fn().mockResolvedValue(createMockGlobber(files)),
	};
}

/**
 * Creates a mock @actions/http-client module
 *
 * @param responseBody - Response body to return from get() (default: "{}")
 * @returns Mock http-client module
 *
 * @example
 * ```typescript
 * const mockHttp = createMockHttpClient('{"versions": []}');
 * const client = new HttpClient("my-agent");
 * const response = await client.get("https://example.com");
 * const body = await response.readBody();
 * expect(body).toBe('{"versions": []}');
 * ```
 */
export function createMockHttpClient(responseBody: string = "{}"): MockHttpClient {
	return {
		HttpClient: vi.fn().mockImplementation(() => ({
			get: vi.fn().mockResolvedValue({
				readBody: vi.fn().mockResolvedValue(responseBody),
			}),
		})),
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
 * Creates a mock Octokit instance with all commonly used API methods
 *
 * @returns Mock Octokit instance with fully initialized rest API
 *
 * @example
 * ```typescript
 * const mockOctokit = createMockOctokit();
 * mockOctokit.rest.repos.getBranch.mockResolvedValue({
 *   data: { name: "main" }
 * });
 * vi.mocked(getOctokit).mockReturnValue(mockOctokit as unknown as ReturnType<typeof getOctokit>);
 * ```
 */
export function createMockOctokit(): MockOctokit {
	return {
		rest: {
			checks: {
				create: vi.fn().mockResolvedValue({ data: { id: 12345 } }),
				update: vi.fn().mockResolvedValue({ data: { id: 12345 } }),
			},
			repos: {
				getBranch: vi.fn(),
			},
			pulls: {
				list: vi.fn(),
			},
			issues: {
				listComments: vi.fn(),
				createComment: vi.fn(),
				updateComment: vi.fn(),
			},
		},
	};
}
