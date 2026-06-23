/**
 * Suite-level runner.
 */

import { getAdapter, getDefaultAdapter } from "../adapters/registry";
import {
  aggregateCell,
  getRepetitions,
  mergeConfig,
  runRepetition,
  type AdapterRunFn,
} from "./case";
import { createLimit } from "./limit";
import type {
  CellReport,
  MatrixCell,
  RepetitionResult,
  RunSuiteOptions,
  SuiteReport,
  TestCase,
  TestSuite,
} from "./types";

const DEFAULT_MAX_CONCURRENT = 4;

interface Task {
  testCase: TestCase;
  cell: MatrixCell;
  repetitionIndex: number;
}

export async function runSuite(
  suite: TestSuite,
  options: RunSuiteOptions = {},
): Promise<SuiteReport> {
  if (suite.matrix.length === 0) {
    throw new Error("runSuite: suite.matrix must contain at least one cell");
  }
  if (suite.cases.length === 0) {
    throw new Error("runSuite: suite.cases must contain at least one case");
  }

  const adapter =
    options.adapter ?? getAdapter(suite.adapter ?? getDefaultAdapter().id);

  const run: AdapterRunFn = (config) => adapter.run(config);

  const maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
  const limit = createLimit(maxConcurrent);
  const onProgress = options.onProgress;

  const startTs = Date.now();
  const startedAt = new Date(startTs).toISOString();

  const tasks: Task[] = [];
  for (const testCase of suite.cases) {
    const reps = getRepetitions(testCase);
    for (const cell of suite.matrix) {
      for (let i = 0; i < reps; i++) {
        tasks.push({ testCase, cell, repetitionIndex: i });
      }
    }
  }

  onProgress?.({ kind: "suite-start", totalReps: tasks.length });

  const buckets = new Map<string, RepetitionResult[]>();
  const bucketKey = (caseId: string, cellLabel: string) =>
    `${caseId}::${cellLabel}`;

  for (const testCase of suite.cases) {
    for (const cell of suite.matrix) {
      buckets.set(bucketKey(testCase.id, cell.label), []);
    }
  }

  await Promise.all(
    tasks.map((task) =>
      limit(async () => {
        if (options.signal?.aborted) return;

        onProgress?.({
          kind: "rep-start",
          caseId: task.testCase.id,
          cellLabel: task.cell.label,
          repIndex: task.repetitionIndex,
        });

        const config = mergeConfig(suite, task.testCase, task.cell);
        const result = await runRepetition(
          task.testCase,
          task.cell,
          config,
          task.repetitionIndex,
          run,
          options.signal,
        );

        buckets.get(bucketKey(task.testCase.id, task.cell.label))!.push(result);

        onProgress?.({
          kind: "rep-complete",
          caseId: task.testCase.id,
          cellLabel: task.cell.label,
          repIndex: task.repetitionIndex,
          ok: result.error === null,
          durationMs: result.durationMs,
          toolCallCount: result.adapterResult?.view.toolCalls.length,
          assertionResults: result.assertionResults,
          errorMessage: result.error?.message,
        });
      }),
    ),
  );

  const cells: CellReport[] = [];
  for (const testCase of suite.cases) {
    for (const cell of suite.matrix) {
      const reps = buckets.get(bucketKey(testCase.id, cell.label)) ?? [];
      reps.sort((a, b) => a.repetitionIndex - b.repetitionIndex);

      const cellReport = aggregateCell(testCase, cell, reps);
      cells.push(cellReport);

      onProgress?.({ kind: "cell-complete", report: cellReport });
    }
  }

  const report: SuiteReport = {
    startedAt,
    durationMs: Date.now() - startTs,
    cells,
  };

  onProgress?.({ kind: "suite-complete", report });

  return report;
}
