import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { TrajectoryBuilder } from "../../src/trajectory/builder";
import { trajectoryToOtlp, traceIdFromSession } from "../../src/otel/emitter";
import { makeToolCall, makeView } from "../helpers/factory";

describe("trajectoryToOtlp", () => {
  it("maps a fixture stream to GenAI semconv spans", async () => {
    const ndjson = await readFile(
      join(__dirname, "../fixtures/streams/simple-search.ndjson"),
      "utf8",
    );
    const builder = new TrajectoryBuilder();
    for (const line of ndjson.trim().split("\n")) {
      builder.consume(JSON.parse(line));
    }
    const view = builder.build();

    const otlp = trajectoryToOtlp(view, { prompt: "search deploy skills" });

    expect(otlp.resourceSpans.length).toBe(1);
    const spans = otlp.resourceSpans[0].scopeSpans[0].spans;
    expect(spans.length).toBe(4);

    const root = spans.find((s) => s.name === "invoke_agent");
    expect(root).toBeDefined();
    expect(root!.parentSpanId).toBeUndefined();
    expect(
      root!.attributes.find((a) => a.key === "gen_ai.operation.name")?.value
        .stringValue,
    ).toBe("invoke_agent");
    expect(
      root!.attributes.find((a) => a.key === "gen_ai.agent.name")?.value
        .stringValue,
    ).toBe("claude-code");

    const chat = spans.find((s) => s.name.startsWith("chat "));
    expect(chat?.parentSpanId).toBe(root!.spanId);
    const inputMessages = chat!.attributes.find(
      (a) => a.key === "gen_ai.input.messages",
    );
    expect(inputMessages?.value.stringValue).toContain("search deploy skills");

    const tool = spans.find((s) => s.name.startsWith("execute_tool "));
    expect(tool?.parentSpanId).toBe(root!.spanId);
    expect(tool?.parentSpanId).toBe(chat?.parentSpanId);
    expect(
      tool!.attributes.find((a) => a.key === "gen_ai.tool.name")?.value
        .stringValue,
    ).toBe("mcp__api__search_skills");
  });

  it("uses a stable trace id derived from session id", () => {
    const view = makeView();
    const a = trajectoryToOtlp(view);
    const b = trajectoryToOtlp(view);

    const traceA = a.resourceSpans[0].scopeSpans[0].spans[0].traceId;
    const traceB = b.resourceSpans[0].scopeSpans[0].spans[0].traceId;
    expect(traceA).toBe(traceB);
    expect(traceA).toBe(traceIdFromSession(view.meta.sessionId));
  });

  it("gives parallel tool calls overlapping timings", () => {
    const callA = makeToolCall({
      name: "Bash",
      callId: "a",
      turnIndex: 0,
      callIndex: 0,
    });
    const callB = makeToolCall({
      name: "Read",
      callId: "b",
      turnIndex: 0,
      callIndex: 1,
    });
    const view = makeView({
      toolCalls: [callA, callB],
      turns: [
        {
          turnIndex: 0,
          text: "",
          toolCalls: [callA, callB],
          stopReason: "tool_use",
        },
      ],
      usage: { ...makeView().usage, durationMs: 1000 },
    });

    const otlp = trajectoryToOtlp(view, { endTimeMs: 2_000_000 });
    const spans = otlp.resourceSpans[0].scopeSpans[0].spans;
    const tools = spans.filter((s) => s.name.startsWith("execute_tool "));
    expect(tools.length).toBe(2);
    expect(tools[0].startTimeUnixNano).toBe(tools[1].startTimeUnixNano);
    expect(tools[0].endTimeUnixNano).toBe(tools[1].endTimeUnixNano);
    expect(tools[0].spanId).not.toBe(tools[1].spanId);
  });
});
