/**
 * Map Gemini CLI `stream-json` NDJSON events into Claude stream-json
 * {@link StreamEvent} shapes for {@link TrajectoryBuilder}.
 *
 * Streaming assistant text arrives as `message` events with `delta: true`.
 * The mapper accumulates delta chunks in a buffer and emits one assistant
 * message when a non-delta message arrives, before tool_use/result, or on
 * result flush — so TrajectoryBuilder sees a single turn instead of many
 * partial turns per chunk.
 */

import type { StreamEvent, Usage } from "../../types/stream";
import type {
  GeminiCliJsonEvent,
  GeminiCliStreamStats,
} from "./types";

export type { GeminiCliJsonEvent, GeminiCliStreamStats } from "./types";

/** Stateful mapper — tracks session id, delta text, and pending tool calls. */
export class GeminiCliEventMapper {
  private sessionId = "gemini-session";
  private model = "";
  private sawInit = false;
  private startedTools = new Set<string>();
  private assistantDeltaBuffer = "";
  private turnCount = 0;

  /** Map one parsed Gemini JSON object to zero or more stream events. */
  map(event: GeminiCliJsonEvent): StreamEvent[] {
    const type = event.type;
    if (!type) return [];

    switch (type) {
      case "init":
        return [this.buildInit(event.session_id ?? this.sessionId, event.model ?? "")];
      case "message":
        return this.mapMessage(event);
      case "tool_use":
        return this.mapToolUse(event);
      case "tool_result":
        return this.mapToolResult(event);
      // Inline error events are omitted; terminal `result` carries failure state.
      case "error":
        return [];
      case "result":
        return this.mapResult(event);
      default:
        return [];
    }
  }

  private buildInit(sessionId: string, model: string): StreamEvent {
    this.sessionId = sessionId;
    this.model = model;
    this.sawInit = true;
    return {
      type: "system",
      subtype: "init",
      session_id: sessionId,
      cwd: "",
      model,
      tools: [],
      mcp_servers: [],
    };
  }

  private ensureInit(): StreamEvent[] {
    if (this.sawInit) return [];
    return [this.buildInit(this.sessionId, this.model)];
  }

  private mapMessage(event: GeminiCliJsonEvent): StreamEvent[] {
    if (event.role === "user") return [];

    const chunk = event.content ?? "";
    if (event.delta) {
      // Accumulate streaming chunks; emit one assistant message on completion
      // (non-delta message or result flush) so TrajectoryBuilder gets a single
      // turn instead of one partial turn per delta.
      this.assistantDeltaBuffer += chunk;
      return this.ensureInit();
    }

    const text = this.assistantDeltaBuffer + chunk;
    this.assistantDeltaBuffer = "";
    if (!text) return this.ensureInit();

    return [
      ...this.ensureInit(),
      {
        type: "assistant",
        session_id: this.sessionId,
        message: {
          id: `msg_${this.turnCount}`,
          type: "message",
          role: "assistant",
          content: [{ type: "text", text }],
          stop_reason: "end_turn",
        },
      },
    ];
  }

  private mapToolUse(event: GeminiCliJsonEvent): StreamEvent[] {
    const toolId = event.tool_id ?? `tool_${Math.random().toString(36).slice(2)}`;
    if (event.tool_id) this.startedTools.add(event.tool_id);

    const name = resolveGeminiToolName(
      event.tool_name ?? "unknown",
      event.parameters ?? {},
    );

    return [
      ...this.flushDeltaBuffer(),
      ...this.ensureInit(),
      {
        type: "assistant",
        session_id: this.sessionId,
        message: {
          id: `assistant_${toolId}`,
          type: "message",
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: toolId,
              name,
              input: event.parameters ?? {},
            },
          ],
          stop_reason: "tool_use",
        },
      },
    ];
  }

  private mapToolResult(event: GeminiCliJsonEvent): StreamEvent[] {
    const toolId = event.tool_id ?? "";
    const prefix = this.ensureInit();
    const events: StreamEvent[] = [...prefix];

    // Gemini may emit tool_result without a prior tool_use; synthesize tool_use.
    if (toolId && !this.startedTools.has(toolId)) {
      events.push({
        type: "assistant",
        session_id: this.sessionId,
        message: {
          id: `assistant_${toolId}`,
          type: "message",
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: toolId,
              name: "unknown",
              input: {},
            },
          ],
          stop_reason: "tool_use",
        },
      });
    } else if (toolId) {
      this.startedTools.delete(toolId);
    }

    const isError = event.status === "error" || event.error != null;
    const content =
      event.output ??
      event.error?.message ??
      "";

    events.push({
      type: "user",
      session_id: this.sessionId,
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolId,
            content,
            is_error: isError,
          },
        ],
      },
    });

    return events;
  }

  private mapResult(event: GeminiCliJsonEvent): StreamEvent[] {
    this.turnCount++;
    const isError = event.status === "error";
    const deltaEvents = this.flushDeltaBuffer();
    return [
      ...deltaEvents,
      {
        type: "result",
        subtype: isError ? "error" : "success",
        session_id: this.sessionId,
        is_error: isError,
        result: event.error?.message ?? "",
        usage: mapUsage(event.stats),
        total_cost_usd: event.stats?.total_cost_usd ?? 0,
        duration_ms: event.stats?.duration_ms ?? 0,
        num_turns: this.turnCount,
      },
    ];
  }

  /** Emit buffered delta text as one assistant message before tool/result events. */
  private flushDeltaBuffer(): StreamEvent[] {
    if (!this.assistantDeltaBuffer) return [];
    const text = this.assistantDeltaBuffer;
    this.assistantDeltaBuffer = "";
    return [
      ...this.ensureInit(),
      {
        type: "assistant",
        session_id: this.sessionId,
        message: {
          id: `msg_delta_${this.turnCount}`,
          type: "message",
          role: "assistant",
          content: [{ type: "text", text }],
          stop_reason: "end_turn",
        },
      },
    ];
  }
}

/** Map an entire fixture or stream of Gemini events through a fresh mapper. */
export function mapGeminiCliEvents(events: GeminiCliJsonEvent[]): StreamEvent[] {
  const mapper = new GeminiCliEventMapper();
  const out: StreamEvent[] = [];
  for (const event of events) {
    out.push(...mapper.map(event));
  }
  return out;
}

/**
 * Resolve harness tool name from Gemini tool_name + parameters.
 *
 * MCP tools use `mcp__<server>__<tool>`; built-in Gemini tools keep native names.
 */
export function resolveGeminiToolName(
  toolName: string,
  parameters: Record<string, unknown>,
): string {
  if (toolName.startsWith("mcp__")) return toolName;

  const server =
    typeof parameters.server === "string" ? parameters.server : undefined;
  const tool =
    typeof parameters.tool === "string" ? parameters.tool : undefined;
  if (server && tool) return `mcp__${server}__${tool}`;

  // Gemini CLI native MCP FQN: mcp_{serverName}_{toolName} (server names use hyphens).
  if (toolName.startsWith("mcp_") && !toolName.startsWith("mcp__")) {
    const rest = toolName.slice("mcp_".length);
    const separator = rest.lastIndexOf("_");
    if (separator > 0) {
      const geminiServer = rest.slice(0, separator);
      const geminiTool = rest.slice(separator + 1);
      if (geminiServer && geminiTool) {
        return `mcp__${geminiServer}__${geminiTool}`;
      }
    }
  }

  return toolName;
}

function mapUsage(stats?: GeminiCliStreamStats): Usage {
  return {
    input_tokens: stats?.input_tokens ?? 0,
    output_tokens: stats?.output_tokens ?? 0,
  };
}
