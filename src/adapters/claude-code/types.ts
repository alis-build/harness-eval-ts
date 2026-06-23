/**
 * Types for the Claude Code adapter.
 *
 * Generic result types live in `src/adapters/types.ts`. This file holds
 * Claude Code-specific config and extended results.
 */

import type {
  AdapterDiagnostics,
  AdapterError,
  AdapterResult,
  BaseAdapterConfig,
  ParseErrorRecord,
} from "../types";
import type { StreamEvent } from "../../types/stream";

// Re-export generic types for back-compat consumers importing from here.
export type {
  AdapterDiagnostics,
  AdapterResult,
  BaseAdapterConfig,
  ParseErrorRecord,
} from "../types";
export { AdapterError } from "../types";

/** Claude Code permission modes (`--permission-mode`). */
export type PermissionMode =
  | "default"
  | "acceptEdits"
  | "plan"
  | "auto"
  | "dontAsk"
  | "bypassPermissions";

/** Effort levels (`--effort`). Availability depends on model. */
export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";

/** Claude Code-specific options (nested under `claudeCode` in YAML). */
export interface ClaudeCodeOptions {
  binary?: string;
  pluginDirs?: string[];
  pluginUrls?: string[];
  addDirs?: string[];
  mcpConfig?: string;
  strictMcpConfig?: boolean;
  model?: string;
  permissionMode?: PermissionMode;
  effort?: EffortLevel;
  agent?: string;
  fallbackModel?: string;
  tools?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  maxTurns?: number;
  maxBudgetUsd?: number;
  settings?: string;
  settingSources?: string;
  systemPrompt?: string;
  systemPromptFile?: string;
  appendSystemPrompt?: string;
  appendSystemPromptFile?: string;
  debug?: string | boolean;
  debugFile?: string;
  /** Emit hook lifecycle events in stream-json (requires verbose). */
  includeHookEvents?: boolean;
  noSessionPersistence?: boolean;
  disableSlashCommands?: boolean;
  bare?: boolean;
  safeMode?: boolean;
  allowDangerouslySkipPermissions?: boolean;
  dangerouslySkipPermissions?: boolean;
  /**
   * When true (default), each run uses a fresh `CLAUDE_CONFIG_DIR` temp dir for
   * isolation. When false, the child inherits the caller's Claude config
   * (login tokens, installed plugins, MCP servers).
   */
  isolateConfig?: boolean;
}

/**
 * Configuration for a single Claude Code run.
 *
 * Authentication: by default the adapter isolates CLAUDE_CONFIG_DIR to a fresh
 * temp dir per run, so cached Pro/Max login tokens are not available unless
 * `isolateConfig: false`. With isolation, provide `ANTHROPIC_API_KEY` via `env`
 * (or in the inherited process env).
 */
export interface ClaudeCodeAdapterConfig
  extends BaseAdapterConfig,
    ClaudeCodeOptions {}

/** Claude Code run result — includes raw stream events for debugging. */
export interface ClaudeCodeAdapterResult extends AdapterResult {
  rawEvents: StreamEvent[];
}
