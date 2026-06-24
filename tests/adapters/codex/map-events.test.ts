import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CodexEventMapper,
  mapCodexEvents,
  mcpToolName,
} from "../../../src/adapters/codex/map-events";
import { TrajectoryBuilder } from "../../../src/trajectory/builder";
import type { CodexJsonEvent } from "../../../src/adapters/codex/types";

function loadFixture(name: string): CodexJsonEvent[] {
  const raw = readFileSync(
    join(process.cwd(), "tests/fixtures/codex", name),
    "utf8",
  );
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CodexJsonEvent);
}

describe("mcpToolName", () => {
  it("builds harness-qualified MCP tool names", () => {
    expect(mcpToolName("filesystem", "read")).toBe("mcp__filesystem__read");
  });
});

describe("CodexEventMapper", () => {
  it("maps thread.started to system/init", () => {
    const mapper = new CodexEventMapper();
    const events = mapper.map({
      type: "thread.started",
      thread_id: "th_1",
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "system",
      subtype: "init",
      session_id: "th_1",
    });
  });

  it("maps mcp_tool_call lifecycle without duplicate tool_use", () => {
    const mapper = new CodexEventMapper();
    mapper.map({ type: "thread.started", thread_id: "th_1" });
    const started = mapper.map({
      type: "item.started",
      item: {
        id: "item_1",
        type: "mcp_tool_call",
        server: "docs",
        tool: "search",
        arguments: { q: "x" },
      },
    });
    const completed = mapper.map({
      type: "item.completed",
      item: {
        id: "item_1",
        type: "mcp_tool_call",
        server: "docs",
        tool: "search",
        result: { content: [{ type: "text", text: "ok" }] },
        status: "completed",
      },
    });

    const toolUses = [...started, ...completed].filter(
      (e) =>
        e.type === "assistant" &&
        Array.isArray(e.message.content) &&
        e.message.content.some(
          (b) => typeof b === "object" && b !== null && "type" in b && b.type === "tool_use",
        ),
    );
    expect(toolUses).toHaveLength(1);
    expect(completed.some((e) => e.type === "user")).toBe(true);
  });
});

describe("fixture streams", () => {
  it("builds TrajectoryView from read-tool-smoke.jsonl", () => {
    const events = mapCodexEvents(loadFixture("read-tool-smoke.jsonl"));
    const builder = new TrajectoryBuilder();
    for (const event of events) builder.consume(event);
    const view = builder.build();

    expect(view.meta.sessionId).toBe("th_codex_read_smoke");
    expect(view.toolCalls).toHaveLength(1);
    expect(view.toolCalls[0]?.name).toBe("mcp__filesystem__read");
    expect(view.toolCalls[0]?.result).not.toBeNull();
    expect(view.finalResponse).toContain("statistical eval framework");
    expect(view.success).toBe(true);
  });

  it("maps command_execution to Bash tool calls", () => {
    const events = mapCodexEvents(loadFixture("command-execution-smoke.jsonl"));
    const builder = new TrajectoryBuilder();
    for (const event of events) builder.consume(event);
    const view = builder.build();

    expect(view.toolCalls[0]?.name).toBe("Bash");
    expect(view.toolCalls[0]?.args).toEqual({ command: "bash -lc ls" });
  });
});
