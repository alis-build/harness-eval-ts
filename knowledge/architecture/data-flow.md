---
type: Architecture
title: End-to-End Data Flow
description: How a Suite YAML becomes an EvalRunEnvelope — the full pipeline from config to versioned interchange document.
tags: [architecture, pipeline, data-flow]
timestamp: 2026-06-24T00:00:00Z
---

# Overview

The harness-eval pipeline has five distinct stages. Each stage produces a well-defined data structure that the next stage consumes. Stages 1–3 are always executed; stages 4–5 are optional.

When a suite defines a **`pipeline:`** block, **`harness-eval pipeline`** (or **`runPipeline()`**) orchestrates these stages with shared artifact paths. Otherwise, invoke each CLI command separately.

```
Stage 1: Load
  Suite YAML ──── loadSuiteDocument() / loadSuite() ────────► TestSuite (+ judge, pipeline metadata)

Stage 2: Run
  TestSuite ───── runSuite() ──── HarnessAdapter ──────────► SuiteReport
                   │ (case × cell × rep)      │
                   │                    vendor stream (stdout)
                   │                          │
                   │                   adapter mapEvents()
                   │                          │
                   │                   TrajectoryBuilder
                   │                          │
                   │                    TrajectoryView ◄──── assertions evaluated here
                   │
                   └── concurrency pool (--max-concurrent)

Stage 3: Report
  SuiteReport ─── formatReport() ──────────────────────────► console / markdown / JSON

Stage 4: Grade  [optional]
  SuiteReport ─── gradeReport() ──── Judge subprocess ──────► SuiteGradingReport
                   │ (per cell rep)        │
                   │            trajectoryToTranscript()
                   │                       │
                   │         built-in judge / custom gradeFn

Stage 5: Envelope  [optional]
  SuiteReport ─── buildEvalRunEnvelope() ───────────────────► EvalRunEnvelope
  + GradingReport                                              (versioned, for DB / CI)

Pipeline orchestrator (optional)
  suite.yaml ─── runPipeline() ─── run → grade → envelope ──► artifact paths on disk
                   │ uses resolvePipelineInputs() for path precedence
                   └── stops on first failing step
```

# Stage 1 — Load

`loadSuite(path)` reads a [Suite YAML](/reference/suite-yaml.md) and returns a `TestSuite`. For unified suite files with optional inline **`judge:`** and **`pipeline:`** blocks, use **`loadSuiteDocument(path)`**, which returns `{ suite, judge?, pipeline?, suitePath }`.

This involves:

1. Parsing YAML with the `yaml` library.
2. Validating the parsed object with the Zod schema (`src/config/schema.ts` / `src/config/suite-file-schema.ts`).
3. Resolving config inheritance: `defaultConfig` → `case.config` → `cell.config` (later wins; lists replace, not merge).
4. Transforming raw YAML assertions into typed `Assertion` objects (`src/config/transform.ts`).

**Multi-file suites:** A suite YAML can reference external case files via a `cases` directory. `loadSuite` resolves and merges these automatically. See `examples/multi-file/`.

# Stage 2 — Run

`runSuite(suite, options)` fans out across the full `(case × cell × rep)` product and collects results into a `SuiteReport`.

**Concurrency:** A fixed-size pool (`src/runner/limit.ts`) caps simultaneous harness processes. Default `maxConcurrent: 4`.

**Per-repetition flow:**

1. Resolve final config for the `(case, cell)` pair.
2. Look up the harness adapter from the suite's `adapter` field (`claude-code`, `codex`, or `gemini-cli`).
3. Build CLI flags from config (e.g. `src/adapters/claude-code/flags.ts`, `src/adapters/codex/flags.ts`, `src/adapters/gemini-cli/flags.ts`).
4. Spawn the harness subprocess via the adapter's `process.ts`.
5. Parse vendor output into normalized stream events (e.g. Claude/Gemini `stream-json`, Codex `exec --json`).
6. Feed events into `TrajectoryBuilder` (`src/trajectory/builder.ts`) to accumulate a `TrajectoryView`.
7. Evaluate all assertions against the `TrajectoryView` (`src/assertions/evaluator.ts`).
8. Record the `RepetitionResult` (trajectory + assertion results + duration).

**Assertion evaluation happens at run time.** Assertions are deterministic functions of the `TrajectoryView` — no network calls, no LLM. See [Assertion DSL](/reference/assertion-dsl.md).

# Stage 3 — Report

`formatReport(report, options)` renders a `SuiteReport` to one of three formats:

| Format | Source file | Use case |
|--------|------------|---------|
| `console` | `src/reporter/format-console.ts` | Human-readable TTY output with color |
| `markdown` | `src/reporter/format-markdown.ts` | CI PR comments, documentation |
| `json` | `src/reporter/format-json.ts` | Downstream processing |

The `--output <path>` flag writes the full `SuiteReport` JSON regardless of `--format`. Baseline comparison (`--baseline <path>`) diffs assertion pass rates between two reports.

# Stage 4 — Grade (optional)

`gradeReport(report, options)` runs an outcome judge for each `(case, cell, rep)` that has `expectations` defined.

**Judge substrate:** By default, a built-in judge subprocess is spawned for the adapter configured in the suite's `judge:` block. Each adapter has judge-specific defaults (e.g. Claude Code: `--max-turns 1`, `bare: true`; Codex: `ephemeral`, `ignoreUserConfig`; Gemini CLI: `approvalMode: yolo`, `isolateConfig: true`). The judge receives a structured prompt built from `trajectoryToTranscript()` and the case expectations. See [Harness adapters](/architecture/adapters.md) and per-adapter references.

**Custom judge:** Pass a `gradeFn` to replace the built-in judge entirely. The function receives `{ prompt, transcript, expectations }` and returns `{ expectations: GradedExpectation[], summary }`.

**Concurrency:** Default `maxConcurrent: 2` for grade (lower than run, since judge calls are more expensive).

# Stage 5 — Envelope (optional)

`buildEvalRunEnvelope(report, options)` assembles the versioned [`EvalRunEnvelope`](/concepts/eval-run-envelope.md) from:

- The `SuiteReport` (behavioral results)
- Optionally: `SuiteGradingReport` (outcome grades)
- Optionally: suite provenance (`uri`, `contentHash`)
- Optionally: CI/git provenance (`commit`, `branch`, `pipelineUrl`)

The envelope is the stable data contract for storage in a database, CI artifact comparison, or API responses. It is self-describing: it carries a `schemaVersion` and references the published JSON Schema.

# Pipeline orchestration (optional)

When a suite YAML includes a **`pipeline:`** block, **`runPipeline(doc, options)`** (`src/pipeline/run-pipeline.ts`) executes configured steps in order:

1. **run** — `runSuite()` → writes `pipeline.run.output`
2. **grade** — `gradeReport()` using inline `judge:` → writes `pipeline.grade.output`
3. **envelope** — `buildEvalRunEnvelopeFromFiles()` → writes `pipeline.envelope.output`

**`resolvePipelineInputs()`** (`src/pipeline/resolve-inputs.ts`) resolves artifact paths with precedence: CLI overrides > explicit YAML > prior step output in this run > default path if file exists.

CLI equivalent: `harness-eval pipeline <suite.yaml|dir> [--steps run,grade,envelope]`.

# Five data layers

| Layer | Type | Produced by | Used by |
|-------|------|-------------|---------|
| Vendor stream | `StreamEvent[]` | Harness subprocess stdout | Adapter `mapEvents` / parsers |
| Harness session | `TrajectoryView` | `TrajectoryBuilder` | Assertions, judges |
| Run report | `SuiteReport` | `runSuite` | Formatters, grader, envelope |
| Grading report | `SuiteGradingReport` | `gradeReport` | Envelope, CI |
| Interchange doc | `EvalRunEnvelope` | `buildEvalRunEnvelope` | DB, API, dashboards |

# Source file index

| File | Responsibility |
|------|---------------|
| `src/config/loader.ts` | `loadSuite()`, `loadSuiteDocument()` — YAML → TestSuite |
| `src/config/suite-document-loader.ts` | Unified suite document loading |
| `src/pipeline/run-pipeline.ts` | `runPipeline()` — orchestrate run → grade → envelope |
| `src/pipeline/resolve-inputs.ts` | `resolvePipelineInputs()` — artifact path resolution |
| `src/runner/suite.ts` | `runSuite()` — fan-out orchestrator |
| `src/runner/case.ts` | Single repetition execution |
| `src/runner/limit.ts` | Concurrency pool |
| `src/adapters/*/process.ts` | Spawn subprocess, collect stream (per adapter) |
| `src/adapters/*/map-events.ts` | Parse vendor output into stream events |
| `src/trajectory/builder.ts` | Accumulate `TrajectoryView` |
| `src/assertions/evaluator.ts` | Evaluate assertions against trajectory |
| `src/reporter/` | Format and render `SuiteReport` |
| `src/grader/grade-report.ts` | `gradeReport()` orchestrator |
| `src/eval-record/build.ts` | `buildEvalRunEnvelope()` |

# Citations

[1] `src/runner/suite.ts` — runSuite implementation
[2] `src/runner/case.ts` — per-rep execution
[3] `src/adapters/claude-code/process.ts` — subprocess management
[4] `src/eval-record/build.ts` — envelope builder
