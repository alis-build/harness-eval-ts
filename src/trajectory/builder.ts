/**
 * TrajectoryBuilder — consumes a stream of {@link StreamEvent} values and
 * produces a {@link TrajectoryView}.
 *
 * State machine: the builder is a small, tolerant state machine. Invariants:
 *
 *   - Exactly one `system/init` event opens the session. The builder requires
 *     it to be present before `build()`.
 *   - Each `assistant` event begins a new turn. Text blocks accumulate into
 *     the turn's text; `tool_use` blocks become `ToolCall` records.
 *   - `user` events with `tool_result` blocks deliver tool results back. We
 *     match them to pending calls by `tool_use_id`.
 *   - One `result` event closes the session and carries aggregate usage.
 *
 * The builder is *tolerant of partial streams*: a process killed mid-run
 * produces a coherent (but flagged) view. Tool calls without matching results
 * keep `result: null`. The `success` flag reflects whether a successful result
 * event was actually observed.
 *
 * Why a class (not a reducer)?
 *   The internal `pendingCalls` map is mutable by design — we modify ToolCall
 *   objects in place when results arrive, so other parts of the view (which
 *   hold references to the same objects) see the update for free. A reducer
 *   would force a deep copy per result event, which is wasteful and would
 *   complicate identity-based queries.
 */

import {
  isAssistantMessage,
  isResult,
  isSystemInit,
  isTextBlock,
  isToolResultBlock,
  isToolUseBlock,
  isUserMessage,
  type StreamEvent,
  type Usage,
} from "../types/stream";
import {
  namespaceOf,
  type AssistantTurn,
  type RetryRecord,
  type SessionMeta,
  type ToolCall,
  type TrajectoryView,
} from "../types/trajectory";

export class TrajectoryBuilder {
  private meta: SessionMeta | null = null;
  private sessionStartTs: number | null = null;

  private turns: AssistantTurn[] = [];
  private allToolCalls: ToolCall[] = [];

  /**
   * tool_use_id → ToolCall, for matching results back to calls.
   * Entries are removed once a result is observed.
   */
  private pendingCalls: Map<string, ToolCall> = new Map();

  private retries: RetryRecord[] = [];

  private finalUsage: Usage | null = null;
  private finalCostUsd = 0;
  private finalDurationMs = 0;
  private finalNumTurns = 0;
  private finalResultText = "";
  private sawResultEvent = false;
  private resultIsError = false;

  /**
   * Consume one event. Safe to call with events in stream order.
   *
   * Unknown event types are silently ignored — the schema evolves and we
   * don't want CI to break on a new event type we haven't modelled.
   */
  consume(event: StreamEvent): void {
    if (isSystemInit(event)) {
      this.meta = {
        sessionId: event.session_id,
        model: event.model,
        cwd: event.cwd,
        permissionMode: event.permissionMode,
        availableTools: event.tools ?? [],
        mcpServers: (event.mcp_servers ?? []).map((s) => ({
          name: s.name,
          status: s.status,
        })),
      };
      this.sessionStartTs = Date.now();
      return;
    }

    if (event.type === "system" && event.subtype === "api_retry") {
      this.retries.push({
        offsetMs: this.sessionStartTs ? Date.now() - this.sessionStartTs : 0,
        raw: event,
      });
      return;
    }

    if (isAssistantMessage(event)) {
      this.handleAssistantMessage(event);
      return;
    }

    if (isUserMessage(event)) {
      this.handleUserMessage(event);
      return;
    }

    if (isResult(event)) {
      this.sawResultEvent = true;
      this.resultIsError = event.is_error;
      this.finalUsage = event.usage ?? null;
      this.finalCostUsd = event.total_cost_usd ?? 0;
      this.finalDurationMs = event.duration_ms ?? 0;
      this.finalNumTurns = event.num_turns ?? 0;
      this.finalResultText = event.result ?? "";
      return;
    }

    // Unknown event: ignored. See class doc.
  }

  /**
   * Finalize the view. Call after consuming the last event from the stream.
   *
   * Throws if no `system/init` was observed — at that point we have no model,
   * no session id, and no available-tools list, which means assertions like
   * "called any mcp__api__* tool" can't even be evaluated meaningfully.
   */
  build(): TrajectoryView {
    if (this.meta === null) {
      throw new Error(
        "TrajectoryBuilder.build() called before any system/init event was observed. " +
          "The harness may have failed to start, or the stream was truncated before init.",
      );
    }

    const lastTurn = this.turns[this.turns.length - 1];

    // Prefer the assistant text we accumulated turn-by-turn over the
    // `result.result` field, because the latter is sometimes a summary
    // and the former is exactly what the model said.
    const accumulatedText = this.turns
      .map((t) => t.text)
      .filter((t) => t.length > 0)
      .join("\n\n")
      .trim();

    return {
      meta: this.meta,
      toolCalls: this.allToolCalls,
      turns: this.turns,
      finalResponse: accumulatedText || this.finalResultText,
      finalStopReason: lastTurn?.stopReason ?? null,
      usage: {
        inputTokens: this.finalUsage?.input_tokens ?? 0,
        outputTokens: this.finalUsage?.output_tokens ?? 0,
        totalCostUsd: this.finalCostUsd,
        durationMs: this.finalDurationMs,
        // Fall back to observed turn count if the result event was missing.
        numTurns: this.finalNumTurns || this.turns.length,
      },
      retries: this.retries,
      // Successful = saw a non-error result envelope. Streams that ended without
      // a result event are reported as unsuccessful regardless of tool outcomes.
      success: this.sawResultEvent && !this.resultIsError,
    };
  }

  // private handlers

  private handleAssistantMessage(
    event: Extract<StreamEvent, { type: "assistant" }>,
  ): void {
    const turnIndex = this.turns.length;
    const textChunks: string[] = [];
    const toolCallsThisTurn: ToolCall[] = [];

    for (const block of event.message.content) {
      if (isTextBlock(block)) {
        textChunks.push(block.text);
        continue;
      }
      if (isToolUseBlock(block)) {
        const call: ToolCall = {
          name: block.name,
          namespace: namespaceOf(block.name),
          callId: block.id,
          args: block.input,
          result: null,
          isError: false,
          turnIndex,
          callIndex: this.allToolCalls.length,
        };
        this.allToolCalls.push(call);
        this.pendingCalls.set(block.id, call);
        toolCallsThisTurn.push(call);
        continue;
      }
      // tool_result blocks don't appear in assistant messages — those arrive
      // via user messages. If one does appear, ignore it; we'd rather drop
      // an unexpected block than crash the eval.
    }

    this.turns.push({
      turnIndex,
      text: textChunks.join("").trim(),
      toolCalls: toolCallsThisTurn,
      stopReason: event.message.stop_reason ?? null,
    });
  }

  private handleUserMessage(
    event: Extract<StreamEvent, { type: "user" }>,
  ): void {
    const content = event.message.content;

    // The very first user message carries the prompt as a plain string. We
    // already know the prompt (the caller passed it to the adapter), so we
    // ignore this case — there's nothing assertion-relevant in it.
    if (typeof content === "string") return;

    for (const block of content) {
      if (!isToolResultBlock(block)) continue;

      const call = this.pendingCalls.get(block.tool_use_id);
      if (!call) {
        // Unmatched result: ignore. Can happen if events arrive out of order
        // or the corresponding tool_use was emitted in an earlier run that
        // we're resuming. Either way, dropping is safer than throwing.
        continue;
      }

      call.result = block.content;
      call.isError = block.is_error ?? false;
      this.pendingCalls.delete(block.tool_use_id);
    }
  }
}

/**
 * Convenience: drain an async iterable of events through a fresh builder.
 *
 * Suitable when you have the full event stream and just want the view.
 * For interactive/incremental scenarios (e.g. surfacing partial state in a UI)
 * instantiate {@link TrajectoryBuilder} directly and call `consume()` /
 * `build()` yourself.
 */
export async function buildTrajectory(
  events: AsyncIterable<StreamEvent>,
): Promise<TrajectoryView> {
  const builder = new TrajectoryBuilder();
  for await (const event of events) {
    builder.consume(event);
  }
  return builder.build();
}
