/**
 * TrajectoryView → markdown transcript for LLM graders.
 */

import type { TrajectoryView } from "../types/trajectory";

/** Maximum characters per tool result embedded in grader transcripts. */
const MAX_RESULT_CHARS = 4000;

/**
 * Render a {@link TrajectoryView} as markdown for LLM graders.
 *
 * Tool results are truncated at {@link MAX_RESULT_CHARS} to keep judge
 * prompts within reasonable token limits.
 */
export function trajectoryToTranscript(
  view: TrajectoryView,
  prompt?: string,
): string {
  const lines: string[] = [];

  if (prompt) {
    lines.push("## User prompt", "", prompt, "");
  }

  for (const turn of view.turns) {
    lines.push(`## Assistant turn ${turn.turnIndex + 1}`, "");
    if (turn.text) {
      lines.push(turn.text, "");
    }
    for (const call of turn.toolCalls) {
      lines.push(`[Tool call] ${call.name} (id=${call.callId})`);
      lines.push(`Arguments: ${formatJson(call.args)}`);
      if (call.result !== null) {
        lines.push(`[Tool result] ${formatResult(call.result)}`);
        if (call.isError) lines.push("(tool reported error)");
      } else {
        lines.push("[Tool result] (none observed)");
      }
      lines.push("");
    }
    if (turn.stopReason) {
      lines.push(`Stop reason: ${turn.stopReason}`, "");
    }
  }

  const finalInTurns = view.turns.some((t) => t.text === view.finalResponse);
  if (view.finalResponse && !finalInTurns) {
    lines.push("## Final response", "", view.finalResponse, "");
  }

  lines.push(
    "## Session metadata",
    `session_id: ${view.meta.sessionId}`,
    `model: ${view.meta.model}`,
    `cwd: ${view.meta.cwd}`,
    `success: ${view.success}`,
    `tool_calls: ${view.toolCalls.length}`,
    `duration_ms: ${view.usage.durationMs}`,
    `input_tokens: ${view.usage.inputTokens}`,
    `output_tokens: ${view.usage.outputTokens}`,
  );

  return lines.join("\n").trimEnd();
}

/** Format unknown values as JSON for transcript embedding. */
function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Format a tool result, truncating long string or JSON payloads. */
function formatResult(result: unknown): string {
  if (typeof result === "string") {
    return truncate(result);
  }
  return truncate(formatJson(result));
}

/** Truncate text with ellipsis when exceeding the transcript size budget. */
function truncate(text: string): string {
  if (text.length <= MAX_RESULT_CHARS) return text;
  return `${text.slice(0, MAX_RESULT_CHARS)}… (truncated)`;
}
