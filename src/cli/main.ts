/**
 * CLI entry point — dispatches subcommands and prints usage on `--help`.
 *
 * Exit codes: 0 success, 1 eval/grade failure, 2 usage or load errors.
 */

import { envelopeCommand } from "./commands/envelope";
import { formatCommand } from "./commands/format";
import { gradeCommand } from "./commands/grade";
import { pipelineCommand } from "./commands/pipeline";
import { runCommand } from "./commands/run";
import { parseArgs } from "./args";

const USAGE = `harness-eval — harness-level eval framework

Usage:
  harness-eval run <suite.yaml> [--max-concurrent N] [--baseline path] [--output path] [--otel-output dir] [--format console|markdown|json] [--adapter id] [--quiet] [--verbose] [--progress default|quiet|verbose|json]
  harness-eval grade <report.json> [--config grading.yaml] [--suite suite.yaml] [--expectations path] [--output path] [--model id] [--timeout-ms N] [--max-concurrent N] [--format console|json] [--quiet] [--verbose] [--progress default|quiet|verbose|json]
  harness-eval envelope <report.json> [--output path] [--grading path] [--suite path] [--projection envelope|trajectory|instances] [--include-raw-stream-events] [--no-transcript]
  harness-eval pipeline <suite.yaml|dir> [--steps run,grade,envelope] [--output path] [--grading path] [--grading-output path] [--envelope-output path] [--report path] [--projection envelope|trajectory|instances] [--max-concurrent N] [--progress default|quiet|verbose|json]
  harness-eval format <report.json> [--format console|markdown|json] [--baseline path]
  harness-eval --help

  Progress (run & grade):
  default   one line per repetition + per-cell summary (default)
  --quiet   colored dots (. = ok, x = fail)
  --verbose per-rep details (tool counts, assertion summary)
  --progress json   newline-delimited JSON events on stderr
  --no-color        disable ANSI colors on progress output
  --color           force ANSI colors on progress output
`;

/**
 * Route argv to the appropriate subcommand handler.
 *
 * @returns Process exit code (0 = success, 1 = eval failure, 2 = usage error).
 */
export async function main(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);

  if (parsed.options.help || parsed.command === "help" || parsed.options.h) {
    process.stdout.write(USAGE);
    return 0;
  }

  switch (parsed.command) {
    case "run":
      return await runCommand(parsed);
    case "grade":
      return await gradeCommand(parsed);
    case "envelope":
      return await envelopeCommand(parsed);
    case "pipeline":
      return await pipelineCommand(parsed);
    case "format":
      return await formatCommand(parsed);
    case undefined:
      console.error(USAGE);
      return 2;
    default:
      console.error(`unknown command: ${parsed.command}\n\n${USAGE}`);
      return 2;
  }
}
