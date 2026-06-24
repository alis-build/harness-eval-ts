/**
 * Types for the Codex CLI adapter.
 */

import type {
  AdapterDiagnostics,
  AdapterError,
  AdapterResult,
  BaseAdapterConfig,
  ParseErrorRecord,
} from "../types";
import type { StreamEvent } from "../../types/stream";

export type {
  AdapterDiagnostics,
  AdapterResult,
  BaseAdapterConfig,
  ParseErrorRecord,
} from "../types";
export { AdapterError } from "../types";

/** Codex sandbox policies (`codex exec --sandbox`). */
export type CodexSandbox = "read-only" | "workspace-write" | "danger-full-access";

/** Codex approval modes (`--ask-for-approval`). */
export type CodexAskForApproval = "untrusted" | "on-request" | "never";

/** Codex-specific options (nested under `codex` in YAML). */
export interface CodexOptions {
  binary?: string;
  model?: string;
  profile?: string;
  sandbox?: CodexSandbox;
  addDirs?: string[];
  /** Inline `-c key=value` overrides (repeatable on CLI). */
  configOverrides?: string[];
  askForApproval?: CodexAskForApproval;
  dangerouslyBypassApprovalsAndSandbox?: boolean;
  dangerouslyBypassHookTrust?: boolean;
  ephemeral?: boolean;
  ignoreUserConfig?: boolean;
  skipGitRepoCheck?: boolean;
  outputSchema?: string;
  outputLastMessage?: string;
  /**
   * When true (default), harness runs auto-generate a temp `--output-last-message`
   * path and read it back as `finalResponse` if JSONL has no assistant_message.
   */
  captureLastMessage?: boolean;
  /**
   * When true, each run uses a fresh temp `$CODEX_HOME` for isolation.
   * Default false — inherit caller's ~/.codex config and auth.
   */
  isolateConfig?: boolean;
}

/** Configuration for a single Codex harness run. */
export interface CodexAdapterConfig extends BaseAdapterConfig, CodexOptions {}

/** Codex run result — includes mapped stream events for debugging. */
export interface CodexAdapterResult extends AdapterResult {
  rawEvents: StreamEvent[];
}

/** Raw Codex `--json` thread event (partial — tolerate unknown fields). */
export interface CodexJsonEvent {
  type?: string;
  thread_id?: string;
  usage?: CodexUsage;
  item?: CodexItem;
  message?: string;
}

/** Token usage on a Codex turn or thread event. */
export interface CodexUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
}

/** One item in a Codex thread (tool call, command, or assistant message). */
export interface CodexItem {
  id?: string;
  type?: string;
  item_type?: string;
  server?: string;
  tool?: string;
  arguments?: unknown;
  command?: string;
  exit_code?: number;
  aggregated_output?: string;
  text?: string;
  result?: unknown;
  error?: { message?: string } | null;
  status?: string;
}
