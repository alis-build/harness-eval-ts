/**
 * Zod schema for standalone grading YAML (`grading.yaml`).
 *
 * The top-level `judge` block reuses {@link ConfigPartialSchema} fields plus
 * grader-specific concurrency and system-instruction overrides.
 */

import { z } from "zod";

import { ConfigPartialSchema } from "./schema";

/** Top-level `judge` block — mirrors harness config fields plus grader concurrency. */
export const JudgeConfigSchema = ConfigPartialSchema.extend({
  adapter: z.string().optional(),
  maxConcurrent: z.number().int().positive().optional(),
  /** Optional judge prompt prefix (maps to upstream system_instruction). */
  system_instruction: z.string().optional(),
});

export const GradingConfigSchema = z.object({
  judge: JudgeConfigSchema,
});

export type RawGradingConfig = z.infer<typeof GradingConfigSchema>;
/** Raw shape of the nested `judge` block before path resolution. */
export type RawJudgeConfig = z.infer<typeof JudgeConfigSchema>;
