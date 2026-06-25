import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  GeminiCliEventMapper,
  mapGeminiCliEvents,
  resolveGeminiToolName,
} from "../../../src/adapters/gemini-cli/map-events";
import { TrajectoryBuilder } from "../../../src/trajectory/builder";
import type { GeminiCliJsonEvent } from "../../../src/adapters/gemini-cli/map-events";

function loadFixture(name: string): GeminiCliJsonEvent[] {
  const raw = readFileSync(
    join(process.cwd(), "tests/fixtures/gemini-cli", name),
    "utf8",
  );
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as GeminiCliJsonEvent);
}

describe("resolveGeminiToolName", () => {
  it("preserves harness-qualified MCP tool names", () => {
    expect(resolveGeminiToolName("mcp__filesystem__read", {})).toBe(
      "mcp__filesystem__read",
    );
  });

  it("maps MCP server/tool fields to harness naming", () => {
    expect(
      resolveGeminiToolName("read", {
        server: "filesystem",
        tool: "read",
      }),
    ).toBe("mcp__filesystem__read");
  });

  it("maps Gemini native MCP FQN to harness naming", () => {
    expect(resolveGeminiToolName("mcp_alis-build_ListLandingZones", {})).toBe(
      "mcp__alis-build__ListLandingZones",
    );
  });

  it("keeps built-in Gemini tool names", () => {
    expect(resolveGeminiToolName("Bash", { command: "ls" })).toBe("Bash");
    expect(resolveGeminiToolName("read_file", { file_path: "x" })).toBe(
      "read_file",
    );
  });
});

describe("GeminiCliEventMapper", () => {
  it("maps init to system/init", () => {
    const mapper = new GeminiCliEventMapper();
    const events = mapper.map({
      type: "init",
      session_id: "sess_1",
      model: "gemini-2.5-pro",
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "system",
      subtype: "init",
      session_id: "sess_1",
      model: "gemini-2.5-pro",
    });
  });

  it("ignores user message events (prompt echo)", () => {
    const mapper = new GeminiCliEventMapper();
    mapper.map({
      type: "init",
      session_id: "sess_1",
      model: "gemini-2.5-pro",
    });
    const events = mapper.map({
      type: "message",
      role: "user",
      content: "List files",
    });
    expect(events).toHaveLength(0);
  });

  it("maps assistant message to assistant stream event", () => {
    const mapper = new GeminiCliEventMapper();
    mapper.map({
      type: "init",
      session_id: "sess_1",
      model: "gemini-2.5-pro",
    });
    const events = mapper.map({
      type: "message",
      role: "assistant",
      content: "Here are the files.",
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "assistant",
      session_id: "sess_1",
    });
    const content = (events[0] as { message: { content: unknown[] } }).message
      .content;
    expect(content[0]).toMatchObject({
      type: "text",
      text: "Here are the files.",
    });
  });

  it("accumulates delta assistant messages and emits once on completion", () => {
    const mapper = new GeminiCliEventMapper();
    mapper.map({
      type: "init",
      session_id: "sess_1",
      model: "gemini-2.5-pro",
    });
    expect(
      mapper.map({
        type: "message",
        role: "assistant",
        content: "Hello ",
        delta: true,
      }),
    ).toHaveLength(0);
    expect(
      mapper.map({
        type: "message",
        role: "assistant",
        content: "world",
        delta: true,
      }),
    ).toHaveLength(0);

    const events = mapper.map({
      type: "message",
      role: "assistant",
      content: "",
    });
    expect(events).toHaveLength(1);
    const content = (events[0] as { message: { content: unknown[] } }).message
      .content;
    expect(content[0]).toMatchObject({ type: "text", text: "Hello world" });
  });

  it("flushes buffered deltas on result when no final message arrives", () => {
    const mapper = new GeminiCliEventMapper();
    mapper.map({
      type: "init",
      session_id: "sess_1",
      model: "gemini-2.5-pro",
    });
    mapper.map({
      type: "message",
      role: "assistant",
      content: "Done.",
      delta: true,
    });

    const events = mapper.map({
      type: "result",
      status: "success",
      stats: { input_tokens: 1, output_tokens: 1, duration_ms: 100 },
    });

    const assistant = events.find((e) => e.type === "assistant");
    expect(assistant).toBeDefined();
    const content = (assistant as { message: { content: unknown[] } }).message
      .content;
    expect(content[0]).toMatchObject({ type: "text", text: "Done." });
    expect(events.some((e) => e.type === "result")).toBe(true);
  });

  it("maps tool_use and tool_result without duplicate tool_use", () => {
    const mapper = new GeminiCliEventMapper();
    mapper.map({
      type: "init",
      session_id: "sess_1",
      model: "gemini-2.5-pro",
    });
    const toolUse = mapper.map({
      type: "tool_use",
      tool_name: "mcp__filesystem__read",
      tool_id: "tool_1",
      parameters: { path: "README.md" },
    });
    const toolResult = mapper.map({
      type: "tool_result",
      tool_id: "tool_1",
      status: "success",
      output: "# harness-eval",
    });

    const toolUses = [...toolUse, ...toolResult].filter(
      (e) =>
        e.type === "assistant" &&
        Array.isArray(e.message.content) &&
        e.message.content.some(
          (b) =>
            typeof b === "object" &&
            b !== null &&
            "type" in b &&
            b.type === "tool_use",
        ),
    );
    expect(toolUses).toHaveLength(1);
    expect(toolResult.some((e) => e.type === "user")).toBe(true);
  });

  it("tolerates unknown event types", () => {
    const mapper = new GeminiCliEventMapper();
    expect(mapper.map({ type: "future_event", foo: "bar" })).toEqual([]);
  });

  it("maps error events to empty stream (non-fatal diagnostic)", () => {
    const mapper = new GeminiCliEventMapper();
    mapper.map({
      type: "init",
      session_id: "sess_1",
      model: "gemini-2.5-pro",
    });
    expect(
      mapper.map({
        type: "error",
        message: "rate limited",
      }),
    ).toEqual([]);
  });

  it("maps result success to result stream event", () => {
    const mapper = new GeminiCliEventMapper();
    mapper.map({
      type: "init",
      session_id: "sess_1",
      model: "gemini-2.5-pro",
    });
    const events = mapper.map({
      type: "result",
      status: "success",
      stats: {
        input_tokens: 100,
        output_tokens: 50,
        duration_ms: 1200,
      },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "result",
      subtype: "success",
      session_id: "sess_1",
      is_error: false,
      usage: { input_tokens: 100, output_tokens: 50 },
      duration_ms: 1200,
    });
  });

  it("maps result error to result stream event", () => {
    const mapper = new GeminiCliEventMapper();
    mapper.map({
      type: "init",
      session_id: "sess_1",
      model: "gemini-2.5-pro",
    });
    const events = mapper.map({
      type: "result",
      status: "error",
      error: { type: "api", message: "quota exceeded" },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "result",
      subtype: "error",
      is_error: true,
      result: "quota exceeded",
    });
  });
});

describe("fixture streams", () => {
  it("builds TrajectoryView from basic-session.jsonl", () => {
    const events = mapGeminiCliEvents(loadFixture("basic-session.jsonl"));
    const builder = new TrajectoryBuilder();
    for (const event of events) builder.consume(event);
    const view = builder.build();

    expect(view.meta.sessionId).toBe("gemini_basic_smoke");
    expect(view.meta.model).toBe("gemini-2.5-pro");
    expect(view.toolCalls).toHaveLength(0);
    expect(view.finalResponse).toContain("statistical eval framework");
    expect(view.success).toBe(true);
  });

  it("builds TrajectoryView from tool-use.jsonl with MCP tool call", () => {
    const events = mapGeminiCliEvents(loadFixture("tool-use.jsonl"));
    const builder = new TrajectoryBuilder();
    for (const event of events) builder.consume(event);
    const view = builder.build();

    expect(view.meta.sessionId).toBe("gemini_tool_smoke");
    expect(view.toolCalls).toHaveLength(1);
    expect(view.toolCalls[0]?.name).toBe("mcp__filesystem__read");
    expect(view.toolCalls[0]?.args).toEqual({ path: "README.md" });
    expect(view.toolCalls[0]?.result).toBe("# harness-eval");
    expect(view.finalResponse).toContain("README");
    expect(view.success).toBe(true);
  });

  it("builds TrajectoryView from streaming-after-tool without duplicated finalResponse", () => {
    const events = mapGeminiCliEvents(
      loadFixture("streaming-after-tool.jsonl"),
    );
    const builder = new TrajectoryBuilder();
    for (const event of events) builder.consume(event);
    const view = builder.build();

    expect(view.toolCalls).toHaveLength(1);
    expect(view.toolCalls[0]?.name).toBe("mcp__alis-build__ListLandingZones");
    expect(view.turns.filter((t) => t.text.length > 0)).toHaveLength(1);
    expect(view.finalResponse).toBe(
      "Here are your landing zones:\n\n| ID | Status |\n|---|---|\n| aibake | ACTIVE |\n| vizx | DELETING |",
    );
    expect(view.finalResponse.match(/Here are your landing zones/g)?.length).toBe(
      1,
    );
    expect(view.success).toBe(true);
  });
});
