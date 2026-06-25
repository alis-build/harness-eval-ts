# @alis-build/harness-eval

Statistical eval framework for **AI coding agent harnesses**. Run real headless harness sessions, capture tool trajectories, and score behavior and outcomes across many repetitions and configurations.

**Built-in harness adapters:** `claude-code`, `codex`, and `gemini-cli`. Set `adapter:` in suite YAML; the runner, assertions, and eval interchange stay the same regardless of vendor.

**Use it to answer:** “When users ask X, does this harness actually call our MCP tools — reliably, in this plugin/model setup?”

---

## Requirements

- Node.js ≥ 22.12 required; Node 24 LTS recommended for development and CI
- A harness CLI on `PATH` for the adapter you use (see [Adding harness adapters](#adding-harness-adapters)):
  - **`claude-code`** — `claude` ([Claude Code CLI](https://code.claude.com/docs/en/cli-reference))
  - **`codex`** — `codex` ([Codex CLI](https://developers.openai.com/codex/cli/reference))
  - **`gemini-cli`** — `gemini` ([Gemini CLI](https://geminicli.com/docs/cli/cli-reference/))

### Authentication (by adapter)

| Adapter | Typical auth |
| ------- | ------------ |
| **Claude Code** | `claude login` with `isolateConfig: false`, or `ANTHROPIC_API_KEY` with isolated config (default harness behavior) |
| **Codex** | Logged-in `~/.codex`, or `OPENAI_API_KEY` when `codex.isolateConfig: true` |
| **Gemini CLI** | Logged-in Gemini CLI config with `geminiCli.isolateConfig: false`, or Vertex/API key env vars (`GOOGLE_APPLICATION_CREDENTIALS`, `GEMINI_API_KEY`, etc.) when isolated |

Each adapter section below documents `isolateConfig`, MCP setup, and headless flags in detail.

---

## Install

**Consumers** — run via npx (no global install required):

```bash
npx @alis-build/harness-eval --help
```

Or install as a project dependency:

```bash
npm install @alis-build/harness-eval
npx @alis-build/harness-eval run examples/basic.yaml --output report.json
```

The npm package name is `@alis-build/harness-eval`; the CLI binary is `harness-eval`. With a single bin entry, `npx @alis-build/harness-eval <command>` invokes it directly.

In a git checkout of this repo, npm resolves `npx @alis-build/harness-eval` to the local package (not the registry). Run `pnpm run build` first so `dist/cli/bin.js` exists; the build links `harness-eval` into `node_modules/.bin` for local use.

### Development (clone & build)

Contributors working from a git checkout:

```bash
pnpm install
pnpm run build
pnpm exec harness-eval --help
# or: node dist/cli/bin.js --help
```

---

## Quick start

### 1. Write a suite

Suites are YAML files. Committed examples:

- [`examples/pipeline/`](examples/pipeline/) — **recommended** unified layout with inline `judge:` + `pipeline:` orchestration
- [`examples/basic.yaml`](examples/basic.yaml) — Claude Code smoke test (`Read` on this repo's README)
- [`examples/codex-basic.yaml`](examples/codex-basic.yaml) — Codex CLI smoke test
- [`examples/gemini-cli-basic.yaml`](examples/gemini-cli-basic.yaml) — Gemini CLI smoke test
- [`examples/matrix.yaml`](examples/matrix.yaml) — Claude Code with a model matrix (sonnet vs opus)
- [`examples/multi-file/`](examples/multi-file/) — directory layout with `suite.yaml` plus cases under `cases/`
- [`examples/grading.yaml`](examples/grading.yaml) — Claude Code judge config (standalone)
- [`examples/codex-grading.yaml`](examples/codex-grading.yaml) — Codex judge config
- [`examples/gemini-grading.yaml`](examples/gemini-grading.yaml) — Gemini CLI judge config

```yaml
adapter: claude-code   # or: codex | gemini-cli

defaultConfig:
  model: claude-sonnet-4-6
  timeoutMs: 120000
  cwd: ..
  claudeCode:
    isolateConfig: false # use your logged-in Claude Code config
    permissionMode: bypassPermissions
    allowedTools:
      - Read

matrix:
  - label: sonnet
    config: {}

cases:
  - id: summarize-readme
    prompt: "Read README.md and summarize what harness-eval does in one or two sentences."
    repetitions: 3

    # Behavioral checks (deterministic, on tool trajectory)
    assertions:
      - called: Read
        threshold: 0.8
      - not:
          responded_without_tool_calls: true

    # Outcome checks (LLM judge via `harness-eval grade`)
    expectations:
      - "The response describes an eval framework for AI coding agent harnesses"
      - "The summary is grounded in README content, not a generic refusal"
```

Generic fields (`model`, `cwd`, `timeoutMs`, `env`) sit at the top level. Harness-specific options nest under `claudeCode`, `codex`, or `geminiCli` depending on `adapter`.

**Full suite & grading YAML reference:** [docs/suite-config.md](docs/suite-config.md) — all case/matrix fields, inline `judge:` / `pipeline:`, multi-file layout, and standalone `grading.yaml`.

### 2. Run behavioral eval

```bash
# Unified pipeline (run + optional grade + envelope when pipeline: is defined)
npx @alis-build/harness-eval pipeline examples/pipeline/

# Or run harness only
npx @alis-build/harness-eval run examples/basic.yaml --output report.json --max-concurrent 1 --format console
```

This spawns the configured harness CLI headless for each (case × matrix cell × repetition), evaluates **assertions** on the captured trajectory, and prints pass rates.

**Progress (stderr):** one line per repetition with ETA by default; use `--quiet` for dots or `--verbose` for tool/assertion detail.

Exit code `0` = all cells passed all assertion thresholds.

### 3. Grade outcomes (optional)

**Unified suite:** add a top-level `judge:` block in `suite.yaml` (see [`examples/pipeline/suite.yaml`](examples/pipeline/suite.yaml)), then:

```bash
npx @alis-build/harness-eval grade report.json --suite examples/pipeline/suite.yaml --output grading.json --max-concurrent 1 --format console
# or: npx @alis-build/harness-eval pipeline examples/pipeline/ --steps grade
```

**Standalone grading file:** judge config in a separate **`grading.yaml`** (still supported). See [`examples/grading.yaml`](examples/grading.yaml).

```bash
npx @alis-build/harness-eval grade report.json --config examples/grading.yaml --output grading.json --max-concurrent 1 --format console
```

Runs a separate harness subprocess as **judge** (`judge.adapter`: `claude-code`, `codex`, or `gemini-cli`) against the `expectations` in your suite (copied into `report.json`). Produces per-expectation PASS/FAIL with cited evidence.

Exit codes: `0` = all graded expectations passed; `1` = at least one failed; `2` = no expectations or no gradable repetitions.

---

## Data contracts & schemas

harness-eval separates **vendor output** from **eval interchange**. Use the types below when wiring CI, a database, or an external judge — not raw adapter NDJSON or OTLP as your primary record.

### Layering

| Layer           | Type                  | Where                     | Use for                                            |
| --------------- | --------------------- | ------------------------- | -------------------------------------------------- |
| Vendor stream   | `StreamEvent`         | `src/types/stream.ts`     | Adapter debug only (Claude/Codex/Gemini NDJSON)    |
| Harness session | **`TrajectoryView`**  | `src/types/trajectory.ts` | Assertions, trajectory queries, judge input        |
| Run report      | **`SuiteReport`**     | `report.json` from `run`  | Runner output; full trajectories + assertion stats |
| Eval record     | **`EvalRunEnvelope`** | `buildEvalRunEnvelope()`  | CI gates, APIs, DB storage                         |
| Observability   | OTLP                  | `--otel-output`           | Tempo / Jaeger side export                         |

```
Suite YAML → run → TrajectoryView → SuiteReport (report.json)
                              ↓ optional grade / external judge
                         EvalRunEnvelope → DB / API / CI gate
```

### `TrajectoryView`

Cross-harness normalized session. Every adapter maps vendor output into this shape.

| Field           | Meaning                                                                                |
| --------------- | -------------------------------------------------------------------------------------- |
| `meta`          | Session id, model, cwd, available tools, MCP server status                             |
| `toolCalls`     | Every tool call in emission order (`name`, `args`, `result`, `turnIndex`, `callIndex`) |
| `turns`         | Per-turn assistant text and tool calls                                                 |
| `finalResponse` | Concatenated assistant text (for `response_contains` and judges)                       |
| `usage`         | Tokens, cost, duration, turn count                                                     |
| `success`       | Whether the harness reported success                                                   |

Tool names follow the harness format (e.g. `mcp__plugin_alis-build_api__SearchSkills`). Assertions use `turnIndex` / `callIndex` for ordering — not wall-clock time.

### `SuiteReport` (`report.json`)

Produced by `harness-eval run`. Contains everything from the run:

- `cells[]` — one row per (test case × matrix cell)
- `cells[].repetitions[]` — each harness invocation
- `cells[].repetitions[].adapterResult.view` — **`TrajectoryView`** when the harness succeeded
- `cells[].repetitions[].assertionResults` — per-rep behavioral assertion tree
- `cells[].assertionStats` — pass rates across repetitions
- `cells[].expectations` — natural-language outcome checks (copied from suite for judges)

Gate behavioral eval on `cells[].passed` or on assertion stats. This file is enough to hand off to a custom judge without re-running the harness.

### `EvalRunEnvelope`

Versioned document for **storage and interchange** (`schemaVersion` `1.0`). Build it from a report (and optional grading):

```typescript
import {
  buildEvalRunEnvelope,
  buildEvalRunEnvelopeFromFiles,
} from "@alis-build/harness-eval";

const envelope = buildEvalRunEnvelope(report, {
  grading, // optional: from gradeReport()
  suite: { uri: "./examples/basic.yaml" },
  provenance: { git: { commit: process.env.GITHUB_SHA } },
});

// Or from disk after CLI run:
const envelope = await buildEvalRunEnvelopeFromFiles("report.json", {
  gradingPath: "grading.json",
  suitePath: "examples/basic.yaml",
});
```

| Field                                        | Meaning                                                                           |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| `summary.behavioralPass`                     | All cells passed assertion thresholds                                             |
| `summary.outcomePass`                        | All graded expectations passed (when outcome layer present)                       |
| `cells[].repetitions[]`                      | Unit of work for judges — trajectory, assertion results, optional `outcomeGrades` |
| `cells[].repetitions[].artifacts.transcript` | Text for LLM judges (`trajectoryToTranscript`)                                    |
| `cells[].repetitions[].externalScores`       | Attach scores from LangSmith, Braintrust, etc.                                    |

**Full reference:** [docs/eval-record.md](docs/eval-record.md)

### TypeScript types & Zod schemas

| Artifact                         | Location                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| TypeScript interfaces            | `@alis-build/harness-eval` — `TrajectoryView`, `EvalRunEnvelope`, `AssertionResult`, … |
| Zod schemas (runtime validation) | `src/schemas/` in repo only — not published on npm                                     |
| JSON Schema (DB / OpenAPI)       | `schemas/*.schema.json` — shipped in the npm package                                   |

Zod is the **source of truth** for JSON Schema. Each field has `title` and `description` for downstream tooling.

```bash
pnpm run generate-schemas   # Zod → schemas/*.schema.json
```

Published JSON Schema files (Draft 2020-12):

- `schemas/trajectory-view.schema.json` — `TrajectoryView` + `schemaVersion`
- `schemas/eval-run-envelope.schema.json` — full run envelope

Canonical `$id` URLs (for validators and `$ref`):

- `https://raw.githubusercontent.com/alis-build/harness-eval-ts/main/schemas/trajectory-view.schema.json`
- `https://raw.githubusercontent.com/alis-build/harness-eval-ts/main/schemas/eval-run-envelope.schema.json`

Source: [github.com/alis-build/harness-eval-ts](https://github.com/alis-build/harness-eval-ts)

Runtime validation (repo development or clone):

```typescript
import { evalRunEnvelopeSchema } from "./src/schemas/eval-run-envelope";
evalRunEnvelopeSchema.parse(envelope);
```

npm consumers validate with the published JSON Schema files or by cloning the repo for Zod imports.

Uses [Zod 4 `z.toJSONSchema()`](https://zod.dev/json-schema).

---

## External eval frameworks & custom judges

harness-eval is intentionally split: **run the harness and score behavior deterministically**; **outcome quality can live anywhere**.

You do not need `harness-eval grade` if you already have LangSmith, Braintrust, OpenAI Evals, a Python judge, or an internal rubric service.

### What harness-eval provides vs what you can replace

| Concern                  | harness-eval                   | External framework / custom judge          |
| ------------------------ | ------------------------------ | ------------------------------------------ |
| Headless harness runs    | `run` / `runSuite`             | —                                          |
| Tool-call behavior       | Assertions on `TrajectoryView` | Optional: re-implement on `toolCalls`      |
| Outcome / rubric scoring | `grade` (built-in judges)      | Your judge, eval platform, or human review |
| Storage contract         | `EvalRunEnvelope`              | Same envelope; attach `externalScores`     |

### Pattern 1 — Behavioral only (no LLM judge)

Run the suite, gate CI on behavioral pass rates, skip outcome grading entirely.

```bash
npx @alis-build/harness-eval run examples/basic.yaml --output report.json
# exit 0 ⇒ all assertion thresholds met
```

Omit `expectations` from the suite, or ignore them. Your pipeline only checks `report.json` assertion stats.

### Pattern 2 — Custom judge in TypeScript (`gradeFn`)

Keep the harness-eval grading **workflow** (concurrency, report shape) but swap the judge implementation:

```typescript
import {
  gradeReport,
  trajectoryToTranscript,
  type GraderFn,
} from "@alis-build/harness-eval";

const myJudge: GraderFn = async ({ prompt, transcript, expectations }) => {
  // Call your API, rubric service, or local model
  const results = await myRubricService.score(transcript, expectations);
  return {
    expectations: results,
    summary: { passed: 2, failed: 0, total: 2, passRate: 1 },
  };
};

const grading = await gradeReport(report, { gradeFn: myJudge });
```

Output is the same `SuiteGradingReport` shape as the built-in judges — merge into `EvalRunEnvelope` via `buildEvalRunEnvelope(report, { grading })`.

### Pattern 3 — Separate judge pipeline (any language)

1. `npx @alis-build/harness-eval run … --output report.json`
2. Your service reads each repetition:

```typescript
// Minimal handoff fields from report.json
const cell = report.cells[0];
const rep = cell.repetitions[0];
const view = rep.adapterResult?.view;
const prompt = cell.prompt;
const expectations = cell.expectations ?? [];

// Prefer transcript for LLM judges
import { trajectoryToTranscript } from "@alis-build/harness-eval";
const transcript = view ? trajectoryToTranscript(view, prompt ?? "") : null;

// Or use structured toolCalls for deterministic checks
const toolNames = view?.toolCalls.map((t) => t.name) ?? [];
```

3. Write scores to your DB or a sidecar JSON.
4. Optionally merge into an envelope for a unified eval store:

```typescript
const envelope = buildEvalRunEnvelope(report, { grading });
// Attach platform scores per repetition (not a buildEvalRunEnvelope option today):
envelope.cells[0].repetitions[0].externalScores = [
  { source: "langsmith", metric: "correctness", value: 0.92 },
];
```

**Judges should use `trajectoryToTranscript(view, prompt)` or structured `toolCalls`** — not raw vendor NDJSON (adapter-specific and verbose).

### Pattern 4 — LangSmith, Braintrust, OpenAI Evals, etc.

Typical flow:

1. **Generate trajectories** with harness-eval (real harness, real MCP tools, statistical repetitions).
2. **Upload or reference** each repetition in your platform:
   - **Input:** `prompt`, `artifacts.transcript` (from envelope), or `TrajectoryView`
   - **Metadata:** `caseId`, `cellLabel`, `axes`, `runId`, git/CI provenance from `EvalRunEnvelope`
3. **Run the platform's evaluators** (LLM judges, human review, custom scorers).
4. **Attach scores** back via `externalScores` on `EvalRepetition` when building the envelope, or store platform run IDs in `provenance`.

harness-eval does not need to own scoring — it owns **faithful harness reproduction** and a **stable trajectory contract**.

### Pattern 5 — Behavioral here, outcome elsewhere (recommended split)

```bash
# CI job 1: behavioral gate (fast, deterministic)
npx @alis-build/harness-eval run suite.yaml --output report.json

# CI job 2: your outcome eval (async, platform-specific)
node scripts/push-to-langsmith.mjs report.json
# or: python scripts/run_braintrust_eval.py report.json
```

- Job 1 fails on tool-selection regressions immediately.
- Job 2 scores answer quality without blocking on harness spawn time.

Both can converge on one `EvalRunEnvelope` in your database for dashboards.

### Injecting a custom `GraderInput`

Built-in grader input shape:

```typescript
interface GraderInput {
  prompt: string;
  transcript: string; // from trajectoryToTranscript()
  expectations: string[]; // from suite / report
}
```

Built-in output shape (`outcomeGrades` in the envelope):

```typescript
interface GradedExpectation {
  text: string;
  passed: boolean;
  evidence: string;
}
```

Map your framework's output into these shapes (or use `externalScores`) so CI and DB layers stay consistent.

---

## Two layers of evaluation

| Layer        | Command | What it checks                          | Mechanism                                    |
| ------------ | ------- | --------------------------------------- | -------------------------------------------- |
| **Behavior** | `run`   | Tool calls, order, args, efficiency     | Deterministic assertions on `TrajectoryView` |
| **Outcome**  | `grade` | Answer quality, grounding, completeness | LLM judge (`claude-code`, `codex`, or `gemini-cli`) on transcript + `finalResponse` |

Both layers use statistical thresholds: a case runs `repetitions` times per matrix cell, and each assertion/expectation has a pass-rate threshold (default `1.0`).

---

## CLI reference

```bash
npx @alis-build/harness-eval run <suite.yaml> [options]
npx @alis-build/harness-eval grade <report.json> [options]
npx @alis-build/harness-eval envelope <report.json> [options]
npx @alis-build/harness-eval pipeline <suite.yaml|dir> [options]
npx @alis-build/harness-eval format <report.json> [options]
npx @alis-build/harness-eval --help
```

### `run`

| Option                             | Description                                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `--output <path>`                  | Write full `SuiteReport` JSON                                                            |
| `--otel-output <dir>`              | Write OTLP trace JSON per repetition (optional)                                          |
| `--format console\|markdown\|json` | Report format (default: `console`)                                                       |
| `--baseline <path>`                | Compare against a previous report                                                        |
| `--max-concurrent <n>`             | Parallel harness processes (default: 4)                                                  |
| `--adapter <id>`                   | Harness adapter (default: `claude-code`)                                                 |
| `--quiet`                          | Progress: dots only (`.` ok, `x` fail)                                                   |
| `--verbose`                        | Progress: per-rep tool counts and assertion summary                                      |
| `--progress <mode>`                | `default` \| `quiet` \| `verbose` \| `json` (ndjson on stderr; disables color)           |
| `--color` / `--no-color`           | Force or disable ANSI colors (auto when stderr is a TTY; `NO_COLOR` / `FORCE_COLOR` env) |

### `grade`

Uses **`grading.yaml`**, an inline **`judge:`** block in `suite.yaml` (`--suite`), or adapter-specific grading files under `examples/`.

**Field reference:** [docs/suite-config.md — Grading config](docs/suite-config.md#grading-config-gradingyaml)

```yaml
# examples/grading.yaml (Claude Code judge)
judge:
  adapter: claude-code
  model: claude-sonnet-4-6
  timeoutMs: 300000
  maxConcurrent: 1
  claudeCode:
    permissionMode: bypassPermissions
```

Other committed judge configs: [`examples/codex-grading.yaml`](examples/codex-grading.yaml) (`adapter: codex`), [`examples/gemini-grading.yaml`](examples/gemini-grading.yaml) (`adapter: gemini-cli`).

```bash
npx @alis-build/harness-eval grade report.json --config examples/grading.yaml --output grading.json
npx @alis-build/harness-eval grade report.json --config examples/codex-grading.yaml --output grading.json
npx @alis-build/harness-eval grade report.json --config examples/gemini-grading.yaml --output grading.json
```

| Option                                 | Description                                                       |
| -------------------------------------- | ----------------------------------------------------------------- |
| `--config <path>`                      | Grading YAML (`judge` block) — model, env, timeout, adapter options |
| `--suite <path>`                       | Unified `suite.yaml` with inline `judge:` (alternative to `--config`) |
| `--output <path>`                      | Write grading JSON                                                |
| `--expectations <path>`                | Sidecar YAML/JSON if report lacks expectations                    |
| `--format console\|json`               | Output format                                                     |
| `--model <id>`                         | Overrides `judge.model` in config                                 |
| `--binary <path>`                      | Overrides judge binary for the selected adapter                   |
| `--timeout-ms <n>`                     | Overrides `judge.timeoutMs`                                       |
| `--max-concurrent <n>`                 | Overrides `judge.maxConcurrent` (default: 2 if unset)             |
| `--quiet` / `--verbose` / `--progress` | Same progress modes as `run` (including `--color` / `--no-color`) |

CLI flags override the YAML file. Expectations still come from `report.json` (copied from the suite at `run` time) unless `--expectations` is set. The grading report may include `gradingConfigPath` when `--config` was used.

**Built-in judge defaults** (override under `judge.claudeCode`, `judge.codex`, or `judge.geminiCli`):

| Adapter | Defaults (summary) |
| ------- | ------------------ |
| `claude-code` | `maxTurns: 1`, `bare: true`, `disableSlashCommands: true`, `noSessionPersistence: true`, `permissionMode: bypassPermissions`; JSON output |
| `codex` | `ephemeral: true`, `ignoreUserConfig: true`, `skipGitRepoCheck: true`, `askForApproval: never` |
| `gemini-cli` | `approvalMode: yolo`, `isolateConfig: true`, `skipTrust: true`; `--output-format json` |

See [docs/suite-config.md](docs/suite-config.md) and each adapter section below for full flag tables.

Exit codes: `0` = all expectations passed; `1` = failures; `2` = no expectations or no gradable repetitions (harness failures without trajectories are skipped).

Optional — use [External eval frameworks & custom judges](#external-eval-frameworks--custom-judges) instead of this command.

### `envelope`

Build the versioned **`EvalRunEnvelope`** (primary eval interchange document) from a harness `report.json`. Optionally merge outcome grades and emit platform-compatible projections.

```bash
npx @alis-build/harness-eval envelope report.json --suite examples/basic.yaml --grading grading.json --output envelope.json

# Interchange projections
npx @alis-build/harness-eval envelope report.json --projection trajectory --output trajectory.jsonl
npx @alis-build/harness-eval envelope report.json --projection instances --output instances.json
npx @alis-build/harness-eval envelope report.json --projection instances --output instances.jsonl
```

| Option                                                      | Description                                               |
| ----------------------------------------------------------- | --------------------------------------------------------- |
| `--output <path>`                                           | Write output (stdout if omitted)                          |
| `--grading <path>`                                          | Merge `grading.json` outcome scores into the envelope     |
| `--suite <path>`                                            | Suite YAML for provenance (`uri`, `contentHash`)          |
| `--projection envelope\|trajectory\|instances` | Output shape (default: `envelope`)                        |
| `--include-raw-stream-events`                               | Include adapter raw stream events in repetition artifacts |
| `--no-transcript`                                           | Omit judge transcript artifacts                           |

Exit codes: `0` = envelope built and behavioral pass; `1` = built but behavioral failures; `2` = usage or file errors.

### `pipeline`

Orchestrate **run → grade → envelope** from a unified `suite.yaml` when a `pipeline:` block is present. See [docs/suite-config.md — Pipeline orchestration](docs/suite-config.md#pipeline-orchestration-pipeline).

```bash
npx @alis-build/harness-eval pipeline examples/pipeline/
npx @alis-build/harness-eval pipeline my-suite/ --steps run,grade
```

| Option | Description |
| ------ | ----------- |
| `--steps run,grade,envelope` | Subset of configured steps (default: all configured) |
| `--output <path>` | Override `pipeline.run.output` |
| `--report <path>` | Override report input for grade/envelope |
| `--grading <path>` | Override grading input for envelope |
| `--grading-output <path>` | Override `pipeline.grade.output` |
| `--envelope-output <path>` | Override `pipeline.envelope.output` |
| `--projection envelope\|trajectory\|instances` | Envelope projection |
| `--max-concurrent <n>` | Parallel harness/judge workers |

Exit codes match the first failing step (`run`, `grade`, or `envelope`). Returns `2` when no `pipeline:` block exists.

### `format`

Re-render an existing `report.json` without re-running the harness.

---

## Output artifacts

After a typical run:

| File                          | Produced by                        | Purpose                                                        |
| ----------------------------- | ---------------------------------- | -------------------------------------------------------------- |
| **`suite.yaml`**              | You                                | Test spec: prompts, matrix, assertions, expectations           |
| **`report.json`**             | `run --output`                     | `SuiteReport` — trajectories, assertion stats, per-rep details |
| **`grading.json`**            | `grade --output`                   | Outcome scores with evidence (optional; or use external judge) |
| **`envelope.json`**           | `envelope --output`                | Versioned `EvalRunEnvelope` for DB / API / eval platforms      |
| **`trajectory.jsonl`**        | `envelope --projection trajectory` | Tabular interchange rows (JSONL)                               |
| **`schemas/*.schema.json`**   | `pnpm run generate-schemas`        | JSON Schema for validators and OpenAPI                         |
| **`otel-traces/*.otlp.json`** | `run --otel-output`                | OTLP for trace UIs (optional; not the eval contract)           |

Write artifact paths with `--output` (and `--otel-output` for traces) wherever your pipeline or CI expects them.

See [Data contracts & schemas](#data-contracts--schemas) for type details.

---

## Suite concepts

**Authoring reference:** [docs/suite-config.md](docs/suite-config.md) — complete field list for suite YAML, matrix cells, test cases, reference trajectories, and grading config.

### Test case

One prompt + assertions + optional expectations, run N times per matrix cell.

### Matrix cell

One configuration point (plugin version, model, tool allowlist, etc.). Each (case × cell) is one row in the report.

### Config merge order

Later wins: `defaultConfig` → `case.config` → `cell.config`.

List fields like `allowedTools` and `pluginDirs` are **replaced**, not merged.

### Thresholds

```yaml
assertions:
  - called: mcp__api__search_skills
    threshold: 0.8 # pass if ≥80% of reps call the tool
```

Default threshold is `1.0` (every evaluated rep must pass). Reps where the harness crashes are excluded from the denominator and counted as `adapterErrors`.

### Reference trajectory (optional)

Define expected tool calls for Vertex trajectory metrics on the eval envelope. Use `tool_name_mode: bare` when reference steps use short tool names but the harness records MCP-prefixed names. See [docs/suite-config.md — Reference trajectory](docs/suite-config.md#reference-trajectory).

**Full reference:** [docs/assertions.md](docs/assertions.md) — all assertion kinds, predicates, statistical model, and how to add new assertion types or harness adapters.

---

## Harness adapters

Built-in adapters register at module load. Each has a dedicated section below with CLI flag mapping, examples, and judge configuration.

| Adapter | Suite key | Example suite | Example judge |
| ------- | --------- | ------------- | ------------- |
| Claude Code | `claudeCode` | [`examples/basic.yaml`](examples/basic.yaml) | [`examples/grading.yaml`](examples/grading.yaml) |
| Codex CLI | `codex` | [`examples/codex-basic.yaml`](examples/codex-basic.yaml) | [`examples/codex-grading.yaml`](examples/codex-grading.yaml) |
| Gemini CLI | `geminiCli` | [`examples/gemini-cli-basic.yaml`](examples/gemini-cli-basic.yaml) | [`examples/gemini-grading.yaml`](examples/gemini-grading.yaml) |

Additional harnesses (e.g. Antigravity CLI) plug in via the same pattern:

1. Implement `HarnessAdapter` under `src/adapters/<id>/` with a `run(config)` that returns a `TrajectoryView`.
2. Add a nested config key on `SuiteConfig` (e.g. `codex: { ... }`) for harness-specific options.
3. Call `registerAdapter("<id>", adapter)` at startup (built-in registration in `src/adapters/registry.ts`, or from plugin bootstrap code).
4. Set `adapter: <id>` in suite YAML; the runner resolves via `getAdapter(id)`.

```typescript
import {
  registerAdapter,
  listAdapters,
  getAdapter,
} from "@alis-build/harness-eval";

registerAdapter("my-harness", myAdapter);
console.log(listAdapters()); // ["claude-code", "codex", "gemini-cli", …]
```

Duplicate registration throws so accidental overrides fail fast during startup or tests.

---

## Claude Code adapter

Nested under `claudeCode` in YAML (or flat in programmatic config). Maps to [Claude Code CLI flags](https://code.claude.com/docs/en/cli-reference#cli-flags).

The adapter always passes `-p`, `--output-format stream-json`, and `--verbose`.

| Field                             | CLI flag                               | Notes                                                                    |
| --------------------------------- | -------------------------------------- | ------------------------------------------------------------------------ |
| `binary`                          | —                                      | Default `claude`                                                         |
| `pluginDirs`                      | `--plugin-dir`                         | Repeatable                                                               |
| `pluginUrls`                      | `--plugin-url`                         | Repeatable                                                               |
| `addDirs`                         | `--add-dir`                            | Extra readable dirs (repeatable)                                         |
| `mcpConfig`                       | `--mcp-config`                         | MCP config file path                                                     |
| `strictMcpConfig`                 | `--strict-mcp-config`                  | Only MCP servers from `mcpConfig`                                        |
| `model`                           | `--model`                              | Also settable at top level                                               |
| `permissionMode`                  | `--permission-mode`                    | `default`, `acceptEdits`, `plan`, `auto`, `dontAsk`, `bypassPermissions` |
| `effort`                          | `--effort`                             | `low` … `max`                                                            |
| `agent`                           | `--agent`                              | Subagent for session                                                     |
| `fallbackModel`                   | `--fallback-model`                     | Comma-separated fallback chain                                           |
| `tools`                           | `--tools`                              | Restrict built-in tools (`Bash,Edit,Read` or `default`)                  |
| `allowedTools`                    | `--allowedTools`                       | Auto-approve tool patterns                                               |
| `disallowedTools`                 | `--disallowedTools`                    | Deny tool patterns                                                       |
| `maxTurns`                        | `--max-turns`                          | Print-mode turn cap                                                      |
| `maxBudgetUsd`                    | `--max-budget-usd`                     | Print-mode spend cap                                                     |
| `settings`                        | `--settings`                           | Settings JSON file path or inline JSON string                            |
| `settingSources`                  | `--setting-sources`                    | e.g. `user,project`                                                      |
| `systemPrompt`                    | `--system-prompt`                      | Replace default system prompt                                            |
| `systemPromptFile`                | `--system-prompt-file`                 | Replace from file                                                        |
| `appendSystemPrompt`              | `--append-system-prompt`               | Append to default prompt                                                 |
| `appendSystemPromptFile`          | `--append-system-prompt-file`          | Append from file                                                         |
| `debug`                           | `--debug`                              | `true` or category filter string                                         |
| `debugFile`                       | `--debug-file`                         | Debug log path                                                           |
| `includeHookEvents`               | `--include-hook-events`                | Hook events in stream-json                                               |
| `noSessionPersistence`            | `--no-session-persistence`             | Don't save session to disk                                               |
| `disableSlashCommands`            | `--disable-slash-commands`             | Disable skills/commands for session                                      |
| `bare`                            | `--bare`                               | Skip auto-discovery (hooks, skills, plugins, MCP)                        |
| `safeMode`                        | `--safe-mode`                          | Disable customizations for troubleshooting                               |
| `dangerouslySkipPermissions`      | `--dangerously-skip-permissions`       | Same as `bypassPermissions` mode                                         |
| `allowDangerouslySkipPermissions` | `--allow-dangerously-skip-permissions` | Add bypass to mode cycle                                                 |
| `isolateConfig`                   | —                                      | `false` = use your login/plugins; `true` (default) = fresh temp config   |

Generic `cwd` sets the child process working directory (not a Claude flag). Relative paths in `mcpConfig`, `pluginDirs`, `addDirs`, and settings/prompt files resolve against the suite YAML directory.

Not wired (eval usually starts fresh sessions): `--resume`, `--continue`, `--session-id`, `--worktree`, interactive-only flags.

The adapter captures Claude’s stream-json output and builds a `TrajectoryView`. Unknown stream events are ignored so schema evolution does not break CI.

---

## Codex CLI adapter

Nested under `codex` in YAML (or flat in programmatic config). Maps to [Codex CLI reference](https://developers.openai.com/codex/cli/reference) (`codex exec` flags).

The harness adapter invokes:

```bash
codex --ask-for-approval never exec --json [exec flags…] "<prompt>"
```

`--ask-for-approval` is a **global** flag (before `exec`); other options attach to the `exec` subcommand.

| Field | CLI flag | Notes |
| ----- | -------- | ----- |
| `binary` | — | Default `codex` |
| `model` | `--model` | Also settable at top level |
| `profile` | `--profile` | Layer `$CODEX_HOME/<profile>.config.toml` |
| `sandbox` | `--sandbox` | `read-only`, `workspace-write`, `danger-full-access` |
| `addDirs` | `--add-dir` | Extra writable dirs (repeatable) |
| `configOverrides` | `-c key=value` | Inline TOML overrides (repeatable) |
| `askForApproval` | `--ask-for-approval` | Default `never` for non-interactive eval |
| `dangerouslyBypassApprovalsAndSandbox` | `--yolo` | Hardened CI only |
| `dangerouslyBypassHookTrust` | `--dangerously-bypass-hook-trust` | Automation with vetted hooks |
| `ephemeral` | `--ephemeral` | No session rollout files |
| `ignoreUserConfig` | `--ignore-user-config` | Skip `$CODEX_HOME/config.toml` |
| `skipGitRepoCheck` | `--skip-git-repo-check` | Allow runs outside git repos |
| `outputSchema` | `--output-schema` | JSON Schema for structured final output |
| `outputLastMessage` | `--output-last-message` | Write final assistant message to file (auto temp path when `captureLastMessage` is true) |
| `captureLastMessage` | — | Default `true`: auto `--output-last-message` and read into `finalResponse` if JSONL has no assistant text |
| `isolateConfig` | — | `false` (default) = inherit `~/.codex`; `true` = temp `$CODEX_HOME` per run |

Generic `cwd` sets the child process working directory (`--cd`). MCP tool calls in Codex `--json` output map to harness names `mcp__<server>__<tool>`; shell commands map to `Bash`.

The adapter maps Codex JSONL events into the shared `StreamEvent` shape and feeds `TrajectoryBuilder`. Fixture-driven tests use committed recordings under `tests/fixtures/codex/` — CI does not require `codex` on `PATH`.

**Example suite:** [examples/codex-basic.yaml](examples/codex-basic.yaml)

**Codex judge:** set `judge.adapter: codex` and nest options under `judge.codex` in grading YAML (see [docs/suite-config.md](docs/suite-config.md)).

**Package export:** `@alis-build/harness-eval/adapters/codex`

---

## Gemini CLI adapter

Nested under `geminiCli` in YAML (or flat in programmatic config). Maps to [Gemini CLI reference](https://geminicli.com/docs/cli/cli-reference/).

The harness adapter invokes:

```bash
gemini -p "<prompt>" --output-format stream-json --approval-mode yolo [flags…]
```

| Field | CLI flag | Notes |
| ----- | -------- | ----- |
| `binary` | — | Default `gemini` |
| `model` | `--model` | Also settable at top level |
| `approvalMode` | `--approval-mode` | Default `yolo`; overridable: `default`, `auto_edit`, `plan` |
| `sandbox` | `--sandbox` | Sandboxed execution |
| `skipTrust` | `--skip-trust` | Default `true` for harness and judge — skips folder trust in headless runs |
| `includeDirectories` | `--include-directories` | Extra workspace dirs (repeatable) |
| `allowedMcpServerNames` | `--allowed-mcp-server-names` | MCP server allowlist |
| `extensions` | `--extensions` | Extension allowlist |
| `debug` | `--debug` | Verbose logging |
| `isolateConfig` | — | `false` (default) = inherit caller config; `true` = temp config dir per run |

MCP tool calls map to harness names `mcp__<server>__<tool>`; built-in Gemini tools keep native names (e.g. `Bash`, `read_file`).

The adapter maps Gemini stream-json events into the shared `StreamEvent` shape and feeds `TrajectoryBuilder`. Fixture-driven tests use committed recordings under `tests/fixtures/gemini-cli/` — CI does not require `gemini` on `PATH`.

**Example suite:** [examples/gemini-cli-basic.yaml](examples/gemini-cli-basic.yaml)

**Gemini CLI judge:** set `judge.adapter: gemini-cli` and nest options under `judge.geminiCli` in grading YAML (see [docs/suite-config.md](docs/suite-config.md)). Example: [examples/gemini-grading.yaml](examples/gemini-grading.yaml).

**Package export:** `@alis-build/harness-eval/adapters/gemini-cli`

---

## Library API

```typescript
import {
  loadSuite,
  loadSuiteDocument,
  runSuite,
  runPipeline,
  gradeReport,
  buildEvalRunEnvelope,
  trajectoryToTranscript,
  trajectoryToOtlp,
  resolveGradeOptions,
  gradingReportPassed,
} from "@alis-build/harness-eval";
import { loadGradingConfig } from "@alis-build/harness-eval/config";

// Unified pipeline
const doc = await loadSuiteDocument("./examples/pipeline/suite.yaml");
const { exitCode } = await runPipeline(doc, { maxConcurrent: 2 });

// Or step-by-step
const suite = await loadSuite("./examples/basic.yaml");
const report = await runSuite(suite, { maxConcurrent: 2 });

const gradingConfig = await loadGradingConfig("./examples/grading.yaml");
const gradeOpts = resolveGradeOptions(gradingConfig, { maxConcurrent: 2 });
const grading = await gradeReport(report, gradeOpts);

// Export trajectory for custom tooling
const view = report.cells[0].repetitions[0].adapterResult?.view;
if (view) {
  const transcript = trajectoryToTranscript(
    view,
    "Read README.md and summarize harness-eval.",
  );
  const otlp = trajectoryToOtlp(view, { prompt: "..." });
}

// Build versioned envelope for DB / CI (see docs/eval-record.md)
const envelope = buildEvalRunEnvelope(report, {
  grading,
  suite: { uri: "./examples/basic.yaml" },
});
```

Subpath exports: `@alis-build/harness-eval/runner`, `@alis-build/harness-eval/config`, `@alis-build/harness-eval/adapters/claude-code`, `@alis-build/harness-eval/adapters/codex`, `@alis-build/harness-eval/adapters/gemini-cli`.

---

## Architecture (brief)

```
Suite YAML  →  runSuite  →  Harness adapter  →  TrajectoryView
                                    ↓
                          assertions (run, in harness-eval)
                                    ↓
                          SuiteReport (report.json)
                                    ↓
              ┌─────────────────────┴─────────────────────┐
              ↓                                           ↓
    harness-eval grade              External judge / eval platform
    (optional built-in)             (LangSmith, Braintrust, custom)
              ↓                                           ↓
              └─────────────────────┬─────────────────────┘
                                    ↓
                          EvalRunEnvelope  →  DB / CI / API
```

- **Pluggable harness adapters** — `claude-code`, `codex`, and `gemini-cli` today; runner and assertions depend only on `TrajectoryView`.
- **Pluggable outcome layer** — built-in `grade`, custom `gradeFn`, or any external workflow.
- **OTLP** — observability side export; not required for scoring.

Details: [Data contracts & schemas](#data-contracts--schemas) · [External eval frameworks](#external-eval-frameworks--custom-judges) · [docs/eval-record.md](docs/eval-record.md)

---

## Development

```bash
pnpm install
pnpm run build
pnpm test              # vitest
pnpm run typecheck
pnpm run generate-schemas   # Zod → schemas/*.schema.json only
```

**Docs:** [Suite & grading YAML](docs/suite-config.md) · [Assertion DSL & adapter extension](docs/assertions.md) · [Eval record contract (DB / CI)](docs/eval-record.md)

---

## Related work

- [lastmile-ai/mcp-eval](https://github.com/lastmile-ai/mcp-eval) — model + MCP eval (not harness-specific)
- [alpic-ai/mcp-eval](https://github.com/alpic-ai/mcp-eval) — YAML-driven MCP eval
- [OpenTelemetry GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/) — OTLP export shape

---
