---
type: Overview
title: harness-eval — Project Overview
description: Statistical evaluation framework for AI coding agent harnesses; answers whether a harness reliably calls the right tools.
tags: [eval, ai-agents, claude-code, codex, gemini-cli, testing, harness]
timestamp: 2026-06-24T00:00:00Z
---

# What is harness-eval?

`@alis-build/harness-eval` is a statistical evaluation framework for **AI coding agent harnesses** — the plugin and configuration layers that sit atop foundation models (Claude Code, Codex, Gemini CLI, and others). It answers one core question:

> When a user asks *X*, does this harness reliably call our MCP tools — in the right order, with the right arguments, within acceptable cost and latency — across different models and plugin configurations?

It is **not** a general-purpose LLM benchmark. It evaluates the *integration* between a foundation model and a harness (tools, system prompt, permissions, MCP servers), not the model in isolation.

# Why it exists

AI coding agent harnesses are difficult to evaluate because:

1. **Non-determinism** — the same prompt can produce different tool-call sequences on each run. A one-shot test is unreliable; you need to run many repetitions and look at pass rates.
2. **Structural complexity** — the signal of interest (which tools were called, in what order, with what arguments) is buried in a vendor-specific stream format that changes between harness versions.
3. **Two distinct concerns** — *did the agent call the right tools?* (deterministic, fast) and *did the agent produce a good answer?* (requires judgment, slower) need different evaluation strategies.
4. **Configuration matrices** — a harness may be tested across multiple models, plugin versions, or permission modes. Running all combinations manually is impractical.

harness-eval addresses all four by providing:

- **Statistical repetitions** — each test case runs N times per configuration cell; assertions fire against the aggregated pass rate.
- **Normalized trajectory format** — a vendor-neutral [`TrajectoryView`](/concepts/trajectory-view.md) that abstracts over vendor-specific output (Claude `stream-json`, Codex `exec --json`, Gemini `stream-json`, etc.), enabling assertions to work without parsing raw streams.
- **Two-layer evaluation** — deterministic [behavioral assertions](/reference/assertion-dsl.md) for tool-call behavior, plus an optional LLM judge for outcome quality. See [Two-layer evaluation](/architecture/two-layer-evaluation.md).
- **Configuration matrix** — a declarative YAML [suite format](/reference/suite-yaml.md) with a `matrix` block that fans out runs across cells.

# Key concepts

| Concept | Description |
|---------|-------------|
| [Suite YAML](/reference/suite-yaml.md) | Declarative test specification: cases, matrix, assertions, expectations |
| [TrajectoryView](/concepts/trajectory-view.md) | Normalized, vendor-neutral snapshot of one harness session |
| [SuiteReport](/concepts/suite-report.md) | Full run output: all trajectories, assertion stats, cell results |
| [EvalRunEnvelope](/concepts/eval-run-envelope.md) | Versioned interchange document for DB / CI / APIs |
| [Assertion DSL](/reference/assertion-dsl.md) | Declarative language for asserting tool-call behavior |
| [Matrix cells](/concepts/matrix-cells.md) | Configuration points in a multi-axis test matrix |
| [Statistical thresholds](/concepts/statistical-thresholds.md) | How pass rates turn assertions into pass/fail gates |

# Design decisions

**Adapters are pluggable.** The framework defines a `HarnessAdapter` interface. Three built-in harness adapters ship today: [Claude Code](/reference/claude-code-adapter.md), [Codex](/reference/codex-adapter.md), and [Gemini CLI](/reference/gemini-cli-adapter.md). Each has a matching built-in judge. Assertions and judges never parse vendor streams directly — they operate on `TrajectoryView`.

**Behavioral evaluation is deterministic.** Assertions are pure functions: given a trajectory, they return pass or fail. No LLM is involved. This makes behavioral gates fast, cheap, and reproducible.

**Outcome grading is optional.** The LLM judge (or a custom `gradeFn`) is a separate step that runs after `run`. Splitting the two allows fast CI gates on tool-call behavior with async outcome evaluation in a separate job.

**The data contract is versioned.** [`EvalRunEnvelope`](/concepts/eval-run-envelope.md) is a stable, schema-versioned document suitable for storage in a database or comparison across releases.

# Package details

| Field | Value |
|-------|-------|
| Package name | `@alis-build/harness-eval` |
| Current version | 0.1.3 |
| Node requirement | ≥22.12.0 |
| Module format | ES Module |
| License | Apache-2.0 |
| Binary | `harness-eval` |

# Citations

[1] [README.md](../README.md)
[2] [docs/suite-config.md](../docs/suite-config.md)
[3] [docs/assertions.md](../docs/assertions.md)
[4] [docs/eval-record.md](../docs/eval-record.md)
