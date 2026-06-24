---
type: Architecture
title: Harness Adapter Pattern
description: How pluggable harness adapters decouple evaluation logic from vendor-specific subprocess management and stream parsing.
tags: [architecture, adapters, claude-code, extensibility]
timestamp: 2026-06-24T00:00:00Z
---

# Purpose

Different AI coding harnesses (Claude Code, Cursor, Gemini CLI) each have their own subprocess protocol, output format, and configuration API. If assertions and judges operated on raw vendor output, every new harness would require rewriting the entire evaluation layer.

The adapter pattern solves this by inserting a translation layer between vendor output and the normalized [`TrajectoryView`](./concepts/trajectory-view.md):

```
HarnessAdapter (vendor-specific)
  ├── spawns subprocess
  ├── reads vendor output (e.g., Claude stream-json)
  ├── parses events into TrajectoryView
  └── returns AdapterResult

Assertions / Judges (vendor-neutral)
  └── operate exclusively on TrajectoryView
```

# HarnessAdapter interface

Defined in `src/adapters/types.ts`:

```typescript
interface HarnessAdapter {
  run(prompt: string, config: ResolvedConfig): Promise<AdapterResult>;
}

interface AdapterResult {
  view: TrajectoryView;           // normalized session snapshot
  rawStreamEvents?: StreamEvent[]; // optional vendor debug data
  error?: AdapterError;           // harness-level error (timeout, crash)
}
```

An adapter receives a fully-resolved config (after `defaultConfig → case → cell` merge) and a prompt string. It must return an `AdapterResult`. How it produces the `TrajectoryView` is entirely its concern.

# Adapter registry

Adapters are registered by ID:

```typescript
// src/adapters/registry.ts
registerAdapter("claude-code", new ClaudeCodeAdapter());

// Retrieval
const adapter = getAdapter(suite.adapter ?? "claude-code");
```

The `adapter` field in the suite YAML selects which adapter `runSuite` uses. Defaults to `"claude-code"`.

# Claude Code adapter

The only built-in adapter. Source: `src/adapters/claude-code/`.

**Subprocess protocol:**

1. Builds CLI flags from `ResolvedConfig` via `src/adapters/claude-code/flags.ts`.
2. Always appends: `-p "<prompt>" --output-format stream-json --verbose`.
3. Spawns the `claude` binary (configurable via `claudeCode.binary`).
4. Reads stdout line-by-line; each line is a JSON object (`StreamEvent`).
5. Passes events to `TrajectoryBuilder` as they arrive.
6. On process exit (or timeout), finalizes the `TrajectoryView`.

**Key flags built from config:**

| Config field | CLI flag |
|-------------|---------|
| `model` | `--model` |
| `claudeCode.permissionMode` | `--permission-mode` |
| `claudeCode.allowedTools` | `--allowedTools` |
| `claudeCode.pluginDirs[]` | `--plugin-dir` (repeated) |
| `claudeCode.pluginUrls[]` | `--plugin-url` (repeated) |
| `claudeCode.maxTurns` | `--max-turns` |
| `claudeCode.systemPrompt` | `--system-prompt` |
| `claudeCode.effort` | `--effort` |
| `claudeCode.agent` | `--agent` |

**Isolation modes:** `isolateConfig: true` (default) runs with a fresh Claude config directory, preventing cross-test state leakage. `isolateConfig: false` uses the current user's logged-in Claude config — useful for MCP server tests that require an authenticated plugin.

See [Claude Code adapter reference](../reference/claude-code-adapter.md) for the complete field list.

# TrajectoryBuilder

`src/trajectory/builder.ts` is the shared event accumulator used by adapters. It accepts `StreamEvent` objects and builds a `TrajectoryView`:

- Tracks tool calls in order, assigning `turnIndex` and `callIndex`.
- Parallel tool calls within a turn share `turnIndex`, get distinct `callIndex`.
- Accumulates assistant text across content deltas.
- Records usage (tokens, cost) from `message_stop` events.
- Records retry events from rate-limit backoffs.

Adapters for new harnesses can use `TrajectoryBuilder` directly if their event stream can be mapped to `StreamEvent`, or build the `TrajectoryView` from scratch if the mapping is impractical.

# Adding a new adapter

1. Implement `HarnessAdapter` in `src/adapters/<name>/index.ts`.
2. Register it in `src/adapters/registry.ts`.
3. Add adapter-specific config fields to the Zod schema in `src/config/schema.ts`.
4. Document in the suite YAML's `adapter` field.

The assertion and grading layers require no changes — they only consume `TrajectoryView`.

# Citations

[1] `src/adapters/types.ts` — HarnessAdapter and AdapterResult interfaces
[2] `src/adapters/registry.ts` — adapter registry
[3] `src/adapters/claude-code/index.ts` — Claude Code adapter implementation
[4] `src/adapters/claude-code/flags.ts` — flag builder
[5] `src/trajectory/builder.ts` — TrajectoryBuilder
