import { afterEach, describe, expect, it, vi } from "vitest";

import { GEMINI_CONFIG_DIR_ENV } from "../../src/adapters/gemini-cli/process";
import {
  JUDGE_GEMINI_CLI_DEFAULTS,
  mergeJudgeGeminiCliOptions,
  runGeminiCliGrader,
} from "../../src/grader/gemini-cli-grader";
import { extractGeminiCliResponseText } from "../../src/grader/parse";
import * as spawnJudgeModule from "../../src/grader/spawn-judge";

vi.mock("../../src/grader/spawn-judge", () => ({
  spawnCollectStdout: vi.fn(),
}));

const mockSpawnCollectStdout = vi.mocked(spawnJudgeModule.spawnCollectStdout);

describe("mergeJudgeGeminiCliOptions", () => {
  it("applies judge-safe defaults", () => {
    expect(mergeJudgeGeminiCliOptions()).toMatchObject(JUDGE_GEMINI_CLI_DEFAULTS);
    expect(mergeJudgeGeminiCliOptions().isolateConfig).toBe(true);
  });

  it("allows user overrides", () => {
    expect(
      mergeJudgeGeminiCliOptions({ model: "gemini-2.5-pro", approvalMode: "plan" })
        .model,
    ).toBe("gemini-2.5-pro");
    expect(mergeJudgeGeminiCliOptions({ approvalMode: "plan" }).approvalMode).toBe(
      "plan",
    );
  });
});

describe("extractGeminiCliResponseText", () => {
  it("extracts response field from Gemini JSON output", () => {
    const stdout = JSON.stringify({
      response: '{"expectations":[{"text":"x","passed":true,"evidence":"ok"}]}',
      stats: { input_tokens: 1, output_tokens: 2 },
    });
    expect(extractGeminiCliResponseText(stdout)).toContain("expectations");
  });

  it("returns trimmed stdout when not JSON", () => {
    expect(extractGeminiCliResponseText("  plain text  ")).toBe("plain text");
  });
});

describe("runGeminiCliGrader", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("applies isolateConfig via GEMINI_CONFIG_DIR by default", async () => {
    mockSpawnCollectStdout.mockResolvedValue(
      JSON.stringify({
        response: JSON.stringify({
          expectations: [{ text: "x", passed: true, evidence: "ok" }],
        }),
      }),
    );

    await runGeminiCliGrader(
      {
        prompt: "p",
        expectations: ["x"],
        transcript: "t",
      },
      { model: "gemini-2.5-flash" },
    );

    expect(mockSpawnCollectStdout).toHaveBeenCalledOnce();
    const env = mockSpawnCollectStdout.mock.calls[0]?.[0]?.env ?? {};
    expect(env[GEMINI_CONFIG_DIR_ENV]).toBeTruthy();
  });

  it("does not isolate when judge geminiCli.isolateConfig is false", async () => {
    mockSpawnCollectStdout.mockResolvedValue(
      JSON.stringify({
        response: JSON.stringify({
          expectations: [{ text: "x", passed: true, evidence: "ok" }],
        }),
      }),
    );

    await runGeminiCliGrader(
      {
        prompt: "p",
        expectations: ["x"],
        transcript: "t",
      },
      { geminiCli: { isolateConfig: false } },
    );

    const env = mockSpawnCollectStdout.mock.calls[0]?.[0]?.env ?? {};
    expect(env[GEMINI_CONFIG_DIR_ENV]).toBeUndefined();
  });

  it("parses grader JSON and aligns expectations on success", async () => {
    mockSpawnCollectStdout.mockResolvedValue(
      JSON.stringify({
        response: JSON.stringify({
          expectations: [
            { text: "Lists zones", passed: true, evidence: "Table has aibake" },
            { text: "Includes status", passed: false, evidence: "No statuses shown" },
          ],
          eval_feedback: { overall: "Partial pass", suggestions: [] },
        }),
      }),
    );

    const result = await runGeminiCliGrader(
      {
        prompt: "List landing zones",
        expectations: ["Lists zones", "Includes status"],
        transcript: "tool call…",
      },
      { model: "gemini-2.5-flash" },
    );

    expect(result.error).toBeUndefined();
    expect(result.summary).toEqual({
      passed: 1,
      failed: 1,
      total: 2,
      passRate: 0.5,
    });
    expect(result.expectations[0]).toMatchObject({
      text: "Lists zones",
      passed: true,
      evidence: "Table has aibake",
    });
    expect(result.expectations[1]).toMatchObject({
      text: "Includes status",
      passed: false,
      evidence: "No statuses shown",
    });
    expect(result.evalFeedback?.overall).toBe("Partial pass");
  });

  it("fails all expectations when grader output is unparseable", async () => {
    mockSpawnCollectStdout.mockResolvedValue("not valid grader json");

    const result = await runGeminiCliGrader(
      {
        prompt: "p",
        expectations: ["a", "b"],
        transcript: "t",
      },
    );

    expect(result.summary.passRate).toBe(0);
    expect(result.summary.failed).toBe(2);
    expect(result.error).toMatch(/failed to parse grader JSON/);
    expect(result.expectations.every((e) => !e.passed)).toBe(true);
  });
});
