/**
 * Case-level runner.
 */

import type { AdapterDiagnostics, AdapterResult, BaseAdapterConfig } from "../adapters/types";
import { getDefaultAdapter } from "../adapters/registry";
import { resolveRunConfig } from "../config/resolve-config";
import { evaluateAll } from "../assertions/evaluator";
import type {
  AssertionStat,
  CellReport,
  MatrixCell,
  RepetitionError,
  RepetitionResult,
  TestCase,
  TestSuite,
} from "./types";

/** Default repetition count when `case.repetitions` is omitted. */
export const DEFAULT_REPETITIONS = 5;

/** Default assertion pass-rate threshold when `threshold` is omitted. */
export const DEFAULT_THRESHOLD = 1.0;

export type AdapterRunFn = (
  config: BaseAdapterConfig & Record<string, unknown>,
) => Promise<AdapterResult>;

/**
 * Build the effective adapter config for one (suite, case, cell).
 *
 * Merge order (later wins): defaultConfig < case.config < cell.config.
 */
export function mergeConfig(
  suite: TestSuite,
  testCase: TestCase,
  cell: MatrixCell,
): BaseAdapterConfig & Record<string, unknown> {
  const adapterId = suite.adapter ?? getDefaultAdapter().id;
  const layers = [
    suite.defaultConfig ?? {},
    testCase.config ?? {},
    cell.config,
  ];
  return resolveRunConfig(adapterId, layers, testCase.prompt);
}

export function getRepetitions(testCase: TestCase): number {
  return testCase.repetitions ?? DEFAULT_REPETITIONS;
}

export async function runRepetition(
  testCase: TestCase,
  _cell: MatrixCell,
  config: BaseAdapterConfig & Record<string, unknown>,
  repetitionIndex: number,
  run: AdapterRunFn,
  signal?: AbortSignal,
): Promise<RepetitionResult> {
  const startTs = Date.now();

  try {
    const adapterResult = await run({
      ...config,
      signal: signal ?? config.signal,
    });

    const assertionResults = evaluateAll(
      adapterResult.view,
      testCase.assertions.map((t) => t.assertion),
    );

    return {
      repetitionIndex,
      adapterResult,
      error: null,
      assertionResults,
      durationMs: Date.now() - startTs,
    };
  } catch (err) {
    return {
      repetitionIndex,
      adapterResult: null,
      error: extractError(err),
      assertionResults: [],
      durationMs: Date.now() - startTs,
    };
  }
}

function extractError(err: unknown): RepetitionError {
  const message = err instanceof Error ? err.message : String(err);

  let diagnostics: Partial<AdapterDiagnostics> = {};
  if (err !== null && typeof err === "object" && "diagnostics" in err) {
    const d = (err as { diagnostics: unknown }).diagnostics;
    if (d !== null && typeof d === "object") {
      diagnostics = d as Partial<AdapterDiagnostics>;
    }
  }

  return { message, diagnostics };
}

export function aggregateCell(
  testCase: TestCase,
  cell: MatrixCell,
  repetitions: RepetitionResult[],
): CellReport {
  const adapterErrors = repetitions.filter((r) => r.error !== null).length;
  const evaluatedReps = repetitions.filter((r) => r.error === null);

  const assertionStats: AssertionStat[] = testCase.assertions.map(
    (thresholded, i) => {
      const threshold = thresholded.threshold ?? DEFAULT_THRESHOLD;
      const passedCount = evaluatedReps.filter(
        (r) => r.assertionResults[i]?.passed,
      ).length;
      const evaluatedCount = evaluatedReps.length;
      const passRate = evaluatedCount === 0 ? 0 : passedCount / evaluatedCount;

      const description =
        evaluatedReps[0]?.assertionResults[i]?.description ??
        `(${thresholded.assertion.type})`;

      return {
        description,
        threshold,
        passedCount,
        evaluatedCount,
        passRate,
        meetsThreshold: evaluatedCount > 0 && passRate >= threshold,
      };
    },
  );

  const passed = assertionStats.every((s) => s.meetsThreshold);

  return {
    caseId: testCase.id,
    category: testCase.category,
    notes: testCase.notes,
    prompt: testCase.prompt,
    expectations: testCase.expectations,
    reference_trajectory: testCase.reference_trajectory,
    human_ratings: testCase.human_ratings,
    cell,
    repetitions,
    assertionStats,
    adapterErrors,
    passed,
  };
}
