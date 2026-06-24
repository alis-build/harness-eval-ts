/**
 * Stable judge identifiers for eval-run envelope provenance.
 */

import type { GradingConfig } from "../config/grading-loader";
import type { JudgeInfo } from "../types/eval-record";

/** Map harness grading adapter id to a stable judge identifier. */
export function judgeIdForAdapter(adapter: string | undefined): string {
  switch (adapter) {
    case "codex":
      return "harness-eval/codex-grader";
    case "claude-code":
      return "harness-eval/claude-grader";
    default:
      return adapter ? `harness-eval/${adapter}-grader` : "harness-eval/claude-grader";
  }
}

/** Build {@link JudgeInfo} from grading adapter and optional model override. */
export function resolveJudgeInfo(options: {
  adapter?: string;
  model?: string;
  id?: string;
}): JudgeInfo {
  const adapter = options.adapter ?? "claude-code";
  return {
    id: options.id ?? judgeIdForAdapter(adapter),
    model: options.model,
    adapter,
  };
}

/** Derive judge metadata from a parsed grading YAML config. */
export function judgeInfoFromGradingConfig(
  config: GradingConfig,
): JudgeInfo {
  const adapter = config.judge.adapter ?? "claude-code";
  const model =
    config.judge.model ??
    (config.judge.codex as { model?: string } | undefined)?.model ??
    (config.judge.claudeCode as { model?: string } | undefined)?.model;

  return resolveJudgeInfo({ adapter, model });
}
