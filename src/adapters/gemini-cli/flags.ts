/**
 * Build CLI args for Gemini CLI harness and judge subprocesses.
 */

import type { GeminiCliAdapterConfig, GeminiCliOptions } from "./types";

function pushRepeatableFlag(args: string[], flag: string, values?: string[]): void {
  if (!values) return;
  for (const value of values) {
    args.push(flag, value);
  }
}

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

/**
 * Append shared Gemini CLI flags (excluding prompt and output format).
 *
 * Harness and judge subprocesses share this helper so both paths stay aligned
 * on approval mode, sandbox, MCP allowlists, and trust settings.
 */
export function appendGeminiCliFlags(
  args: string[],
  config: GeminiCliOptions & { model?: string },
): void {
  pushOptionalFlag(
    args,
    "--approval-mode",
    config.approvalMode ?? "yolo",
  );
  pushOptionalFlag(args, "--model", config.model);
  pushOptionalFlag(args, "--sandbox", config.sandbox);
  pushOptionalFlag(args, "--skip-trust", config.skipTrust);
  pushRepeatableFlag(args, "--include-directories", config.includeDirectories);
  pushRepeatableFlag(
    args,
    "--allowed-mcp-server-names",
    config.allowedMcpServerNames,
  );
  pushRepeatableFlag(args, "--extensions", config.extensions);
  pushOptionalFlag(args, "--debug", config.debug);
}

/**
 * Build argv for `gemini -p "<prompt>" --output-format stream-json …`.
 *
 * Prompt is passed via `-p` and must remain the final positional argument
 * after all flags. Defaults `skipTrust` to true so CI and ephemeral workspaces
 * do not block on interactive folder-trust prompts.
 */
export function buildArgs(config: GeminiCliAdapterConfig): string[] {
  const args: string[] = ["-p", config.prompt, "--output-format", "stream-json"];
  appendGeminiCliFlags(args, {
    ...config,
    skipTrust: config.skipTrust ?? true,
  });
  return args;
}

/**
 * Build argv for `gemini -p "<prompt>" --output-format json …` (judge).
 *
 * Emits a single JSON object (not NDJSON). The judge grader may read it from
 * stdout or recover it from stderr when Gemini prints warnings first.
 */
export function buildJudgeArgs(
  prompt: string,
  config: GeminiCliOptions & { model?: string } = {},
): string[] {
  const args: string[] = ["-p", prompt, "--output-format", "json"];
  appendGeminiCliFlags(args, {
    ...config,
    approvalMode: config.approvalMode ?? "yolo",
    skipTrust: config.skipTrust ?? true,
  });
  return args;
}
