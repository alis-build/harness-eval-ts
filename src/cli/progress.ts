/**
 * CLI progress reporting for long-running harness and grade commands.
 *
 * Progress writes to stderr by default so stdout remains free for report
 * output. Supports human-readable modes and newline-delimited JSON events.
 */

import type { Writable } from "node:stream";

import { getOption, hasOption } from "./args";
import type { GradeProgressEvent as GraderGradeProgressEvent } from "../grader/types";
import type { AssertionResult } from "../types/assertions";
import type { CellReport, ProgressCallback } from "../runner/types";

/** Progress display mode for run and grade commands. */
export type ProgressMode = "default" | "quiet" | "verbose" | "json";

/** ANSI SGR codes for progress output. Disabled when {@link resolveProgressColor} returns false. */
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

/** Options for {@link createRunProgressHandler}. */
export interface RunProgressOptions {
  mode: ProgressMode;
  maxConcurrent?: number;
  color?: boolean;
  stream?: Writable;
}

/** Options for {@link createGradeProgressHandler}. */
export interface GradeProgressOptions {
  mode: ProgressMode;
  maxConcurrent?: number;
  color?: boolean;
  stream?: Writable;
}

/**
 * Resolve progress mode from `--progress`, `--quiet`, or `--verbose` flags.
 *
 * Explicit `--progress` wins; otherwise `--quiet` / `--verbose` map to modes.
 */
export function resolveProgressMode(
  options: Record<string, string | boolean>,
): ProgressMode {
  const progress = getOption(options, "progress");
  if (
    progress === "json" ||
    progress === "quiet" ||
    progress === "verbose" ||
    progress === "default"
  ) {
    return progress;
  }
  if (hasOption(options, "quiet")) return "quiet";
  if (hasOption(options, "verbose")) return "verbose";
  return "default";
}

/**
 * Whether to emit ANSI colors on the progress stream (stderr).
 *
 * Precedence: `--no-color` → off; `--color` → on; `NO_COLOR` env → off;
 * `FORCE_COLOR` (non-zero) → on; otherwise TTY detection on `stream`.
 */
export function resolveProgressColor(
  options: Record<string, string | boolean>,
  stream: Writable = process.stderr,
): boolean {
  if (hasOption(options, "no-color")) return false;
  if (hasOption(options, "color")) return true;
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "") {
    return false;
  }
  if (process.env.FORCE_COLOR !== undefined && process.env.FORCE_COLOR !== "0") {
    return true;
  }
  return (
    "isTTY" in stream &&
    (stream as { isTTY?: boolean }).isTTY === true
  );
}

/** Green checkmark prefix for per-rep success lines. */
function okMark(color: boolean): string {
  return color ? `${GREEN}✓${RESET}` : "✓";
}

/** Red cross prefix for per-rep failure lines. */
function failMark(color: boolean): string {
  return color ? `${RED}✗${RESET}` : "✗";
}

/** Inline lowercase status word for repetition rows. */
function okStatus(color: boolean): string {
  return color ? `${GREEN}ok${RESET}` : "ok";
}

/** Inline uppercase status word for repetition failures. */
function failStatus(color: boolean): string {
  return color ? `${RED}FAIL${RESET}` : "FAIL";
}

/** Uppercase cell-level pass label in {@link formatCellSummary}. */
function passLabel(color: boolean): string {
  return color ? `${GREEN}PASS${RESET}` : "PASS";
}

/** Uppercase cell-level fail label in {@link formatCellSummary}. */
function failLabel(color: boolean): string {
  return color ? `${RED}FAIL${RESET}` : "FAIL";
}

/**
 * Build a {@link ProgressCallback} for suite runs.
 *
 * Writes to `options.stream` (default stderr). JSON mode emits one event per line.
 */
export function createRunProgressHandler(
  options: RunProgressOptions,
): ProgressCallback {
  const stream = options.stream ?? process.stderr;
  const mode = options.mode;
  const color = options.color ?? false;

  let totalReps = 0;
  let completed = 0;
  let totalDurationMs = 0;

  return (event) => {
    switch (event.kind) {
      case "suite-start":
        totalReps = event.totalReps;
        completed = 0;
        totalDurationMs = 0;
        if (mode === "quiet") return;
        if (mode === "json") {
          writeJson(stream, {
            kind: "suite-start",
            totalReps: event.totalReps,
            maxConcurrent: options.maxConcurrent,
          });
          return;
        }
        const concurrent =
          options.maxConcurrent !== undefined
            ? ` (max-concurrent ${options.maxConcurrent})`
            : "";
        stream.write(`Running ${totalReps} repetitions${concurrent}...\n\n`);
        break;

      case "rep-complete":
        completed++;
        totalDurationMs += event.durationMs;
        if (mode === "quiet") {
          stream.write(event.ok ? (color ? `${GREEN}.${RESET}` : ".") : (color ? `${RED}x${RESET}` : "x"));
          return;
        }
        if (mode === "json") {
          writeJson(stream, {
            kind: "rep-complete",
            index: completed,
            total: totalReps,
            caseId: event.caseId,
            cellLabel: event.cellLabel,
            repIndex: event.repIndex,
            ok: event.ok,
            durationMs: event.durationMs,
            toolCallCount: event.toolCallCount,
            errorMessage: event.errorMessage,
          });
          return;
        }

        const eta = formatEta(totalDurationMs, completed, totalReps);
        const icon = event.ok ? okMark(color) : failMark(color);
        const status = event.ok ? okStatus(color) : failStatus(color);
        let line = `${icon} [${completed}/${totalReps}] ${event.caseId} @ ${event.cellLabel} #${event.repIndex}  ${status}  ${formatDuration(event.durationMs)}`;
        if (eta) {
          line += color
            ? `  ${DIM}(${eta})${RESET}`
            : `  (${eta})`;
        }
        if (!event.ok && event.errorMessage) {
          line += color
            ? `  ${YELLOW}— ${truncate(event.errorMessage, 80)}${RESET}`
            : `  — ${truncate(event.errorMessage, 80)}`;
        }
        if (mode === "verbose") {
          if (event.toolCallCount !== undefined) {
            line += `  tools=${event.toolCallCount}`;
          }
          const summary = formatAssertionSummary(event.assertionResults, color);
          if (summary) line += `  ${summary}`;
        }
        stream.write(`${line}\n`);
        break;

      case "cell-complete":
        if (mode === "quiet") return;
        if (mode === "json") {
          writeJson(stream, {
            kind: "cell-complete",
            caseId: event.report.caseId,
            cellLabel: event.report.cell.label,
            passed: event.report.passed,
            adapterErrors: event.report.adapterErrors,
            assertionStats: event.report.assertionStats.map((s) => ({
              description: s.description,
              passRate: s.passRate,
              meetsThreshold: s.meetsThreshold,
            })),
          });
          return;
        }
        stream.write(`${formatCellSummary(event.report, color)}\n`);
        break;

      case "suite-complete":
        if (mode === "quiet") {
          stream.write("\n");
          return;
        }
        if (mode === "json") {
          writeJson(stream, {
            kind: "suite-complete",
            durationMs: event.report.durationMs,
            cellsTotal: event.report.cells.length,
            cellsPassed: event.report.cells.filter((c) => c.passed).length,
          });
          return;
        }
        const okReps = event.report.cells.reduce(
          (n, c) => n + c.repetitions.filter((r) => r.error === null).length,
          0,
        );
        const totalRun = event.report.cells.reduce(
          (n, c) => n + c.repetitions.length,
          0,
        );
        const adapterErrors = event.report.cells.reduce(
          (n, c) => n + c.adapterErrors,
          0,
        );
        let footer = `\nFinished in ${formatDuration(event.report.durationMs)} (${okReps}/${totalRun} reps ok`;
        if (adapterErrors > 0) {
          footer += `, ${adapterErrors} adapter error(s)`;
        }
        footer += ")\n\n";
        stream.write(footer);
        break;

      default:
        break;
    }
  };
}

/** Build a progress handler for outcome grading ({@link GradeProgressEvent}). */
export function createGradeProgressHandler(
  options: GradeProgressOptions,
): (event: GraderGradeProgressEvent) => void {
  const stream = options.stream ?? process.stderr;
  const mode = options.mode;
  const color = options.color ?? false;

  let total = 0;
  let completed = 0;
  let totalDurationMs = 0;

  return (event) => {
    switch (event.kind) {
      case "grade-start":
        total = event.total;
        completed = 0;
        totalDurationMs = 0;
        if (mode === "quiet" || total === 0) return;
        if (mode === "json") {
          writeJson(stream, {
            kind: "grade-start",
            total: event.total,
            maxConcurrent: options.maxConcurrent,
          });
          return;
        }
        const concurrent =
          options.maxConcurrent !== undefined
            ? ` (max-concurrent ${options.maxConcurrent})`
            : "";
        stream.write(
          `Grading ${total} repetition(s)${concurrent}...\n\n`,
        );
        break;

      case "grade-complete":
        completed++;
        totalDurationMs += event.durationMs;
        if (mode === "quiet") {
          const allPassed = event.failed === 0 && !event.graderError;
          stream.write(
            allPassed
              ? color ? `${GREEN}.${RESET}` : "."
              : color ? `${RED}x${RESET}` : "x",
          );
          return;
        }
        if (mode === "json") {
          writeJson(stream, {
            kind: "grade-complete",
            index: completed,
            total,
            caseId: event.caseId,
            cellLabel: event.cellLabel,
            repetitionIndex: event.repetitionIndex,
            passed: event.passed,
            failed: event.failed,
            durationMs: event.durationMs,
            graderError: event.graderError,
          });
          return;
        }

        const eta = formatEta(totalDurationMs, completed, total);
        const ok = event.failed === 0 && !event.graderError;
        const icon = ok ? okMark(color) : failMark(color);
        const status = ok ? okStatus(color) : failStatus(color);
        let line = `${icon} [${completed}/${total}] ${event.caseId} @ ${event.cellLabel} #${event.repetitionIndex}  ${status}  ${formatDuration(event.durationMs)}`;
        line += `  expectations ${event.passed}/${event.passed + event.failed}`;
        if (eta) {
          line += color ? `  ${DIM}(${eta})${RESET}` : `  (${eta})`;
        }
        if (event.graderError) {
          line += color
            ? `  ${YELLOW}— ${truncate(event.graderError, 80)}${RESET}`
            : `  — ${truncate(event.graderError, 80)}`;
        }
        if (mode === "verbose" && event.failed && event.failed > 0) {
          line += color ? `  ${YELLOW}see grading output${RESET}` : "  see grading output";
        }
        stream.write(`${line}\n`);
        break;

      case "grade-done":
        if (mode === "quiet") {
          stream.write("\n");
          return;
        }
        if (mode === "json") {
          writeJson(stream, {
            kind: "grade-done",
            durationMs: event.durationMs,
            totalExpectations: event.totalExpectations,
            passedExpectations: event.passedExpectations,
          });
          return;
        }
        if (total === 0) return;
        stream.write(
          `\nGraded in ${formatDuration(event.durationMs)} (${event.passedExpectations}/${event.totalExpectations} expectations passed)\n\n`,
        );
        break;

      default:
        break;
    }
  };
}

/**
 * Write one NDJSON progress event line to the progress stream.
 *
 * JSON mode keeps stdout clean for machine-readable reports while still
 * exposing structured progress for CI log parsers.
 */
function writeJson(stream: Writable, value: unknown): void {
  stream.write(`${JSON.stringify(value)}\n`);
}

/** Format milliseconds as a human-readable duration string. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = Math.floor(sec / 60);
  const remSec = Math.round(sec % 60);
  if (min < 60) return `${min}m ${remSec}s`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return `${hr}h ${remMin}m`;
}

/**
 * Estimate remaining time from average completed rep duration.
 *
 * Uses a simple running mean — good enough for long suites without storing
 * per-rep history. Returns `undefined` at start and when all reps are done.
 */
function formatEta(
  totalDurationMs: number,
  completed: number,
  total: number,
): string | undefined {
  if (completed === 0 || completed >= total) return undefined;
  const avg = totalDurationMs / completed;
  const remaining = (total - completed) * avg;
  return `~${formatDuration(Math.round(remaining))} remaining`;
}

/** Truncate error text for single-line progress rows (Unicode ellipsis). */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/**
 * Compact per-assertion pass/fail summary for `--progress verbose` rep lines.
 *
 * @returns Comma-separated `✓ description` / `✗ description` fragments, or empty string.
 */
function formatAssertionSummary(
  results?: AssertionResult[],
  color = false,
): string {
  if (!results || results.length === 0) return "";
  return results
    .map((r) =>
      `${r.passed ? okMark(color) : failMark(color)} ${r.description}`,
    )
    .join(", ");
}

/** One-line summary when a matrix cell finishes (used in default progress mode). */
export function formatCellSummary(cell: CellReport, color: boolean): string {
  const mark = cell.passed ? okMark(color) : failMark(color);
  const status = cell.passed ? passLabel(color) : failLabel(color);
  const parts = cell.assertionStats.map((s) => {
    const pct = (s.passRate * 100).toFixed(0);
    return `${s.description} ${s.passedCount}/${s.evaluatedCount} (${pct}%)`;
  });
  const crash =
    cell.adapterErrors > 0
      ? color
        ? ` ${YELLOW}[${cell.adapterErrors} adapter errors]${RESET}`
        : ` [${cell.adapterErrors} adapter errors]`
      : "";
  const stats = parts.length > 0 ? `  ${parts.join(" · ")}` : "";
  return `${mark} ${cell.caseId} @ ${cell.cell.label}  ${status}${crash}${stats}`;
}
