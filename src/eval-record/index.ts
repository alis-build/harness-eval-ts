/**
 * Eval record envelope builders — public re-exports.
 *
 * Primary entry for converting runner reports into {@link EvalRunEnvelope}
 * documents. Schema version constants are exported for consumers validating
 * envelope JSON.
 */

export {
  buildEvalRunEnvelope,
  buildEvalRunEnvelopeFromFiles,
} from "./build";
export {
  EVAL_RUN_SCHEMA_VERSION,
  TRAJECTORY_SCHEMA_VERSION,
} from "../types/eval-record";
