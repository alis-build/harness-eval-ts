/**
 * Zod schemas for {@link TrajectoryView} and related types.
 * JSON Schema is generated from these at build time — see `src/schemas/generate.ts`.
 */

import { z } from "zod";

import { TRAJECTORY_SCHEMA_VERSION } from "../types/eval-record";
import { described, field } from "./meta";

export const mcpServerSchema = described(
  z.object({
    name: field(z.string(), "MCP server name as reported by the harness."),
    status: field(
      z.string(),
      "Connection status at session start, e.g. connected or failed.",
    ),
  }),
  {
    id: "McpServer",
    title: "McpServer",
    description: "MCP server entry from session initialization metadata.",
  },
);

export const sessionMetaSchema = described(
  z.object({
    sessionId: field(
      z.string(),
      "Harness-assigned session identifier from the vendor stream.",
    ),
    model: field(
      z.string(),
      "Model identifier used for the session, e.g. claude-sonnet-4-6.",
    ),
    cwd: field(z.string(), "Working directory the harness used for the run."),
    permissionMode: field(
      z.string().optional(),
      "Permission mode active for the session, when reported by the harness.",
    ),
    availableTools: field(
      z.array(z.string()),
      "Tool names the harness reported as available at session start.",
    ),
    mcpServers: field(
      z.array(mcpServerSchema),
      "MCP servers configured for the session, with connection status.",
    ),
  }),
  {
    id: "SessionMeta",
    title: "SessionMeta",
    description:
      "Session metadata captured from harness initialization (e.g. Claude system/init).",
  },
);

export const toolCallSchema = described(
  z.object({
    name: field(
      z.string(),
      "Fully-qualified tool name, e.g. mcp__plugin_alis-build_api__SearchSkills or Bash.",
      ["mcp__plugin_alis-build_api__SearchSkills", "Bash"],
    ),
    namespace: field(
      z.string().nullable(),
      "Namespace prefix for MCP-style names (mcp__<server>), or null for built-in tools.",
      ["mcp__plugin_alis-build_api", null],
    ),
    callId: field(
      z.string(),
      "Vendor tool-use block id; matches a later tool_result.tool_use_id when present.",
    ),
    args: field(
      z.unknown(),
      "Arguments the model emitted for this tool call. Tool-specific schema.",
    ),
    result: field(
      z.unknown().nullable(),
      "Tool result payload, or null if no result was observed (e.g. process killed).",
    ),
    isError: field(
      z.boolean(),
      "Whether the tool reported an error in its result envelope.",
    ),
    turnIndex: field(
      z.number().int(),
      "Assistant turn that produced this call. Parallel calls in one message share a turnIndex.",
    ),
    callIndex: field(
      z.number().int(),
      "Index in the global ordered tool-call sequence (used for called_before assertions).",
    ),
  }),
  {
    id: "ToolCall",
    title: "ToolCall",
    description:
      "One tool invocation in emission order. Primary unit for behavioral assertions.",
  },
);

export const assistantTurnSchema = described(
  z.object({
    turnIndex: field(z.number().int(), "Monotonic assistant turn index."),
    text: field(
      z.string(),
      "Assistant text emitted in this turn (may be empty for tool-only turns).",
    ),
    toolCalls: field(
      z.array(toolCallSchema),
      "Tool calls emitted in this turn, in block order.",
    ),
    stopReason: field(
      z.string().nullable(),
      "Model stop reason for this turn, or null if not reported.",
      ["end_turn", "tool_use", null],
    ),
  }),
  {
    id: "AssistantTurn",
    title: "AssistantTurn",
    description: "One assistant turn: text content plus any tool calls in that turn.",
  },
);

export const usageSummarySchema = described(
  z.object({
    inputTokens: field(z.number(), "Total input tokens for the session."),
    outputTokens: field(z.number(), "Total output tokens for the session."),
    totalCostUsd: field(z.number(), "Total session cost in USD when reported by the harness."),
    durationMs: field(
      z.number(),
      "Session duration in milliseconds from harness result metadata.",
    ),
    numTurns: field(z.number(), "Number of assistant turns in the session."),
  }),
  {
    id: "UsageSummary",
    title: "UsageSummary",
    description: "Aggregate token usage, cost, and timing from the harness result.",
  },
);

export const retryRecordSchema = described(
  z.object({
    offsetMs: field(
      z.number(),
      "Approximate milliseconds since session start when the retry was observed.",
    ),
    raw: field(
      z.unknown(),
      "Raw vendor payload from the retry event (e.g. system/api_retry).",
    ),
  }),
  {
    id: "RetryRecord",
    title: "RetryRecord",
    description: "Rate-limit or transient error retry observed during the run.",
  },
);

/** Internal harness session shape (no schemaVersion). */
export const trajectoryViewSchema = described(
  z.object({
    meta: field(sessionMetaSchema, "Session metadata from harness initialization."),
    toolCalls: field(
      z.array(toolCallSchema),
      "Every tool call in global emission order.",
    ),
    turns: field(
      z.array(assistantTurnSchema),
      "Assistant turns with per-turn text and tool calls.",
    ),
    finalResponse: field(
      z.string(),
      "All assistant text concatenated across turns. Used for response_contains assertions.",
    ),
    finalStopReason: field(
      z.string().nullable(),
      "Stop reason of the last assistant turn.",
    ),
    usage: field(usageSummarySchema, "Aggregate usage and cost for the session."),
    retries: field(
      z.array(retryRecordSchema),
      "Retry events observed during the run.",
    ),
    success: field(
      z.boolean(),
      "Whether the harness result envelope indicated success.",
    ),
  }),
  {
    id: "TrajectoryView",
    title: "TrajectoryView",
    description:
      "Assertion-friendly projection of a harness session. Cross-harness normalized shape — not vendor stream-json.",
  },
);

/** Trajectory embedded in {@link EvalRunEnvelope}. */
export const trajectoryViewExportSchema = described(
  trajectoryViewSchema.extend({
    schemaVersion: field(
      z.literal(TRAJECTORY_SCHEMA_VERSION),
      "TrajectoryView schema version for storage and API interchange.",
    ),
  }),
  {
    id: "TrajectoryViewExport",
    title: "TrajectoryViewExport",
    description:
      "TrajectoryView with schemaVersion, as embedded in EvalRunEnvelope repetitions.",
  },
);

export type TrajectoryViewZod = z.infer<typeof trajectoryViewSchema>;
export type TrajectoryViewExportZod = z.infer<typeof trajectoryViewExportSchema>;
