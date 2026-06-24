import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { DEFAULT_PIPELINE_OUTPUTS } from "../../src/config/pipeline-schema";
import {
  parsePipelineSteps,
  resolveGradingArtifactFromSuite,
  resolvePipelineInputs,
  suiteDirectoryFromPath,
} from "../../src/pipeline/resolve-inputs";

describe("resolvePipelineInputs", () => {
  const tmpRoot = join(import.meta.dirname, "../.tmp-pipeline-resolve");
  const suiteDir = join(tmpRoot, "suite");
  const suitePath = join(suiteDir, "suite.yaml");

  beforeEach(async () => {
    await mkdir(suiteDir, { recursive: true });
  });

  afterEach(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("chains run.output to grade.input", async () => {
    const pipeline = {
      run: { output: join(suiteDir, "report.json") },
      grade: { output: join(suiteDir, "grading.json") },
    };
    const resolved = await resolvePipelineInputs({
      suitePath,
      suiteDir,
      pipeline,
      steps: ["grade"],
      executed: { run: { output: join(suiteDir, "report.json") } },
    });
    expect(resolved.grade?.input).toBe(join(suiteDir, "report.json"));
  });

  it("uses explicit envelope.grading for external file", async () => {
    const externalGrading = join(tmpRoot, "external-grading.json");
    await writeFile(join(suiteDir, "report.json"), "{}", "utf8");
    const pipeline = {
      envelope: {
        report: join(suiteDir, "report.json"),
        grading: externalGrading,
        output: join(suiteDir, "envelope.json"),
        projection: "envelope" as const,
      },
    };
    const resolved = await resolvePipelineInputs({
      suitePath,
      suiteDir,
      pipeline,
      steps: ["envelope"],
    });
    expect(resolved.envelope?.grading).toBe(externalGrading);
  });

  it("falls back to default grade output on disk for envelope-only step", async () => {
    await writeFile(join(suiteDir, "report.json"), "{}", "utf8");
    await writeFile(join(suiteDir, DEFAULT_PIPELINE_OUTPUTS.grade), "{}", "utf8");
    const pipeline = {
      run: { output: join(suiteDir, DEFAULT_PIPELINE_OUTPUTS.run) },
      grade: { output: join(suiteDir, DEFAULT_PIPELINE_OUTPUTS.grade) },
      envelope: {
        output: join(suiteDir, DEFAULT_PIPELINE_OUTPUTS.envelope),
        projection: "envelope" as const,
      },
    };
    const resolved = await resolvePipelineInputs({
      suitePath,
      suiteDir,
      pipeline,
      steps: ["envelope"],
    });
    expect(resolved.envelope?.report).toBe(
      join(suiteDir, DEFAULT_PIPELINE_OUTPUTS.run),
    );
    expect(resolved.envelope?.grading).toBe(
      join(suiteDir, DEFAULT_PIPELINE_OUTPUTS.grade),
    );
  });

  it("CLI override beats YAML explicit paths", async () => {
    await writeFile(join(suiteDir, "report.json"), "{}", "utf8");
    const pipeline = {
      envelope: {
        report: join(suiteDir, "report.json"),
        output: join(suiteDir, "envelope.json"),
        projection: "envelope" as const,
      },
    };
    const overrideReport = join(tmpRoot, "override-report.json");
    await writeFile(overrideReport, "{}", "utf8");
    const resolved = await resolvePipelineInputs({
      suitePath,
      suiteDir,
      pipeline,
      steps: ["envelope"],
      overrides: { envelope: { report: overrideReport } },
    });
    expect(resolved.envelope?.report).toBe(overrideReport);
  });

  it("suiteDirectoryFromPath returns parent of suite.yaml", () => {
    expect(suiteDirectoryFromPath("/tmp/eval/suite.yaml")).toBe("/tmp/eval");
  });

  it("resolveGradingArtifactFromSuite finds default grade output on disk", async () => {
    await writeFile(join(suiteDir, DEFAULT_PIPELINE_OUTPUTS.grade), "{}", "utf8");
    await writeFile(
      join(suiteDir, "suite.yaml"),
      [
        "adapter: claude-code",
        "matrix:",
        "  - label: default",
        "    config: {}",
        "cases:",
        "  - id: t1",
        "    prompt: hello",
        "    assertions:",
        "      - called: Bash",
        "pipeline:",
        "  grade:",
        "    output: grading.json",
      ].join("\n"),
      "utf8",
    );

    const resolved = await resolveGradingArtifactFromSuite(suitePath);
    expect(resolved).toBe(join(suiteDir, DEFAULT_PIPELINE_OUTPUTS.grade));
  });
});

describe("parsePipelineSteps", () => {
  it("rejects unknown step names", () => {
    const pipeline = { run: { output: "r.json" } };
    expect(() => parsePipelineSteps(pipeline, "run,bogus")).toThrow(
      /unknown pipeline step "bogus"/,
    );
  });

  it("rejects step not configured in pipeline", () => {
    const pipeline = { run: { output: "r.json" } };
    expect(() => parsePipelineSteps(pipeline, "grade")).toThrow(
      /not configured in suite.yaml/,
    );
  });

  it("returns all configured steps when stepsArg is undefined", () => {
    const pipeline = {
      run: { output: "r.json" },
      grade: { output: "g.json" },
    };
    expect(parsePipelineSteps(pipeline, undefined)).toEqual(["run", "grade"]);
  });

  it("preserves configured step order even when stepsArg differs", () => {
    const pipeline = {
      run: { output: "r.json" },
      grade: { output: "g.json" },
      envelope: { output: "e.json", projection: "envelope" as const },
    };
    expect(parsePipelineSteps(pipeline, "envelope,run")).toEqual([
      "run",
      "envelope",
    ]);
  });
});
