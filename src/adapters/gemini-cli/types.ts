/**
 * Types for the Gemini CLI adapter.
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

/** Gemini CLI approval modes (`--approval-mode`). */
export type GeminiApprovalMode = "default" | "auto_edit" | "yolo" | "plan";

/** Gemini-specific options (nested under `geminiCli` in YAML). */
export interface GeminiCliOptions {
  binary?: string;
  model?: string;
  /** Headless approval policy; harness defaults to `yolo`. */
  approvalMode?: GeminiApprovalMode;
  sandbox?: string;
  /** Skip interactive folder-trust prompts (default true for harness). */
  skipTrust?: boolean;
  /** Extra workspace roots passed as `--include-directories`. */
  includeDirectories?: string[];
  /** Restrict MCP servers by name (`--allowed-mcp-server-names`). */
  allowedMcpServerNames?: string[];
  extensions?: string[];
  debug?: boolean;
  /**
   * When true, each run uses a fresh temp config directory for isolation.
   * Default false — inherit caller's Gemini CLI config and auth.
   */
  isolateConfig?: boolean;
}

/** Configuration for a single Gemini CLI harness run. */
export interface GeminiCliAdapterConfig
  extends BaseAdapterConfig,
    GeminiCliOptions {}

/** Gemini CLI run result — includes mapped stream events for debugging. */
export interface GeminiCliAdapterResult extends AdapterResult {
  rawEvents: StreamEvent[];
}

/** Raw Gemini CLI stream-json event (one JSON object per NDJSON line). */
export interface GeminiCliJsonEvent {
  type?: string;
  timestamp?: string;
  session_id?: string;
  model?: string;
  role?: "user" | "assistant";
  content?: string;
  /** When true, `content` is a streaming chunk — accumulate until completion. */
  delta?: boolean;
  tool_name?: string;
  tool_id?: string;
  parameters?: Record<string, unknown>;
  status?: "success" | "error";
  output?: string;
  message?: string;
  error?: { type?: string; message?: string };
  /** Token and cost stats on terminal `result` events. */
  stats?: GeminiCliStreamStats;
  [key: string]: unknown;
}

/** Usage and timing from a Gemini CLI `result` event. */
export interface GeminiCliStreamStats {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  duration_ms?: number;
  total_cost_usd?: number;
  tool_calls?: number;
}

/** Single JSON object from `gemini --output-format json` (judge). */
export interface GeminiCliJsonOutput {
  session_id?: string;
  /** Judge verdict text — typically JSON embedded in this string. */
  response?: string;
  stats?: GeminiCliStreamStats;
  error?: { type?: string; message?: string };
  warnings?: string[];
}
