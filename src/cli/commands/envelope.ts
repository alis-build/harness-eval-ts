/**
 * `harness-eval envelope` — build EvalRunEnvelope and interchange projections.
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildEvalRunEnvelopeFromFiles } from "../../eval-record/build";
import {
  toAgentTrace,
  toProtoInstances,
  toTrajectory,
} from "../../eval-interchange/projections";
import type { EvalRunEnvelope } from "../../types/eval-record";
import { getOption, hasOption, type ParsedArgs } from "../args";

export type EnvelopeProjection =
  | "envelope"
  | "trajectory"
  | "instances"
  | "agent-trace";

const PROJECTIONS = new Set<EnvelopeProjection>([
  "envelope",
  "trajectory",
  "instances",
  "agent-trace",
]);

export function parseEnvelopeProjection(
  value: string | undefined,
): EnvelopeProjection | undefined {
  if (value === undefined) return "envelope";
  if (PROJECTIONS.has(value as EnvelopeProjection)) {
    return value as EnvelopeProjection;
  }
  return undefined;
}

export function serializeEnvelopeProjection(
  envelope: EvalRunEnvelope,
  projection: EnvelopeProjection,
): string {
  switch (projection) {
    case "trajectory":
      return `${toTrajectory(envelope).map((row) => JSON.stringify(row)).join("\n")}\n`;
    case "instances":
      return `${JSON.stringify(toProtoInstances(envelope), null, 2)}\n`;
    case "agent-trace":
      return `${JSON.stringify(toAgentTrace(envelope), null, 2)}\n`;
    case "envelope":
    default:
      return `${JSON.stringify(envelope, null, 2)}\n`;
  }
}

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

export async function envelopeCommand(args: ParsedArgs): Promise<number> {
  const reportPath = args.positional[0];
  if (!reportPath) {
    console.error(
      "usage: harness-eval envelope <report.json> [--output path] [--grading path] [--suite path] [--projection envelope|trajectory|instances|agent-trace] [--include-raw-stream-events] [--no-transcript]",
    );
    return 2;
  }

  const outputPath = getOption(args.options, "output");
  const gradingPath = getOption(args.options, "grading");
  const suitePath = getOption(args.options, "suite");
  const projection = parseEnvelopeProjection(
    getOption(args.options, "projection"),
  );

  if (!projection) {
    console.error(
      "invalid --projection; expected envelope, trajectory, instances, or agent-trace",
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
