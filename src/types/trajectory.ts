/**
 * TrajectoryView — the assertion-friendly projection of a Claude Code session.
 *
 * The view is derived from the stream of {@link StreamEvent} values produced by
 * the harness, but is optimized for the queries that the assertion DSL needs to
 * express:
 *
 *   - did tool X get called?  (look at `toolCalls`)
 *   - did tool A come before tool B?  (compare `turnIndex` / `callIndex`)
 *   - was a tool called with arguments matching predicate P?  (`toolCalls[i].args`)
 *   - did the agent answer without using any tool?  (`toolCalls.length === 0`)
 *
 * The view is reconstructable from the raw events (lossless w.r.t. assertions),
 * but operating on it directly is dramatically simpler than walking event
 * streams or OTel span trees.
 *
 * Design notes:
 *  - `turnIndex` and `callIndex` are the right primitives for ordering.
 *    Wall-clock timestamps from the stream are unreliable for sub-second
 *    ordering and parallel tool dispatch.
 *  - Parallel tool calls (multiple `tool_use` blocks in one assistant message)
 *    share a `turnIndex` but have distinct `callIndex` values in emission order.
 *  - `namespace` is precomputed so assertions like `called(pattern: "mcp__api__*")`
 *    can do a cheap string check.
 */

import type { StopReason } from "./stream";

export interface TrajectoryView {
  /** Session metadata, captured from the `system/init` event. */
  meta: SessionMeta;

  /** Every tool call, in global emission order. */
  toolCalls: ToolCall[];

  /** Each assistant turn: text content + any tool calls emitted in that turn. */
  turns: AssistantTurn[];

  /** All assistant text concatenated across turns. Useful for `response_contains`. */
  finalResponse: string;

  /** Stop reason of the *last* assistant turn. */
  finalStopReason: StopReason | null;

  /** Aggregate usage and cost from the result event. */
  usage: UsageSummary;

  /** Retry events observed during the run (rate limits, transient errors). */
  retries: RetryRecord[];

  /** Whether the result envelope indicated success. */
  success: boolean;
}

export interface SessionMeta {
  sessionId: string;
  model: string;
  cwd: string;
  permissionMode?: string;
  /** Tool names the harness reported as available at session start. */
  availableTools: string[];
  /** MCP servers configured for the session, with connection status. */
  mcpServers: { name: string; status: string }[];
}

export interface ToolCall {
  /** Fully-qualified tool name, e.g. `"mcp__api__search_skills"` or `"Bash"`. */
  name: string;

  /**
   * Namespace prefix for MCP-style names (`"mcp__api"`), or null for built-ins.
   * Precomputed via {@link namespaceOf} for cheap pattern matching.
   */
  namespace: string | null;

  /** The `tool_use` block's `id`; matches a later `tool_result.tool_use_id`. */
  callId: string;

  /** Args the model emitted on this call. Tool-specific schema. */
  args: unknown;

  /** Tool result, or null if no result was observed (e.g. process killed). */
  result: unknown | null;

  /** Whether the tool reported an error in its result. */
  isError: boolean;

  /**
   * Which assistant turn produced this call. Parallel calls within a single
   * assistant message share a `turnIndex`.
   */
  turnIndex: number;

  /** Index in the global ordered tool-call sequence. */
  callIndex: number;
}

export interface AssistantTurn {
  turnIndex: number;
  /** Text emitted in this turn (may be empty if turn was tool-only). */
  text: string;
  /** Tool calls emitted in this turn, in their block order. */
  toolCalls: ToolCall[];
  /** Stop reason reported by the model for this turn. */
  stopReason: StopReason | null;
}

export interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  durationMs: number;
  numTurns: number;
}

export interface RetryRecord {
  /** ms since session start (approximate; the stream doesn't include precise ts). */
  offsetMs: number;
  /** Raw payload from the `system/api_retry` event for diagnostics. */
  raw: unknown;
}

// helpers

/**
 * Extract the MCP namespace prefix from a tool name.
 *
 * Claude Code formats MCP tool names as `mcp__<server>__<tool>`. The namespace
 * is the first two segments joined: `mcp__<server>`. Returns null for non-MCP
 * tool names (built-ins like `Bash`, `Read`, `Edit`).
 *
 * @example
 *   namespaceOf("mcp__api__search_skills") // "mcp__api"
 *   namespaceOf("Bash")                     // null
 */
export function namespaceOf(toolName: string): string | null {
  if (!toolName.startsWith("mcp__")) return null;
  const parts = toolName.split("__");
  if (parts.length < 3) return null;
  return `${parts[0]}__${parts[1]}`;
}
