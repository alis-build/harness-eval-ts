import { describe, expect, it } from "vitest";

import {
  judgeIdForAdapter,
  judgeInfoFromGradingConfig,
  resolveJudgeInfo,
} from "../../src/eval-record/judge-metadata";

describe("judgeIdForAdapter", () => {
  it("maps known adapters to stable judge ids", () => {
    expect(judgeIdForAdapter("claude-code")).toBe("harness-eval/claude-grader");
    expect(judgeIdForAdapter("codex")).toBe("harness-eval/codex-grader");
  });
});

describe("resolveJudgeInfo", () => {
  it("includes adapter and model when provided", () => {
    expect(
      resolveJudgeInfo({ adapter: "codex", model: "gpt-5.4" }),
    ).toEqual({
      id: "harness-eval/codex-grader",
      model: "gpt-5.4",
      adapter: "codex",
    });
  });
});

describe("judgeInfoFromGradingConfig", () => {
  it("reads adapter and model from grading YAML shape", () => {
    expect(
      judgeInfoFromGradingConfig({
        judge: {
          adapter: "codex",
          model: "gpt-5.4",
        },
      }),
    ).toEqual({
      id: "harness-eval/codex-grader",
      model: "gpt-5.4",
      adapter: "codex",
    });
  });
});
