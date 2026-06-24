import { describe, expect, it } from "vitest";

import {
  JUDGE_CODEX_DEFAULTS,
  mergeJudgeCodexOptions,
} from "../../src/grader/codex-grader";

describe("mergeJudgeCodexOptions", () => {
  it("applies judge-safe defaults", () => {
    expect(mergeJudgeCodexOptions()).toMatchObject(JUDGE_CODEX_DEFAULTS);
  });

  it("allows user overrides", () => {
    expect(
      mergeJudgeCodexOptions({ model: "gpt-5.4", ephemeral: false }).model,
    ).toBe("gpt-5.4");
    expect(mergeJudgeCodexOptions({ ephemeral: false }).ephemeral).toBe(false);
  });
});
