/**
 * TrajectoryView → OTLP JSON export using OpenTelemetry GenAI semantic conventions.
 *
 * Produces an `ExportTraceServiceRequest` suitable for OTLP/HTTP JSON ingestion.
 * Assertions continue to use {@link TrajectoryView} directly; this is export-only.
 */

import { createHash } from "node:crypto";

import type { TrajectoryView } from "../types/trajectory";
import { boolAttr, intAttr, jsonAttr, strAttr } from "./attributes";
import {
  assistantMessageFromTurn,
  inputMessagesBeforeTurn,
  mapStopReason,
} from "./messages";
import type {
  EmitOtelOptions,
  ExportTraceServiceRequest,
  Span,
  SpanStatus,
} from "./types";
import { SpanKind, StatusCode } from "./types";

const INSTRUMENTATION_VERSION = "0.1.0";

interface SpanTiming {
  startNs: string;
  endNs: string;
}

/**
 * Map a {@link TrajectoryView} to OTLP trace JSON.
 *
 * Span tree (siblings under `invoke_agent`, not nested):
 * ```
 * invoke_agent
 * ├── chat {model}
 * ├── execute_tool {name}
 * ├── chat {model}
 * └── ...
 * ```
 */
export function trajectoryToOtlp(
  view: TrajectoryView,
  options: EmitOtelOptions = {},
): ExportTraceServiceRequest {
  const agentName = options.agentName ?? "claude-code";
  const providerName = options.providerName ?? "anthropic";
  const serviceName = options.serviceName ?? "harness-eval";
  const scopeName =
    options.instrumentationScope ?? "@alis-build/harness-eval";

  const traceId = traceIdFromSession(view.meta.sessionId);
  const rootSpanId = spanIdFromKey(traceId, "invoke_agent");

  const durationMs = Math.max(view.usage.durationMs, 1);
  const endMs = options.endTimeMs ?? Date.now();
  const startMs = endMs - durationMs;
  const rootStartNs = msToNs(startMs);
  const rootEndNs = msToNs(endMs);

  const spans: Span[] = [];
  const timings = buildSpanTimings(view, startMs, endMs);

  spans.push({
    traceId,
    spanId: rootSpanId,
    name: "invoke_agent",
    kind: SpanKind.INTERNAL,
    startTimeUnixNano: rootStartNs,
    endTimeUnixNano: rootEndNs,
    attributes: [
      strAttr("gen_ai.operation.name", "invoke_agent"),
      strAttr("gen_ai.agent.name", agentName),
      strAttr("gen_ai.provider.name", providerName),
      strAttr("gen_ai.conversation.id", view.meta.sessionId),
      strAttr("gen_ai.request.model", view.meta.model),
      strAttr("gen_ai.response.model", view.meta.model),
      intAttr("gen_ai.usage.input_tokens", view.usage.inputTokens),
      intAttr("gen_ai.usage.output_tokens", view.usage.outputTokens),
      boolAttr("harness_eval.success", view.success),
    ],
    status: viewStatus(view),
  });

  let opIndex = 0;
  for (const turn of view.turns) {
    const chatTiming = timings[opIndex++];
    const chatSpanId = spanIdFromKey(traceId, `chat:${turn.turnIndex}`);
    const inputMessages = inputMessagesBeforeTurn(
      view,
      turn.turnIndex,
      options.prompt,
    );
    const outputMessages = [assistantMessageFromTurn(turn)];

    spans.push({
      traceId,
      spanId: chatSpanId,
      parentSpanId: rootSpanId,
      name: `chat ${view.meta.model}`,
      kind: SpanKind.CLIENT,
      startTimeUnixNano: chatTiming.startNs,
      endTimeUnixNano: chatTiming.endNs,
      attributes: [
        strAttr("gen_ai.operation.name", "chat"),
        strAttr("gen_ai.provider.name", providerName),
        strAttr("gen_ai.request.model", view.meta.model),
        strAttr("gen_ai.response.model", view.meta.model),
        ...(inputMessages.length > 0
          ? [jsonAttr("gen_ai.input.messages", inputMessages)]
          : []),
        jsonAttr("gen_ai.output.messages", outputMessages),
        ...(turn.stopReason
          ? [
              jsonAttr("gen_ai.response.finish_reasons", [
                mapStopReason(turn.stopReason) ?? turn.stopReason,
              ]),
            ]
          : []),
      ],
      status: { code: StatusCode.OK },
    });

    if (turn.toolCalls.length === 0) continue;

    const toolTiming = timings[opIndex++];
    for (const call of turn.toolCalls) {
      const toolSpanId = spanIdFromKey(
        traceId,
        `tool:${call.callId}`,
      );

      spans.push({
        traceId,
        spanId: toolSpanId,
        parentSpanId: rootSpanId,
        name: `execute_tool ${call.name}`,
        kind: SpanKind.INTERNAL,
        startTimeUnixNano: toolTiming.startNs,
        endTimeUnixNano: toolTiming.endNs,
        attributes: [
          strAttr("gen_ai.operation.name", "execute_tool"),
          strAttr("gen_ai.provider.name", providerName),
          strAttr("gen_ai.tool.name", call.name),
          strAttr("gen_ai.tool.call.id", call.callId),
          jsonAttr("gen_ai.tool.call.arguments", call.args ?? {}),
          ...(call.result !== null
            ? [jsonAttr("gen_ai.tool.call.result", call.result)]
            : []),
          ...(call.namespace
            ? [strAttr("harness_eval.tool.namespace", call.namespace)]
            : []),
          boolAttr("harness_eval.tool.is_error", call.isError),
        ],
        status: call.isError
          ? { code: StatusCode.ERROR, message: "tool reported error" }
          : { code: StatusCode.OK },
      });
    }
  }

  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            strAttr("service.name", serviceName),
            strAttr("gen_ai.agent.name", agentName),
          ],
        },
        scopeSpans: [
          {
            scope: {
              name: scopeName,
              version: INSTRUMENTATION_VERSION,
            },
            spans,
          },
        ],
      },
    ],
  };
}

/** Alias for {@link trajectoryToOtlp} — matches implementation plan naming. */
export const emitOtel = trajectoryToOtlp;

/** Map view success flag to OTLP span status on the root invoke_agent span. */
function viewStatus(view: TrajectoryView): SpanStatus {
  if (view.success) {
    return { code: StatusCode.OK };
  }
  return {
    code: StatusCode.ERROR,
    message: "harness run did not complete successfully",
  };
}

/**
 * Assign synthetic timestamps to chat and tool spans.
 *
 * Stream-json does not carry per-turn wall times, so we divide the session
 * duration evenly across chat/tool slots for OTLP consumers that require
 * start/end times on every span.
 */
function buildSpanTimings(
  view: TrajectoryView,
  startMs: number,
  endMs: number,
): SpanTiming[] {
  const slots: Array<"chat" | "tools"> = [];
  for (const turn of view.turns) {
    slots.push("chat");
    if (turn.toolCalls.length > 0) slots.push("tools");
  }

  if (slots.length === 0) {
    return [];
  }

  const totalMs = Math.max(endMs - startMs, 1);
  const slotMs = totalMs / slots.length;
  const timings: SpanTiming[] = [];
  let offset = startMs;

  for (const slot of slots) {
    const slotStart = offset;
    const slotEnd = offset + slotMs;
    timings.push({
      startNs: msToNs(slotStart),
      endNs: msToNs(slotEnd),
    });
    offset = slotEnd;
  }

  return timings;
}

/**
 * Derive a deterministic 128-bit trace id from the harness session id.
 *
 * Uses SHA-256 truncation so the same session always maps to the same trace.
 */
export function traceIdFromSession(sessionId: string): string {
  return createHash("sha256")
    .update(`harness-eval:trace:${sessionId}`)
    .digest("hex")
    .slice(0, 32)
    .toUpperCase();
}

/**
 * Derive a deterministic 64-bit span id from trace id and a logical span key.
 */
export function spanIdFromKey(traceId: string, key: string): string {
  return createHash("sha256")
    .update(`${traceId}:span:${key}`)
    .digest("hex")
    .slice(0, 16)
    .toUpperCase();
}

/** Convert milliseconds since epoch to OTLP nanosecond timestamp string. */
function msToNs(ms: number): string {
  return String(Math.round(ms * 1_000_000));
}
