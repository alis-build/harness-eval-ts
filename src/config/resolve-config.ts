/**
 * Flatten nested suite config into harness-specific adapter config.
 *
 * Suite YAML nests adapter options under keys like `claudeCode`; adapters
 * expect a flat config object. This module merges layers and flattens per
 * adapter id.
 */

import { DEFAULT_ADAPTER_ID } from "../adapters/registry";
import type { BaseAdapterConfig } from "../adapters/types";
import type { ClaudeCodeAdapterConfig } from "../adapters/claude-code/types";
import type { CodexAdapterConfig } from "../adapters/codex/types";
import type { SuiteConfig } from "../adapters/types";

/** Merged config passed to {@link HarnessAdapter.run}. */
export type ResolvedRunConfig = BaseAdapterConfig & Record<string, unknown>;

/** Merge generic suite config layers into a flat {@link ClaudeCodeAdapterConfig}. */
export function toClaudeCodeConfig(
  layers: SuiteConfig[],
  prompt: string,
): ClaudeCodeAdapterConfig {
  const merged: Record<string, unknown> = {};
  for (const layer of layers) {
    const { claudeCode, ...generic } = layer;
    Object.assign(merged, generic);
    if (claudeCode && typeof claudeCode === "object") {
      Object.assign(merged, claudeCode);
    }
  }
  merged.prompt = prompt;
  return merged as unknown as ClaudeCodeAdapterConfig;
}

/** Merge generic suite config layers into a flat {@link CodexAdapterConfig}. */
export function toCodexConfig(
  layers: SuiteConfig[],
  prompt: string,
): CodexAdapterConfig {
  const merged: Record<string, unknown> = {};
  for (const layer of layers) {
    const { codex, ...generic } = layer;
    Object.assign(merged, generic);
    if (codex && typeof codex === "object") {
      Object.assign(merged, codex);
    }
  }
  merged.prompt = prompt;
  return merged as unknown as CodexAdapterConfig;
}

/**
 * Resolve merged suite layers into the flat config shape expected by the
 * selected harness adapter.
 */
export function resolveRunConfig(
  adapterId: string,
  layers: SuiteConfig[],
  prompt: string,
): ResolvedRunConfig {
  if (adapterId === DEFAULT_ADAPTER_ID || adapterId === "claude-code") {
    return toClaudeCodeConfig(layers, prompt) as ResolvedRunConfig;
  }

  if (adapterId === "codex") {
    return toCodexConfig(layers, prompt) as ResolvedRunConfig;
  }

  // Unknown adapters receive a shallow merge of all config layers.
  const merged: Record<string, unknown> = {};
  for (const layer of layers) {
    Object.assign(merged, layer);
  }
  merged.prompt = prompt;
  return merged as ResolvedRunConfig;
}
