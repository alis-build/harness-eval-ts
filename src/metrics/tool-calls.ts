/**
 * Tool-call-level metrics operating on prediction/reference tool-call pairs.
 *
 * Implements Vertex-aligned per-call checks: validity, name match, parameter
 * key match, and full key-value match. Used by trajectory metrics and
 * available for custom eval pipelines.
 *
 * Scores are 0 or 1 per call; {@link computeToolCallMetrics} averages across
 * aligned index pairs (max length of predicted vs reference).
 */

import { parseToolInput, type TrajectoryInput, type WireToolCall } from "./trajectory";
import { serializeToolInput } from "../eval-interchange/normalize";

/** Options for parameter value comparison. */
export interface ToolCallMetricOptions {
  /** When true, compare serialized JSON strictly (reserved for future semantics). */
  useStrictStringMatch?: boolean;
}

/** Aggregated tool-call metric scores (each 0..1). */
export interface ToolCallMetrics {
  tool_call_valid: number;
  tool_name_match: number;
  tool_parameter_key_match: number;
  tool_parameter_kv_match: number;
}

type ToolCallInput = TrajectoryInput[number];

/** Normalize harness or wire tool call to canonical wire shape for comparison. */
function normalizeToolCall(toolCall: ToolCallInput): WireToolCall {
  if (typeof toolCall.tool_input === "string") {
    return {
      tool_name: toolCall.tool_name,
      tool_input: toolCall.tool_input,
    };
  }

  return {
    tool_name: toolCall.tool_name,
    tool_input: serializeToolInput(toolCall.tool_input),
  };
}

/** Parse tool_input JSON to an object map, or null when not a plain object. */
function parsedArgs(toolCall: WireToolCall): Record<string, unknown> | null {
  const parsed = parseToolInput(toolCall.tool_input);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  return parsed as Record<string, unknown>;
}

/**
 * Whether a predicted tool call is well-formed (non-empty name, parseable JSON input).
 *
 * @returns 1 when valid, 0 otherwise.
 */
export function toolCallValid(toolCall: ToolCallInput): number {
  const normalized = normalizeToolCall(toolCall);
  if (!normalized.tool_name.trim()) return 0;

  try {
    JSON.parse(normalized.tool_input);
    return 1;
  } catch {
    return 0;
  }
}

/**
 * Whether predicted and reference tool names match exactly.
 *
 * @returns 1 on match, 0 otherwise.
 */
export function toolNameMatch(
  predicted: ToolCallInput,
  reference: ToolCallInput,
): number {
  const predictedNorm = normalizeToolCall(predicted);
  const referenceNorm = normalizeToolCall(reference);
  return predictedNorm.tool_name === referenceNorm.tool_name ? 1 : 0;
}

/**
 * Whether parameter key sets match (same keys, same order after sort).
 *
 * Requires matching tool names first. Returns 0 when args are not objects.
 */
export function toolParameterKeyMatch(
  predicted: ToolCallInput,
  reference: ToolCallInput,
): number {
  if (toolNameMatch(predicted, reference) === 0) return 0;

  const predictedArgs = parsedArgs(normalizeToolCall(predicted));
  const referenceArgs = parsedArgs(normalizeToolCall(reference));
  if (predictedArgs === null || referenceArgs === null) return 0;

  const predictedKeys = Object.keys(predictedArgs).sort();
  const referenceKeys = Object.keys(referenceArgs).sort();
  if (predictedKeys.length !== referenceKeys.length) return 0;

  return predictedKeys.every((key, index) => key === referenceKeys[index])
    ? 1
    : 0;
}

/** Deep equality via JSON serialization (handles nested objects in args). */
function valuesEqual(
  left: unknown,
  right: unknown,
  useStrictStringMatch: boolean,
): boolean {
  if (useStrictStringMatch) {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Whether all reference parameter key-value pairs match in the predicted call.
 *
 * Requires {@link toolParameterKeyMatch} first. Only keys present in reference
 * are checked (predicted may have extra keys).
 */
export function toolParameterKvMatch(
  predicted: ToolCallInput,
  reference: ToolCallInput,
  options: ToolCallMetricOptions = {},
): number {
  if (toolParameterKeyMatch(predicted, reference) === 0) return 0;

  const predictedArgs = parsedArgs(normalizeToolCall(predicted))!;
  const referenceArgs = parsedArgs(normalizeToolCall(reference))!;

  for (const key of Object.keys(referenceArgs)) {
    if (
      !valuesEqual(
        predictedArgs[key],
        referenceArgs[key],
        options.useStrictStringMatch ?? false,
      )
    ) {
      return 0;
    }
  }

  return 1;
}

/**
 * Average tool-call metrics across index-aligned predicted/reference pairs.
 *
 * Denominator is `max(predicted.length, reference.length, 1)`. Missing
 * predicted calls at an index are skipped for pair metrics; validity still
 * counts when a predicted call exists.
 */
export function computeToolCallMetrics(
  predicted: ToolCallInput[],
  reference: ToolCallInput[],
  options: ToolCallMetricOptions = {},
): ToolCallMetrics {
  const pairCount = Math.max(predicted.length, reference.length, 1);
  let valid = 0;
  let nameMatch = 0;
  let keyMatch = 0;
  let kvMatch = 0;

  for (let index = 0; index < pairCount; index += 1) {
    const predictedCall = predicted[index];
    const referenceCall = reference[index];
    if (!predictedCall) continue;

    valid += toolCallValid(predictedCall);
    if (!referenceCall) continue;

    nameMatch += toolNameMatch(predictedCall, referenceCall);
    keyMatch += toolParameterKeyMatch(predictedCall, referenceCall);
    kvMatch += toolParameterKvMatch(predictedCall, referenceCall, options);
  }

  return {
    tool_call_valid: valid / pairCount,
    tool_name_match: nameMatch / pairCount,
    tool_parameter_key_match: keyMatch / pairCount,
    tool_parameter_kv_match: kvMatch / pairCount,
  };
}
