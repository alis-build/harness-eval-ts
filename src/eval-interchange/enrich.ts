/**
 * Enrich eval repetitions with Vertex protojson interchange fields.
 *
 * Called during envelope build for each successful repetition. Adds
 * `evaluationInstance`, optional `trajectoryInstances` / `harnessMetrics`
 * when a suite reference exists, and Vertex-style `latencySeconds` / `failure`
 * flags derived from trajectory success.
 */

import { toEvaluationInstance } from "./protojson/evaluation-instance";
import { toHarnessMetrics } from "./protojson/harness-metrics";
import { toTrajectoryInstances } from "./protojson/trajectory-instances";
import type { EvalRepetition } from "../types/eval-record";
import type { ReferenceTrajectoryConfig } from "../types/eval-interchange";
import type { ToolCall } from "../types/trajectory";

/** Extract reference steps from suite config when present. */
function referenceSteps(
  reference?: ReferenceTrajectoryConfig,
): Array<{ tool_name: string; tool_input: unknown }> | undefined {
  return reference?.steps;
}

/**
 * Attach Vertex protojson interchange fields to one {@link EvalRepetition}.
 *
 * When no trajectory exists (adapter error), sets `failure: 1` and skips
 * protojson payloads. Trajectory instances and harness metrics are only
 * computed when the suite defines a non-empty reference trajectory.
 *
 * @param repetition - Base repetition from the runner (trajectory, assertions, grades).
 * @param options.prompt - Case prompt for EvaluationInstance.
 * @param options.reference - Suite reference trajectory config, if any.
 */
export function enrichRepetitionWithProtojson(
  repetition: EvalRepetition,
  options: {
    prompt?: string;
    reference?: ReferenceTrajectoryConfig;
  } = {},
): EvalRepetition {
  if (!repetition.trajectory) {
    return {
      ...repetition,
      failure: 1,
    };
  }

  const predicted = repetition.trajectory.toolCalls;
  const referenceStepsList = referenceSteps(options.reference);
  const referenceToolNameMode = options.reference?.tool_name_mode ?? "harness";

  const enriched: EvalRepetition = {
    ...repetition,
    evaluationInstance: toEvaluationInstance({
      prompt: options.prompt,
      response: repetition.trajectory.finalResponse,
    }),
    // Vertex EvaluateInstances expects seconds; harness stores milliseconds.
    latencySeconds: repetition.trajectory.usage.durationMs / 1000,
    failure: repetition.trajectory.success ? 0 : 1,
  };

  if (referenceStepsList?.length) {
    enriched.trajectoryInstances = toTrajectoryInstances({
      predicted,
      reference: referenceStepsList,
      referenceToolNameMode,
    });
    enriched.harnessMetrics = toHarnessMetrics(predicted, referenceStepsList, {
      referenceToolNameMode,
    });
  }

  return enriched;
}

/**
 * Return predicted tool calls from a repetition, or an empty array.
 *
 * Convenience for metrics and tests that need harness-shaped tool calls
 * without null-checking trajectory.
 */
export function predictedToolCalls(repetition: EvalRepetition): ToolCall[] {
  return repetition.trajectory?.toolCalls ?? [];
}
