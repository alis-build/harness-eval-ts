import { readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { describe, expect, it, afterAll } from "vitest";
import { join } from "node:path";

import { loadGradingConfig, loadSuite, loadSuiteDocument } from "../../src/config/loader";

const fixturesDir = join(import.meta.dirname, "../fixtures/suites");
const unifiedDir = join(fixturesDir, "unified");

describe("loadSuiteDocument", () => {
  it("loads legacy suite without judge or pipeline", async () => {
    const doc = await loadSuiteDocument(join(fixturesDir, "valid.yaml"));
    expect(doc.judge).toBeUndefined();
    expect(doc.pipeline).toBeUndefined();
    expect(doc.suite.cases.length).toBeGreaterThan(0);
  });

  it("loads unified suite with inline judge and pipeline", async () => {
    const doc = await loadSuiteDocument(unifiedDir);
    expect(doc.suitePath).toContain("suite.yaml");
    expect(doc.judge?.model).toBe("claude-sonnet-4-6");
    expect(doc.pipeline?.run?.output).toContain("report.json");
    expect(doc.pipeline?.grade?.output).toContain("grading.json");
    expect(doc.pipeline?.envelope?.output).toContain("envelope.json");
  });

  it("loadSuite returns same cases as before for legacy fixture", async () => {
    const legacy = await loadSuite(join(fixturesDir, "valid.yaml"));
    const doc = await loadSuiteDocument(join(fixturesDir, "valid.yaml"));
    expect(doc.suite.cases.map((c) => c.id)).toEqual(
      legacy.cases.map((c) => c.id),
    );
  });

  it("rejects invalid judge block in strict mode", async () => {
    const dir = join(fixturesDir, ".tmp-invalid-judge");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "suite.yaml"),
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
        "judge: not-an-object",
      ].join("\n"),
    );
    await expect(loadSuiteDocument(dir)).rejects.toThrow(/validation failed/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("loadSuite ignores malformed judge block (lenient)", async () => {
    const dir = join(fixturesDir, ".tmp-lenient-judge");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "suite.yaml"),
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
        "judge: not-an-object",
      ].join("\n"),
    );
    const suite = await loadSuite(dir);
    expect(suite.cases[0].id).toBe("t1");
    rmSync(dir, { recursive: true, force: true });
  });

  it("loadSuite ignores malformed pipeline block (lenient)", async () => {
    const dir = join(fixturesDir, ".tmp-lenient-pipeline");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "suite.yaml"),
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
        "  run:",
        "    output: 42",
      ].join("\n"),
    );
    const suite = await loadSuite(dir);
    expect(suite.cases[0].id).toBe("t1");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("loadGradingConfig from unified suite", () => {
  it("extracts judge from suite.yaml", async () => {
    const config = await loadGradingConfig(join(unifiedDir, "suite.yaml"));
    expect(config.judge.adapter).toBe("claude-code");
    expect(config.judge.model).toBe("claude-sonnet-4-6");
  });

  it("loads standalone grading yaml unchanged", async () => {
    const path = join(import.meta.dirname, "../fixtures/grading/valid.yaml");
    const config = await loadGradingConfig(path);
    expect(config.judge.model).toBe("claude-sonnet-4-6");
    void readFileSync(path, "utf8");
  });
});
