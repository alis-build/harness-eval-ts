import { describe, expect, it } from "vitest";

import {
  PipelineConfigSchema,
  PipelineEnvelopeStepSchema,
} from "../../src/config/pipeline-schema";
import {
  SuiteFileDirectorySchema,
  SuiteFileSingleSchema,
} from "../../src/config/suite-file-schema";

describe("PipelineConfigSchema", () => {
  it("accepts run, grade, and envelope steps", () => {
    const result = PipelineConfigSchema.safeParse({
      run: { output: "report.json", maxConcurrent: 2 },
      grade: { input: "report.json", output: "grading.json" },
      envelope: {
        report: "report.json",
        grading: "grading.json",
        output: "envelope.json",
        projection: "trajectory",
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial pipeline with only run", () => {
    const result = PipelineConfigSchema.safeParse({
      run: { output: "out/report.json" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid envelope projection", () => {
    const result = PipelineEnvelopeStepSchema.safeParse({
      output: "envelope.json",
      projection: "invalid",
    });
    expect(result.success).toBe(false);
  });
});

describe("SuiteFileSchema", () => {
  it("accepts single-file suite with judge and pipeline", () => {
    const result = SuiteFileSingleSchema.safeParse({
      adapter: "claude-code",
      matrix: [{ label: "sonnet", config: {} }],
      cases: [
        {
          id: "smoke",
          prompt: "hello",
          assertions: [{ called: "Read" }],
        },
      ],
      judge: {
        adapter: "claude-code",
        model: "claude-sonnet-4-6",
      },
      pipeline: {
        run: { output: "report.json" },
        grade: { output: "grading.json" },
        envelope: { output: "envelope.json" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts directory suite root with judge and pipeline", () => {
    const result = SuiteFileDirectorySchema.safeParse({
      adapter: "codex",
      matrix: [{ label: "gpt", config: {} }],
      judge: { adapter: "codex", model: "gpt-5.4" },
      pipeline: { run: {} },
    });
    expect(result.success).toBe(true);
  });

  it("accepts legacy suite without judge or pipeline", () => {
    const result = SuiteFileSingleSchema.safeParse({
      matrix: [{ label: "default", config: {} }],
      cases: [
        {
          id: "c1",
          prompt: "p",
          assertions: [{ called: "Read" }],
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});
