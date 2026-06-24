/**
 * Runtime types for a unified suite.yaml document (suite + judge + pipeline).
 */

import type { GradingConfig } from "./grading-loader";
import type { PipelineConfig } from "./pipeline-schema";
import type { TestSuite } from "../runner/types";

/** Parsed suite.yaml including optional orchestration blocks. */
export interface SuiteDocument {
  /** Absolute path to the suite.yaml file. */
  suitePath: string;
  suite: TestSuite;
  judge?: GradingConfig["judge"];
  pipeline?: PipelineConfig;
}
