# Eval record contract

Cross-harness interchange format for **CI/CD gates**, **runtime APIs**, and **database storage**.

This document defines what to persist and exchange — not Claude `stream-json` lines and not OTLP traces as the primary record.

---

## Layering

| Layer | Type | Role |
|-------|------|------|
| Vendor stream | `StreamEvent` (`src/types/stream.ts`) | Claude Code `stream-json` only; optional debug artifact |
| Harness session | **`TrajectoryView`** | Adapter output; behavioral assertions; trajectory queries |
| Eval run | **`EvalRunEnvelope`** | Full run for DB / pipelines / external judges |
| Observability | OTLP via `trajectoryToOtlp()` | Side export for backends; not the eval contract |

```
Suite YAML → runSuite → adapter → TrajectoryView
                                      ↓
                         assertions (behavioral, in-run)
                                      ↓
                              SuiteReport (report.json)
                                      ↓
                         gradeReport (optional, outcome)
                                      ↓
                         buildEvalRunEnvelope → EvalRunEnvelope
```

**Store and gate on `EvalRunEnvelope` (or its `cells` / `repetitions` rows).** Attach `rawStreamEvents` or OTLP URIs only when you need vendor-specific debugging.

---

## Schema versions

| Constant | Value | JSON Schema `$id` |
|----------|-------|-------------------|
| `EVAL_RUN_SCHEMA_VERSION` | `1.0` | `https://raw.githubusercontent.com/alis-build/harness-eval-ts/main/schemas/eval-run-envelope.schema.json` |
| `TRAJECTORY_SCHEMA_VERSION` | `1.0` | `https://raw.githubusercontent.com/alis-build/harness-eval-ts/main/schemas/trajectory-view.schema.json` |

Repo: [alis-build/harness-eval-ts](https://github.com/alis-build/harness-eval-ts). Bump `schemaVersion` when you make breaking JSON changes. Consumers should read `schemaVersion` before parsing nested fields.

---

## EvalRunEnvelope

Top-level document produced by `buildEvalRunEnvelope(report, options)`.

### Required fields

- `schemaVersion` — `"1.0"`
- `runId` — UUID (generated if omitted)
- `startedAt` — ISO 8601 from `SuiteReport`
- `durationMs` — wall time for the run
- `harness` — `{ adapter, frameworkVersion?, harnessVersion? }`
- `summary` — `{ cellsTotal, cellsPassed, behavioralPass, outcomePass? }`
- `cells` — array of `EvalCellResult`

### Optional fields

- `suite` — `{ uri?, id?, contentHash? }` for traceability to the YAML spec
- `provenance` — CI, git, plugin version, `triggeredBy`, extensible

### Summary semantics

- **`behavioralPass`** — every cell passed all assertion thresholds (deterministic tool/trajectory checks).
- **`outcomePass`** — present only when outcome grading was merged; all graded cells passed every expectation.

These are independent: a run can pass behavioral checks but fail outcome judges.

---

## EvalCellResult

One matrix cell for one test case (e.g. `list-landing-zones` × `sonnet`).

| Field | Meaning |
|-------|---------|
| `caseId`, `cellLabel`, `axes` | Identity and matrix dimensions |
| `prompt`, `expectations` | Copied from suite for judge context |
| `assertionStats` | Per-assertion pass rates across repetitions |
| `behavioralPass` | Cell passed assertion thresholds |
| `outcomePass` | All graded repetitions passed expectations (if graded) |
| `adapterErrors` | Reps excluded from assertion denominator (harness crash/timeout) |
| `repetitions` | One entry per statistical repetition |

---

## EvalRepetition

The **unit of work** for external judges and trajectory analytics.

| Field | Meaning |
|-------|---------|
| `trajectory` | `TrajectoryView` + `schemaVersion: "1.0"` when harness completed |
| `assertionResults` | Tree of deterministic assertion results for this rep |
| `outcomeGrades` | LLM or custom judge output (`judge`, `expectations`, `summary`) |
| `externalScores` | Scores from LangSmith, Braintrust, etc. (attach at integration layer) |
| `artifacts.transcript` | Text from `trajectoryToTranscript` (default on) |
| `artifacts.rawStreamEvents` | Claude stream-json lines (opt-in, not cross-harness) |
| `artifacts.otlpTraceUri` | Pointer to OTLP blob if exported separately |
| `error` | Harness failure without a view |

Judges should prefer `artifacts.transcript` or structured `trajectory.toolCalls` — not raw stream events.

---

## TrajectoryView

Normalized harness session. Defined in `src/types/trajectory.ts`.

Adapters map vendor output into this shape. The assertion engine and grader only depend on `TrajectoryView`, not on Claude-specific events.

When embedded in an envelope, each trajectory includes `schemaVersion: "1.0"`.

---

## Building envelopes

### From in-memory reports

```typescript
import {
  loadSuite,
  runSuite,
  gradeReport,
  buildEvalRunEnvelope,
  resolveGradeOptions,
} from "@alis-build/harness-eval";
import { loadGradingConfig } from "@alis-build/harness-eval/config";

const suite = await loadSuite("./examples/basic.yaml");
const report = await runSuite(suite);

const gradingConfig = await loadGradingConfig("./examples/grading.yaml");
const grading = await gradeReport(report, resolveGradeOptions(gradingConfig));

const envelope = buildEvalRunEnvelope(report, {
  grading,
  suite: { uri: "./examples/basic.yaml" },
  harness: { adapter: suite.adapter, frameworkVersion: "0.1.0" },
  provenance: {
    git: { commit: process.env.GITHUB_SHA, branch: process.env.GITHUB_REF_NAME },
    ci: { provider: "github-actions", jobId: process.env.GITHUB_RUN_ID },
  },
  includeTranscript: true,
  includeRawStreamEvents: false,
});
```

### From on-disk JSON

```typescript
import { buildEvalRunEnvelopeFromFiles } from "@alis-build/harness-eval";

const envelope = await buildEvalRunEnvelopeFromFiles(".debug/report.json", {
  gradingPath: ".debug/grading.json",
  suitePath: "examples/basic.yaml",
});
```

### CLI workflow today

```bash
pnpm run build
node dist/cli/bin.js run examples/basic.yaml --output .debug/report.json
node dist/cli/bin.js grade .debug/report.json \
  --config examples/grading.yaml \
  --output .debug/grading.json
node dist/cli/bin.js envelope .debug/report.json \
  --suite examples/basic.yaml \
  --grading .debug/grading.json \
  --output .debug/envelope.json
```

Use `--projection trajectory|instances` to emit interchange rows instead of the full envelope document.

### Vertex protojson subfields

Each successful repetition may include:

- `evaluationInstance` — Vertex `EvaluationInstance` wire JSON (`prompt`/`response` as `{ text }`; `agentEvalData` omitted in v1)
- `trajectoryInstances` — map of `Trajectory*Instance` messages (`exactMatch`, `precision`, …)
- `harnessMetrics` — camelCase precomputed trajectory scores

Validate fixtures in CI via `@google-cloud/aiplatform` protobuf deserialize (`tests/eval-interchange/protojson-validation.test.ts`). For local Go verification, run `.debug/protojson/verify` against `tests/fixtures/protojson/*.json`.

### Grading config (`grading.yaml`)

Outcome grading uses a **standalone YAML file** (Option B), separate from the suite. The `judge` block mirrors suite `defaultConfig`: `model`, `timeoutMs`, `env`, `maxConcurrent`, `system_instruction`, and nested `claudeCode` flags.

**Full field reference:** [suite-config.md — Grading config](suite-config.md#grading-config-gradingyaml)

```yaml
judge:
  adapter: claude-code
  model: claude-haiku-4-5
  timeoutMs: 300000
  maxConcurrent: 2
  env:
    CLAUDE_CODE_USE_VERTEX: "1"
  claudeCode:
    permissionMode: bypassPermissions
```

- **Load:** `loadGradingConfig(path)` / `parseGradingConfig(yaml)` from `@alis-build/harness-eval/config`
- **Validate:** `GradingConfigSchema` in `src/config/grading-schema.ts`
- **Paths:** relative `env` paths and `claudeCode` file paths resolve via `resolveGradingConfigPaths` (against the grading file directory)
- **Merge with CLI:** `resolveGradeOptions(gradingConfig, cliOverrides)` before `gradeReport(report, options)`

The built-in judge defaults (`maxTurns: 1`, `bare`, `disableSlashCommands`, `noSessionPersistence`) apply unless overridden under `judge.claudeCode`. Only repetitions with a successful `TrajectoryView` are graded; harness failures are skipped.

When grading via CLI with `--config`, `SuiteGradingReport.gradingConfigPath` records the file used.

---

## Database mapping (suggested)

Normalize for query performance; keep full JSON for audit.

| Table | Source | Notes |
|-------|--------|-------|
| `eval_runs` | envelope root | `run_id`, `schema_version`, `started_at`, `duration_ms`, `behavioral_pass`, `outcome_pass`, `harness_adapter`, `suite_uri`, `provenance` JSONB |
| `eval_cells` | `cells[]` | FK `run_id`, `case_id`, `cell_label`, `behavioral_pass`, `outcome_pass`, `axes` JSONB |
| `eval_repetitions` | `repetitions[]` | FK cell, `repetition_index`, `duration_ms`, `trajectory` JSONB, `outcome_grades` JSONB, `external_scores` JSONB, `error` JSONB |
| `eval_artifacts` | `artifacts` | Optional blob table or object storage URIs for transcript / raw stream / OTLP |

Index `trajectory.toolCalls[].name` via JSONB GIN if you need “which runs called SearchSkills?” across harnesses.

---

## CI/CD gates

Typical pipeline:

1. `runSuite` → fail job if `report` has failing cells or high `adapterErrors`.
2. `gradeReport` → optional outcome layer.
3. `buildEvalRunEnvelope` → upload to storage / POST to API.
4. Gate on `summary.behavioralPass` (required) and `summary.outcomePass` (if expectations defined).

Do not gate on OTLP or raw stream presence — those are optional artifacts.

---

## External judges and other frameworks

`OutcomeGrades` uses the same shape as harness-eval’s built-in grader:

```typescript
interface OutcomeGrades {
  judge: { id: string; model?: string; version?: string };
  expectations: Array<{ text: string; passed: boolean; evidence: string }>;
  summary: { passed: number; failed: number; total: number; passRate: number };
  evalFeedback?: { suggestions: Array<{ assertion?: string; reason: string }>; overall: string };
  error?: string;
}
```

To attach LangSmith / Braintrust scores without replacing outcome grades, set `externalScores` on each `EvalRepetition` after building the envelope (or mutate before upload):

```typescript
{ source: "langsmith", metric: "correctness", value: 0.92, metadata: { runId: "..." } }
```

`buildEvalRunEnvelope()` does not accept `externalScores` directly — merge platform scores onto `envelope.cells[].repetitions[]` in your integration layer.

Envelope `outcomeGrades.judge` defaults to `{ id: "harness-eval/claude-grader" }` unless you pass `grading.judge` in `BuildEvalRunEnvelopeOptions`.

---

## What not to use as the primary record

| Format | Why not primary |
|--------|----------------|
| `StreamEvent[]` | Claude-only; breaks with Cursor/Gemini adapters |
| OTLP GenAI spans | Observability export; incomplete for assertion stats and grading |
| `SuiteReport` alone | Runner-internal; no schema version, no provenance, grading split across files |

`SuiteReport` remains the runner output file; **`EvalRunEnvelope` is the storage/API contract** built from it.

---

## JSON Schema

Zod schemas in `src/schemas/` are the **source of truth**. JSON Schema files are generated on build via [Zod's native `z.toJSONSchema()`](https://zod.dev/json-schema):

```bash
pnpm run generate-schemas   # writes schemas/*.schema.json
pnpm run build                # generate-schemas && tsdown
```

Published artifacts (included in the npm package):

- `schemas/eval-run-envelope.schema.json`
- `schemas/trajectory-view.schema.json`

Use these for DB validation, OpenAPI `components`, or contract tests in downstream services. For runtime validation in TypeScript, import Zod schemas from `src/schemas/` in a repo clone (not from the published npm package).

---

## Related docs

- [Assertion DSL & adapters](assertions.md)
- [TrajectoryView source](../src/types/trajectory.ts)
- [Eval record types](../src/types/eval-record.ts)
