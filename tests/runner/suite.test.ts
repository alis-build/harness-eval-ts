import { describe, expect, it } from "vitest";

import { runSuite } from "../../src/runner/suite";
import {
  createFailingAdapter,
  createMockAdapter,
  createQueueAdapter,
} from "../helpers/mock-adapter";
import { makeToolCall, makeView } from "../helpers/factory";

describe("runSuite", () => {
  const baseSuite = {
    cases: [
      {
        id: "case-a",
        prompt: "hello",
        assertions: [
          { assertion: { type: "called" as const, tool: "Bash" }, threshold: 1 },
        ],
        repetitions: 2,
      },
    ],
    matrix: [{ label: "default", config: {} }],
  };

  it("aggregates pass rates with mock adapter", async () => {
    const passView = makeView({ toolCalls: [makeToolCall({ name: "Bash" })] });
    const failView = makeView({ toolCalls: [] });
    const report = await runSuite(baseSuite, {
      adapter: createQueueAdapter([passView, failView]),
      maxConcurrent: 2,
    });
    const cell = report.cells[0];
    expect(cell.assertionStats[0].passedCount).toBe(1);
    expect(cell.assertionStats[0].evaluatedCount).toBe(2);
    expect(cell.passed).toBe(false);
  });

  it("tracks adapter errors separately", async () => {
    const report = await runSuite(
      { ...baseSuite, cases: [{ ...baseSuite.cases[0], repetitions: 1 }] },
      { adapter: createFailingAdapter() },
    );
    expect(report.cells[0].adapterErrors).toBe(1);
    expect(report.cells[0].assertionStats[0].evaluatedCount).toBe(0);
    expect(report.cells[0].passed).toBe(false);
  });

  it("passes when all reps pass", async () => {
    const view = makeView({ toolCalls: [makeToolCall({ name: "Bash" })] });
    const report = await runSuite(baseSuite, {
      adapter: createMockAdapter(view),
    });
    expect(report.cells[0].passed).toBe(true);
  });
});
