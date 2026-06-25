import { join } from "node:path";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runGeminiCli } from "../../../src/adapters/gemini-cli/index";
import * as processModule from "../../../src/adapters/gemini-cli/process";

describe("runGeminiCli", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps fixture stdout into TrajectoryView", async () => {
    const fixture = readFileSync(
      join(process.cwd(), "tests/fixtures/gemini-cli/tool-use.jsonl"),
      "utf8",
    );

    vi.spyOn(processModule, "spawnGeminiCli").mockResolvedValue({
      stdout: Readable.from([fixture]),
      done: Promise.resolve({ exitCode: 0, signal: null }),
      stderrCollected: Promise.resolve(""),
      timedOut: () => false,
      cleanup: async () => {},
    });

    const result = await runGeminiCli({
      prompt: "read readme",
      approvalMode: "yolo",
    });

    expect(result.view.toolCalls).toHaveLength(1);
    expect(result.view.toolCalls[0]?.name).toBe("mcp__filesystem__read");
    expect(result.view.finalResponse).toContain("README");
    expect(result.rawEvents.length).toBeGreaterThan(0);
    expect(result.diagnostics.exitCode).toBe(0);
  });

  it("throws AdapterError when stream lacks init event", async () => {
    vi.spyOn(processModule, "spawnGeminiCli").mockResolvedValue({
      stdout: Readable.from(['{"type":"unknown"}\n']),
      done: Promise.resolve({ exitCode: 42, signal: null }),
      stderrCollected: Promise.resolve("boom"),
      timedOut: () => false,
      cleanup: async () => {},
    });

    await expect(
      runGeminiCli({ prompt: "x" }),
    ).rejects.toMatchObject({
      name: "AdapterError",
      message: expect.stringContaining("code 42"),
      diagnostics: expect.objectContaining({
        exitCode: 42,
        exitCodeDescription: expect.stringContaining("code 42"),
        stderr: "boom",
      }),
    });
  });

  it("records parse errors without failing the run", async () => {
    const fixture = readFileSync(
      join(process.cwd(), "tests/fixtures/gemini-cli/basic-session.jsonl"),
      "utf8",
    );

    vi.spyOn(processModule, "spawnGeminiCli").mockResolvedValue({
      stdout: Readable.from([fixture, "not-json\n"]),
      done: Promise.resolve({ exitCode: 0, signal: null }),
      stderrCollected: Promise.resolve(""),
      timedOut: () => false,
      cleanup: async () => {},
    });

    const result = await runGeminiCli({ prompt: "hello" });

    expect(result.view.success).toBe(true);
    expect(result.diagnostics.parseErrors).toHaveLength(1);
    expect(result.diagnostics.parseErrors[0]?.line).toBe("not-json");
  });
});
