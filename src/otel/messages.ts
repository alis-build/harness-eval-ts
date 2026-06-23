/**
 * Build GenAI semconv message arrays from a TrajectoryView.
 */

import type { AssistantTurn, ToolCall, TrajectoryView } from "../types/trajectory";

export interface GenAiMessage {
  role: string;
  parts: GenAiPart[];
  finish_reason?: string;
}

export type GenAiPart =
  | { type: "text"; content: string }
  | {
      type: "tool_call";
      id: string;
      name: string;
      arguments: unknown;
    }
  | {
      type: "tool_call_response";
      id: string;
      result: unknown;
    };

export function mapStopReason(reason: string | null): string | undefined {
  if (!reason) return undefined;
  switch (reason) {
    case "end_turn":
      return "stop";
    case "tool_use":
      return "tool_calls";
    case "max_tokens":
      return "length";
    case "stop_sequence":
      return "stop";
    default:
      return reason;
  }
}

export function toolCallPart(call: ToolCall): GenAiPart {
  return {
    type: "tool_call",
    id: call.callId,
    name: call.name,
    arguments: call.args ?? {},
  };
}

export function toolResponsePart(call: ToolCall): GenAiPart {
  return {
    type: "tool_call_response",
    id: call.callId,
    result: call.result,
  };
}

export function assistantMessageFromTurn(turn: AssistantTurn): GenAiMessage {
  const parts: GenAiPart[] = [];
  if (turn.text) {
    parts.push({ type: "text", content: turn.text });
  }
  for (const call of turn.toolCalls) {
    parts.push(toolCallPart(call));
  }
  const finish = mapStopReason(turn.stopReason);
  return {
    role: "assistant",
    parts,
    ...(finish ? { finish_reason: finish } : {}),
  };
}

export function toolResultsMessage(calls: ToolCall[]): GenAiMessage | null {
  const parts = calls
    .filter((c) => c.result !== null)
    .map((c) => toolResponsePart(c));
  if (parts.length === 0) return null;
  return { role: "tool", parts };
}

/**
 * Input history before the assistant turn at `turnIndex`.
 */
export function inputMessagesBeforeTurn(
  view: TrajectoryView,
  turnIndex: number,
  prompt?: string,
): GenAiMessage[] {
  const messages: GenAiMessage[] = [];

  if (prompt) {
    messages.push({
      role: "user",
      parts: [{ type: "text", content: prompt }],
    });
  }

  for (let i = 0; i < turnIndex; i++) {
    const turn = view.turns[i];
    if (!turn) continue;
    messages.push(assistantMessageFromTurn(turn));
    const toolMsg = toolResultsMessage(turn.toolCalls);
    if (toolMsg) messages.push(toolMsg);
  }

  return messages;
}

export function finalOutputMessages(view: TrajectoryView): GenAiMessage[] {
  if (view.turns.length === 0) {
    if (!view.finalResponse) return [];
    return [
      {
        role: "assistant",
        parts: [{ type: "text", content: view.finalResponse }],
        finish_reason: mapStopReason(view.finalStopReason),
      },
    ];
  }

  const last = view.turns[view.turns.length - 1];
  return [assistantMessageFromTurn(last)];
}
