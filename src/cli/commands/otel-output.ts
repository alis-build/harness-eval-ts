/**
 * Write OTLP JSON artifacts from a suite report.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { trajectoryToOtlp } from "../../otel/emitter";
import type { SuiteReport, TestSuite } from "../../runner/types";

/** Sanitize case/cell labels for use in OTLP artifact filenames. */
function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

/**
 * Write one OTLP JSON file per successful repetition.
 *
 * Files: `{caseId}__{cellLabel}__rep{N}.otlp.json`
 */
export async function writeOtelArtifacts(
  suite: TestSuite,
  report: SuiteReport,
  outputDir: string,
): Promise<number> {
  await mkdir(outputDir, { recursive: true });

  let written = 0;
  for (const cellReport of report.cells) {
    const testCase = suite.cases.find((c) => c.id === cellReport.caseId);
    if (!testCase) continue;

    for (const rep of cellReport.repetitions) {
      if (!rep.adapterResult) continue;

      const otlp = trajectoryToOtlp(rep.adapterResult.view, {
        prompt: testCase.prompt,
      });

      const filename = `${safeFilePart(cellReport.caseId)}__${safeFilePart(
        cellReport.cell.label,
      )}__rep${rep.repetitionIndex}.otlp.json`;

      await writeFile(
        join(outputDir, filename),
        JSON.stringify(otlp, null, 2),
        "utf8",
      );
      written++;
    }
  }

  return written;
}
