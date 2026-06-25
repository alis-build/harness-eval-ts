/**
 * Default harness adapter registry.
 *
 * New adapters register here so the CLI and runner can resolve `adapter`
 * names from YAML without hard-coding imports at every call site.
 *
 * ## Adding a new harness adapter
 *
 * 1. **Create an adapter module** under `src/adapters/<id>/` implementing
 *    {@link HarnessAdapter} from `./types`. Set `id` to match the YAML
 *    `adapter` field (e.g. `"codex"`).
 * 2. **Nest suite config** under a camelCase key in {@link SuiteConfig}
 *    (e.g. `codex: { ... }`) so each harness keeps its own options.
 * 3. **Register at startup** via {@link registerAdapter} — either in this
 *    module for built-in adapters or from plugin/bootstrap code for
 *    runtime extensions.
 * 4. **Reference in suite YAML** with `adapter: <id>` and the nested config
 *    block; the runner calls `getAdapter(id).run(resolvedConfig)`.
 *
 * Built-in adapters are registered when this module loads: `claude-code`, `codex`,
 * and `gemini-cli`. Future harnesses (e.g. Antigravity CLI) follow the same
 * pattern in separate tracks.
 */

import type { HarnessAdapter } from "./types";
import { claudeCodeAdapter } from "./claude-code/index";
import { codexAdapter } from "./codex/index";
import { geminiCliAdapter } from "./gemini-cli/index";

const ADAPTERS: Record<string, HarnessAdapter> = {};

function registerBuiltIn(id: string, adapter: HarnessAdapter): void {
  ADAPTERS[id] = adapter;
}

registerBuiltIn("claude-code", claudeCodeAdapter);
registerBuiltIn("codex", codexAdapter);
registerBuiltIn("gemini-cli", geminiCliAdapter);

/**
 * Register a harness adapter by id.
 *
 * Duplicate ids throw — registration is explicit so accidental overrides
 * surface immediately during startup or test setup.
 */
export function registerAdapter(id: string, adapter: HarnessAdapter): void {
  if (ADAPTERS[id]) {
    throw new Error(`adapter "${id}" is already registered`);
  }
  ADAPTERS[id] = adapter;
}

/** Return all registered adapter ids (built-in and runtime). */
export function listAdapters(): string[] {
  return Object.keys(ADAPTERS);
}

/** Resolve an adapter by id. Throws if unknown. */
export function getAdapter(id: string): HarnessAdapter {
  const adapter = ADAPTERS[id];
  if (!adapter) {
    throw new Error(
      `unknown adapter "${id}". Available: ${listAdapters().join(", ")}`,
    );
  }
  return adapter;
}

/** Default adapter when YAML omits `adapter`. */
export const DEFAULT_ADAPTER_ID = "claude-code";

export function getDefaultAdapter(): HarnessAdapter {
  return getAdapter(DEFAULT_ADAPTER_ID);
}
