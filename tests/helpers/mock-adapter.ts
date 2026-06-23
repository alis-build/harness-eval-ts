/**
 * Mock harness adapters for unit and integration tests.
 *
 * Returns deterministic {@link TrajectoryView} results without spawning
 * Claude Code or other real harness processes.
 */

import type {
  AdapterDiagnostics,
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

/**
 * Adapter that always returns a fixed trajectory view.
 *
 * @param view - Trajectory to return from every `run` call.
 * @param diagnostics - Partial diagnostics merged over defaults.
 */
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

/** Adapter that throws on every run — simulates harness startup failures. */
export function createFailingAdapter(message = "adapter failed"): HarnessAdapter {
  return {
    id: "mock-fail",
    run: async () => {
      throw new Error(message);
    },
  };
}

/**
 * Adapter that returns a different view on each run (FIFO queue).
 *
 * When the queue is exhausted, falls back to {@link makeView}.
 */
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
