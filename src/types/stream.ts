/**
 * Discriminated union of events emitted by Claude Code's
 * `--output-format stream-json` mode.
 *
 * The format is NDJSON (one JSON object per line on stdout). Each line has
 * a required `type` field and often a `subtype` for further disambiguation.
 *
 * Source notes: the stream-json schema is not formally documented as of mid-2026.
 * These types are derived from:
 *   - https://code.claude.com/docs/en/headless
 *   - https://github.com/anthropics/claude-code/issues/24612 (event-types tracking issue)
 *   - https://takopi.dev/reference/runners/claude/stream-json-cheatsheet/
 *   - The `@anthropic-ai/claude-agent-sdk` TypeScript declaration files,
 *     which are the de-facto source of truth.
 *
 * When adding new event types, prefer extending the union here rather than
 * branching on `any` in callers. Unknown events should be tolerated silently
 * by the builder (the schema evolves and we don't want CI to break on a new
 * event type we haven't modelled yet).
 */

/** Top-level discriminated union of stream-json events. */
export type StreamEvent =
  | SystemInitEvent
  | SystemRetryEvent
  | SystemPluginInstallEvent
  | SystemCompactBoundaryEvent
  | SystemUnknownEvent
  | AssistantMessageEvent
  | UserMessageEvent
  | ResultEvent;

// system events

/** Emitted once at session start. Carries the session-level metadata. */
export interface SystemInitEvent {
  type: "system";
  subtype: "init";
  session_id: string;
  cwd: string;
  model: string;
  permissionMode?: string;
  apiKeySource?: string;
  /** Names of tools available in the session (built-in + MCP). */
  tools: string[];
  /** MCP servers configured for this session, with connection status. */
  mcp_servers: McpServerStatus[];
}

export interface McpServerStatus {
  name: string;
  status: "connected" | "disconnected" | "error" | string;
}

/** Emitted when the API rate-limits us or otherwise asks for a retry. */
export interface SystemRetryEvent {
  type: "system";
  subtype: "api_retry";
  session_id: string;
  /** Implementation-defined retry payload (delay, reason, etc). */
  [key: string]: unknown;
}

/** Emitted while marketplace plugins are installing pre-session. */
export interface SystemPluginInstallEvent {
  type: "system";
  subtype: "plugin_install";
  session_id: string;
  [key: string]: unknown;
}

/** Emitted when Claude Code compacts the context window mid-session. */
export interface SystemCompactBoundaryEvent {
  type: "system";
  subtype: "compact_boundary";
  session_id: string;
  [key: string]: unknown;
}

/**
 * Catch-all for `type: "system"` events we haven't modelled.
 *
 * Keeps the union exhaustive while tolerating schema evolution. Callers should
 * either explicitly handle a known subtype or fall through to ignore.
 */
export interface SystemUnknownEvent {
  type: "system";
  subtype: string;
  session_id?: string;
  [key: string]: unknown;
}

// conversational events

/** One assistant turn. The `message` field mirrors the Anthropic Messages API shape. */
export interface AssistantMessageEvent {
  type: "assistant";
  session_id: string;
  message: AssistantMessage;
}

export interface AssistantMessage {
  id: string;
  type: "message";
  role: "assistant";
  content: ContentBlock[];
  model?: string;
  stop_reason?: StopReason | null;
  usage?: Usage;
}

/**
 * A user-role message in the stream.
 *
 * In stream-json these are usually *synthetic* — the harness injects them to
 * feed tool results back into the conversation after dispatching a tool. The
 * very first user message (the prompt) is also emitted here for completeness.
 */
export interface UserMessageEvent {
  type: "user";
  session_id: string;
  message: UserMessage;
}

export interface UserMessage {
  role: "user";
  /** String for the initial prompt, array of blocks when carrying tool results. */
  content: ContentBlock[] | string;
}

// content blocks

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  /** Unique id assigned by the model; used to match tool_result back to this call. */
  id: string;
  /** Tool name. MCP tools follow the convention `mcp__<server>__<tool>`. */
  name: string;
  /** Arguments the model passed. Schema is per-tool. */
  input: unknown;
}

export interface ToolResultBlock {
  type: "tool_result";
  /** The id of the corresponding tool_use block. */
  tool_use_id: string;
  /** Tool output. May be plain text or further content blocks for richer tools. */
  content: string | ContentBlock[];
  is_error?: boolean;
}

// result envelope

/** Emitted once at session end. Carries aggregate usage and cost. */
export interface ResultEvent {
  type: "result";
  subtype: "success" | "error";
  session_id: string;
  total_cost_usd: number;
  is_error: boolean;
  duration_ms: number;
  duration_api_ms?: number;
  num_turns: number;
  /** The final text the harness returned, if any. */
  result?: string;
  usage?: Usage;
}

// shared scalars

/**
 * Reasons the model can stop a turn. Open-ended string union because new
 * stop reasons appear over time.
 */
export type StopReason =
  | "end_turn"
  | "tool_use"
  | "max_tokens"
  | "stop_sequence"
  | (string & {});

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

// type guards

/** Type guards. Prefer these over manual `e.type === "..."` checks at call sites. */

export function isSystemInit(e: StreamEvent): e is SystemInitEvent {
  return e.type === "system" && (e as SystemInitEvent).subtype === "init";
}

export function isSystemRetry(e: StreamEvent): e is SystemRetryEvent {
  return e.type === "system" && (e as SystemRetryEvent).subtype === "api_retry";
}

export function isAssistantMessage(e: StreamEvent): e is AssistantMessageEvent {
  return e.type === "assistant";
}

export function isUserMessage(e: StreamEvent): e is UserMessageEvent {
  return e.type === "user";
}

export function isResult(e: StreamEvent): e is ResultEvent {
  return e.type === "result";
}

export function isTextBlock(b: ContentBlock): b is TextBlock {
  return b.type === "text";
}

export function isToolUseBlock(b: ContentBlock): b is ToolUseBlock {
  return b.type === "tool_use";
}

export function isToolResultBlock(b: ContentBlock): b is ToolResultBlock {
  return b.type === "tool_result";
}
