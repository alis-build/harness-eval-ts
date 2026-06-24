/**
 * Zod schemas for optional `pipeline:` block in suite.yaml.
 *
 * Step presence under `pipeline` enables orchestration via `harness-eval pipeline`.
 */

import { z } from "zod";

/** `pipeline.run` step — harness eval run. */
export const PipelineRunStepSchema = z
  .object({
    output: z.string().min(1).optional(),
    maxConcurrent: z.number().int().positive().optional(),
  })
  .optional();

/** `pipeline.grade` step — LLM outcome grading. */
export const PipelineGradeStepSchema = z
  .object({
    input: z.string().min(1).optional(),
    output: z.string().min(1).optional(),
    maxConcurrent: z.number().int().positive().optional(),
  })
  .optional();

/** `pipeline.envelope` step — EvalRunEnvelope export. */
export const PipelineEnvelopeStepSchema = z
  .object({
    report: z.string().min(1).optional(),
    grading: z.string().min(1).optional(),
    output: z.string().min(1).optional(),
    projection: z.enum(["envelope", "trajectory", "instances"]).optional(),
    includeRawStreamEvents: z.boolean().optional(),
    noTranscript: z.boolean().optional(),
  })
  .optional();

/** Top-level optional pipeline block in suite.yaml. */
export const PipelineConfigSchema = z
  .object({
    run: PipelineRunStepSchema,
    grade: PipelineGradeStepSchema,
    envelope: PipelineEnvelopeStepSchema,
  })
  .partial();

/** Validated YAML shape for the optional `pipeline:` block. */
export type RawPipelineConfig = z.infer<typeof PipelineConfigSchema>;
/** Validated YAML shape for `pipeline.run`. */
export type RawPipelineRunStep = z.infer<typeof PipelineRunStepSchema>;
/** Validated YAML shape for `pipeline.grade`. */
export type RawPipelineGradeStep = z.infer<typeof PipelineGradeStepSchema>;
/** Validated YAML shape for `pipeline.envelope`. */
export type RawPipelineEnvelopeStep = z.infer<typeof PipelineEnvelopeStepSchema>;

/** Runtime pipeline config with resolved absolute paths. */
export interface PipelineConfig {
  run?: PipelineRunStep;
  grade?: PipelineGradeStep;
  envelope?: PipelineEnvelopeStep;
}

/** Resolved `pipeline.run` step — harness eval run output path. */
export interface PipelineRunStep {
  output: string;
  maxConcurrent?: number;
}

/** Resolved `pipeline.grade` step — LLM outcome grading inputs and output. */
export interface PipelineGradeStep {
  input?: string;
  output: string;
  maxConcurrent?: number;
}

/** Resolved `pipeline.envelope` step — EvalRunEnvelope export options. */
export interface PipelineEnvelopeStep {
  report?: string;
  grading?: string;
  output: string;
  projection: "envelope" | "trajectory" | "instances";
  includeRawStreamEvents?: boolean;
  noTranscript?: boolean;
}

/** Default artifact filenames relative to the suite.yaml directory. */
export const DEFAULT_PIPELINE_OUTPUTS = {
  run: "report.json",
  grade: "grading.json",
  envelope: "envelope.json",
} as const;
