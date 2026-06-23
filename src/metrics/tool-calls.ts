/**
 * Tool-call-level metrics operating on prediction/reference tool-call pairs.
 *
 * Metric definitions align with upstream evaluation service tool-call specs.
 */

import type {
  InterchangeToolCall,
  TabularToolCall,
  ToolCallMetrics,
} from "../types/eval-interchange";
import { parseToolInput, serializeToolInput } from "../eval-interchange/build";

export interface ToolCallMetricOptions {
  useStrictStringMatch?: boolean;
}

type ToolCallInput =
  | InterchangeToolCall
  | TabularToolCall
  | { tool_name: string; tool_input: unknown };

function normalizeToolCall(toolCall: ToolCallInput): InterchangeToolCall {
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

function parsedArgs(toolCall: InterchangeToolCall): Record<string, unknown> | null {
  const parsed = parseToolInput(toolCall.tool_input);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  return parsed as Record<string, unknown>;
}

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

export function toolNameMatch(
  predicted: ToolCallInput,
  reference: ToolCallInput,
): number {
  const predictedNorm = normalizeToolCall(predicted);
  const referenceNorm = normalizeToolCall(reference);
  return predictedNorm.tool_name === referenceNorm.tool_name ? 1 : 0;
}

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
