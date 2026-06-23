import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  envelopeCommand,
  parseEnvelopeProjection,
  serializeEnvelopeProjection,
} from "../../src/cli/commands/envelope";
import { buildEvalRunEnvelope } from "../../src/eval-record/build";
import type { SuiteReport } from "../../src/runner/types";
import { makeToolCall, makeView } from "../helpers/factory";

function makeReport(): SuiteReport {
  const toolCall = makeToolCall({
    name: "SearchSkills",
    args: { query: "deploy" },
  });

  return {
    startedAt: "2026-06-23T12:00:00.000Z",
    durationMs: 1000,
    cells: [
      {
        caseId: "list-landing-zones",
        prompt: "Please list my landing zones",
        reference_trajectory: {
          steps: [{ tool_name: "SearchSkills", tool_input: { query: "deploy" } }],
        },
        cell: { label: "sonnet", config: {} },
        repetitions: [
          {
            repetitionIndex: 0,
            adapterResult: {
              view: makeView({
                toolCalls: [toolCall],
                finalResponse: "aibake ACTIVE",
              }),
              diagnostics: {
                exitCode: 0,
                signal: null,
                stderr: "",
                parseErrors: [],
                timedOut: false,
                durationMs: 500,
              },
            },
            error: null,
            assertionResults: [],
            durationMs: 500,
          },
        ],
        assertionStats: [],
        adapterErrors: 0,
        passed: true,
      },
    ],
  };
}

describe("envelope CLI helpers", () => {
  it("parses projection names", () => {
    expect(parseEnvelopeProjection(undefined)).toBe("envelope");
    expect(parseEnvelopeProjection("trajectory")).toBe("trajectory");
    expect(parseEnvelopeProjection("invalid")).toBeUndefined();
  });

  it("serializes projections from an envelope", () => {
    const envelope = buildEvalRunEnvelope(makeReport());
    const trajectory = serializeEnvelopeProjection(envelope, "trajectory");
    const lines = trajectory.trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      caseId: "list-landing-zones",
      prompt: "Please list my landing zones",
      response: "aibake ACTIVE",
    });

    const instanceLines = serializeEnvelopeProjection(envelope, "instances")
      .trim()
      .split("\n");
    expect(instanceLines.length).toBeGreaterThanOrEqual(1);
    expect(JSON.parse(instanceLines[0]!)).toMatchObject({
      messageType: "TrajectoryExactMatchInstance",
      caseId: "list-landing-zones",
      repetitionIndex: 0,
    });
  });
});

describe("envelopeCommand", () => {
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

  afterEach(() => {
    stdout.mockClear();
  });

  it("writes envelope JSON to --output", async () => {
    const dir = await mkdtemp(join(tmpdir(), "harness-eval-envelope-"));
    const reportPath = join(dir, "report.json");
    const outputPath = join(dir, "envelope.json");
    await writeFile(reportPath, JSON.stringify(makeReport()), "utf8");

    const code = await envelopeCommand({
      positional: [reportPath],
      options: { output: outputPath },
    });

    expect(code).toBe(0);
    const envelope = JSON.parse(await readFile(outputPath, "utf8")) as {
      schemaVersion: string;
      cells: Array<{ repetitions: Array<{ evaluationInstance: unknown }> }>;
    };
    expect(envelope.schemaVersion).toBe("1.0");
    expect(envelope.cells[0]?.repetitions[0]?.evaluationInstance).toBeDefined();
  });

  it("returns 2 for invalid projection", async () => {
    const dir = await mkdtemp(join(tmpdir(), "harness-eval-envelope-"));
    const reportPath = join(dir, "report.json");
    await writeFile(reportPath, JSON.stringify(makeReport()), "utf8");

    const code = await envelopeCommand({
      positional: [reportPath],
      options: { projection: "not-a-projection" },
    });

    expect(code).toBe(2);
  });
});
