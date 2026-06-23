/**
 * Normalize harness and suite data into Vertex protojson wire shapes.
 *
 * Accepts both {@link ToolCall} (harness runtime) and suite YAML reference
 * step shapes, producing consistent {@link ProtojsonTrajectory} objects for
 * EvaluateInstances and envelope export.
 */

import type { ToolCall } from "../types/trajectory";
import type { ProtojsonTrajectory, ReferenceToolNameMode } from "../types/eval-interchange";

/** Input accepted by trajectory normalizers — harness or suite reference steps. */
export type TrajectoryInput =
  | ToolCall[]
  | Array<{ tool_name: string; tool_input: unknown | string }>;

/**
 * Serialize tool arguments to the Vertex wire string format.
 *
 * Already-string inputs pass through unchanged (e.g. pre-serialized reference
 * steps). Objects and nullish values become JSON strings; empty input becomes `{}`.
 *
 * @param args - Tool arguments from harness or suite YAML.
 * @returns JSON string suitable for {@link ProtojsonToolCall.toolInput}.
 */
export function serializeToolInput(args: unknown): string {
  if (typeof args === "string") return args;
  return JSON.stringify(args ?? {});
}

/**
 * Normalize a tool name according to suite reference configuration.
 *
 * In `"bare"` mode, strips the MCP namespace prefix (`mcp__api__foo` → `foo`)
 * so reference trajectories authored with bare names match harness tool names.
 *
 * @param toolName - Raw tool name from harness or suite.
 * @param mode - `"harness"` preserves the name; `"bare"` strips after last `__`.
 */
export function normalizeReferenceToolName(
  toolName: string,
  mode: ReferenceToolNameMode,
): string {
  if (mode !== "bare") return toolName;

  const separator = toolName.lastIndexOf("__");
  if (separator === -1) return toolName;
  return toolName.slice(separator + 2);
}

/**
 * Convert a harness or suite trajectory into Vertex protojson wire format.
 *
 * `toolNameMode` controls MCP prefix stripping for every tool name in the
 * trajectory. Suite reference steps and predicted harness tool calls use the
 * same mode so comparisons stay consistent across metrics and instances.
 *
 * @param trajectory - Tool calls in harness or YAML reference shape.
 * @param options.toolNameMode - `"harness"` keeps full names; `"bare"` strips after last `__`.
 */
export function toProtojsonTrajectory(
  trajectory: TrajectoryInput,
  options: { toolNameMode?: ReferenceToolNameMode } = {},
): ProtojsonTrajectory {
  const toolNameMode = options.toolNameMode ?? "harness";

  return {
    toolCalls: trajectory.map((toolCall) => {
      const name = "name" in toolCall ? toolCall.name : toolCall.tool_name;
      const args = "args" in toolCall ? toolCall.args : toolCall.tool_input;

      return {
        toolName: normalizeReferenceToolName(name, toolNameMode),
        toolInput: serializeToolInput(args),
      };
    }),
  };
}
