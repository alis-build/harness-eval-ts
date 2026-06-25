import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildEvalRunEnvelope } from "../../src/eval-record/build";
import { evalRunEnvelopeSchema } from "../../src/schemas/eval-run-envelope";
import {
  EVAL_RUN_ENVELOPE_SCHEMA_ID,
  TRAJECTORY_VIEW_SCHEMA_ID,
} from "../../src/schemas/ids";
import { trajectoryViewExportSchema } from "../../src/schemas/trajectory-view";
import {
  EVAL_RUN_SCHEMA_VERSION,
  TRAJECTORY_SCHEMA_VERSION,
} from "../../src/types/eval-record";
import type { SuiteReport } from "../../src/runner/types";
import { makeView } from "../helpers/factory";

const schemasDir = join(import.meta.dirname, "../../schemas");

function makeReport(): SuiteReport {
  return {
    startedAt: "2026-06-23T12:00:00.000Z",
    durationMs: 1000,
    cells: [
      {
        caseId: "list-landing-zones",
        prompt: "Please list my landing zones",
        cell: { label: "sonnet", config: {} },
        repetitions: [
          {
            repetitionIndex: 0,
            adapterResult: {
              view: makeView({ finalResponse: "aibake ACTIVE" }),
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

describe("Zod eval schemas", () => {
  it("accepts envelopes built by buildEvalRunEnvelope", () => {
    const envelope = buildEvalRunEnvelope(makeReport(), {
      runId: "00000000-0000-4000-8000-000000000001",
    });

    expect(evalRunEnvelopeSchema.parse(envelope)).toEqual(envelope);
    expect(envelope.schemaVersion).toBe(EVAL_RUN_SCHEMA_VERSION);
    expect(envelope.cells[0].repetitions[0].evaluationInstance).toBeDefined();
  });

  it("preserves exitCodeDescription in adapter diagnostics through envelope parse", () => {
    const report = makeReport();
    report.cells[0]!.repetitions[0]!.adapterResult!.diagnostics = {
      exitCode: 42,
      exitCodeDescription: "Gemini CLI input error (code 42)",
      signal: null,
      stderr: "invalid prompt",
      parseErrors: [],
      timedOut: false,
      durationMs: 100,
    };

    const envelope = buildEvalRunEnvelope(report, {
      runId: "00000000-0000-4000-8000-000000000003",
    });

    const parsed = evalRunEnvelopeSchema.parse(envelope);
    expect(
      parsed.cells[0]?.repetitions[0]?.diagnostics?.exitCodeDescription,
    ).toBe("Gemini CLI input error (code 42)");
  });

  it("trajectory export schema matches embedded trajectories", () => {
    const envelope = buildEvalRunEnvelope(makeReport(), {
      runId: "00000000-0000-4000-8000-000000000002",
    });

    const trajectory = envelope.cells[0].repetitions[0].trajectory;
    expect(trajectory).toBeDefined();
    expect(trajectoryViewExportSchema.parse(trajectory)).toEqual(trajectory);
    expect(trajectory!.schemaVersion).toBe(TRAJECTORY_SCHEMA_VERSION);
  });
});

describe("published JSON Schema files", () => {
  it("uses GitHub raw URLs as document $id", () => {
    const trajectory = JSON.parse(
      readFileSync(join(schemasDir, "trajectory-view.schema.json"), "utf8"),
    ) as { $id: string };
    const envelope = JSON.parse(
      readFileSync(join(schemasDir, "eval-run-envelope.schema.json"), "utf8"),
    ) as { $id: string };
    const interchange = JSON.parse(
      readFileSync(join(schemasDir, "eval-interchange.schema.json"), "utf8"),
    ) as { $id: string };

    expect(trajectory.$id).toBe(TRAJECTORY_VIEW_SCHEMA_ID);
    expect(envelope.$id).toBe(EVAL_RUN_ENVELOPE_SCHEMA_ID);
    expect(interchange.$id).toContain("eval-interchange.schema.json");
    expect(trajectory.$id).toContain("alis-build/harness-eval-ts");
  });
});
