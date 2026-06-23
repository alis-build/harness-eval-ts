import { describe, expect, it } from "vitest";

import {
  computeTrajectoryMetrics,
  trajectoryAnyOrderMatch,
  trajectoryExactMatch,
  trajectoryInOrderMatch,
  trajectoryPrecision,
  trajectoryRecall,
  trajectorySingleToolUse,
} from "../../src/metrics/trajectory";

const reference = [
  { tool_name: "SearchSkills", tool_input: { query: "deploy" } },
  { tool_name: "Bash", tool_input: { command: "ls" } },
];

describe("trajectory metrics", () => {
  it("scores exact match", () => {
    expect(trajectoryExactMatch(reference, reference)).toBe(1);
    expect(
      trajectoryExactMatch(
        [{ tool_name: "Bash", tool_input: { command: "ls" } }],
        reference,
      ),
    ).toBe(0);
  });

  it("scores in-order match as subsequence", () => {
    expect(
      trajectoryInOrderMatch(
        [
          { tool_name: "SearchSkills", tool_input: { query: "deploy" } },
          { tool_name: "Read", tool_input: {} },
          { tool_name: "Bash", tool_input: { command: "ls" } },
        ],
        reference,
      ),
    ).toBe(1);
  });

  it("scores any-order match with multiset equality", () => {
    expect(
      trajectoryAnyOrderMatch(
        [
          { tool_name: "Bash", tool_input: { command: "ls" } },
          { tool_name: "SearchSkills", tool_input: { query: "deploy" } },
        ],
        reference,
      ),
    ).toBe(1);
  });

  it("computes precision and recall", () => {
    const predicted = [
      { tool_name: "SearchSkills", tool_input: { query: "deploy" } },
      { tool_name: "Read", tool_input: {} },
    ];

    expect(trajectoryPrecision(predicted, reference)).toBe(0.5);
    expect(trajectoryRecall(predicted, reference)).toBe(0.5);
  });

  it("scores single tool use", () => {
    const single = [{ tool_name: "Bash", tool_input: { command: "ls" } }];
    expect(trajectorySingleToolUse(single, single)).toBe(1);
    expect(trajectorySingleToolUse(reference, single)).toBe(0);
  });

  it("returns all metrics together", () => {
    const metrics = computeTrajectoryMetrics(reference, reference);
    expect(metrics.trajectory_exact_match).toBe(1);
    expect(metrics.trajectory_precision).toBe(1);
    expect(metrics.trajectory_recall).toBe(1);
  });
});
