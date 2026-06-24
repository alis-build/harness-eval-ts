---
type: Concept
title: Matrix Cells
description: Configuration points in a multi-axis test matrix — how harness-eval fans out test cases across model, plugin, and configuration variants.
tags: [data-model, matrix, configuration, testing]
timestamp: 2026-06-24T00:00:00Z
---

# What is a matrix cell?

A **matrix cell** is one configuration point in the test matrix. Each case in the suite runs once per cell. If you have 3 cases and 2 cells, `runSuite` executes 6 `(case × cell)` combinations (each potentially repeated N times).

Matrix cells are used to test the same prompt against different:

- **Models** (e.g., Sonnet vs Opus)
- **Plugin configurations** (different MCP servers or plugin versions)
- **Permission modes** (e.g., `acceptEdits` vs `bypassPermissions`)
- **Tool allowlists** (narrow vs broad tool access)

# Defining cells in YAML

```yaml
matrix:
  - label: sonnet          # Required — unique identifier for this cell
    axes:                  # Optional — metadata tags (not merged into config)
      model: claude-sonnet-4-6
    config:                # Config overrides for this cell
      model: claude-sonnet-4-6

  - label: opus
    axes:
      model: claude-opus-4-8
    config:
      model: claude-opus-4-8
      claudeCode:
        maxTurns: 10       # Opus gets more turns

  - label: with-plugin
    config:
      claudeCode:
        pluginDirs: ["/path/to/plugin"]
        allowedTools: [Read, mcp__plugin__*]
```

**`label`** — Required. Must be unique within the matrix. Used in report output and as `cellLabel` in `EvalCellResult`.

**`axes`** — Optional metadata. Arbitrary key/value pairs for labeling/filtering. Not merged into config. Useful for structured analysis (e.g., group results by `model` axis).

**`config`** — Config overrides applied on top of `defaultConfig` and case-level `config`. See config merge order below.

# Config merge order

For each `(case, cell)` pair, the final config is assembled as:

```
defaultConfig           (suite-level fallback)
    ↓ merged by
case.config             (case-level overrides)
    ↓ merged by
cell.config             (cell-level overrides)
    = ResolvedConfig    (final config for this execution)
```

**Important:** List fields (e.g., `allowedTools`, `pluginDirs`) are **replaced**, not appended, at each merge step. If `defaultConfig` has `allowedTools: [Read]` and a cell sets `allowedTools: [Read, Bash]`, the result is `[Read, Bash]` — not a merge. This is intentional: tool allowlists are security-sensitive and must be explicit.

Scalar fields (strings, numbers, booleans) are replaced at each level. Nested objects are merged shallowly (top-level keys replace; nested structure is preserved unless overridden).

# Running without a matrix

If the suite YAML omits `matrix`, `runSuite` creates a single implicit cell with an empty config. The suite runs as if there is one cell labeled `default`.

This is the typical setup for simple smoke tests:

```yaml
adapter: claude-code
defaultConfig:
  model: claude-sonnet-4-6
  # no matrix — single cell
cases:
  - id: basic-test
    prompt: "..."
    repetitions: 3
```

# CellReport output

Each `(case × cell)` pair produces one `CellReport` in the `SuiteReport`. The `cellLabel` field identifies which matrix cell the report belongs to. In `EvalRunEnvelope`, the same label appears in `EvalCellResult.cellLabel`.

# Citations

[1] `src/config/schema.ts` — Zod schema for matrix YAML
[2] `src/config/resolve-config.ts` — config merge logic
[3] `src/runner/suite.ts` — fan-out across cases × cells
[4] `docs/suite-config.md` — matrix configuration reference
