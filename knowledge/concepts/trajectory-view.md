---
type: Concept
title: TrajectoryView
description: The normalized, vendor-neutral snapshot of a single harness session — the primary data structure that assertions and judges operate on.
resource: ../schemas/trajectory-view.schema.json
tags: [data-model, trajectory, assertions, normalization]
timestamp: 2026-06-24T00:00:00Z
---

# What is a TrajectoryView?

A `TrajectoryView` is the normalized record of one harness session: every tool call, every assistant turn, the final response, usage statistics, and any errors. It is produced by a [harness adapter](/architecture/adapters.md) and is the central data structure in harness-eval.

**Key design goals:**

- **Vendor-neutral.** Assertions and judges never parse raw vendor streams directly — they operate on `TrajectoryView`. When a new adapter ships, only the adapter changes.
- **Ordered.** `turnIndex` and `callIndex` are the canonical ordering primitives, not wall-clock timestamps. This makes ordering assertions (`called_before`, `sequence`) reliable across harness implementations.
- **Compact.** The view captures what matters for evaluation — tool calls, turns, response, usage — without duplicating the full vendor stream. Raw stream events are optional and carried separately.

# Schema

```typescript
interface TrajectoryView {
  meta: SessionMeta;
  toolCalls: ToolCall[];
  turns: AssistantTurn[];
  finalResponse: string;
  finalStopReason: StopReason;
  usage: UsageSummary;
  retries: RetryRecord[];
  success: boolean;
}
```

## SessionMeta

```typescript
interface SessionMeta {
  sessionId: string;          // UUID assigned by the adapter
  model: string;              // model ID used (e.g. "claude-sonnet-4-6")
  cwd: string;                // working directory of the harness process
  availableTools: string[];   // tools declared available to the model
  mcpServers?: string[];      // MCP server IDs visible in the session
}
```

## ToolCall

```typescript
interface ToolCall {
  id: string;                 // tool call ID from the model
  tool: string;               // tool name (e.g. "Read", "mcp__plugin__method")
  args: Record<string, unknown>; // arguments as passed by the model
  result?: string;            // tool result (may be omitted for errors)
  turnIndex: number;          // which assistant turn made this call (0-based)
  callIndex: number;          // position within the turn (0-based)
  durationMs?: number;        // time between call and result
}
```

**Parallel calls:** When the model issues multiple tool calls in one turn, they all share the same `turnIndex` and get sequential `callIndex` values (0, 1, 2, …). Ordering assertions use `(turnIndex, callIndex)` as a total order.

## AssistantTurn

```typescript
interface AssistantTurn {
  turnIndex: number;
  text: string;               // assistant text content in this turn
  toolCalls: ToolCall[];      // tool calls issued in this turn
  stopReason: StopReason;
}
```

## UsageSummary

```typescript
interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalCostUsd?: number;       // may be absent if model pricing is unknown
  durationMs: number;          // wall-clock duration of the session
  turnCount: number;           // number of assistant turns
}
```

## StopReason

```typescript
type StopReason =
  | "end_turn"           // model chose to stop
  | "max_turns"          // hit --max-turns limit
  | "tool_use"           // waiting for tool result (intermediate)
  | "timeout"            // adapter timeout
  | "error"              // harness error
  | "stop_sequence";     // model hit a stop sequence
```

## RetryRecord

```typescript
interface RetryRecord {
  type: "rate_limit" | "overloaded" | "unknown";
  attemptIndex: number;
  delayMs: number;
  timestamp: string;    // ISO 8601
}
```

# How it is produced

1. The adapter spawns the harness subprocess.
2. Each line of `stream-json` stdout becomes a `StreamEvent`.
3. `TrajectoryBuilder.feed(event)` accumulates tool calls, turns, text, and usage.
4. On process exit, `TrajectoryBuilder.build()` returns the finalized `TrajectoryView`.

Source: `src/trajectory/builder.ts`

# How it is consumed

**Assertions** — All assertion types in the [assertion DSL](/reference/assertion-dsl.md) operate on `TrajectoryView`. For example, `called: Read` checks whether `toolCalls` contains any entry with `tool === "Read"`.

**Judges** — `trajectoryToTranscript(view, prompt)` converts the trajectory into a human-readable text transcript suitable for an LLM judge prompt.

**Metrics** — `src/metrics/trajectory.ts` computes Levenshtein distance, precision, recall, and F1 against a reference trajectory. Used for the Vertex AI interchange format.

**OTLP export** — `trajectoryToOtlp(view, options)` maps the trajectory to OpenTelemetry spans for trace backends.

# JSON Schema

The `TrajectoryView` is published as a JSON Schema (Draft 2020-12):

```
https://raw.githubusercontent.com/alis-build/harness-eval-ts/main/schemas/trajectory-view.schema.json
```

See [schema reference](/schemas/trajectory-view.md).

# Citations

[1] `src/types/trajectory.ts` — TrajectoryView type definitions
[2] `src/trajectory/builder.ts` — TrajectoryBuilder
[3] `src/parsers/stream-json.ts` — parseStreamJson
[4] [schemas/trajectory-view.schema.json](../schemas/trajectory-view.schema.json) — published JSON Schema
