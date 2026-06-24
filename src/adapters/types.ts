/**
 * Generic harness adapter contract.
 *
 * Every harness adapter produces a {@link TrajectoryView} plus process
 * diagnostics. The runner and assertion engine depend only on these types —
 * not on any specific harness implementation.
 */

import type { TrajectoryView } from "../types/trajectory";

/** Base config every adapter must accept. */
export interface BaseAdapterConfig {
  prompt: string;
  model?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  env?: Record<string, string>;
  cwd?: string;
}

/** Suite-level config: generic fields plus adapter-specific nested blocks. */
export type SuiteConfig = Partial<BaseAdapterConfig> & {
  /** Claude Code adapter options (when `adapter` is `claude-code`). */
  claudeCode?: Record<string, unknown>;
  /** Codex CLI adapter options (when `adapter` is `codex`). */
  codex?: Record<string, unknown>;
};

/** Generic harness adapter interface. */
export interface HarnessAdapter<
  TConfig extends BaseAdapterConfig = BaseAdapterConfig,
> {
  readonly id: string;
  run(config: TConfig): Promise<AdapterResult>;
}

/** Successful adapter run. */
export interface AdapterResult {
  view: TrajectoryView;
  diagnostics: AdapterDiagnostics;
}

/** Process-level diagnostics from any adapter. */
export interface AdapterDiagnostics {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  parseErrors: ParseErrorRecord[];
  timedOut: boolean;
  durationMs: number;
}

export interface ParseErrorRecord {
  line: string;
  error: string;
}

/**
 * Thrown when the harness fails to produce a usable trajectory.
 *
 * Most commonly this means the process failed before emitting a usable
 * session init event. Inspect `diagnostics.stderr` for the cause.
 */
export class AdapterError extends Error {
  constructor(
    message: string,
    public readonly diagnostics: Partial<AdapterDiagnostics>,
  ) {
    super(message);
    this.name = "AdapterError";
  }
}
