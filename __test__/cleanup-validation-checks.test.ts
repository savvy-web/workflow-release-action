/**
 * Tests for the cleanupValidationChecks utility.
 */

import type {
	ActionOutputsTestState,
	CheckRunRecord,
	CheckRunTestState,
} from "@savvy-web/github-action-effects/testing";
import { ActionOutputsTest, CheckRunTest } from "@savvy-web/github-action-effects/testing";
import { Effect, Layer, Logger } from "effect";
import { describe, expect, it } from "vitest";
import type { CleanupResult } from "../src/utils/cleanup-validation-checks.js";
import { cleanupValidationChecks } from "../src/utils/cleanup-validation-checks.js";

interface Fixtures {
	outputsState: ActionOutputsTestState;
	checkRunState: CheckRunTestState;
}

const makeFixtures = (
	params: { runs?: Array<Partial<CheckRunRecord> & { id: number; status: CheckRunRecord["status"] }> } = {},
): Fixtures => {
	const checkRunState = CheckRunTest.empty();
	for (const run of params.runs ?? []) {
		const record: CheckRunRecord = {
			id: run.id,
			name: run.name ?? `check-${run.id}`,
			headSha: run.headSha ?? "abc123",
			htmlUrl: run.htmlUrl ?? `https://github.com/test/checks/${run.id}`,
			status: run.status,
			outputs: run.outputs ?? [],
			...(run.conclusion !== undefined ? { conclusion: run.conclusion } : {}),
		};
		checkRunState.runs.push(record);
		// Keep nextId above any seeded ids
		if (run.id >= checkRunState.nextId) {
			checkRunState.nextId = run.id + 1;
		}
	}

	return {
		outputsState: ActionOutputsTest.empty(),
		checkRunState,
	};
};

const runCleanup = (
	checkIds: ReadonlyArray<number>,
	reason: string,
	dryRun: boolean,
	f: Fixtures,
): Promise<CleanupResult> => {
	const layer = Layer.mergeAll(ActionOutputsTest.layer(f.outputsState), CheckRunTest.layer(f.checkRunState));
	return Effect.runPromise(
		cleanupValidationChecks(checkIds, reason, dryRun).pipe(
			Effect.provide(layer),
			Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
		),
	);
};

describe("cleanupValidationChecks", () => {
	it("cancels an in-progress check run", async () => {
		const f = makeFixtures({
			runs: [{ id: 42, status: "in_progress", name: "Validation Check" }],
		});

		const result = await runCleanup([42], "workflow interrupted", false, f);

		expect(result.cleanedUp).toBe(1);
		expect(result.failed).toBe(0);
		expect(result.errors).toHaveLength(0);

		const run = f.checkRunState.runs.find((r) => r.id === 42);
		expect(run?.status).toBe("completed");
		expect(run?.conclusion).toBe("cancelled");
	});

	it("skips an already-completed check run", async () => {
		const f = makeFixtures({
			runs: [{ id: 99, status: "completed", conclusion: "success", name: "Validation Check" }],
		});

		const result = await runCleanup([99], "workflow interrupted", false, f);

		expect(result.cleanedUp).toBe(0);
		expect(result.failed).toBe(0);
		expect(result.errors).toHaveLength(0);

		// Conclusion must not have been changed
		const run = f.checkRunState.runs.find((r) => r.id === 99);
		expect(run?.conclusion).toBe("success");
	});

	it("dry-run does not mutate check runs but counts the id as cleaned up", async () => {
		const f = makeFixtures({
			runs: [{ id: 7, status: "in_progress", name: "Validation Check" }],
		});

		const result = await runCleanup([7], "dry-run test", true, f);

		expect(result.cleanedUp).toBe(1);
		expect(result.failed).toBe(0);

		// The in-memory record must not have been completed
		const run = f.checkRunState.runs.find((r) => r.id === 7);
		expect(run?.status).toBe("in_progress");
		expect(run?.conclusion).toBeUndefined();
	});

	it("records a failure when a check run cannot be fetched", async () => {
		// No runs seeded — CheckRunTest.get fails for an unknown id.
		const f = makeFixtures();

		const result = await runCleanup([404], "workflow interrupted", false, f);

		expect(result.cleanedUp).toBe(0);
		expect(result.failed).toBe(1);
		expect(result.errors.length).toBeGreaterThan(0);
	});
});
