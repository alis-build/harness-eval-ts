/**
 * Test factories for {@link TrajectoryView} and {@link ToolCall} objects.
 *
 * Provides sensible defaults so tests can override only the fields they care
 * about. Used by mock adapters and assertion/grader tests.
 */

import type {
  SessionMeta,
  ToolCall,
  TrajectoryView,
  UsageSummary,
} from "../../src/types/trajectory";
import { namespaceOf } from "../../src/types/trajectory";

const defaultMeta: SessionMeta = {
  sessionId: "test-session",
  model: "claude-sonnet-4-6",
  cwd: "/tmp",
  availableTools: ["Bash", "Read"],
  mcpServers: [{ name: "api", status: "connected" }],
};

const defaultUsage: UsageSummary = {
  inputTokens: 100,
  outputTokens: 50,
  totalCostUsd: 0.01,
  durationMs: 1000,
  numTurns: 2,
};

/**
 * Build a tool call with defaults for namespace, callId, and turn indices.
 *
 * @param overrides - Must include `name`; other fields default when omitted.
 */
export function makeToolCall(
  overrides: Partial<ToolCall> & Pick<ToolCall, "name">,
): ToolCall {
  const name = overrides.name;
  return {
    name,
    namespace: overrides.namespace ?? namespaceOf(name),
    callId: overrides.callId ?? `call-${name}-${overrides.callIndex ?? 0}`,
    args: overrides.args ?? {},
    result: overrides.result ?? { ok: true },
    isError: overrides.isError ?? false,
    turnIndex: overrides.turnIndex ?? 0,
    callIndex: overrides.callIndex ?? 0,
  };
}

/**
 * Build a minimal successful {@link TrajectoryView} for tests.
 *
 * @param overrides - Partial view fields; `toolCalls` replaces the default empty list.
 */
export function makeView(
  overrides: Partial<TrajectoryView> & { toolCalls?: ToolCall[] } = {},
): TrajectoryView {
  const toolCalls = overrides.toolCalls ?? [];
  return {
    meta: overrides.meta ?? defaultMeta,
    toolCalls,
    turns: overrides.turns ?? [],
    finalResponse: overrides.finalResponse ?? "hello deploy world",
    finalStopReason: overrides.finalStopReason ?? "end_turn",
    usage: overrides.usage ?? defaultUsage,
    retries: overrides.retries ?? [],
    success: overrides.success ?? true,
  };
}
