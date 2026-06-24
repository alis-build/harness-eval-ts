/**
 * Superset suite.yaml schemas including optional `judge:` and `pipeline:` blocks.
 *
 * Kept separate from `schema.ts` to avoid a circular import with `grading-schema.ts`.
 */

import { z } from "zod";

import { JudgeConfigSchema } from "./grading-schema";
import { PipelineConfigSchema } from "./pipeline-schema";
import { SuiteDirectorySchema, TestSuiteSchema } from "./schema";

/** Single-file suite with optional inline judge and pipeline orchestration. */
export const SuiteFileSingleSchema = TestSuiteSchema.extend({
  judge: JudgeConfigSchema.optional(),
  pipeline: PipelineConfigSchema.optional(),
});

/** Directory suite root with optional inline judge and pipeline orchestration. */
export const SuiteFileDirectorySchema = SuiteDirectorySchema.extend({
  judge: JudgeConfigSchema.optional(),
  pipeline: PipelineConfigSchema.optional(),
});

/** Validated single-file suite.yaml root (suite fields + optional judge/pipeline). */
export type RawSuiteFileSingle = z.infer<typeof SuiteFileSingleSchema>;
/** Validated directory suite.yaml root (matrix + optional judge/pipeline). */
export type RawSuiteFileDirectory = z.infer<typeof SuiteFileDirectorySchema>;
