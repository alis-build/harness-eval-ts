/**
 * `harness-eval envelope` — build EvalRunEnvelope and interchange projections.
 *
 * Reads a suite run report (and optional grading JSON), builds a versioned
 * {@link EvalRunEnvelope}, and serializes one of three projections:
 *
 *   - `envelope` — full nested JSON document (default)
 *   - `trajectory` — JSONL of {@link EvalDatasetRow} per repetition
 *   - `instances` — JSONL of {@link InstancesJsonlRow} for Vertex batch upload
 *
 * Exit code 0 when behavioral pass, 1 when any cell failed assertions.
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildEvalRunEnvelopeFromFiles } from "../../eval-record/build";
import {
  toInstancesJsonl,
  toTrajectory,
} from "../../eval-interchange/projections";
import { resolveGradingArtifactFromSuite } from "../../pipeline/resolve-inputs";
import type { EvalRunEnvelope } from "../../types/eval-record";
import { getOption, hasOption, type ParsedArgs } from "../args";

/** Supported `--projection` values for envelope output. */
export type EnvelopeProjection =
  | "envelope"
  | "trajectory"
  | "instances";

const PROJECTIONS = new Set<EnvelopeProjection>([
  "envelope",
  "trajectory",
  "instances",
]);

/**
 * Parse and validate `--projection` CLI flag.
 *
 * @returns `"envelope"` when omitted; `undefined` when value is invalid.
 */
export function parseEnvelopeProjection(
  value: string | undefined,
): EnvelopeProjection | undefined {
  if (value === undefined) return "envelope";
  if (PROJECTIONS.has(value as EnvelopeProjection)) {
    return value as EnvelopeProjection;
  }
  return undefined;
}

/**
 * Serialize an envelope to stdout/file string for the chosen projection.
 *
 * Trajectory and instances projections emit NDJSON (one JSON object per line).
 */
export function serializeEnvelopeProjection(
  envelope: EvalRunEnvelope,
  projection: EnvelopeProjection,
): string {
  switch (projection) {
    case "trajectory":
      return `${toTrajectory(envelope).map((row) => JSON.stringify(row)).join("\n")}\n`;
    case "instances":
      return `${toInstancesJsonl(envelope).map((row) => JSON.stringify(row)).join("\n")}\n`;
    case "envelope":
    default:
      return `${JSON.stringify(envelope, null, 2)}\n`;
  }
}

/** Read harness-eval package version for envelope harness.frameworkVersion. */
async function readFrameworkVersion(): Promise<string | undefined> {
  try {
    const packagePath = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../package.json",
    );
    const text = await readFile(packagePath, "utf8");
    const pkg = JSON.parse(text) as { version?: string };
    return pkg.version;
  } catch {
    return undefined;
  }
}

/**
 * CLI entry point for the `envelope` subcommand.
 *
 * @returns Process exit code: 0 on behavioral pass, 1 on failure, 2 on usage/error.
 */
export async function envelopeCommand(args: ParsedArgs): Promise<number> {
  const reportPath = args.positional[0];
  if (!reportPath) {
    console.error(
      "usage: harness-eval envelope <report.json> [--output path] [--grading path] [--suite path] [--projection envelope|trajectory|instances] [--include-raw-stream-events] [--no-transcript]",
    );
    return 2;
  }

  const outputPath = getOption(args.options, "output");
  const suitePath = getOption(args.options, "suite");
  let gradingPath = getOption(args.options, "grading");
  if (!gradingPath && suitePath) {
    gradingPath = await resolveGradingArtifactFromSuite(suitePath);
  }
  const projection = parseEnvelopeProjection(
    getOption(args.options, "projection"),
  );

  if (!projection) {
    console.error(
      "invalid --projection; expected envelope, trajectory, or instances",
    );
    return 2;
  }

  let envelope: EvalRunEnvelope;
  try {
    const frameworkVersion = await readFrameworkVersion();
    envelope = await buildEvalRunEnvelopeFromFiles(reportPath, {
      gradingPath,
      suitePath,
      includeTranscript: !hasOption(args.options, "no-transcript"),
      includeRawStreamEvents: hasOption(args.options, "include-raw-stream-events"),
      harness: { frameworkVersion },
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }

  const serialized = serializeEnvelopeProjection(envelope, projection);

  if (outputPath) {
    await writeFile(outputPath, serialized, "utf8");
  } else {
    process.stdout.write(serialized);
  }

  return envelope.summary.behavioralPass ? 0 : 1;
}
