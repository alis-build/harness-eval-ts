---
type: Reference
title: Suite YAML Configuration
description: Complete reference for the suite YAML file format used to define test cases, matrix cells, assertions, and harness configuration.
tags: [configuration, yaml, suite, reference]
timestamp: 2026-06-24T00:00:00Z
---

# Overview

A suite YAML file is the primary input to `harness-eval run` and `harness-eval pipeline`. It defines:

- Which harness adapter to use
- Default harness configuration
- A matrix of configuration variants
- Test cases with prompts, assertions, and expectations
- Optionally: inline **`judge:`** (outcome grading config) and **`pipeline:`** (orchestration)

Use **one `suite.yaml` per harness target** (e.g. separate files for Claude Code vs Codex when tool names differ).

```yaml
# Top-level keys
adapter: claude-code          # Optional; default "claude-code"
defaultConfig: { ... }        # Optional; base config for all cases/cells
matrix: [ ... ]               # Optional; list of configuration cells
cases: [ ... ]                # Required (or cases/ directory)
judge: { ... }                # Optional; inline grading config
pipeline: { ... }             # Optional; run → grade → envelope orchestration
```

# Top-level fields

## adapter

```yaml
adapter: claude-code
```

Selects the harness adapter. Defaults to `"claude-code"`. Must match an ID in the adapter registry. See [adapter pattern](/architecture/adapters.md).

## defaultConfig

Base configuration applied to all `(case, cell)` combinations. Overridden by `case.config` and then `cell.config`.

```yaml
defaultConfig:
  model: claude-sonnet-4-6     # model ID
  timeoutMs: 120000             # harness process timeout (ms)
  cwd: ..                       # working directory for harness
  maxTurns: 10                  # --max-turns for Claude
  claudeCode:                   # Claude Code adapter config
    permissionMode: bypassPermissions
    allowedTools: [Read, mcp__plugin__*]
    isolateConfig: false        # false = use logged-in config
```

For `claudeCode` fields see [Claude Code adapter reference](/reference/claude-code-adapter.md).

## matrix

A list of configuration cells. Each case runs once per cell.

```yaml
matrix:
  - label: sonnet              # Required; unique label
    axes:                      # Optional metadata (not merged into config)
      model: claude-sonnet-4-6
    config:                    # Optional config overrides
      model: claude-sonnet-4-6

  - label: opus
    axes:
      model: claude-opus-4-8
    config:
      model: claude-opus-4-8
```

If `matrix` is omitted, a single implicit cell is used. See [matrix cells](/concepts/matrix-cells.md).

## cases

A list of test cases. Each case is a `(prompt, repetitions, assertions, expectations)` bundle.

```yaml
cases:
  - id: my-case-id             # Required; unique within the suite
    prompt: "..."              # Required; sent to the harness
    repetitions: 5             # Optional; default 5
    config: { ... }            # Optional; case-level config overrides
    assertions: [ ... ]        # Optional; behavioral assertions
    expectations: [ ... ]      # Optional; outcome expectations for grading
```

---

# Case fields

## id

```yaml
id: search-and-load
```

Required. Must be unique within the suite. Used as `caseId` in reports and envelopes.

## prompt

```yaml
prompt: |
  Search for a skill related to building neurons. Load the first result
  and summarize what it does.
```

The text prompt sent to the harness. Multi-line prompts use YAML block scalars (`|`).

## repetitions

```yaml
repetitions: 5
```

How many times to run this case per cell. Default: 5. Higher values produce more reliable pass-rate estimates but take longer. See [statistical thresholds](/concepts/statistical-thresholds.md).

## config

```yaml
config:
  model: claude-opus-4-8
  claudeCode:
    allowedTools: [Read, Write]
```

Case-level config overrides. Applied on top of `defaultConfig`, before `cell.config`. List fields (e.g., `allowedTools`) are replaced, not merged.

## assertions

A list of assertions evaluated against every repetition's `TrajectoryView`. See [assertion DSL reference](/reference/assertion-dsl.md) for the full syntax.

```yaml
assertions:
  - called: mcp__plugin__SearchSkills
    threshold: 1.0

  - called_before:
      first: mcp__plugin__SearchSkills
      then: mcp__plugin__LoadSkill

  - iterations_within: 8
    threshold: 0.8

  - not_called: Bash
```

## expectations

Free-form strings describing expected outcomes. Used by `harness-eval grade` as inputs to the LLM judge.

```yaml
expectations:
  - "Identifies a skill relevant to the neuron build workflow"
  - "Summarizes the skill's purpose accurately"
  - "Grounded in the skill's actual documentation, not hallucinated"
```

---

# Config fields (shared across defaultConfig / case / cell)

## model

```yaml
model: claude-sonnet-4-6
```

Model ID passed to `--model`. Overrides the Claude Code default.

## timeoutMs

```yaml
timeoutMs: 120000
```

Process-level timeout in milliseconds. If the harness subprocess does not exit within this time, it is killed and the repetition is recorded as an error.

## cwd

```yaml
cwd: /path/to/project
# or relative to the suite YAML:
cwd: ..
```

Working directory for the harness process. Relative paths are resolved relative to the suite YAML file's directory.

## maxTurns

```yaml
maxTurns: 10
```

Maps to `--max-turns`. Limits how many assistant turns the harness will take before stopping.

## claudeCode

Nested config block for Claude Code adapter options. See [Claude Code adapter reference](/reference/claude-code-adapter.md).

---

# Multi-file suites

Large suites can split cases across multiple files:

```yaml
# suite.yaml
adapter: claude-code
defaultConfig: { ... }
matrix: [ ... ]
cases:
  dir: ./cases                 # load all YAML files from this directory
```

Each file in `./cases/` is a list of case objects. They are merged in alphabetical filename order.

See `examples/multi-file/` for a working example.

---

# Inline judge (`judge:`)

Optional top-level block with the same shape as standalone `grading.yaml`. Colocates outcome-judge config with the suite (one file per harness).

```yaml
judge:
  adapter: claude-code
  model: claude-sonnet-4-6
  timeoutMs: 300000
  maxConcurrent: 2
  system_instruction: "You are a strict evaluator."
  claudeCode:
    permissionMode: bypassPermissions
```

Use with:

```bash
harness-eval grade report.json --suite my-suite/suite.yaml
```

Standalone `grading.yaml` remains supported via `grade --config`. See [docs/suite-config.md](https://github.com/alis-build/harness-eval/blob/main/docs/suite-config.md) for all `judge` fields.

**Auth note:** When the harness uses Vertex or logged-in config (`isolateConfig: false`), the judge block should mirror the same `env` / `claudeCode` settings — otherwise grading may fail while behavioral run passes.

---

# Pipeline orchestration (`pipeline:`)

Optional block enabling **`harness-eval pipeline`**. Step presence under `pipeline` enables that step.

```yaml
pipeline:
  run:
    output: report.json
    maxConcurrent: 4
  grade:
    input: report.json      # optional; implicit from run output
    output: grading.json
  envelope:
    report: report.json     # optional
    grading: grading.json   # optional; omit for behavioral-only envelope
    output: envelope.json
    projection: envelope    # envelope | trajectory | instances
```

**Input resolution:** CLI flags > explicit YAML paths > prior step output in this run > configured default path if file exists on disk.

```bash
harness-eval pipeline my-suite/
harness-eval pipeline my-suite/ --steps run,grade
harness-eval pipeline my-suite/ --steps envelope   # reuse existing artifacts
```

When `pipeline` is omitted, use `run`, `grade`, and `envelope` separately. See [CLI commands — pipeline](/reference/cli-commands.md#harness-eval-pipeline) and [examples/pipeline/](https://github.com/alis-build/harness-eval/tree/main/examples/pipeline).

---

# Full example

```yaml
adapter: claude-code

defaultConfig:
  model: claude-sonnet-4-6
  timeoutMs: 120000
  cwd: ..
  claudeCode:
    isolateConfig: false
    permissionMode: bypassPermissions
    allowedTools:
      - Read
      - mcp__plugin__SearchSkills
      - mcp__plugin__LoadSkill

matrix:
  - label: sonnet
    config:
      model: claude-sonnet-4-6
  - label: opus
    config:
      model: claude-opus-4-8
      claudeCode:
        allowedTools:
          - Read
          - mcp__plugin__SearchSkills
          - mcp__plugin__LoadSkill
          - mcp__plugin__RunBuild   # Opus also gets RunBuild

cases:
  - id: search-skills
    prompt: "Search for a skill to build a neuron. Load the first result."
    repetitions: 5
    assertions:
      - called: mcp__plugin__SearchSkills
        threshold: 1.0
      - called: mcp__plugin__LoadSkill
        threshold: 0.8
      - called_before:
          first: mcp__plugin__SearchSkills
          then: mcp__plugin__LoadSkill
      - iterations_within: 6
        threshold: 0.8
    expectations:
      - "Finds a skill related to neuron builds"
      - "Loads and references the skill's content"
```

# Citations

[1] `src/config/schema.ts` — Zod schema validating suite YAML
[2] `src/config/loader.ts` — loadSuite(), loadSuiteDocument()
[3] `src/config/suite-document-loader.ts` — unified suite file loading
[4] `src/config/resolve-config.ts` — config merge logic
[5] `docs/suite-config.md` — official suite configuration reference
[6] `examples/basic.yaml` — minimal example
[7] `examples/pipeline/` — unified judge + pipeline example
[8] `examples/matrix.yaml` — multi-cell matrix example
