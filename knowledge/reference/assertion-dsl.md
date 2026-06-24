---
type: Reference
title: Assertion DSL
description: Complete reference for the declarative assertion language used in suite YAML files to specify expected harness behavior.
tags: [assertions, dsl, reference, tool-calls, behavior]
timestamp: 2026-06-24T00:00:00Z
---

# Overview

Assertions are declared under each test case in the suite YAML. They define the expected behavioral properties of harness sessions and are evaluated deterministically against [`TrajectoryView`](/concepts/trajectory-view.md) data.

Each assertion supports an optional `threshold` field (default `1.0`) that sets the minimum fraction of repetitions that must pass for the assertion to be considered satisfied. See [statistical thresholds](/concepts/statistical-thresholds.md).

```yaml
cases:
  - id: my-case
    assertions:
      - called: Read           # shorthand — no threshold needed
      - called: Bash
        threshold: 0.8         # explicit threshold
```

---

# 1. Tool presence

## called

Asserts that a tool was called at least once (or a specified number of times).

```yaml
# Simple — tool must be called at least once
- called: Read

# With tool name (explicit object form)
- called:
    tool: Read

# With glob pattern
- called:
    tool: "mcp__plugin__*"     # any tool matching the glob

# With cardinality
- called:
    tool: Read
    times: ">= 2"              # must be called 2 or more times

- called:
    tool: Bash
    times: "== 1"              # exactly once

- called:
    tool: Write
    times: "<= 3"              # no more than 3 times
```

**Cardinality operators:** `==`, `!=`, `>=`, `<=`, `>`, `<`

## not_called

Asserts that a tool was never called.

```yaml
- not_called: Bash
- not_called: "mcp__plugin__*"    # glob: none of these tools called
```

## called_any_of

Asserts that at least one of the listed tools was called.

```yaml
- called_any_of: [Read, Bash]
- called_any_of:
    tools: [Read, Bash]
```

## called_all_of

Asserts that all of the listed tools were called.

```yaml
- called_all_of: [Read, mcp__plugin__SearchSkills]
```

---

# 2. Tool ordering

## called_before

Asserts that tool A was called before tool B (by `turnIndex`/`callIndex` ordering). Does not require them to be adjacent.

```yaml
- called_before:
    first: mcp__plugin__SearchSkills
    then: mcp__plugin__LoadSkill
```

Glob patterns are supported in both `first` and `then`.

## sequence

Asserts that a sequence of tools was called in order. By default, allows interleaving — other tools may appear between the listed tools.

```yaml
# Interleaved (default): A then B then C, other calls allowed between
- sequence: [mcp__plugin__SearchSkills, mcp__plugin__LoadSkill, mcp__plugin__RunBuild]

# Strict: A then B then C, contiguous (no other calls between)
- sequence:
    tools: [A, B, C]
    strict: true
```

---

# 3. Tool arguments

## called_with

Asserts that a tool was called with arguments matching a predicate. Evaluates against all calls to the specified tool — passes if **any** call matches.

```yaml
- called_with:
    tool: mcp__plugin__SearchSkills
    args:
      query:
        contains: "neuron"        # arg must contain this substring
      limit:
        gte: 5                    # arg must be >= 5

- called_with:
    tool: Read
    args:
      file_path:
        regex: ".*\\.md$"        # arg must match regex
```

**Predicate operators for arguments:**

| Operator | Meaning | Example |
|----------|---------|---------|
| `equals` | Exact match | `{ equals: "README.md" }` |
| `contains` | Substring match | `{ contains: "neuron" }` |
| `not_contains` | Not a substring | `{ not_contains: "error" }` |
| `regex` | Regex match | `{ regex: ".*\\.ts$" }` |
| `gte` | Numeric ≥ | `{ gte: 5 }` |
| `lte` | Numeric ≤ | `{ lte: 10 }` |
| `gt` | Numeric > | `{ gt: 0 }` |
| `lt` | Numeric < | `{ lt: 100 }` |
| `one_of` | Value in list | `{ one_of: ["a", "b"] }` |
| `any_of` | At least one predicate matches | `{ any_of: [{ contains: "a" }, { contains: "b" }] }` |
| `all_of` | All predicates match | `{ all_of: [{ contains: "a" }, { gte: 5 }] }` |
| `not` | Negation | `{ not: { equals: "bad" } }` |

**Shorthand:** A bare string value is treated as `{ equals: value }`.

```yaml
args:
  file_path: "README.md"        # equivalent to: { equals: "README.md" }
```

---

# 4. Behavior

## responded_without_tool_calls

Asserts that the session completed without calling any tools.

```yaml
- responded_without_tool_calls: true   # no tools called
- responded_without_tool_calls: false  # at least one tool was called
```

## iterations_within

Asserts that the number of assistant turns is within a maximum.

```yaml
- iterations_within: 8     # must complete in 8 or fewer turns
```

## cost_within_usd

Asserts that the session's total cost is within a budget.

```yaml
- cost_within_usd: 0.10    # must cost $0.10 or less
```

## duration_within_ms

Asserts that the session's wall-clock duration is within a limit.

```yaml
- duration_within_ms: 30000    # must complete within 30 seconds
```

## finished_with

Asserts the final stop reason of the session.

```yaml
- finished_with: end_turn       # model chose to stop
- finished_with: max_turns      # hit --max-turns limit
- finished_with: timeout        # adapter timeout fired
```

---

# 5. Response text

## response_contains

Asserts that the final response text contains a substring.

```yaml
- response_contains: "neuron"
- response_contains:
    value: "neuron"
    case_sensitive: false      # optional; default true
```

## response_not_contains

Asserts that the final response text does NOT contain a substring.

```yaml
- response_not_contains: "I don't have access"
- response_not_contains: "error"
```

## response_matches

Asserts that the final response text matches a regex.

```yaml
- response_matches:
    pattern: "step \\d+:"
    flags: i                   # case-insensitive
```

---

# 6. Compound assertions

## all_of

Passes if all nested assertions pass.

```yaml
- all_of:
    - called: Read
    - not_called: Bash
    - iterations_within: 5
```

## any_of

Passes if at least one nested assertion passes.

```yaml
- any_of:
    - called: Read
    - called: Bash
```

## not

Passes if the nested assertion fails.

```yaml
- not:
    called: Bash

- not:
    responded_without_tool_calls: true
```

Compound assertions are recursively composable — `any_of` can contain `all_of`, etc.

---

# Tool name patterns

Tool names support glob patterns (`*`, `?`, `[abc]`) in all tool-name fields. Pattern matching is applied to the full tool name.

```yaml
- called: "mcp__plugin__*"           # any tool from mcp__plugin__
- called: "mcp__*__Search*"          # any tool matching this pattern
- not_called: "mcp__*"               # no MCP tools at all
```

Source: `src/assertions/patterns.ts`

---

# Assertion evaluation

All assertions are pure functions evaluated in `src/assertions/evaluator.ts`. They receive a `TrajectoryView` and return `AssertionResult { passed, evidence }`. No network calls are made during assertion evaluation.

See [statistical thresholds](/concepts/statistical-thresholds.md) for how per-repetition results are aggregated into pass rates.

# Citations

[1] `src/types/assertions.ts` — Assertion discriminated union types
[2] `src/assertions/evaluator.ts` — Evaluation entry point
[3] `src/assertions/tool-calls.ts` — Tool presence/ordering assertions
[4] `src/assertions/behavior.ts` — Behavioral assertions
[5] `src/assertions/predicates.ts` — Predicate matching
[6] `src/assertions/patterns.ts` — Glob pattern matching
[7] `src/assertions/compound.ts` — Compound assertions
[8] `docs/assertions.md` — Official assertions documentation
