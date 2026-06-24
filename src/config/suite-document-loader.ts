/**
 * Load a unified suite.yaml document (suite + optional judge + pipeline).
 */

import { readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { z } from "zod";

import type { TestCase, TestSuite } from "../runner/types";
import type { SuiteConfig } from "../adapters/types";
import {
  resolveGradingConfigPaths,
  resolvePipelineConfigPaths,
  resolveSuitePaths,
} from "./paths";
import type { PipelineConfig } from "./pipeline-schema";
import { DEFAULT_PIPELINE_OUTPUTS } from "./pipeline-schema";
import { SuiteDirectorySchema, TestSuiteSchema } from "./schema";
import type { RawSuiteFileDirectory } from "./suite-file-schema";
import { SuiteFileDirectorySchema, SuiteFileSingleSchema } from "./suite-file-schema";
import {
  ConfigError,
  transformSuite,
  transformSuiteDirectory,
} from "./transform";
import { collectCaseYamlFiles, parseCasesFile } from "./loader-internals";

type JudgeConfig = SuiteConfig & {
  adapter?: string;
  maxConcurrent?: number;
  system_instruction?: string;
};

import type { SuiteDocument } from "./suite-document";

export type { SuiteDocument } from "./suite-document";

export interface LoadSuiteDocumentOptions {
  /**
   * When true (default), `judge:` and `pipeline:` blocks are validated against
   * their Zod schemas and returned in the result. When false, they are silently
   * stripped — used by {@link loadSuite} so callers that only need the
   * `TestSuite` are not broken by malformed orchestration blocks.
   */
  validateOrchestration?: boolean;
}

/** Load suite.yaml (or directory) including optional judge and pipeline blocks. */
export async function loadSuiteDocument(
  filePath: string,
  options: LoadSuiteDocumentOptions = {},
): Promise<SuiteDocument> {
  const absolutePath = resolve(filePath);
  let info;
  try {
    info = await stat(absolutePath);
  } catch (err) {
    throw new ConfigError(
      `failed to read suite path: ${err instanceof Error ? err.message : String(err)}`,
      filePath,
    );
  }

  const strict = options.validateOrchestration !== false;

  if (info.isDirectory()) {
    return loadSuiteDocumentDirectory(absolutePath, strict);
  }
  return loadSuiteDocumentFile(absolutePath, strict);
}

/** Load suite.yaml from a directory layout (cases under `cases/`). */
async function loadSuiteDocumentDirectory(dir: string, strict: boolean): Promise<SuiteDocument> {
  const suiteYamlPath = join(dir, "suite.yaml");
  let content: string;
  try {
    content = await readFile(suiteYamlPath, "utf8");
  } catch (err) {
    throw new ConfigError(
      `missing suite.yaml in suite directory: ${err instanceof Error ? err.message : String(err)}`,
      dir,
    );
  }

  const { judge, pipeline, suite: base } = parseSuiteFileRoot(
    content,
    suiteYamlPath,
    "directory",
    strict,
  );

  const casesDir = join(dir, "cases");
  const caseFiles = await collectCaseYamlFiles(casesDir);

  type TaggedCase = { relPath: string; index: number; testCase: TestCase };
  const tagged: TaggedCase[] = base.cases.map((testCase, index) => ({
    relPath: "suite.yaml",
    index,
    testCase,
  }));

  for (const filePath of caseFiles) {
    const fileContent = await readFile(filePath, "utf8");
    const cases = parseCasesFile(fileContent, filePath);
    const relPath = relative(casesDir, filePath);
    for (const [index, testCase] of cases.entries()) {
      tagged.push({ relPath, index, testCase });
    }
  }

  tagged.sort((a, b) => {
    const pathCmp = a.relPath.localeCompare(b.relPath);
    if (pathCmp !== 0) return pathCmp;
    return a.index - b.index;
  });

  // Stable order: inline suite.yaml cases first, then cases/*.yaml lexicographically.
  const cases = tagged.map((entry) => entry.testCase);
  if (cases.length === 0) {
    throw new ConfigError("suite directory has no test cases", dir);
  }

  const suite: TestSuite = { ...base, cases };
  resolveSuitePaths(suite, suiteYamlPath);

  return buildSuiteDocument(suiteYamlPath, suite, judge, pipeline);
}

/** Load a single suite.yaml file (inline cases). */
async function loadSuiteDocumentFile(absolutePath: string, strict: boolean): Promise<SuiteDocument> {
  let content: string;
  try {
    content = await readFile(absolutePath, "utf8");
  } catch (err) {
    throw new ConfigError(
      `failed to read suite file: ${err instanceof Error ? err.message : String(err)}`,
      absolutePath,
    );
  }

  const { judge, pipeline, suite } = parseSuiteFileRoot(
    content,
    absolutePath,
    "single",
    strict,
  );
  resolveSuitePaths(suite, absolutePath);
  return buildSuiteDocument(absolutePath, suite, judge, pipeline);
}

/**
 * Parse suite.yaml root and validate against the appropriate schema.
 *
 * When `strict` is true, uses extended schemas that validate `judge:` and
 * `pipeline:` blocks (for `loadSuiteDocument`). When false, uses base schemas
 * that silently strip unknown keys (for `loadSuite`).
 */
function parseSuiteFileRoot(
  yamlContent: string,
  sourcePath: string,
  layout: "directory" | "single",
  strict: boolean,
): {
  suite: TestSuite;
  judge?: JudgeConfig;
  pipeline?: PipelineConfig;
} {
  let raw: unknown;
  try {
    raw = parseYaml(yamlContent);
  } catch (err) {
    throw new ConfigError(
      `YAML parse error: ${err instanceof Error ? err.message : String(err)}`,
      sourcePath,
    );
  }

  if (!strict) {
    const schema = layout === "directory" ? SuiteDirectorySchema : TestSuiteSchema;
    const validated = schema.safeParse(raw);
    if (!validated.success) {
      throw new ConfigError(
        `validation failed:\n${formatZodError(validated.error, sourcePath)}`,
        sourcePath,
      );
    }
    const transform = layout === "directory" ? transformSuiteDirectory : transformSuite;
    return { suite: transform(validated.data as Parameters<typeof transform>[0]) };
  }

  if (layout === "directory") {
    const validated = SuiteFileDirectorySchema.safeParse(raw);
    if (!validated.success) {
      throw new ConfigError(
        `validation failed:\n${formatZodError(validated.error, sourcePath)}`,
        sourcePath,
      );
    }
    return extractSuiteFileParts(validated.data, sourcePath, transformSuiteDirectory);
  }

  const validated = SuiteFileSingleSchema.safeParse(raw);
  if (!validated.success) {
    throw new ConfigError(
      `validation failed:\n${formatZodError(validated.error, sourcePath)}`,
      sourcePath,
    );
  }
  return extractSuiteFileParts(validated.data, sourcePath, transformSuite);
}

/** Split validated YAML into suite, judge, and pipeline with path resolution. */
function extractSuiteFileParts<T extends RawSuiteFileDirectory>(
  data: T,
  sourcePath: string,
  transform: (raw: T) => TestSuite,
): {
  suite: TestSuite;
  judge?: JudgeConfig;
  pipeline?: PipelineConfig;
} {
  const { judge: rawJudge, pipeline: rawPipeline, ...suiteRaw } = data;
  const suite = transform(suiteRaw as T);

  let judge: JudgeConfig | undefined;
  if (rawJudge) {
    judge = { ...rawJudge };
    resolveGradingConfigPaths({ judge }, sourcePath);
  }

  let pipeline: PipelineConfig | undefined;
  if (rawPipeline) {
    pipeline = transformPipelineConfig(rawPipeline);
    pipeline = resolvePipelineConfigPaths(pipeline, sourcePath);
  }

  return { suite, judge, pipeline };
}

/** Apply default artifact filenames when a pipeline step key is present but paths are omitted. */
function transformPipelineConfig(
  raw: NonNullable<RawSuiteFileDirectory["pipeline"]>,
): PipelineConfig {
  const pipeline: PipelineConfig = {};
  if (raw.run !== undefined) {
    pipeline.run = {
      output: raw.run?.output ?? DEFAULT_PIPELINE_OUTPUTS.run,
      maxConcurrent: raw.run?.maxConcurrent,
    };
  }
  if (raw.grade !== undefined) {
    pipeline.grade = {
      input: raw.grade?.input,
      output: raw.grade?.output ?? DEFAULT_PIPELINE_OUTPUTS.grade,
      maxConcurrent: raw.grade?.maxConcurrent,
    };
  }
  if (raw.envelope !== undefined) {
    pipeline.envelope = {
      report: raw.envelope?.report,
      grading: raw.envelope?.grading,
      output: raw.envelope?.output ?? DEFAULT_PIPELINE_OUTPUTS.envelope,
      projection: raw.envelope?.projection ?? "envelope",
      includeRawStreamEvents: raw.envelope?.includeRawStreamEvents,
      noTranscript: raw.envelope?.noTranscript,
    };
  }
  return pipeline;
}

/** Assemble the runtime {@link SuiteDocument} from parsed parts. */
function buildSuiteDocument(
  suitePath: string,
  suite: TestSuite,
  judge?: JudgeConfig,
  pipeline?: PipelineConfig,
): SuiteDocument {
  return {
    suitePath: resolve(suitePath),
    suite,
    judge,
    pipeline,
  };
}

function formatZodError(err: z.ZodError, sourcePath?: string): string {
  return err.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      const prefix = sourcePath ? `${sourcePath} → ${path}` : path;
      return `  ${prefix}: ${issue.message}`;
    })
    .join("\n");
}
