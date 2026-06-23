/**
 * zod schemas for the YAML on-disk shape.
 *
 * Config uses a nested layout: generic harness fields at the top level,
 * adapter-specific options under a named key (e.g. `claudeCode`). Validated
 * raw shapes are transformed into runtime types by `src/config/transform.ts`.
 */

import { z } from "zod";

/** Claude Code adapter-specific options (nested under `claudeCode`). */
export const ClaudeCodeConfigSchema = z
  .object({
    binary: z.string(),
    pluginDirs: z.array(z.string()),
    mcpConfig: z.string(),
    permissionMode: z.enum([
      "default",
      "acceptEdits",
      "plan",
      "auto",
      "dontAsk",
      "bypassPermissions",
    ]),
    effort: z.enum(["low", "medium", "high", "xhigh", "max"]),
    pluginUrls: z.array(z.string()),
    addDirs: z.array(z.string()),
    strictMcpConfig: z.boolean(),
    agent: z.string(),
    fallbackModel: z.string(),
    tools: z.string(),
    maxBudgetUsd: z.number().positive(),
    settings: z.string(),
    settingSources: z.string(),
    systemPrompt: z.string(),
    systemPromptFile: z.string(),
    appendSystemPrompt: z.string(),
    appendSystemPromptFile: z.string(),
    debug: z.union([z.string(), z.boolean()]),
    debugFile: z.string(),
    includeHookEvents: z.boolean(),
    noSessionPersistence: z.boolean(),
    disableSlashCommands: z.boolean(),
    bare: z.boolean(),
    safeMode: z.boolean(),
    allowDangerouslySkipPermissions: z.boolean(),
    dangerouslySkipPermissions: z.boolean(),
    allowedTools: z.array(z.string()),
    disallowedTools: z.array(z.string()),
    maxTurns: z.number().int().positive(),
    isolateConfig: z.boolean(),
  })
  .partial();

/** Generic + nested adapter config for one layer (defaultConfig, case, cell). */
export const ConfigPartialSchema = z
  .object({
    model: z.string(),
    cwd: z.string(),
    timeoutMs: z.number().int().positive(),
    env: z.record(z.string(), z.string()),
    claudeCode: ClaudeCodeConfigSchema,
  })
  .partial();

/** A matrix cell — one point in the configuration matrix. */
export const MatrixCellSchema = z.object({
  label: z.string().min(1),
  config: ConfigPartialSchema,
  axes: z.record(z.string(), z.string()).optional(),
});

/** Reference tool call in suite YAML. */
export const ReferenceToolCallSchema = z.object({
  tool_name: z.string().min(1),
  tool_input: z.unknown(),
});

/** Reference trajectory in suite YAML — array of steps or object with mode + steps. */
export const ReferenceTrajectorySchema = z.union([
  z.array(ReferenceToolCallSchema),
  z.object({
    tool_name_mode: z.enum(["harness", "bare"]).optional(),
    steps: z.array(ReferenceToolCallSchema).min(1),
  }),
]);

/** A test case. */
export const TestCaseSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  category: z.string().optional(),
  notes: z.string().optional(),
  expectations: z.array(z.string().min(1)).optional(),
  reference_trajectory: ReferenceTrajectorySchema.optional(),
  human_ratings: z.record(z.string(), z.number()).optional(),
  assertions: z.array(z.unknown()).min(1),
  repetitions: z.number().int().positive().optional(),
  config: ConfigPartialSchema.optional(),
});

/** Top-level suite shape. */
export const TestSuiteSchema = z.object({
  adapter: z.string().optional(),
  defaultConfig: ConfigPartialSchema.optional(),
  matrix: z.array(MatrixCellSchema).min(1),
  cases: z.array(TestCaseSchema).min(1),
});

/** Directory suite root (suite.yaml) — cases may live under cases/ as separate YAML files. */
export const SuiteDirectorySchema = z.object({
  adapter: z.string().optional(),
  defaultConfig: ConfigPartialSchema.optional(),
  matrix: z.array(MatrixCellSchema).min(1),
  cases: z.array(TestCaseSchema).optional(),
});

export type RawTestSuite = z.infer<typeof TestSuiteSchema>;
/** Raw shape of a directory suite root (`suite.yaml` with optional inline cases). */
export type RawSuiteDirectory = z.infer<typeof SuiteDirectorySchema>;
/** Raw shape of one test case before assertion transformation. */
export type RawTestCase = z.infer<typeof TestCaseSchema>;
/** Raw shape of one matrix cell before path resolution. */
export type RawMatrixCell = z.infer<typeof MatrixCellSchema>;
