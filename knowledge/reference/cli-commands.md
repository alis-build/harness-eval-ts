---
type: Reference
title: CLI Commands
description: Complete reference for all harness-eval subcommands, flags, and options.
tags: [cli, reference, commands]
timestamp: 2026-06-24T00:00:00Z
---

# harness-eval

```
harness-eval <command> [options]
```

Four subcommands cover the full evaluation workflow:

| Command | Purpose |
|---------|---------|
| `run` | Execute a suite; evaluate behavioral assertions |
| `grade` | Run outcome judge against a report |
| `envelope` | Build a versioned EvalRunEnvelope from a report |
| `format` | Re-render an existing report without re-running |

---

# harness-eval run

Run a suite YAML, spawn harness sessions, evaluate assertions, and write results.

```bash
harness-eval run <suite.yaml> [options]
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--output <path>` | — | Write full SuiteReport JSON to this path |
| `--format <mode>` | `console` | Output format: `console`, `markdown`, `json` |
| `--baseline <path>` | — | Compare pass rates against a previous report |
| `--max-concurrent <n>` | `4` | Maximum simultaneous harness subprocesses |
| `--adapter <id>` | `claude-code` | Harness adapter to use |
| `--progress <mode>` | `default` | Progress mode: `default`, `quiet`, `verbose`, `json` |
| `--quiet` | — | Alias for `--progress quiet` |
| `--verbose` | — | Alias for `--progress verbose` |
| `--otel-output <dir>` | — | Write one OTLP JSON file per repetition to this directory |

## Examples

```bash
# Run suite, print console report
harness-eval run examples/basic.yaml

# Run suite, save report for later use
harness-eval run examples/basic.yaml --output report.json

# Run with baseline comparison (detect regressions)
harness-eval run examples/basic.yaml --baseline previous/report.json --output report.json

# Run matrix suite, limit concurrency
harness-eval run examples/matrix.yaml --max-concurrent 2 --output report.json

# Emit JSON progress (for CI log parsing)
harness-eval run examples/basic.yaml --progress json
```

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | All cells passed (all assertions met thresholds) |
| `1` | One or more cells failed |
| `2` | Suite failed to load or fatal error |

---

# harness-eval grade

Run an LLM judge (or custom `gradeFn`) against an existing `SuiteReport`.

```bash
harness-eval grade <report.json> [options]
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--config <grading.yaml>` | — | Standalone grading configuration file |
| `--output <path>` | — | Write grading JSON to this path |
| `--expectations <path>` | — | Sidecar expectations file (if not embedded in report) |
| `--model <id>` | from config | Override judge model |
| `--timeout-ms <n>` | `300000` | Judge subprocess timeout |
| `--max-concurrent <n>` | `2` | Maximum simultaneous judge subprocesses |
| `--format <mode>` | `console` | Output format for grading summary |

## Examples

```bash
# Grade with default judge config
harness-eval grade report.json --output grading.json

# Grade with custom judge config
harness-eval grade report.json --config grading.yaml --output grading.json

# Override judge model
harness-eval grade report.json --model claude-opus-4-8 --output grading.json
```

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | All expectations passed |
| `1` | One or more expectations failed |
| `2` | Fatal error |

---

# harness-eval envelope

Build a versioned `EvalRunEnvelope` from a `SuiteReport` and optional grading output.

```bash
harness-eval envelope <report.json> [options]
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--output <path>` | stdout | Write envelope JSON to this path |
| `--grading <path>` | — | Merge a grading JSON into the envelope |
| `--suite <path>` | — | Add suite provenance (URI + content hash) |
| `--projection <mode>` | `envelope` | Output shape: `envelope`, `trajectory`, `instances` |
| `--include-raw-stream-events` | false | Include vendor stream events in repetitions |
| `--no-transcript` | false | Omit text transcripts from repetitions |

## Projections

| Projection | Output |
|-----------|--------|
| `envelope` | Full `EvalRunEnvelope` JSON |
| `trajectory` | Vertex AI trajectory JSONL (one line per repetition) |
| `instances` | Vertex AI evaluation instances JSONL |

## Examples

```bash
# Basic envelope from run output
harness-eval envelope report.json --output envelope.json

# Merge behavioral + outcome results
harness-eval envelope report.json \
  --grading grading.json \
  --suite examples/basic.yaml \
  --output envelope.json

# Emit Vertex AI trajectory format
harness-eval envelope report.json --projection trajectory --output trajectory.jsonl
```

---

# harness-eval format

Re-render an existing `SuiteReport` without re-running the harness.

```bash
harness-eval format <report.json> [options]
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--format <mode>` | `console` | Output format: `console`, `markdown`, `json` |
| `--baseline <path>` | — | Compare against a previous report |

## Examples

```bash
# Re-render as markdown (e.g. for a PR comment)
harness-eval format report.json --format markdown

# Diff two reports
harness-eval format report.json --baseline previous.json --format console
```

---

# Global behavior

**Progress output:** The `--progress json` mode emits newline-delimited JSON events to stderr. Each event has a `type` and a payload. Useful for CI log parsers or dashboards.

**Environment variables:** The harness subprocess inherits the environment of the parent process. Set `ANTHROPIC_API_KEY` (or equivalent) before running.

**Node version:** Requires Node.js ≥22.12.0.

# Citations

[1] `src/cli/commands/run.ts` — run command implementation
[2] `src/cli/commands/grade.ts` — grade command implementation
[3] `src/cli/commands/envelope.ts` — envelope command implementation
[4] `src/cli/commands/format.ts` — format command implementation
[5] `src/cli/args.ts` — argument parsing
