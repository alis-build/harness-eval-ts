/**
 * Harness-owned trajectory metric scores in Vertex camelCase field names.
 *
 * Wraps {@link computeTrajectoryMetrics} for envelope export. External
 * systems can compare harness-precomputed scores against Vertex EvaluateInstances
 * results without reimplementing trajectory matching logic.
 */

import { computeTrajectoryMetrics } from "../../metrics/trajectory";
import { normalizeReferenceToolName } from "../normalize";
import type { HarnessMetrics, ReferenceToolNameMode } from "../../types/eval-interchange";
import type { ToolCall } from "../../types/trajectory";

/** Suite YAML reference step shape accepted by metric computation. */
type ReferenceStep = { tool_name: string; tool_input: unknown };

/**
 * Compute trajectory metrics and map snake_case keys to Vertex camelCase.
 *
 * When `referenceToolNameMode` is `"bare"`, both predicted and reference tool
 * names are stripped to the suffix after the last `__` so suite reference steps
 * authored with bare names (e.g. `ListLandingZones`) match harness MCP names
 * (e.g. `mcp__plugin__ListLandingZones`).
 *
 * @param predicted - Tool calls from the harness trajectory view.
 * @param reference - Reference steps from suite YAML.
 * @param options.referenceToolNameMode - Name normalization mode from suite YAML.
 */
export function toHarnessMetrics(
  predicted: ToolCall[],
  reference: ReferenceStep[],
  options: { referenceToolNameMode?: ReferenceToolNameMode } = {},
): HarnessMetrics {
  const referenceToolNameMode = options.referenceToolNameMode ?? "harness";

  const metrics = computeTrajectoryMetrics(
    predicted.map((toolCall) => ({
      tool_name: normalizeReferenceToolName(toolCall.name, referenceToolNameMode),
      tool_input: toolCall.args,
    })),
    reference.map((step) => ({
      tool_name: normalizeReferenceToolName(step.tool_name, referenceToolNameMode),
      tool_input: step.tool_input,
    })),
  );

  return {
    trajectoryExactMatch: metrics.trajectory_exact_match,
    trajectoryInOrderMatch: metrics.trajectory_in_order_match,
    trajectoryAnyOrderMatch: metrics.trajectory_any_order_match,
    trajectoryPrecision: metrics.trajectory_precision,
    trajectoryRecall: metrics.trajectory_recall,
    trajectorySingleToolUse: metrics.trajectory_single_tool_use,
  };
}
