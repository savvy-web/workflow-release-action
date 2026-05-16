// biome-ignore lint/correctness/noUndeclaredDependencies: only used in tests
import { vi } from "vitest";

/**
 * Suppresses console output during tests.
 *
 * Mocks `process.stdout.write` and `process.stderr.write` to prevent test
 * output noise from code that logs through the `_actions-compat` shim.
 *
 * @remarks
 * Call this in `beforeEach()`; the mocks are restored by `vi.restoreAllMocks()`
 * in `afterEach()` (see {@link cleanupTestEnvironment}).
 */
export function suppressConsoleOutput(): void {
	vi.spyOn(process.stdout, "write").mockImplementation(() => true);
	vi.spyOn(process.stderr, "write").mockImplementation(() => true);
}

/**
 * Sets up a clean test environment.
 *
 * Clears all mocks and optionally suppresses console output.
 *
 * @param options - Configuration options.
 * @param options.suppressOutput - Whether to suppress console output (default: false).
 */
export function setupTestEnvironment(options: { suppressOutput?: boolean } = {}): void {
	vi.clearAllMocks();

	if (options.suppressOutput) {
		suppressConsoleOutput();
	}
}

/**
 * Cleans up the test environment by restoring all mocked functions.
 *
 * @remarks
 * Call this in `afterEach()` to ensure clean state between tests.
 */
export function cleanupTestEnvironment(): void {
	vi.restoreAllMocks();
}
