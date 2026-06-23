/**
 * Zod schemas for eval interchange output types.
 *
 * Primary output vocabulary for trajectory evaluation, proto-compatible
 * instances, and multi-turn agent traces. Inspired by upstream evaluation
 * service wire formats (see evaluation_service.proto v1beta1).
 */

import { z } from "zod";

import { described, field } from "./meta";

/** Wire-format tool call: `tool_input` is a JSON-serialized string. */
export const interchangeToolCallSchema = described(
  z.object({
    tool_name: field(z.string(), "Tool name as emitted by the agent."),
    tool_input: field(
      z.string(),
      "JSON-serialized tool arguments (wire format).",
    ),
  }),
  {
    id: "InterchangeToolCall",
    title: "InterchangeToolCall",
    description: "Tool call in interchange wire format.",
  },
);

export const interchangeTrajectorySchema = described(
  z.object({
    tool_calls: field(
      z.array(interchangeToolCallSchema),
      "Ordered tool calls in the trajectory.",
    ),
  }),
  {
    id: "InterchangeTrajectory",
    title: "InterchangeTrajectory",
    description: "Ordered sequence of tool calls.",
  },
);

/** Tabular tool call: `tool_input` as parsed object for dataset rows. */
export const tabularToolCallSchema = described(
  z.object({
    tool_name: field(z.string(), "Tool name as emitted by the agent."),
    tool_input: field(
      z.unknown(),
      "Tool arguments as a structured object for tabular consumption.",
    ),
  }),
  {
    id: "TabularToolCall",
    title: "TabularToolCall",
    description: "Tool call with structured tool_input for JSONL/tabular export.",
  },
);

export const contentPartSchema = described(
  z.object({
    text: field(z.string().optional(), "Plain text content."),
    function_call: field(
      z
        .object({
          name: field(z.string(), "Function or tool name."),
          args: field(z.unknown(), "Function arguments."),
        })
        .optional(),
      "Function call emitted by the agent.",
    ),
    function_response: field(
      z
        .object({
          name: field(z.string(), "Function or tool name."),
          response: field(z.unknown(), "Function result payload."),
        })
        .optional(),
      "Function response from tool execution.",
    ),
  }),
  {
    id: "ContentPart",
    title: "ContentPart",
    description: "One part of agent event content (text, function_call, or function_response).",
  },
);

export const agentEventSchema = described(
  z.object({
    author: field(
      z.string(),
      "Agent id or user identifier for this event.",
    ),
    content: field(
      z.object({
        parts: field(z.array(contentPartSchema), "Content parts for this event."),
      }),
      "Structured event content.",
    ),
    event_time: field(
      z.string().optional(),
      "ISO 8601 timestamp when the event occurred.",
    ),
    state_delta: field(
      z.record(z.string(), z.unknown()).optional(),
      "Session state changes associated with this event.",
    ),
    active_tools: field(
      z.array(z.object({ name: field(z.string(), "Tool name.") })).optional(),
      "Tools available to the agent at event time.",
    ),
  }),
  {
    id: "AgentEvent",
    title: "AgentEvent",
    description: "One event in a multi-turn agent trace.",
  },
);

export const conversationTurnSchema = described(
  z.object({
    turn_index: field(z.number().int(), "Zero-based turn index."),
    turn_id: field(z.string().optional(), "Optional stable turn identifier."),
    events: field(z.array(agentEventSchema), "Events in chronological order."),
  }),
  {
    id: "ConversationTurn",
    title: "ConversationTurn",
    description: "One turn in a multi-turn agent conversation.",
  },
);

export const agentConfigSchema = described(
  z.object({
    agent_id: field(z.string(), "Stable agent identifier."),
    agent_type: field(z.string().optional(), "Agent type or role."),
    description: field(z.string().optional(), "Human-readable agent description."),
    instruction: field(z.string().optional(), "System instruction for the agent."),
    tools: field(
      z.array(z.object({ name: field(z.string(), "Tool name.") })).optional(),
      "Tools available to this agent.",
    ),
    sub_agents: field(
      z.array(z.string()).optional(),
      "Sub-agent identifiers when using multi-agent setups.",
    ),
  }),
  {
    id: "AgentConfig",
    title: "AgentConfig",
    description: "Static configuration for one agent in a trace.",
  },
);

export const agentTraceSchema = described(
  z.object({
    agents: field(
      z.record(z.string(), agentConfigSchema),
      "Agent configurations keyed by agent id.",
    ),
    turns: field(
      z.array(conversationTurnSchema),
      "Chronological conversation turns.",
    ),
  }),
  {
    id: "AgentTrace",
    title: "AgentTrace",
    description: "Full multi-turn agent execution trace.",
  },
);

export const evalDatasetRowSchema = described(
  z.object({
    prompt: field(z.string().optional(), "Eval prompt sent to the agent."),
    response: field(z.string().optional(), "Final agent response text."),
    reference: field(
      z.string().optional(),
      "Reference answer text when provided.",
    ),
    predicted_trajectory: field(
      z.array(tabularToolCallSchema),
      "Predicted tool-call trajectory with structured tool_input.",
    ),
    reference_trajectory: field(
      z.array(tabularToolCallSchema).optional(),
      "Reference tool-call trajectory when provided.",
    ),
    latency_in_seconds: field(
      z.number(),
      "Session latency in seconds.",
    ),
    failure: field(
      z.union([z.literal(0), z.literal(1)]),
      "1 when the harness run failed, 0 on success.",
    ),
    human_ratings: field(
      z.record(z.string(), z.number()).optional(),
      "Human ratings keyed by metric name for judge calibration.",
    ),
  }),
  {
    id: "EvalDatasetRow",
    title: "EvalDatasetRow",
    description: "Flattened row for tabular or JSONL dataset consumption.",
  },
);

export const protoTrajectoryInstanceSchema = described(
  z.object({
    predicted_trajectory: field(
      interchangeTrajectorySchema,
      "Predicted trajectory in wire format.",
    ),
    reference_trajectory: field(
      interchangeTrajectorySchema.optional(),
      "Reference trajectory in wire format.",
    ),
    prompt: field(z.string().optional(), "Eval prompt."),
    response: field(z.string().optional(), "Final response."),
    reference: field(z.string().optional(), "Reference answer text."),
  }),
  {
    id: "ProtoTrajectoryInstance",
    title: "ProtoTrajectoryInstance",
    description: "Proto-compatible evaluation instance with JSON-string tool_input.",
  },
);

export type InterchangeToolCallZod = z.infer<typeof interchangeToolCallSchema>;
export type InterchangeTrajectoryZod = z.infer<typeof interchangeTrajectorySchema>;
export type TabularToolCallZod = z.infer<typeof tabularToolCallSchema>;
export type AgentEventZod = z.infer<typeof agentEventSchema>;
export type ConversationTurnZod = z.infer<typeof conversationTurnSchema>;
export type AgentConfigZod = z.infer<typeof agentConfigSchema>;
export type AgentTraceZod = z.infer<typeof agentTraceSchema>;
export type EvalDatasetRowZod = z.infer<typeof evalDatasetRowSchema>;
export type ProtoTrajectoryInstanceZod = z.infer<
  typeof protoTrajectoryInstanceSchema
>;
