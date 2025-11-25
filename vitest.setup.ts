/**
 * Global Vitest setup
 * Runs once before all test files
 *
 * @remarks
 * Currently empty - all coverage-related setup (BATS verification, kcov checks,
 * cache clearing) is handled by the KcovCoverageProvider.
 * This file is kept for potential future global setup needs.
 */

import type { TestProject } from "vitest/node";

export async function setup(_project: TestProject): Promise<void> {
	// All setup logic is handled by the coverage provider
	// Keep this function for potential future global setup needs
}
