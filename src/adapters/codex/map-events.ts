/**
 * Map Codex `exec --json` NDJSON events into Claude stream-json {@link StreamEvent}
 * shapes for {@link TrajectoryBuilder}.
 */

import type { StreamEvent, Usage } from "../../types/stream";
import type { CodexItem, CodexJsonEvent, CodexUsage } from "./types";

/** Stateful mapper — tracks session id and pending tool calls across the stream. */
export class CodexEventMapper {
  private sessionId = "codex-session";
  private sawInit = false;
  private startedItems = new Set<string>();
  private turnCount = 0;

  /** Map one parsed Codex JSON object to zero or more stream events. */
  map(event: CodexJsonEvent): StreamEvent[] {
    const type = event.type;
    if (!type) return [];

    switch (type) {
      case "thread.started":
        return [this.buildInit(event.thread_id ?? this.sessionId)];
      case "item.started":
        return event.item ? this.mapItemStarted(event.item) : [];
      case "item.completed":
        return event.item ? this.mapItemCompleted(event.item) : [];
      case "turn.completed":
        this.turnCount++;
        return [this.buildResult(false, event.usage)];
      case "turn.failed":
        this.turnCount++;
        return [this.buildResult(true, event.usage, event.message)];
      default:
        return [];
    }
  }

  private buildInit(sessionId: string): StreamEvent {
    this.sessionId = sessionId;
    this.sawInit = true;
    return {
      type: "system",
      subtype: "init",
      session_id: sessionId,
      cwd: "",
      model: "",
      tools: [],
      mcp_servers: [],
    };
  }

  private ensureInit(): StreamEvent[] {
    if (this.sawInit) return [];
    return [this.buildInit(this.sessionId)];
  }

  private mapItemStarted(item: CodexItem): StreamEvent[] {
    const itemType = itemTypeOf(item);
    if (itemType === "mcp_tool_call" || itemType === "command_execution") {
      if (item.id) this.startedItems.add(item.id);
      return [
        ...this.ensureInit(),
        itemType === "mcp_tool_call"
          ? this.toolUseEvent(item)
          : this.commandUseEvent(item),
      ];
    }
    return this.ensureInit();
  }

  private mapItemCompleted(item: CodexItem): StreamEvent[] {
    const itemType = itemTypeOf(item);
    const prefix = this.ensureInit();
    const id = item.id ?? "";

    if (itemType === "mcp_tool_call") {
      const events = [...prefix];
      // Codex may emit item.completed without a prior item.started; synthesize tool_use.
      if (!this.startedItems.has(id)) {
        events.push(this.toolUseEvent(item));
      } else {
        this.startedItems.delete(id);
      }
      events.push(this.toolResultEvent(item));
      return events;
    }

    if (itemType === "command_execution") {
      const events = [...prefix];
      if (!this.startedItems.has(id)) {
        events.push(this.commandUseEvent(item));
      } else {
        this.startedItems.delete(id);
      }
      events.push(this.toolResultEvent(item, "Bash"));
      return events;
    }

    if (itemType === "assistant_message" && item.text) {
      return [
        ...prefix,
        {
          type: "assistant",
          session_id: this.sessionId,
          message: {
            id: item.id ?? `msg_${id}`,
            type: "message",
            role: "assistant",
            content: [{ type: "text", text: item.text }],
            stop_reason: "end_turn",
          },
        },
      ];
    }

    return prefix;
  }

  private toolUseEvent(item: CodexItem): StreamEvent {
    const id = item.id ?? `item_${Math.random().toString(36).slice(2)}`;
    const name = mcpToolName(item.server ?? "unknown", item.tool ?? "unknown");
    return {
      type: "assistant",
      session_id: this.sessionId,
      message: {
        id: `assistant_${id}`,
        type: "message",
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id,
            name,
            input: item.arguments ?? {},
          },
        ],
        stop_reason: "tool_use",
      },
    };
  }

  private commandUseEvent(item: CodexItem): StreamEvent {
    const id = item.id ?? `item_${Math.random().toString(36).slice(2)}`;
    return {
      type: "assistant",
      session_id: this.sessionId,
      message: {
        id: `assistant_${id}`,
        type: "message",
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id,
            name: "Bash",
            input: { command: item.command ?? "" },
          },
        ],
        stop_reason: "tool_use",
      },
    };
  }

  private toolResultEvent(item: CodexItem, toolName?: string): StreamEvent {
    const id = item.id ?? "";
    const isError = item.status === "failed" || item.error != null;
    const content =
      toolName === "Bash"
        ? formatCommandResult(item)
        : formatMcpResult(item.result, item.error);

    return {
      type: "user",
      session_id: this.sessionId,
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: id,
            content,
            is_error: isError,
          },
        ],
      },
    };
  }

  private buildResult(
    isError: boolean,
    usage?: CodexUsage,
    message?: string,
  ): StreamEvent {
    return {
      type: "result",
      subtype: isError ? "error" : "success",
      session_id: this.sessionId,
      is_error: isError,
      result: message ?? "",
      usage: mapUsage(usage),
      total_cost_usd: 0,
      duration_ms: 0,
      num_turns: this.turnCount,
    };
  }
}

/** Map an entire fixture or stream of Codex events through a fresh mapper. */
export function mapCodexEvents(events: CodexJsonEvent[]): StreamEvent[] {
  const mapper = new CodexEventMapper();
  const out: StreamEvent[] = [];
  for (const event of events) {
    out.push(...mapper.map(event));
  }
  return out;
}

/** Build harness-qualified MCP tool name from Codex server + tool fields. */
export function mcpToolName(server: string, tool: string): string {
  return `mcp__${server}__${tool}`;
}

function itemTypeOf(item: CodexItem): string {
  return item.type ?? item.item_type ?? "";
}

function mapUsage(usage?: CodexUsage): Usage {
  return {
    input_tokens: usage?.input_tokens ?? 0,
    output_tokens: usage?.output_tokens ?? 0,
  };
}

function formatMcpResult(result: unknown, error?: { message?: string } | null): string {
  if (error?.message) return error.message;
  if (result == null) return "";
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

function formatCommandResult(item: CodexItem): string {
  if (item.aggregated_output) return item.aggregated_output;
  if (item.exit_code != null) return String(item.exit_code);
  return "";
}
