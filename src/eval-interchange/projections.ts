/**
 * Envelope projection methods for eval interchange output.
 */

import {
  buildAgentTrace,
  interchangeToTabular,
  latencyInSeconds,
  predictedTrajectoryFromView,
  toolCallToTabular,
} from "./build";
import type {
  AgentTrace,
  EvalDatasetRow,
  InterchangeToolCall,
  ProtoTrajectoryInstance,
  TabularToolCall,
  TrajectoryMetrics,
} from "../types/eval-interchange";
import type {
  EvalCellResult,
  EvalRepetition,
  EvalRunEnvelope,
} from "../types/eval-record";
import { computeTrajectoryMetrics } from "../metrics/trajectory";
import { computeToolCallMetrics } from "../metrics/tool-calls";

function repetitionInterchangeFields(
  repetition: EvalRepetition,
): {
  predicted_trajectory: InterchangeToolCall[];
  agent_trace?: AgentTrace;
  latency_in_seconds?: number;
  failure?: 0 | 1;
} {
  if (!repetition.trajectory) {
    return { predicted_trajectory: [] };
  }

  return {
    predicted_trajectory: repetition.predicted_trajectory ??
      predictedTrajectoryFromView(repetition.trajectory),
    agent_trace: repetition.agent_trace ??
      buildAgentTrace(repetition.trajectory),
    latency_in_seconds: repetition.latency_in_seconds ??
      latencyInSeconds(repetition.trajectory),
    failure: repetition.failure ?? (repetition.trajectory.success ? 0 : 1),
  };
}

function referenceTrajectoryForCell(
  cell: EvalCellResult,
): TabularToolCall[] | undefined {
  return cell.reference_trajectory;
}

export function repetitionToDatasetRow(
  cell: EvalCellResult,
  repetition: EvalRepetition,
): EvalDatasetRow | null {
  const fields = repetitionInterchangeFields(repetition);
  if (!repetition.trajectory) {
    return {
      prompt: cell.prompt,
      response: undefined,
      predicted_trajectory: [],
      reference_trajectory: referenceTrajectoryForCell(cell),
      latency_in_seconds: repetition.durationMs / 1000,
      failure: 1,
      human_ratings: cell.human_ratings,
    };
  }

  return {
    prompt: cell.prompt,
    response: repetition.trajectory.finalResponse,
    predicted_trajectory: fields.predicted_trajectory.map(interchangeToTabular),
    reference_trajectory: referenceTrajectoryForCell(cell),
    latency_in_seconds: fields.latency_in_seconds ?? repetition.durationMs / 1000,
    failure: fields.failure ?? 1,
    human_ratings: cell.human_ratings,
  };
}

export function repetitionToProtoInstance(
  cell: EvalCellResult,
  repetition: EvalRepetition,
): ProtoTrajectoryInstance | null {
  const fields = repetitionInterchangeFields(repetition);
  if (!repetition.trajectory) return null;

  const reference = referenceTrajectoryForCell(cell);
  return {
    prompt: cell.prompt,
    response: repetition.trajectory.finalResponse,
    predicted_trajectory: {
      tool_calls: fields.predicted_trajectory,
    },
    reference_trajectory: reference
      ? {
          tool_calls: reference.map((toolCall) => ({
            tool_name: toolCall.tool_name,
            tool_input:
              typeof toolCall.tool_input === "string"
                ? toolCall.tool_input
                : JSON.stringify(toolCall.tool_input ?? {}),
          })),
        }
      : undefined,
  };
}

export function repetitionToAgentTrace(
  repetition: EvalRepetition,
): AgentTrace | null {
  const fields = repetitionInterchangeFields(repetition);
  return fields.agent_trace ?? null;
}

export function computeRepetitionMetrics(
  repetition: EvalRepetition,
  referenceTrajectory?: TabularToolCall[],
): {
  trajectoryMetrics?: TrajectoryMetrics;
  toolCallMetrics?: ReturnType<typeof computeToolCallMetrics>;
} {
  if (!referenceTrajectory?.length) {
    return {};
  }

  const predicted = repetition.predicted_trajectory ??
    (repetition.trajectory
      ? predictedTrajectoryFromView(repetition.trajectory)
      : []);

  const predictedTabular = predicted.map(interchangeToTabular);

  return {
    trajectoryMetrics: computeTrajectoryMetrics(
      predictedTabular,
      referenceTrajectory,
    ),
    toolCallMetrics: computeToolCallMetrics(
      predictedTabular,
      referenceTrajectory,
    ),
  };
}

export function toTrajectory(envelope: EvalRunEnvelope): EvalDatasetRow[] {
  const rows: EvalDatasetRow[] = [];
  for (const cell of envelope.cells) {
    for (const repetition of cell.repetitions) {
      const row = repetitionToDatasetRow(cell, repetition);
      if (row) rows.push(row);
    }
  }
  return rows;
}

export function toProtoInstances(
  envelope: EvalRunEnvelope,
): ProtoTrajectoryInstance[] {
  const instances: ProtoTrajectoryInstance[] = [];
  for (const cell of envelope.cells) {
    for (const repetition of cell.repetitions) {
      const instance = repetitionToProtoInstance(cell, repetition);
      if (instance) instances.push(instance);
    }
  }
  return instances;
}

export function toAgentTrace(envelope: EvalRunEnvelope): AgentTrace[] {
  const traces: AgentTrace[] = [];
  for (const cell of envelope.cells) {
    for (const repetition of cell.repetitions) {
      const trace = repetitionToAgentTrace(repetition);
      if (trace) traces.push(trace);
    }
  }
  return traces;
}

export function enrichRepetitionWithInterchange(
  repetition: EvalRepetition,
  referenceTrajectory?: TabularToolCall[],
): EvalRepetition {
  if (!repetition.trajectory) {
    return repetition;
  }

  const predicted_trajectory = predictedTrajectoryFromView(repetition.trajectory);
  const agent_trace = buildAgentTrace(repetition.trajectory);
  const latency_in_seconds = latencyInSeconds(repetition.trajectory);
  const failure = repetition.trajectory.success ? 0 : 1;

  const metrics = computeRepetitionMetrics(
    {
      ...repetition,
      predicted_trajectory,
      agent_trace,
      latency_in_seconds,
      failure,
    },
    referenceTrajectory,
  );

  return {
    ...repetition,
    predicted_trajectory,
    agent_trace,
    latency_in_seconds,
    failure,
    trajectoryMetrics: metrics.trajectoryMetrics,
    toolCallMetrics: metrics.toolCallMetrics,
  };
}
