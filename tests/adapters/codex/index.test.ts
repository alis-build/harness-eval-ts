import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runCodex } from "../../../src/adapters/codex/index";
import { ensureHarnessOutputLastMessage } from "../../../src/adapters/codex/flags";
import type { CodexAdapterConfig } from "../../../src/adapters/codex/types";
import * as processModule from "../../../src/adapters/codex/process";

describe("ensureHarnessOutputLastMessage", () => {
  it("auto-generates a temp path when capture is enabled", () => {
    const config: CodexAdapterConfig = { prompt: "x" };
    const autoPath = ensureHarnessOutputLastMessage(config);

    expect(autoPath).toBeTruthy();
    expect(config.outputLastMessage).toBe(autoPath);
    expect(autoPath).toContain("harness-eval-codex-last-msg-");
  });

  it("does not override an explicit outputLastMessage path", () => {
    const config: CodexAdapterConfig = { prompt: "x", outputLastMessage: "/tmp/explicit.txt" };
    expect(ensureHarnessOutputLastMessage(config)).toBeNull();
    expect(config.outputLastMessage).toBe("/tmp/explicit.txt");
  });

  it("skips auto-generation when captureLastMessage is false", () => {
    const config: CodexAdapterConfig = { prompt: "x", captureLastMessage: false };
    expect(ensureHarnessOutputLastMessage(config)).toBeNull();
    expect(config.outputLastMessage).toBeUndefined();
  });
});

describe("runCodex", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps fixture stdout into TrajectoryView", async () => {
    const fixture = readFileSync(
      join(process.cwd(), "tests/fixtures/codex/read-tool-smoke.jsonl"),
      "utf8",
    );

    vi.spyOn(processModule, "spawnCodex").mockResolvedValue({
      stdout: Readable.from([fixture]),
      done: Promise.resolve({ exitCode: 0, signal: null }),
      stderrCollected: Promise.resolve(""),
      timedOut: () => false,
      cleanup: async () => {},
    });

    const result = await runCodex({
      prompt: "read readme",
      captureLastMessage: false,
    });

    expect(result.view.toolCalls).toHaveLength(1);
    expect(result.view.toolCalls[0]?.name).toBe("mcp__filesystem__read");
    expect(result.view.finalResponse).toContain("statistical eval framework");
    expect(result.rawEvents.length).toBeGreaterThan(0);
    expect(result.diagnostics.exitCode).toBe(0);
  });

  it("uses JSONL assistant_message for finalResponse when present", async () => {
    const fixture = readFileSync(
      join(process.cwd(), "tests/fixtures/codex/read-tool-smoke.jsonl"),
      "utf8",
    );
    const lastMessagePath = join(tmpdir(), "harness-eval-test-last-msg-jsonl.txt");
    await writeFile(
      lastMessagePath,
      "This file should be ignored when JSONL has assistant text.",
    );

    vi.spyOn(processModule, "spawnCodex").mockResolvedValue({
      stdout: Readable.from([fixture]),
      done: Promise.resolve({ exitCode: 0, signal: null }),
      stderrCollected: Promise.resolve(""),
      timedOut: () => false,
      cleanup: async () => {},
    });

    const result = await runCodex({
      prompt: "read readme",
      outputLastMessage: lastMessagePath,
    });

    expect(result.view.finalResponse).toContain("statistical eval framework");
    expect(result.view.finalResponse).not.toContain("ignored");

    await rm(lastMessagePath, { force: true });
  });

  it("reads outputLastMessage when JSONL has no assistant_message", async () => {
    const fixture = readFileSync(
      join(process.cwd(), "tests/fixtures/codex/mcp-no-assistant.jsonl"),
      "utf8",
    );
    const tempDir = await mkdtemp(join(tmpdir(), "harness-eval-codex-test-"));
    const lastMessagePath = join(tempDir, "last-message.txt");
    await writeFile(
      lastMessagePath,
      "Here are your landing zones: aibake (ACTIVE), alis (FAILED).",
    );

    vi.spyOn(processModule, "spawnCodex").mockResolvedValue({
      stdout: Readable.from([fixture]),
      done: Promise.resolve({ exitCode: 0, signal: null }),
      stderrCollected: Promise.resolve(""),
      timedOut: () => false,
      cleanup: async () => {},
    });

    const result = await runCodex({
      prompt: "list landing zones",
      outputLastMessage: lastMessagePath,
    });

    expect(result.view.toolCalls).toHaveLength(1);
    expect(result.view.toolCalls[0]?.name).toBe(
      "mcp__alis-build__ListLandingZones",
    );
    expect(result.view.finalResponse).toBe(
      "Here are your landing zones: aibake (ACTIVE), alis (FAILED).",
    );

    await rm(tempDir, { recursive: true, force: true });
  });

  it("leaves finalResponse empty when outputLastMessage file is missing", async () => {
    const fixture = readFileSync(
      join(process.cwd(), "tests/fixtures/codex/mcp-no-assistant.jsonl"),
      "utf8",
    );

    vi.spyOn(processModule, "spawnCodex").mockResolvedValue({
      stdout: Readable.from([fixture]),
      done: Promise.resolve({ exitCode: 0, signal: null }),
      stderrCollected: Promise.resolve(""),
      timedOut: () => false,
      cleanup: async () => {},
    });

    const result = await runCodex({
      prompt: "list landing zones",
      outputLastMessage: join(tmpdir(), "harness-eval-missing-last-msg.txt"),
      captureLastMessage: false,
    });

    expect(result.view.finalResponse).toBe("");
  });
});
