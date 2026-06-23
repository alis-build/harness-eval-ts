/**
 * Build Vertex EvaluationInstance protojson wire objects.
 *
 * Maps harness prompt/response text into the InstanceData wrapper shape
 * expected by EvaluateInstances for text-based metrics.
 */

import type { EvaluationInstanceJson } from "../../types/eval-interchange";

/**
 * Build an EvaluationInstance protojson object from harness strings.
 *
 * Omitted fields are excluded from the output object rather than set to
 * empty wrappers — protojson omits unset optional fields.
 *
 * @param options.prompt - Case prompt sent to the agent.
 * @param options.response - Final agent response from the trajectory.
 * @param options.reference - Optional reference answer text (rare in harness eval).
 */
export function toEvaluationInstance(options: {
  prompt?: string;
  response?: string;
  reference?: string;
}): EvaluationInstanceJson {
  const instance: EvaluationInstanceJson = {};

  if (options.prompt !== undefined) {
    instance.prompt = { text: options.prompt };
  }
  if (options.response !== undefined) {
    instance.response = { text: options.response };
  }
  if (options.reference !== undefined) {
    instance.reference = { text: options.reference };
  }

  return instance;
}
