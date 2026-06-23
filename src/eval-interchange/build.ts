/**
 * Build interchange output from internal {@link TrajectoryView} data.
 */

import type {
  AgentTrace,
  InterchangeToolCall,
  TabularToolCall,
} from "../types/eval-interchange";
import type { ToolCall, TrajectoryView } from "../types/trajectory";

const DEFAULT_AGENT_ID = "agent";

export function serializeToolInput(args: unknown): string {
  return JSON.stringify(args ?? {});
}

export function parseToolInput(toolInput: string): unknown {
  try {
    return JSON.parse(toolInput) as unknown;
  } catch {
    return toolInput;
  }
}

export function toolCallToInterchange(toolCall: ToolCall): InterchangeToolCall {
  return {
    tool_name: toolCall.name,
    tool_input: serializeToolInput(toolCall.args),
  };
}

export function toolCallToTabular(toolCall: ToolCall): TabularToolCall {
  return {
    tool_name: toolCall.name,
    tool_input: toolCall.args ?? {},
  };
}

export function interchangeToTabular(
  toolCall: InterchangeToolCall,
): TabularToolCall {
  return {
    tool_name: toolCall.tool_name,
    tool_input: parseToolInput(toolCall.tool_input),
  };
}

export function tabularToInterchange(
  toolCall: TabularToolCall,
): InterchangeToolCall {
  return {
    tool_name: toolCall.tool_name,
    tool_input: serializeToolInput(toolCall.tool_input),
  };
}

export function predictedTrajectoryFromView(
  view: TrajectoryView,
): InterchangeToolCall[] {
  return view.toolCalls.map(toolCallToInterchange);
}

export function buildAgentTrace(
  view: TrajectoryView,
  agentId: string = DEFAULT_AGENT_ID,
): AgentTrace {
  const agents: AgentTrace["agents"] = {
    [agentId]: {
      agent_id: agentId,
      agent_type: "assistant",
      description: view.meta.model,
      tools: view.meta.availableTools.map((name) => ({ name })),
    },
  };

  const activeTools = view.meta.availableTools.map((name) => ({ name }));

  const turns = view.turns.map((turn) => {
    const events: AgentTrace["turns"][number]["events"] = [];

    if (turn.text) {
      events.push({
        author: agentId,
        content: { parts: [{ text: turn.text }] },
        active_tools: activeTools,
      });
    }

    for (const toolCall of turn.toolCalls) {
      events.push({
        author: agentId,
        content: {
          parts: [
            {
              function_call: {
                name: toolCall.name,
                args: toolCall.args ?? {},
              },
            },
          ],
        },
        active_tools: activeTools,
      });

      if (toolCall.result !== null && toolCall.result !== undefined) {
        events.push({
          author: agentId,
          content: {
            parts: [
              {
                function_response: {
                  name: toolCall.name,
                  response: toolCall.result,
                },
              },
            ],
          },
          active_tools: activeTools,
        });
      }
    }

    return {
      turn_index: turn.turnIndex,
      events,
    };
  });

  return { agents, turns };
}

export function latencyInSeconds(view: TrajectoryView): number {
  return view.usage.durationMs / 1000;
}

export function failureFlag(view: TrajectoryView): 0 | 1 {
  return view.success ? 0 : 1;
}
