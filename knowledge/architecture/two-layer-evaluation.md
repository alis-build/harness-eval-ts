---
type: Architecture
title: Two-Layer Evaluation
description: How harness-eval separates deterministic behavioral assertions from LLM-based outcome grading into two independent evaluation layers.
tags: [architecture, evaluation, grading, assertions]
timestamp: 2026-06-24T00:00:00Z
---

# The Core Insight

Two fundamentally different questions arise when evaluating an AI coding agent:

1. **Did the agent do the right things?** — Did it call the expected tools, in the right order, with valid arguments, within acceptable cost and latency? This is *structural* and *deterministic*: given a trajectory, the answer is always the same.

2. **Did the agent produce a good result?** — Was the answer accurate, grounded in evidence, complete, and useful? This requires *judgment* — either human or LLM.

Conflating the two leads to slow, expensive CI gates (if you use LLM judgment for everything) or blind spots (if you skip outcome evaluation entirely). harness-eval separates them into two explicit layers.

# Layer 1 — Behavioral Evaluation

**What:** Deterministic assertions evaluated against the [`TrajectoryView`](/concepts/trajectory-view.md) at run time.

**When:** Always, during `harness-eval run`.

**How:** Pure functions in `src/assertions/evaluator.ts`. No network calls. No model. Given the same trajectory, they always return the same result.

**What you can assert:**

| Category | Examples |
|----------|---------|
| Tool presence | `called: Read`, `not_called: Bash` |
| Tool ordering | `called_before: { first: A, then: B }`, `sequence: [A, B]` |
| Tool arguments | `called_with: { tool: X, args: { key: { contains: "..." } } }` |
| Cardinality | `called: { tool: Read, times: ">= 2" }` |
| Efficiency | `iterations_within: 8`, `cost_within_usd: 0.05`, `duration_within_ms: 30000` |
| Response text | `response_contains: "..."`, `response_matches: { pattern: "..." }` |
| Stop reason | `finished_with: end_turn` |

Each assertion has a [statistical threshold](/concepts/statistical-thresholds.md). An assertion with `threshold: 0.8` passes if at least 80% of repetitions satisfy it.

**Speed:** Behavioral evaluation adds negligible overhead — assertions run in microseconds per repetition. The bottleneck is the harness subprocess itself.

**See also:** [Assertion DSL reference](/reference/assertion-dsl.md)

# Layer 2 — Outcome Grading

**What:** LLM-based (or custom function) evaluation of answer quality against named expectations.

**When:** Optionally, during `harness-eval grade` after `run` completes.

**How:** For each `(case, cell, rep)`, the grader:

1. Calls `trajectoryToTranscript()` to convert the `TrajectoryView` into a readable text transcript.
2. Builds a judge prompt from the transcript + `expectations` list.
3. Spawns a Claude Code subprocess (or calls a custom `gradeFn`) to score each expectation.
4. Returns structured `GradedExpectation[]` results.

**What you can express:**

Expectations are free-form strings in the suite YAML, under each case's `expectations` key:

```yaml
cases:
  - id: summarize-readme
    prompt: "Read README.md and summarize in one sentence."
    expectations:
      - "Describes an evaluation framework for AI coding agents"
      - "Grounded in the actual README content, not hallucinated"
      - "Concise — one sentence as instructed"
```

The judge sees the full transcript and scores each expectation independently.

**Cost consideration:** Outcome grading is more expensive than behavioral evaluation. Default concurrency is `maxConcurrent: 2` (vs 4 for run). Consider running grading async from CI.

**See also:** [Custom judges guide](/guides/custom-judges.md)

# Comparison

| Dimension | Behavioral (Layer 1) | Outcome (Layer 2) |
|-----------|---------------------|-------------------|
| Trigger | `harness-eval run` | `harness-eval grade` |
| Speed | Fast (milliseconds per assertion) | Slow (LLM call per rep) |
| Cost | Zero (deterministic) | Non-zero (model tokens) |
| Reproducible | Yes — same trajectory → same result | No — LLM judge varies |
| What it catches | Wrong tools, wrong args, wrong order, inefficiency | Wrong answer, hallucination, incomplete response |
| When to skip | Never — always run | When outcome quality isn't the gate |

# Recommended CI pattern

```
CI job 1: harness-eval run (fast, deterministic)
  → Gate on assertion pass rates
  → Blocks PR if behavioral regressions detected

CI job 2: harness-eval grade (async, expensive)
  → Runs after PR merges, or on a schedule
  → Results stored in EvalRunEnvelope for trending
```

Both jobs write their results into a single [`EvalRunEnvelope`](/concepts/eval-run-envelope.md) that accumulates in a database for dashboards.

See [CI/CD integration guide](/guides/ci-cd-integration.md) for a complete example.

# Citations

[1] `src/assertions/evaluator.ts` — behavioral assertion evaluator
[2] `src/grader/grade-report.ts` — outcome grading orchestrator
[3] `src/grader/transcript.ts` — trajectoryToTranscript()
[4] `docs/assertions.md` — assertion reference
