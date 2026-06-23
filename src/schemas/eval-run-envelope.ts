/**
 * Zod schemas for {@link EvalRunEnvelope} and related types.
 * JSON Schema is generated from these at build time — see `src/schemas/generate.ts`.
 */

import { z } from "zod";

import { EVAL_RUN_SCHEMA_VERSION } from "../types/eval-record";
import {
  agentTraceSchema,
  interchangeToolCallSchema,
  tabularToolCallSchema,
} from "./eval-interchange";
import { described, field } from "./meta";
import { toolCallSchema, trajectoryViewExportSchema } from "./trajectory-view";

export const trajectoryMetricsSchema = described(
  z.object({
    trajectory_exact_match: field(z.number(), "Exact trajectory match score (0 or 1)."),
    trajectory_in_order_match: field(
      z.number(),
      "In-order trajectory match score (0 or 1).",
    ),
    trajectory_any_order_match: field(
      z.number(),
      "Any-order trajectory match score (0 or 1).",
    ),
    trajectory_precision: field(z.number(), "Trajectory precision (0..1)."),
    trajectory_recall: field(z.number(), "Trajectory recall (0..1)."),
    trajectory_single_tool_use: field(
      z.number(),
      "Single-tool-use match score (0 or 1).",
    ),
  }),
  {
    id: "TrajectoryMetrics",
    title: "TrajectoryMetrics",
    description: "Trajectory-level metric scores for one repetition.",
  },
);

export const toolCallMetricsSchema = described(
  z.object({
    tool_call_valid: field(z.number(), "Tool call validity score (0..1)."),
    tool_name_match: field(z.number(), "Tool name match score (0..1)."),
    tool_parameter_key_match: field(
      z.number(),
      "Tool parameter key match score (0..1).",
    ),
    tool_parameter_kv_match: field(
      z.number(),
      "Tool parameter key-value match score (0..1).",
    ),
  }),
  {
    id: "ToolCallMetrics",
    title: "ToolCallMetrics",
    description: "Tool-call-level metric scores for one repetition.",
  },
);

export const suiteReferenceSchema = described(
  z.object({
    uri: field(
      z.string().optional(),
      "Absolute or repo-relative path to the suite YAML that produced this run.",
      ["examples/basic.yaml"],
    ),
    id: field(
      z.string().optional(),
      "Stable suite identifier when known (e.g. bundle or catalog name).",
    ),
    contentHash: field(
      z.string().optional(),
      "Hash of suite file contents (SHA-256 hex) for reproducibility.",
    ),
  }),
  {
    id: "SuiteReference",
    title: "SuiteReference",
    description: "Link to the eval suite specification that produced this run.",
  },
);

export const harnessInfoSchema = described(
  z.object({
    adapter: field(
      z.string(),
      "Harness adapter id from suite YAML, e.g. claude-code.",
      ["claude-code"],
    ),
    frameworkVersion: field(
      z.string().optional(),
      "harness-eval package version when the envelope was built.",
    ),
    harnessVersion: field(
      z.string().optional(),
      "Optional harness CLI version string (e.g. claude -v output).",
    ),
  }),
  {
    id: "HarnessInfo",
    title: "HarnessInfo",
    description: "Harness adapter and version metadata for the run.",
  },
);

export const ciProvenanceSchema = described(
  z.object({
    provider: field(
      z.string().optional(),
      "CI provider name, e.g. github-actions or gitlab-ci.",
    ),
    jobId: field(z.string().optional(), "CI job or run identifier."),
    pipelineId: field(z.string().optional(), "CI pipeline or workflow identifier."),
    url: field(z.string().optional(), "URL to the CI job run page."),
  }),
  {
    id: "CiProvenance",
    title: "CiProvenance",
    description: "CI job metadata for correlating eval runs with pipelines.",
  },
);

export const gitProvenanceSchema = described(
  z.object({
    commit: field(z.string().optional(), "Git commit SHA at time of run."),
    branch: field(z.string().optional(), "Git branch name."),
    repository: field(
      z.string().optional(),
      "Repository slug or URL, e.g. alis-build/harness-eval-ts.",
    ),
  }),
  {
    id: "GitProvenance",
    title: "GitProvenance",
    description: "Git coordinates for the code under evaluation.",
  },
);

export const evalProvenanceSchema = described(
  z
    .object({
      runId: field(
        z.string().optional(),
        "Optional duplicate of envelope runId for nested provenance blobs.",
      ),
      ci: field(ciProvenanceSchema.optional(), "CI metadata when run from a pipeline."),
      git: field(gitProvenanceSchema.optional(), "Git metadata when run from a repo."),
      pluginVersion: field(
        z.string().optional(),
        "Version of the plugin or MCP bundle under test.",
      ),
      triggeredBy: field(
        z.string().optional(),
        "Actor or trigger source, e.g. user id, schedule, or pull_request.",
      ),
    })
    .catchall(z.unknown()),
  {
    id: "EvalProvenance",
    title: "EvalProvenance",
    description:
      "CI, git, and runtime provenance for DB correlation. Additional keys allowed.",
  },
);

export const evalRunSummarySchema = described(
  z.object({
    cellsTotal: field(
      z.number().int().min(0),
      "Number of matrix cells (case × config) in this run.",
    ),
    cellsPassed: field(
      z.number().int().min(0),
      "Cells that passed all behavioral assertion thresholds.",
    ),
    behavioralPass: field(
      z.boolean(),
      "True when every cell passed behavioral assertion thresholds.",
    ),
    outcomePass: field(
      z.boolean().optional(),
      "True when every graded cell passed all outcome expectations. Omitted if not graded.",
    ),
  }),
  {
    id: "EvalRunSummary",
    title: "EvalRunSummary",
    description: "Aggregate pass/fail summary for CI gates and dashboards.",
  },
);

export const judgeInfoSchema = described(
  z.object({
    id: field(
      z.string(),
      "Stable judge identifier, e.g. harness-eval/claude-grader or langsmith/my-judge.",
    ),
    model: field(z.string().optional(), "Model used by the judge, when applicable."),
    version: field(z.string().optional(), "Judge or grader package version."),
  }),
  {
    id: "JudgeInfo",
    title: "JudgeInfo",
    description: "Identity of the judge that produced outcome grades.",
  },
);

export const gradedExpectationSchema = described(
  z.object({
    text: field(z.string(), "Natural-language expectation that was graded."),
    passed: field(z.boolean(), "Whether the judge deemed this expectation satisfied."),
    evidence: field(
      z.string(),
      "Judge explanation citing transcript or trajectory evidence.",
    ),
  }),
  {
    id: "GradedExpectation",
    title: "GradedExpectation",
    description: "Outcome grade for one natural-language expectation.",
  },
);

export const gradingSummarySchema = described(
  z.object({
    passed: field(z.number().int().min(0), "Count of expectations that passed."),
    failed: field(z.number().int().min(0), "Count of expectations that failed."),
    total: field(z.number().int().min(0), "Total expectations graded."),
    passRate: field(
      z.number().min(0).max(1),
      "Fraction of expectations that passed (0..1).",
    ),
  }),
  {
    id: "GradingSummary",
    title: "GradingSummary",
    description: "Aggregate counts for a set of graded expectations.",
  },
);

export const evalFeedbackSuggestionSchema = described(
  z.object({
    assertion: field(
      z.string().optional(),
      "Related assertion or expectation text, when the suggestion targets one.",
    ),
    reason: field(z.string(), "Why the judge suggests changing the suite or assertions."),
  }),
  {
    id: "EvalFeedbackSuggestion",
    title: "EvalFeedbackSuggestion",
    description: "Actionable suggestion from eval feedback.",
  },
);

export const evalFeedbackSchema = described(
  z.object({
    suggestions: field(
      z.array(evalFeedbackSuggestionSchema),
      "Per-item suggestions for improving the suite or expectations.",
    ),
    overall: field(z.string(), "Overall narrative feedback from the judge."),
  }),
  {
    id: "EvalFeedback",
    title: "EvalFeedback",
    description: "Structured eval feedback from the outcome judge.",
  },
);

export const outcomeGradesSchema = described(
  z.object({
    judge: field(judgeInfoSchema, "Judge that produced these grades."),
    expectations: field(
      z.array(gradedExpectationSchema),
      "Per-expectation pass/fail with evidence.",
    ),
    summary: field(gradingSummarySchema, "Aggregate pass/fail counts."),
    evalFeedback: field(
      evalFeedbackSchema.optional(),
      "Optional structured feedback for suite authors.",
    ),
    error: field(
      z.string().optional(),
      "Error message when grading failed for this repetition.",
    ),
  }),
  {
    id: "OutcomeGrades",
    title: "OutcomeGrades",
    description:
      "Outcome grades for one repetition from the built-in or external LLM judge.",
  },
);

export const externalScoreSchema = described(
  z.object({
    source: field(
      z.string(),
      "External framework identifier, e.g. langsmith or braintrust.",
    ),
    metric: field(z.string(), "Metric name within the external framework."),
    value: field(
      z.union([z.number(), z.boolean(), z.string()]),
      "Metric value (numeric score, boolean pass, or categorical label).",
    ),
    metadata: field(
      z.record(z.string(), z.unknown()).optional(),
      "Framework-specific metadata (run ids, trace urls, etc.).",
    ),
  }),
  {
    id: "ExternalScore",
    title: "ExternalScore",
    description: "Score attached from an external eval platform without replacing OutcomeGrades.",
  },
);

export const parseErrorRecordSchema = described(
  z.object({
    line: field(z.string(), "Raw line from harness output that failed to parse."),
    error: field(z.string(), "Parse error message."),
  }),
  {
    id: "ParseErrorRecord",
    title: "ParseErrorRecord",
    description: "One stream-json or adapter output parse failure.",
  },
);

export const adapterDiagnosticsSchema = described(
  z.object({
    exitCode: field(
      z.number().nullable().optional(),
      "Child process exit code, or null if not available.",
    ),
    signal: field(
      z.string().nullable().optional(),
      "Termination signal when the harness process was signaled.",
    ),
    stderr: field(z.string().optional(), "Captured stderr from the harness process."),
    parseErrors: field(
      z.array(parseErrorRecordSchema).optional(),
      "Parse errors from adapter output handling.",
    ),
    timedOut: field(z.boolean().optional(), "Whether the harness run hit the configured timeout."),
    durationMs: field(
      z.number().optional(),
      "Harness process duration in milliseconds.",
    ),
  }),
  {
    id: "AdapterDiagnostics",
    title: "AdapterDiagnostics",
    description: "Process-level diagnostics from the harness adapter.",
  },
);

export const evalArtifactsSchema = described(
  z.object({
    rawStreamEvents: field(
      z.array(z.unknown()).optional(),
      "Claude Code stream-json lines — debug only, not cross-harness. Prefer transcript for judges.",
    ),
    otlpTraceUri: field(
      z.string().optional(),
      "URI to an OTLP trace blob (S3, GCS, etc.) when exported separately.",
    ),
    transcript: field(
      z.string().optional(),
      "Text transcript for judges (trajectoryToTranscript output).",
    ),
  }),
  {
    id: "EvalArtifacts",
    title: "EvalArtifacts",
    description:
      "Optional large or vendor-specific blobs. Store by reference in DB when possible.",
  },
);

export const assertionResultSchema: z.ZodType<{
  passed: boolean;
  description: string;
  details: string;
  matches?: z.infer<typeof toolCallSchema>[];
  children?: unknown[];
}> = z.lazy(() =>
  described(
    z.object({
      passed: field(z.boolean(), "Whether this assertion node passed."),
      description: field(
        z.string(),
        "Short human-readable name, e.g. called(mcp__api__SearchSkills, >= 1).",
      ),
      details: field(z.string(), "Diagnostic detail explaining pass or fail."),
      matches: field(
        z.array(toolCallSchema).optional(),
        "Tool calls that satisfied (or could have satisfied) this assertion.",
      ),
      children: field(
        z.array(assertionResultSchema).optional(),
        "Sub-results for compound assertions (and/or/not).",
      ),
    }),
    {
      id: "AssertionResult",
      title: "AssertionResult",
      description: "Result of evaluating one assertion, optionally with child nodes.",
    },
  ),
);

export const repetitionErrorSchema = described(
  z.object({
    message: field(z.string(), "Harness failure message for this repetition."),
    diagnostics: field(
      adapterDiagnosticsSchema.optional(),
      "Adapter diagnostics when the harness failed before producing a trajectory.",
    ),
  }),
  {
    id: "RepetitionError",
    title: "RepetitionError",
    description: "Harness failure for one repetition without a usable TrajectoryView.",
  },
);

export const evalAssertionStatSchema = described(
  z.object({
    description: field(z.string(), "Assertion description aggregated across repetitions."),
    threshold: field(
      z.number().min(0).max(1),
      "Minimum pass rate required across repetitions (0..1).",
    ),
    passedCount: field(z.number().int().min(0), "Repetitions where this assertion passed."),
    evaluatedCount: field(
      z.number().int().min(0),
      "Repetitions included in the denominator (excludes adapter errors).",
    ),
    passRate: field(z.number().min(0).max(1), "passedCount / evaluatedCount."),
    meetsThreshold: field(
      z.boolean(),
      "Whether passRate meets or exceeds threshold.",
    ),
  }),
  {
    id: "EvalAssertionStat",
    title: "EvalAssertionStat",
    description: "Behavioral assertion statistics for one assertion in a matrix cell.",
  },
);

export const evalRepetitionSchema = described(
  z.object({
    repetitionIndex: field(
      z.number().int().min(0),
      "Zero-based index of this repetition within the cell.",
    ),
    durationMs: field(
      z.number().int().min(0),
      "Wall time for this repetition in milliseconds.",
    ),
    trajectory: field(
      trajectoryViewExportSchema.optional(),
      "Normalized harness session when the run completed with a view.",
    ),
    diagnostics: field(
      adapterDiagnosticsSchema.optional(),
      "Adapter process diagnostics for this repetition.",
    ),
    assertionResults: field(
      z.array(assertionResultSchema),
      "Deterministic behavioral assertion results for this repetition.",
    ),
    outcomeGrades: field(
      outcomeGradesSchema.optional(),
      "LLM or custom judge outcome grades when grading was run.",
    ),
    externalScores: field(
      z.array(externalScoreSchema).optional(),
      "Scores from external eval frameworks (LangSmith, Braintrust, etc.).",
    ),
    artifacts: field(
      evalArtifactsSchema.optional(),
      "Optional transcript, raw stream, or OTLP URI artifacts.",
    ),
    predicted_trajectory: field(
      z.array(interchangeToolCallSchema).optional(),
      "Predicted tool-call trajectory in interchange wire format.",
    ),
    agent_trace: field(
      agentTraceSchema.optional(),
      "Full multi-turn agent trace in interchange format.",
    ),
    latency_in_seconds: field(
      z.number().optional(),
      "Session latency in seconds (interchange field).",
    ),
    failure: field(
      z.union([z.literal(0), z.literal(1)]).optional(),
      "1 when the harness run failed, 0 on success.",
    ),
    trajectoryMetrics: field(
      trajectoryMetricsSchema.optional(),
      "Trajectory-level metrics when reference_trajectory is provided.",
    ),
    toolCallMetrics: field(
      toolCallMetricsSchema.optional(),
      "Tool-call-level metrics when reference_trajectory is provided.",
    ),
    error: field(
      repetitionErrorSchema.optional(),
      "Present when the harness failed without producing a trajectory.",
    ),
  }),
  {
    id: "EvalRepetition",
    title: "EvalRepetition",
    description:
      "One harness invocation — the unit external judges and trajectory queries use.",
  },
);

export const evalCellResultSchema = described(
  z.object({
    caseId: field(z.string(), "Test case id from the suite YAML."),
    category: field(z.string().optional(), "Optional case category for reporting."),
    notes: field(z.string().optional(), "Author notes copied from the suite."),
    prompt: field(z.string().optional(), "Prompt sent to the harness for this case."),
    expectations: field(
      z.array(z.string()).optional(),
      "Natural-language outcome expectations for grading.",
    ),
    reference_trajectory: field(
      z.array(tabularToolCallSchema).optional(),
      "Reference tool-call trajectory for metric computation.",
    ),
    human_ratings: field(
      z.record(z.string(), z.number()).optional(),
      "Human ratings keyed by metric name for judge calibration.",
    ),
    cellLabel: field(
      z.string(),
      "Matrix cell label, e.g. sonnet or opus-marketplace.",
    ),
    axes: field(
      z.record(z.string(), z.string()).optional(),
      "Matrix axis values for this cell (model, plugin source, etc.).",
    ),
    assertionStats: field(
      z.array(evalAssertionStatSchema),
      "Per-assertion pass rates across repetitions in this cell.",
    ),
    adapterErrors: field(
      z.number().int().min(0),
      "Repetitions excluded from assertion denominators due to harness failure.",
    ),
    behavioralPass: field(
      z.boolean(),
      "Cell passed all behavioral assertion thresholds.",
    ),
    outcomePass: field(
      z.boolean().optional(),
      "Cell passed all outcome expectations when graded. Omitted if not graded.",
    ),
    repetitions: field(
      z.array(evalRepetitionSchema),
      "Individual harness runs for statistical eval.",
    ),
  }),
  {
    id: "EvalCellResult",
    title: "EvalCellResult",
    description: "Result for one test case × matrix cell combination.",
  },
);

export const evalRunEnvelopeSchema = described(
  z.object({
    schemaVersion: field(
      z.literal(EVAL_RUN_SCHEMA_VERSION),
      "EvalRunEnvelope schema version. Bump on breaking JSON changes.",
    ),
    runId: field(
      z.uuid(),
      "Unique identifier for this eval run (UUID).",
      ["00000000-0000-4000-8000-000000000001"],
    ),
    startedAt: field(
      z.string(),
      "ISO 8601 timestamp when the run started.",
      ["2026-06-23T12:00:00.000Z"],
    ),
    durationMs: field(
      z.number().int().min(0),
      "Total wall time for the run in milliseconds.",
    ),
    suite: field(
      suiteReferenceSchema.optional(),
      "Reference to the suite YAML that defined this run.",
    ),
    harness: field(harnessInfoSchema, "Harness adapter that executed the run."),
    provenance: field(
      evalProvenanceSchema.optional(),
      "CI, git, and runtime provenance for correlation.",
    ),
    summary: field(evalRunSummarySchema, "Aggregate behavioral and outcome pass summary."),
    cells: field(
      z.array(evalCellResultSchema),
      "Results for each test case × matrix cell.",
    ),
  }),
  {
    id: "EvalRunEnvelope",
    title: "EvalRunEnvelope",
    description:
      "Cross-harness eval run record for CI/CD, APIs, and databases. Not vendor stream-json or OTLP.",
  },
);

export type EvalRunEnvelopeZod = z.infer<typeof evalRunEnvelopeSchema>;
