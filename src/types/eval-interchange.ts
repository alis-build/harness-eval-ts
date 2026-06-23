/**
 * TypeScript types for eval interchange output.
 */

export interface InterchangeToolCall {
  tool_name: string;
  tool_input: string;
}

export interface InterchangeTrajectory {
  tool_calls: InterchangeToolCall[];
}

export interface TabularToolCall {
  tool_name: string;
  tool_input: unknown;
}

export interface ContentPart {
  text?: string;
  function_call?: {
    name: string;
    args: unknown;
  };
  function_response?: {
    name: string;
    response: unknown;
  };
}

export interface AgentEvent {
  author: string;
  content: {
    parts: ContentPart[];
  };
  event_time?: string;
  state_delta?: Record<string, unknown>;
  active_tools?: Array<{ name: string }>;
}

export interface ConversationTurn {
  turn_index: number;
  turn_id?: string;
  events: AgentEvent[];
}

export interface AgentConfig {
  agent_id: string;
  agent_type?: string;
  description?: string;
  instruction?: string;
  tools?: Array<{ name: string }>;
  sub_agents?: string[];
}

export interface AgentTrace {
  agents: Record<string, AgentConfig>;
  turns: ConversationTurn[];
}

export interface EvalDatasetRow {
  prompt?: string;
  response?: string;
  reference?: string;
  predicted_trajectory: TabularToolCall[];
  reference_trajectory?: TabularToolCall[];
  latency_in_seconds: number;
  failure: 0 | 1;
  human_ratings?: Record<string, number>;
}

export interface ProtoTrajectoryInstance {
  predicted_trajectory: InterchangeTrajectory;
  reference_trajectory?: InterchangeTrajectory;
  prompt?: string;
  response?: string;
  reference?: string;
}

export interface TrajectoryMetrics {
  trajectory_exact_match: number;
  trajectory_in_order_match: number;
  trajectory_any_order_match: number;
  trajectory_precision: number;
  trajectory_recall: number;
  trajectory_single_tool_use: number;
}

export interface ToolCallMetrics {
  tool_call_valid: number;
  tool_name_match: number;
  tool_parameter_key_match: number;
  tool_parameter_kv_match: number;
}
