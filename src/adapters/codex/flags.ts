/**
 * Build CLI args for Codex harness and judge subprocesses.
 *
 * `--ask-for-approval` is a **global** flag (before `exec`). Other options attach
 * to the `exec` subcommand per `codex exec --help`.
 */

import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CodexAdapterConfig, CodexOptions } from "./types";

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

/** Prepend global flags that must appear before the `exec` subcommand. */
export function appendGlobalCodexFlags(
  args: string[],
  config: CodexOptions,
): void {
  pushOptionalFlag(
    args,
    "--ask-for-approval",
    config.askForApproval ?? "never",
  );
}

/** Append `codex exec` subcommand flags (after `exec`, before prompt). */
export function appendExecCodexFlags(
  args: string[],
  config: CodexOptions & { model?: string; cwd?: string },
): void {
  pushOptionalFlag(args, "--cd", config.cwd);
  pushRepeatableFlag(args, "--add-dir", config.addDirs);
  pushOptionalFlag(args, "--model", config.model);
  pushOptionalFlag(args, "--profile", config.profile);
  pushOptionalFlag(args, "--sandbox", config.sandbox);
  pushOptionalFlag(
    args,
    "--dangerously-bypass-approvals-and-sandbox",
    config.dangerouslyBypassApprovalsAndSandbox,
  );
  pushOptionalFlag(
    args,
    "--dangerously-bypass-hook-trust",
    config.dangerouslyBypassHookTrust,
  );
  pushOptionalFlag(args, "--ephemeral", config.ephemeral);
  pushOptionalFlag(args, "--ignore-user-config", config.ignoreUserConfig);
  pushOptionalFlag(args, "--skip-git-repo-check", config.skipGitRepoCheck);
  pushOptionalFlag(args, "--output-schema", config.outputSchema);
  pushOptionalFlag(args, "--output-last-message", config.outputLastMessage);

  if (config.configOverrides) {
    for (const override of config.configOverrides) {
      args.push("-c", override);
    }
  }
}

/** @deprecated Use appendGlobalCodexFlags + appendExecCodexFlags */
export function appendCodexFlags(
  args: string[],
  config: CodexOptions & { model?: string; cwd?: string },
): void {
  appendExecCodexFlags(args, config);
}

/**
 * Ensure harness runs pass `--output-last-message` when capture is enabled.
 * Returns the auto-generated path (for cleanup), or null if unchanged.
 */
export function ensureHarnessOutputLastMessage(
  config: CodexAdapterConfig,
): string | null {
  if (config.captureLastMessage === false) return null;
  if (config.outputLastMessage) return null;

  const path = join(tmpdir(), `harness-eval-codex-last-msg-${randomUUID()}.txt`);
  config.outputLastMessage = path;
  return path;
}

/**
 * Build argv for `codex --ask-for-approval never exec --json … "<prompt>"`.
 *
 * Expects `config.outputLastMessage` to already be set if capture is desired;
 * call {@link ensureHarnessOutputLastMessage} before this if spawning outside
 * of {@link spawnCodex}.
 */
export function buildArgs(config: CodexAdapterConfig): string[] {
  const args: string[] = [];
  appendGlobalCodexFlags(args, config);
  args.push("exec", "--json");
  appendExecCodexFlags(args, config);
  args.push(config.prompt);
  return args;
}

/**
 * Build argv for `codex --ask-for-approval never exec … "<prompt>"` (no `--json`).
 */
export function buildJudgeArgs(
  prompt: string,
  config: CodexOptions & { model?: string; cwd?: string } = {},
): string[] {
  const args: string[] = [];
  appendGlobalCodexFlags(args, {
    ...config,
    askForApproval: config.askForApproval ?? "never",
  });
  args.push("exec");
  appendExecCodexFlags(args, config);
  args.push(prompt);
  return args;
}
