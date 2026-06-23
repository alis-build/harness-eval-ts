import { describe, expect, it } from "vitest";

import type { ProgressEvent } from "../../src/runner/types";
import {
  createRunProgressHandler,
  formatCellSummary,
  formatDuration,
  resolveProgressMode,
} from "../../src/cli/progress";
import type { CellReport } from "../../src/runner/types";

function captureProgress(mode: "default" | "quiet" | "verbose" | "json", events: ProgressEvent[]) {
  const chunks: string[] = [];
  const handler = createRunProgressHandler({
    mode,
    maxConcurrent: 2,
    color: false,
    stream: {
      write: (chunk: string | Uint8Array) => {
        chunks.push(String(chunk));
      },
    } as import("node:stream").Writable,
  });
  for (const event of events) {
    handler(event);
  }
  return chunks.join("");
}

describe("resolveProgressMode", () => {
  it("defaults to default", () => {
    expect(resolveProgressMode({})).toBe("default");
  });

  it("honors --progress flag", () => {
    expect(resolveProgressMode({ progress: "json" })).toBe("json");
  });

  it("honors --quiet and --verbose flags", () => {
    expect(resolveProgressMode({ quiet: true })).toBe("quiet");
    expect(resolveProgressMode({ verbose: true })).toBe("verbose");
  });
});

describe("formatDuration", () => {
  it("formats ms, seconds, and minutes", () => {
    expect(formatDuration(500)).toBe("500ms");
    expect(formatDuration(2500)).toBe("2.5s");
    expect(formatDuration(125000)).toBe("2m 5s");
  });
});

describe("createRunProgressHandler", () => {
  const cellReport: CellReport = {
    caseId: "case-a",
    cell: { label: "sonnet", config: {} },
    repetitions: [],
    assertionStats: [
      {
        description: "called Bash",
        threshold: 1,
        passedCount: 2,
        evaluatedCount: 2,
        passRate: 1,
        meetsThreshold: true,
      },
    ],
    adapterErrors: 0,
    passed: true,
  };

  it("prints line per rep in default mode", () => {
    const out = captureProgress("default", [
      { kind: "suite-start", totalReps: 2 },
      {
        kind: "rep-complete",
        caseId: "case-a",
        cellLabel: "sonnet",
        repIndex: 0,
        ok: true,
        durationMs: 1500,
      },
      {
        kind: "rep-complete",
        caseId: "case-a",
        cellLabel: "sonnet",
        repIndex: 1,
        ok: false,
        durationMs: 800,
        errorMessage: "timeout",
      },
      { kind: "cell-complete", report: cellReport },
      {
        kind: "suite-complete",
        report: {
          startedAt: "2026-01-01T00:00:00.000Z",
          durationMs: 5000,
          cells: [cellReport],
        },
      },
    ]);

    expect(out).toContain("Running 2 repetitions");
    expect(out).toContain("[1/2] case-a @ sonnet #0  ok  1.5s");
    expect(out).toContain("[2/2] case-a @ sonnet #1  FAIL");
    expect(out).toContain("timeout");
    expect(out).toContain("✓ case-a @ sonnet  PASS");
    expect(out).toContain("Finished in 5.0s");
  });

  it("prints colored dots in quiet mode when color enabled", () => {
    const out = captureProgress("quiet", [
      { kind: "suite-start", totalReps: 2 },
      {
        kind: "rep-complete",
        caseId: "case-a",
        cellLabel: "sonnet",
        repIndex: 0,
        ok: true,
        durationMs: 100,
      },
      {
        kind: "rep-complete",
        caseId: "case-a",
        cellLabel: "sonnet",
        repIndex: 1,
        ok: false,
        durationMs: 100,
      },
      {
        kind: "suite-complete",
        report: {
          startedAt: "2026-01-01T00:00:00.000Z",
          durationMs: 200,
          cells: [cellReport],
        },
      },
    ]);

    expect(out).toBe(".x\n");
  });

  it("emits json lines in json mode", () => {
    const out = captureProgress("json", [
      { kind: "suite-start", totalReps: 1 },
      {
        kind: "rep-complete",
        caseId: "case-a",
        cellLabel: "sonnet",
        repIndex: 0,
        ok: true,
        durationMs: 100,
      },
    ]);

    const lines = out.trim().split("\n");
    expect(JSON.parse(lines[0])).toMatchObject({ kind: "suite-start" });
    expect(JSON.parse(lines[1])).toMatchObject({
      kind: "rep-complete",
      index: 1,
      ok: true,
    });
  });
});

describe("formatCellSummary", () => {
  it("includes assertion stats", () => {
    const line = formatCellSummary(
      {
        caseId: "x",
        cell: { label: "y", config: {} },
        repetitions: [],
        assertionStats: [
          {
            description: "called Tool",
            threshold: 1,
            passedCount: 3,
            evaluatedCount: 5,
            passRate: 0.6,
            meetsThreshold: false,
          },
        ],
        adapterErrors: 1,
        passed: false,
      },
      false,
    );
    expect(line).toContain("✗");
    expect(line).toContain("FAIL");
    expect(line).toContain("called Tool 3/5 (60%)");
    expect(line).toContain("1 adapter errors");
  });
});
