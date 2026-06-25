---
type: Reference
title: Library API
description: Programmatic TypeScript / JavaScript API for loading suites, running evals, grading outcomes, and building envelopes.
tags: [api, typescript, programmatic, reference]
timestamp: 2026-06-24T00:00:00Z
---

# Package entry points

```typescript
import { ... } from "@alis-build/harness-eval";               // main API
import { ... } from "@alis-build/harness-eval/runner";         // runner internals
import { ... } from "@alis-build/harness-eval/config";         // config loading
import { ... } from "@alis-build/harness-eval/adapters/claude-code"; // Claude types
import { ... } from "@alis-build/harness-eval/adapters/codex";      // Codex types
import { ... } from "@alis-build/harness-eval/adapters/gemini-cli"; // Gemini CLI types
```

---

# Core workflow

## loadSuite

```typescript
import { loadSuite } from "@alis-build/harness-eval/config";

const suite: TestSuite = await loadSuite("./examples/basic.yaml");
```

Reads, validates, and transforms a suite YAML into a `TestSuite` runtime object. Throws if the YAML is invalid or missing required fields.

## loadSuiteDocument

```typescript
import { loadSuiteDocument } from "@alis-build/harness-eval";

const doc = await loadSuiteDocument("./examples/pipeline/suite.yaml");
// doc.suite — TestSuite
// doc.judge? — inline grading config (same shape as grading.yaml)
// doc.pipeline? — run / grade / envelope artifact paths
// doc.suitePath — resolved path to the suite file
```

Use when a single `suite.yaml` colocates harness config, optional inline **`judge:`**, and optional **`pipeline:`** orchestration. `loadSuite(path)` remains valid for harness-only YAML (ignores `judge` / `pipeline` blocks).

**Options:**

```typescript
await loadSuite("./suite.yaml", {
  cwd?: string;   // resolve relative paths from this directory (default: suite file dir)
});
```

## runSuite

```typescript
import { runSuite } from "@alis-build/harness-eval";

const report: SuiteReport = await runSuite(suite, {
  maxConcurrent?: number;    // default 4
  adapter?: string;          // override adapter ID
  onProgress?: (event: ProgressEvent) => void;
});
```

Executes the suite: fans out across all `(case × cell × rep)` combinations and returns a `SuiteReport`. The `onProgress` callback receives real-time progress events.

**Example:**

```typescript
const suite = await loadSuite("./examples/matrix.yaml");
const report = await runSuite(suite, {
  maxConcurrent: 2,
  onProgress: (e) => console.error(e.type, e.label ?? ""),
});

console.log(`Cells: ${report.cells.length}, all passed: ${report.cells.every((c) => c.passed)}`);
```

---

# Pipeline orchestration

## runPipeline

```typescript
import { loadSuiteDocument, runPipeline } from "@alis-build/harness-eval";

const doc = await loadSuiteDocument("./my-suite/suite.yaml");
const result = await runPipeline(doc, {
  steps?: "run,grade,envelope";  // default: all configured steps
  maxConcurrent?: number;
  overrides?: {
    run?: { output?: string; maxConcurrent?: number };
    grade?: { input?: string; output?: string; maxConcurrent?: number };
    envelope?: {
      report?: string;
      grading?: string;
      output?: string;
      projection?: "envelope" | "trajectory" | "instances";
    };
  };
  onRunProgress?: ProgressCallback;
  onGradeProgress?: GradeProgressCallback;
});

// result.exitCode — 0 when all executed steps passed
// result.stepsRun — ["run", "grade", "envelope"]
// result.runReport — SuiteReport when run step executed
```

Requires a `pipeline:` block on the suite document. Stops on the first failing step.

## resolvePipelineInputs

```typescript
import { resolvePipelineInputs } from "@alis-build/harness-eval";

const resolved = await resolvePipelineInputs({
  suitePath: doc.suitePath,
  suiteDir: dirname(doc.suitePath),
  pipeline: doc.pipeline!,
  steps: ["grade"],
  executed: { run: { output: "./report.json" } },
  overrides: { grade: { input: "./custom-report.json" } },
});
```

Low-level helper for artifact path resolution (CLI flags > YAML > prior step output > existing default path).

## resolveGradingArtifactFromSuite

```typescript
import { resolveGradingArtifactFromSuite } from "@alis-build/harness-eval";

const gradingPath = await resolveGradingArtifactFromSuite("./my-suite/suite.yaml");
// undefined when no pipeline block or grading file missing on disk
```

Resolves a grading JSON path from a unified suite's `pipeline.envelope.grading` or default `pipeline.grade.output` when the file exists. Used by `harness-eval envelope --suite` when `--grading` is omitted.

---

# Grading

## loadGradingConfig

```typescript
import { loadGradingConfig } from "@alis-build/harness-eval/config";

const gradingConfig = await loadGradingConfig("./examples/grading.yaml");
```

Reads and validates a grading YAML file. Returns a `GradingConfig` object.

## resolveGradeOptions

```typescript
import { resolveGradeOptions } from "@alis-build/harness-eval";

const options = resolveGradeOptions(gradingConfig, {
  model?: string;
  timeoutMs?: number;
  maxConcurrent?: number;
});
```

Merges CLI overrides into a `GradingConfig` to produce `GradeReportOptions`.

## gradeReport

```typescript
import { gradeReport } from "@alis-build/harness-eval";

const grading: SuiteGradingReport = await gradeReport(report, options);
```

Runs the outcome judge for each `(case, cell, rep)` that has `expectations`. By default uses the built-in Claude grader.

**Custom judge function:**

```typescript
const grading = await gradeReport(report, {
  gradeFn: async ({ prompt, transcript, expectations }) => {
    // Your own judge logic
    const results = await myEvalService.score(transcript, expectations);
    return {
      expectations: results.map(r => ({
        expectation: r.text,
        passed: r.score >= 0.7,
        score: r.score,
        rationale: r.explanation,
      })),
      summary: {
        total: results.length,
        passed: results.filter(r => r.score >= 0.7).length,
      },
    };
  },
});
```

## gradingReportPassed

```typescript
import { gradingReportPassed } from "@alis-build/harness-eval";

if (!gradingReportPassed(grading)) {
  process.exit(1);
}
```

Returns `true` if all expectations in the grading report passed.

---

# Envelope building

## buildEvalRunEnvelope

```typescript
import { buildEvalRunEnvelope } from "@alis-build/harness-eval";

const envelope: EvalRunEnvelope = buildEvalRunEnvelope(report, {
  grading?: SuiteGradingReport;
  suite?: {
    uri?: string;
    id?: string;
    contentHash?: string;
  };
  provenance?: {
    git?: { commit: string; branch?: string; repository?: string };
    ci?: { provider: string; jobId?: string; pipelineUrl?: string };
    pluginVersion?: string;
    triggeredBy?: string;
  };
  includeRawStreamEvents?: boolean;  // default false
  includeTranscript?: boolean;       // default true
});
```

## buildEvalRunEnvelopeFromFiles

```typescript
import { buildEvalRunEnvelopeFromFiles } from "@alis-build/harness-eval";

const envelope = await buildEvalRunEnvelopeFromFiles(
  "./report.json",
  {
    gradingPath?: "./grading.json",
    suitePath?: "./suite.yaml",
    provenance?: { ... },
  }
);
```

Convenience function that reads `report.json` (and optionally `grading.json`) from disk.

---

# Trajectory utilities

## trajectoryToTranscript

```typescript
import { trajectoryToTranscript } from "@alis-build/harness-eval";

const transcript: string = trajectoryToTranscript(view, prompt);
```

Converts a `TrajectoryView` into a human-readable text transcript. The transcript includes the user prompt, all assistant turns, tool calls (with truncated args), and tool results. Used by the grader to build judge prompts.

---

# OTLP export

## trajectoryToOtlp

```typescript
import { trajectoryToOtlp } from "@alis-build/harness-eval";

const otlp: ExportTraceServiceRequest = trajectoryToOtlp(view, {
  prompt: string;
  caseId?: string;
  cellLabel?: string;
  runId?: string;
});
```

Converts a `TrajectoryView` to an OpenTelemetry `ExportTraceServiceRequest`. Each tool call becomes a span.

## emitOtel

```typescript
import { emitOtel } from "@alis-build/harness-eval";

await emitOtel(otlp, {
  endpoint: "http://localhost:4318/v1/traces";
  headers?: Record<string, string>;
});
```

POSTs an OTLP payload to an OpenTelemetry collector endpoint.

---

# Key types

```typescript
// Suite / runner
import type {
  TestSuite,
  TestCase,
  SuiteReport,
  CellReport,
  RepetitionResult,
  EvalAssertionStat,
} from "@alis-build/harness-eval";

// Trajectory
import type { TrajectoryView, ToolCall, UsageSummary } from "@alis-build/harness-eval";

// Assertions
import type { Assertion, Predicate, AssertionResult } from "@alis-build/harness-eval";

// Eval record
import type {
  EvalRunEnvelope,
  EvalCellResult,
  EvalRepetition,
  OutcomeGrades,
  ExternalScore,
} from "@alis-build/harness-eval";

// Grading
import type {
  GraderFn,
  GraderInput,
  GraderOutput,
  SuiteGradingReport,
} from "@alis-build/harness-eval";
```

---

# Complete example

**Unified suite (recommended):**

```typescript
import { loadSuiteDocument, runPipeline } from "@alis-build/harness-eval";

const doc = await loadSuiteDocument("./my-suite/suite.yaml");
const { exitCode } = await runPipeline(doc, { maxConcurrent: 4 });
process.exit(exitCode);
```

**Separate commands (legacy layout with standalone `grading.yaml`):**

```typescript
import { loadSuite, loadGradingConfig } from "@alis-build/harness-eval/config";
import {
  runSuite,
  gradeReport,
  resolveGradeOptions,
  buildEvalRunEnvelope,
  gradingReportPassed,
} from "@alis-build/harness-eval";
import { writeFileSync } from "node:fs";

// 1. Load suite
const suite = await loadSuite("./suite.yaml");

// 2. Run behavioral eval
const report = await runSuite(suite, { maxConcurrent: 4 });
writeFileSync("report.json", JSON.stringify(report, null, 2));

// 3. Run outcome grading (optional)
const gradingConfig = await loadGradingConfig("./grading.yaml");
const grading = await gradeReport(report, resolveGradeOptions(gradingConfig));
writeFileSync("grading.json", JSON.stringify(grading, null, 2));

// 4. Build versioned envelope
const envelope = buildEvalRunEnvelope(report, {
  grading,
  suite: { uri: "./suite.yaml" },
  provenance: {
    git: { commit: process.env.GITHUB_SHA ?? "local" },
  },
});
writeFileSync("envelope.json", JSON.stringify(envelope, null, 2));

// 5. Exit with appropriate code
const behavioralPass = report.cells.every((c) => c.passed);
const outcomePass = gradingReportPassed(grading);
process.exit(behavioralPass && outcomePass ? 0 : 1);
```

# Citations

[1] `src/index.ts` — main public API exports
[2] `src/config/loader.ts` — loadSuite, loadSuiteDocument
[3] `src/pipeline/run-pipeline.ts` — runPipeline
[4] `src/pipeline/resolve-inputs.ts` — resolvePipelineInputs
[5] `src/runner/suite.ts` — runSuite
[6] `src/grader/grade-report.ts` — gradeReport
[7] `src/eval-record/build.ts` — buildEvalRunEnvelope
[8] `src/grader/transcript.ts` — trajectoryToTranscript
[9] `src/otel/emitter.ts` — trajectoryToOtlp, emitOtel
