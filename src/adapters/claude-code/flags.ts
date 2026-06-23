/**
 * Build CLI args for Claude Code judge subprocesses (JSON output, not stream-json).
 *
 * Shared flag assembly for harness runs (`buildArgs`) and LLM grading judges
 * (`buildJudgeArgs`).
 */

import type { ClaudeCodeAdapterConfig, ClaudeCodeOptions } from "./types";

/** Append repeated `--flag value` pairs for array config fields. */
function pushRepeatableFlag(args: string[], flag: string, values?: string[]): void {
  if (!values) return;
  for (const value of values) {
    args.push(flag, value);
  }
}

/**
 * Append an optional CLI flag. Boolean `true` emits the flag alone; other
 * scalars emit `--flag value`.
 */
function pushOptionalFlag(
  args: string[],
  flag: string,
  value: string | number | boolean | undefined,
): void {
  if (value === undefined) return;
  if (typeof value === "boolean") {
    if (value) args.push(flag);
    return;
  }
  args.push(flag, String(value));
}

/** Append Claude Code CLI flags shared by harness runs and grading judges. */
export function appendClaudeCodeFlags(
  args: string[],
  config: ClaudeCodeOptions & { model?: string },
): void {
  pushRepeatableFlag(args, "--plugin-dir", config.pluginDirs);
  pushRepeatableFlag(args, "--plugin-url", config.pluginUrls);
  pushRepeatableFlag(args, "--add-dir", config.addDirs);

  pushOptionalFlag(args, "--mcp-config", config.mcpConfig);
  pushOptionalFlag(args, "--model", config.model);
  pushOptionalFlag(args, "--permission-mode", config.permissionMode);
  pushOptionalFlag(args, "--effort", config.effort);
  pushOptionalFlag(args, "--agent", config.agent);
  pushOptionalFlag(args, "--fallback-model", config.fallbackModel);
  pushOptionalFlag(args, "--tools", config.tools);
  pushOptionalFlag(args, "--settings", config.settings);
  pushOptionalFlag(args, "--setting-sources", config.settingSources);
  pushOptionalFlag(args, "--max-turns", config.maxTurns);
  pushOptionalFlag(args, "--max-budget-usd", config.maxBudgetUsd);
  pushOptionalFlag(args, "--system-prompt", config.systemPrompt);
  pushOptionalFlag(args, "--system-prompt-file", config.systemPromptFile);
  pushOptionalFlag(args, "--append-system-prompt", config.appendSystemPrompt);
  pushOptionalFlag(
    args,
    "--append-system-prompt-file",
    config.appendSystemPromptFile,
  );
  pushOptionalFlag(args, "--debug", config.debug);
  pushOptionalFlag(args, "--debug-file", config.debugFile);

  if (config.allowedTools && config.allowedTools.length > 0) {
    args.push("--allowedTools", config.allowedTools.join(","));
  }

  if (config.disallowedTools && config.disallowedTools.length > 0) {
    args.push("--disallowedTools", config.disallowedTools.join(","));
  }

  pushOptionalFlag(args, "--strict-mcp-config", config.strictMcpConfig);
  pushOptionalFlag(args, "--include-hook-events", config.includeHookEvents);
  pushOptionalFlag(args, "--no-session-persistence", config.noSessionPersistence);
  pushOptionalFlag(args, "--disable-slash-commands", config.disableSlashCommands);
  pushOptionalFlag(args, "--bare", config.bare);
  pushOptionalFlag(args, "--safe-mode", config.safeMode);
  pushOptionalFlag(
    args,
    "--allow-dangerously-skip-permissions",
    config.allowDangerouslySkipPermissions,
  );
  pushOptionalFlag(
    args,
    "--dangerously-skip-permissions",
    config.dangerouslySkipPermissions,
  );
}

/**
 * Build the argument vector for spawning `claude`.
 *
 * Order matters only for flags that take values — value flags must come
 * after their flag name. Everything else is order-independent.
 */
export function buildArgs(config: ClaudeCodeAdapterConfig): string[] {
  const args: string[] = [
    "-p",
    config.prompt,
    "--output-format",
    "stream-json",
    "--verbose",
  ];

  appendClaudeCodeFlags(args, config);

  return args;
}

/**
 * Build args for an LLM judge subprocess (`--output-format json`).
 *
 * Defaults permission mode to `bypassPermissions` so the judge does not
 * block on tool permission prompts during single-shot JSON grading.
 */
export function buildJudgeArgs(
  prompt: string,
  config: ClaudeCodeOptions & { model?: string } = {},
): string[] {
  const args: string[] = ["-p", prompt, "--output-format", "json"];
  const permissionMode = config.permissionMode ?? "bypassPermissions";
  appendClaudeCodeFlags(args, {
    ...config,
    permissionMode,
  });
  return args;
}
