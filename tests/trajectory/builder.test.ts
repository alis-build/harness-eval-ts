import { createReadStream } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseStreamJson } from "../../src/parsers/stream-json";
import { TrajectoryBuilder } from "../../src/trajectory/builder";

const fixturesDir = join(import.meta.dirname, "../fixtures/streams");

async function collectEvents(path: string) {
  const events: unknown[] = [];
  const stream = createReadStream(path);
  for await (const result of parseStreamJson(stream)) {
    if (result.ok) events.push(result.event);
  }
  return events;
}

describe("stream-json parser", () => {
  it("parses NDJSON lines", async () => {
    const path = join(fixturesDir, "simple-search.ndjson");
    const events = await collectEvents(path);
    expect(events.length).toBe(5);
  });

  it("handles chunk-spanning lines", async () => {
    const { Readable } = await import("node:stream");
    const line = '{"type":"system","subtype":"init","session_id":"s","cwd":"/","model":"m","tools":[],"mcp_servers":[]}\n';
    const stream = Readable.from([line.slice(0, 10), line.slice(10)]);
    const results: boolean[] = [];
    for await (const r of parseStreamJson(stream)) {
      results.push(r.ok);
    }
    expect(results).toEqual([true]);
  });

  it("reports parse errors for malformed JSON", async () => {
    const { Readable } = await import("node:stream");
    const stream = Readable.from(["not json\n"]);
    for await (const r of parseStreamJson(stream)) {
      expect(r.ok).toBe(false);
    }
  });

  it("parses multiple objects in one chunk", async () => {
    const { Readable } = await import("node:stream");
    const init =
      '{"type":"system","subtype":"init","session_id":"s","cwd":"/","model":"m","tools":[],"mcp_servers":[]}\n';
    const result =
      '{"type":"result","subtype":"success","session_id":"s","total_cost_usd":0,"is_error":false,"duration_ms":1,"num_turns":1}\n';
    const stream = Readable.from([init + result]);
    const results: boolean[] = [];
    for await (const r of parseStreamJson(stream)) {
      results.push(r.ok);
    }
    expect(results).toEqual([true, true]);
  });

  it("skips empty lines", async () => {
    const { Readable } = await import("node:stream");
    const line =
      '{"type":"system","subtype":"init","session_id":"s","cwd":"/","model":"m","tools":[],"mcp_servers":[]}\n';
    const stream = Readable.from(["\n", line, "\n\n"]);
    const results: boolean[] = [];
    for await (const r of parseStreamJson(stream)) {
      results.push(r.ok);
    }
    expect(results).toEqual([true]);
  });

  it("flushes trailing content without a final newline", async () => {
    const { Readable } = await import("node:stream");
    const line =
      '{"type":"system","subtype":"init","session_id":"s","cwd":"/","model":"m","tools":[],"mcp_servers":[]}';
    const stream = Readable.from([line]);
    const results: boolean[] = [];
    for await (const r of parseStreamJson(stream)) {
      results.push(r.ok);
    }
    expect(results).toEqual([true]);
  });

  it("yields nothing for an empty stream", async () => {
    const { Readable } = await import("node:stream");
    const stream = Readable.from([]);
    const results: boolean[] = [];
    for await (const r of parseStreamJson(stream)) {
      results.push(r.ok);
    }
    expect(results).toEqual([]);
  });
});

describe("TrajectoryBuilder", () => {
  it("builds view from recorded stream", async () => {
    const path = join(fixturesDir, "simple-search.ndjson");
    const builder = new TrajectoryBuilder();
    for (const event of await collectEvents(path)) {
      builder.consume(event as import("../../src/types/stream").StreamEvent);
    }
    const view = builder.build();
    expect(view.toolCalls.length).toBe(1);
    expect(view.toolCalls[0].name).toBe("mcp__api__search_skills");
    expect(view.finalResponse).toContain("deploy");
    expect(view.success).toBe(true);
  });

  it("throws without init event", () => {
    const builder = new TrajectoryBuilder();
    expect(() => builder.build()).toThrow(/init/);
  });
});
