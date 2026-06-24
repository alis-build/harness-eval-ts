---
type: Concept
title: EvalRunEnvelope
description: The versioned, self-describing interchange document that carries behavioral and outcome evaluation results for storage in a DB, CI artifact comparison, or API responses.
resource: ../schemas/eval-run-envelope.schema.json
tags: [data-model, interchange, ci-cd, database, versioning]
timestamp: 2026-06-24T00:00:00Z
---

# What is an EvalRunEnvelope?

An `EvalRunEnvelope` is the stable data contract between harness-eval and external systems (databases, CI pipelines, dashboards, APIs). It is produced by `harness-eval envelope` and is designed to be:

- **Versioned** — carries `schemaVersion: "1.0"` and references the published JSON Schema.
- **Self-describing** — includes suite provenance, git/CI provenance, harness metadata, and full cell results.
- **Composable** — behavioral results (from `run`) and outcome grades (from `grade`) can be merged into a single envelope.
- **Stable** — the shape is designed for long-lived storage; the `schemaVersion` field enables consumers to migrate.

# Top-level schema

```typescript
interface EvalRunEnvelope {
  schemaVersion: "1.0";
  runId: string;               // UUID, stable across re-grading of the same run
  startedAt: string;           // ISO 8601
  durationMs: number;
  harness: HarnessInfo;
  summary: RunSummary;
  suite?: SuiteProvenance;
  provenance?: RunProvenance;
  cells: EvalCellResult[];
}
```

## HarnessInfo

```typescript
interface HarnessInfo {
  adapter: string;             // e.g. "claude-code"
  frameworkVersion?: string;   // harness-eval package version
  harnessVersion?: string;     // adapter-specific version (Claude Code version)
}
```

## RunSummary

```typescript
interface RunSummary {
  cellsTotal: number;
  cellsPassed: number;
  behavioralPass: boolean;     // true if all assertions met their thresholds
  outcomePass?: boolean;        // true if all expectations passed (present only if graded)
}
```

## SuiteProvenance

```typescript
interface SuiteProvenance {
  uri?: string;                // path or URL to the suite YAML
  id?: string;                 // suite id field if present
  contentHash?: string;        // SHA-256 of the suite YAML (for exact reproducibility)
}
```

## RunProvenance

```typescript
interface RunProvenance {
  git?: {
    commit: string;
    branch?: string;
    repository?: string;
  };
  ci?: {
    provider: string;          // e.g. "github-actions"
    jobId?: string;
    pipelineUrl?: string;
  };
  pluginVersion?: string;      // MCP plugin/block version under test
  triggeredBy?: string;        // user or system that triggered the run
}
```

## EvalCellResult

One `(case × cell)` entry in the envelope. Corresponds to a `CellReport` from the `SuiteReport`.

```typescript
interface EvalCellResult {
  caseId: string;
  cellLabel: string;
  prompt: string;
  passed: boolean;
  assertionStats: EvalAssertionStat[];
  repetitions: EvalRepetition[];
}
```

## EvalRepetition

The per-repetition unit. This is where behavioral results, outcome grades, and external scores all converge.

```typescript
interface EvalRepetition {
  repetitionIndex: number;
  trajectory?: TrajectoryView & { schemaVersion: "1.0" };
  assertionResults: AssertionResult[];
  outcomeGrades?: OutcomeGrades;        // LLM or custom judge results
  externalScores?: ExternalScore[];     // LangSmith, Braintrust, etc.
  artifacts?: {
    transcript?: string;                // text transcript (for judges)
    rawStreamEvents?: unknown[];         // vendor debug (opt-in)
    otlpTraceUri?: string;
  };
  // Vertex AI protojson (if reference trajectory defined)
  evaluationInstance?: EvaluationInstanceJson;
  trajectoryInstances?: TrajectoryInstancesJson;
  harnessMetrics?: HarnessMetrics;
}
```

## OutcomeGrades

```typescript
interface OutcomeGrades {
  judge: string;               // model or function name
  expectations: GradedExpectation[];
  summary: GradingSummary;
}

interface GradedExpectation {
  expectation: string;         // original expectation text
  passed: boolean;
  score?: number;              // optional 0–1 score
  rationale?: string;          // judge's explanation
}
```

## ExternalScore

```typescript
interface ExternalScore {
  provider: string;            // e.g. "langsmith", "braintrust"
  metric: string;              // e.g. "faithfulness", "correctness"
  score: number;               // typically 0–1
  runUrl?: string;
}
```

# Building an envelope

```bash
harness-eval envelope report.json \
  --output envelope.json \
  --grading grading.json \
  --suite ./examples/basic.yaml
```

Or programmatically:

```typescript
import { buildEvalRunEnvelope } from "@alis-build/harness-eval";

const envelope = buildEvalRunEnvelope(report, {
  grading,
  suite: { uri: "./examples/basic.yaml" },
  provenance: {
    git: { commit: process.env.GITHUB_SHA, branch: process.env.GITHUB_REF_NAME },
    ci: { provider: "github-actions", jobId: process.env.GITHUB_RUN_ID },
    pluginVersion: "1.2.3",
  },
});
```

# Projections

The `--projection` flag selects what the envelope command emits:

| Projection | What is written |
|-----------|----------------|
| `envelope` (default) | Full `EvalRunEnvelope` JSON |
| `trajectory` | Vertex AI trajectory JSONL |
| `instances` | Vertex AI evaluation instances JSONL |

# JSON Schema

Published at:
```
https://raw.githubusercontent.com/alis-build/harness-eval-ts/main/schemas/eval-run-envelope.schema.json
```

See [schema reference](/schemas/eval-run-envelope.md).

# Citations

[1] `src/types/eval-record.ts` — EvalRunEnvelope and related types
[2] `src/eval-record/build.ts` — buildEvalRunEnvelope()
[3] [schemas/eval-run-envelope.schema.json](../schemas/eval-run-envelope.schema.json) — published JSON Schema
[4] `docs/eval-record.md` — interchange document reference
