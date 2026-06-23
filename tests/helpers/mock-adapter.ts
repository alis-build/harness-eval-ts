import type {
  AdapterDiagnostics,
  AdapterResult,
  HarnessAdapter,
} from "../../src/adapters/types";
import type { TrajectoryView } from "../../src/types/trajectory";
import { makeView } from "./factory";

const defaultDiagnostics: AdapterDiagnostics = {
  exitCode: 0,
  signal: null,
  stderr: "",
  parseErrors: [],
  timedOut: false,
  durationMs: 100,
};

export function createMockAdapter(
  view: TrajectoryView = makeView(),
  diagnostics: Partial<AdapterDiagnostics> = {},
): HarnessAdapter {
  return {
    id: "mock",
    run: async () => ({
      view,
      diagnostics: { ...defaultDiagnostics, ...diagnostics },
    }),
  };
}

export function createFailingAdapter(message = "adapter failed"): HarnessAdapter {
  return {
    id: "mock-fail",
    run: async () => {
      throw new Error(message);
    },
  };
}

export function createQueueAdapter(views: TrajectoryView[]): HarnessAdapter {
  const queue = [...views];
  return {
    id: "mock-queue",
    run: async () => {
      const view = queue.shift() ?? makeView();
      return { view, diagnostics: defaultDiagnostics };
    },
  };
}
