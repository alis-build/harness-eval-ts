---
type: Concept
title: Statistical Thresholds
description: How harness-eval converts per-repetition assertion pass/fail results into aggregate pass rates, and how thresholds determine whether a cell passes or fails.
tags: [data-model, statistics, thresholds, assertions, reliability]
timestamp: 2026-06-24T00:00:00Z
---

# Why thresholds exist

AI agent behavior is non-deterministic. The same prompt can produce different tool-call sequences on different runs. A strict "must always call X" assertion would be unreliable — a single unlucky run would fail the suite even if the agent calls the right tool 90% of the time.

Thresholds solve this: instead of requiring every repetition to pass, an assertion with `threshold: 0.8` passes if at least 80% of repetitions satisfy it. This lets you express reliability requirements rather than strict determinism.

# How thresholds work

For each `(case, cell)` combination:

1. `runSuite` runs the harness `repetitions` times (default: 5 per case × cell).
2. Each repetition produces a `TrajectoryView` and a set of `AssertionResult` values.
3. For each assertion, harness-eval counts how many repetitions produced `passed: true`.
4. The `passRate = passCount / totalCount` is compared to the assertion's `threshold`.
5. If `passRate >= threshold`, the assertion passes. Otherwise it fails.
6. A `CellReport` is `passed: true` only if **all** its assertions pass.

# Configuring thresholds

Thresholds are set per-assertion in the suite YAML:

```yaml
cases:
  - id: search-example
    repetitions: 5
    assertions:
      # Must call SearchSkills in every rep
      - called: mcp__plugin__SearchSkills
        threshold: 1.0          # default — 100% required

      # Read is preferred but optional — 60% is acceptable
      - called: Read
        threshold: 0.6

      # Must NOT call Bash in any rep
      - not_called: Bash
        threshold: 1.0
```

**Default threshold:** `1.0` (strict). Every repetition must pass. You must explicitly set a lower threshold to allow partial passes.

**Recommended values:**

| Scenario | Threshold |
|----------|-----------|
| Required tool (must always fire) | `1.0` |
| Preferred tool (usually fires) | `0.8` |
| Tool that sometimes fires | `0.6` |
| Efficiency constraint (soft) | `0.8` |
| Hard budget/latency constraint | `1.0` |

# Choosing repetition counts

More repetitions → more reliable pass rate estimates, but slower runs.

| Reps | Threshold | Minimum passing reps |
|------|-----------|---------------------|
| 3 | 1.0 | 3/3 |
| 3 | 0.8 | 2.4 → 3/3 (rounds up effectively) |
| 5 | 0.8 | 4/5 |
| 5 | 0.6 | 3/5 |
| 10 | 0.8 | 8/10 |

**Practical guidance:**

- **3 reps** — Fast smoke tests; only use `threshold: 1.0` assertions (strict determinism).
- **5 reps** (default) — Good balance for most cases. Supports thresholds down to `0.6`.
- **10+ reps** — For statistical robustness when measuring reliability of a non-deterministic behavior.

# Reading assertion stats in reports

The console output shows per-assertion pass rates for each cell:

```
✓ cell: sonnet
  ✓ called: mcp__plugin__SearchSkills   [5/5 = 100%]  threshold=1.0
  ✓ called: Read                        [4/5 = 80%]   threshold=0.8
  ✗ not_called: Bash                    [3/5 = 60%]   threshold=1.0  FAIL
```

In the `SuiteReport`, this is captured in `CellReport.assertionStats`:

```typescript
{
  assertion: { not_called: "Bash" },
  threshold: 1.0,
  passCount: 3,
  totalCount: 5,
  passRate: 0.6,
  passed: false
}
```

# Baseline comparison

`harness-eval run --baseline <previous-report.json>` diffs assertion pass rates between two runs. This lets you detect regressions in reliability, not just binary pass/fail:

```
  called: SearchSkills  sonnet  4/5 → 5/5  ↑
  called: Read          sonnet  4/5 → 2/5  ↓ REGRESSION
```

# Citations

[1] `src/assertions/evaluator.ts` — assertion evaluation and stat aggregation
[2] `src/runner/case.ts` — per-rep assertion evaluation
[3] `src/runner/types.ts` — EvalAssertionStat type
[4] `docs/assertions.md` — assertion DSL with threshold examples
