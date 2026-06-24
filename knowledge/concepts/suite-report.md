---
type: Concept
title: SuiteReport
description: The full output of a harness-eval run — trajectories, assertion stats, and per-cell results for every (case × cell × rep) combination.
tags: [data-model, report, assertions, results]
timestamp: 2026-06-24T00:00:00Z
---

# What is a SuiteReport?

A `SuiteReport` is the complete output of `harness-eval run`. It contains every trajectory captured, every assertion result, and aggregated statistics for every `(case × cell)` combination. It is the primary artifact consumed by `harness-eval grade` and `harness-eval envelope`.

The report is written to disk as `report.json` when `--output <path>` is passed to `harness-eval run`.

# Schema

```typescript
interface SuiteReport {
  startedAt: string;          // ISO 8601
  durationMs: number;         // wall-clock duration of the full run
  cells: CellReport[];        // one entry per (case × cell) pair
  summary: SuiteSummary;
}

interface SuiteSummary {
  cellsTotal: number;
  cellsPassed: number;        // cells where all assertions met their thresholds
  adapterErrors: number;      // total harness crashes/timeouts across all reps
}
```

## CellReport

A `CellReport` represents one `(case × cell)` pair — all repetitions for a single test case under a single matrix cell configuration.

```typescript
interface CellReport {
  caseId: string;             // from suite YAML: cases[].id
  cellLabel: string;          // from suite YAML: matrix[].label
  prompt: string;             // the prompt sent to the harness
  config: ResolvedConfig;     // final merged config used for this cell
  expectations?: string[];    // outcome expectations (for grading)
  repetitions: RepetitionResult[];
  assertionStats: EvalAssertionStat[];
  adapterErrors: number;      // reps where the harness crashed or timed out
  passed: boolean;            // true if all assertions met their thresholds
}
```

## RepetitionResult

One execution of the harness for a `(case, cell)` pair.

```typescript
interface RepetitionResult {
  repetitionIndex: number;    // 0-based
  adapterResult: AdapterResult | null;  // null if the harness crashed
  error: RepetitionError | null;        // non-null if harness error occurred
  assertionResults: AssertionResult[];  // one per assertion in the case
  durationMs: number;
}

interface AdapterResult {
  view: TrajectoryView;
  rawStreamEvents?: StreamEvent[];      // optional debug data
}

interface RepetitionError {
  type: "timeout" | "crash" | "parse_error";
  message: string;
  exitCode?: number;
}
```

## EvalAssertionStat

Aggregated assertion statistics across all repetitions for a `(case, cell)` pair.

```typescript
interface EvalAssertionStat {
  assertion: Assertion;           // the assertion definition from YAML
  threshold: number;              // required pass rate (e.g. 0.8)
  passCount: number;              // reps where this assertion passed
  totalCount: number;             // reps where this assertion was evaluated
  passRate: number;               // passCount / totalCount
  passed: boolean;                // passRate >= threshold
}
```

## AssertionResult

The result of evaluating one assertion against one `TrajectoryView`.

```typescript
interface AssertionResult {
  assertion: Assertion;
  passed: boolean;
  evidence?: string;              // human-readable explanation of why it passed/failed
  error?: string;                 // if assertion threw during evaluation
}
```

# Report structure example

For a suite with 2 cases × 2 matrix cells × 3 repetitions:

```
SuiteReport
└── cells: CellReport[4]                   (2 cases × 2 cells)
    ├── CellReport { caseId: "A", cellLabel: "sonnet" }
    │   ├── repetitions: RepetitionResult[3]
    │   │   ├── [0] { view: TrajectoryView, assertionResults: [...] }
    │   │   ├── [1] { view: TrajectoryView, assertionResults: [...] }
    │   │   └── [2] { view: TrajectoryView, assertionResults: [...] }
    │   └── assertionStats: EvalAssertionStat[N]   (N = assertions in case A)
    ├── CellReport { caseId: "A", cellLabel: "opus" }
    │   └── ...
    ├── CellReport { caseId: "B", cellLabel: "sonnet" }
    │   └── ...
    └── CellReport { caseId: "B", cellLabel: "opus" }
        └── ...
```

# How it is used

**Rendering:** `formatReport(report, options)` produces console, markdown, or JSON output. The console format shows per-cell pass/fail status and per-assertion pass rates.

**Baseline comparison:** `--baseline <path>` diffs assertion pass rates between two reports to detect regressions.

**Grading:** `harness-eval grade <report.json>` reads `CellReport.expectations` and `RepetitionResult.adapterResult.view` to run the outcome judge.

**Envelope:** `harness-eval envelope <report.json>` transforms the report into an [`EvalRunEnvelope`](/concepts/eval-run-envelope.md) for storage.

# Citations

[1] `src/runner/types.ts` — SuiteReport, CellReport, RepetitionResult types
[2] `src/assertions/evaluator.ts` — EvalAssertionStat computation
[3] `src/reporter/format-console.ts` — console renderer
[4] `src/eval-record/build.ts` — report → EvalRunEnvelope transformation
