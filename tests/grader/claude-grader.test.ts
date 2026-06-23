import { describe, expect, it } from "vitest";

import { buildJudgeArgs } from "../../src/adapters/claude-code/flags";
import {
  JUDGE_CLAUDE_DEFAULTS,
  mergeJudgeClaudeOptions,
} from "../../src/grader/claude-grader";

describe("judge Claude defaults", () => {
  it("merges bare/maxTurns defaults for grading", () => {
    expect(mergeJudgeClaudeOptions()).toEqual(JUDGE_CLAUDE_DEFAULTS);
    expect(mergeJudgeClaudeOptions({ bare: false })).toMatchObject({
      bare: false,
      maxTurns: 1,
    });
  });

  it("buildJudgeArgs includes bare mode for fast single-shot JSON", () => {
    const args = buildJudgeArgs("grade", mergeJudgeClaudeOptions());
    expect(args).toContain("--bare");
    expect(args).toContain("--max-turns");
    expect(args).toContain("1");
    expect(args).toContain("--disable-slash-commands");
  });
});
