import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChildProcess } from "node:child_process";

const spawnMock = vi.fn();

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

import { killTree, spawnCollectStdout } from "../../src/grader/spawn-judge";

function mockChild(pid = 42_424): {
  child: ChildProcess;
  stdout: PassThrough;
  stderr: PassThrough;
} {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const child = new EventEmitter() as ChildProcess;
  child.stdout = stdout;
  child.stderr = stderr;
  child.pid = pid;
  child.kill = vi.fn();
  return { child, stdout, stderr };
}

describe("spawnCollectStdout", () => {
  beforeEach(() => {
    spawnMock.mockReset();
    vi.spyOn(process, "kill").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("collects stdout on successful exit", async () => {
    spawnMock.mockImplementation(() => {
      const { child, stdout } = mockChild();
      queueMicrotask(() => {
        stdout.write('{"passed":true}');
        stdout.end();
        child.emit("close", 0);
      });
      return child;
    });

    const output = await spawnCollectStdout({
      binary: "fake-grader",
      args: ["--json"],
      timeoutMs: 5_000,
    });

    expect(output).toBe('{"passed":true}');
    expect(spawnMock).toHaveBeenCalledWith(
      "fake-grader",
      ["--json"],
      expect.objectContaining({ detached: true, stdio: ["ignore", "pipe", "pipe"] }),
    );
  });

  it("rejects on timeout and sends SIGTERM to the process group", async () => {
    vi.useFakeTimers();
    const pid = 99_001;
    spawnMock.mockImplementation(() => mockChild(pid).child);

    const promise = spawnCollectStdout({
      binary: "slow-grader",
      args: [],
      timeoutMs: 100,
    });

    const rejection = expect(promise).rejects.toThrow(/timed out after 100ms/);
    await vi.advanceTimersByTimeAsync(100);
    await rejection;

    expect(process.kill).toHaveBeenCalledWith(-pid, "SIGTERM");
  });

  it("escalates to SIGKILL after grace period on timeout", async () => {
    vi.useFakeTimers();
    const pid = 99_002;
    spawnMock.mockImplementation(() => mockChild(pid).child);

    const promise = spawnCollectStdout({
      binary: "slow-grader",
      args: [],
      timeoutMs: 100,
    });

    const rejection = expect(promise).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(5_000);
    await rejection;

    expect(process.kill).toHaveBeenCalledWith(-pid, "SIGTERM");
    expect(process.kill).toHaveBeenCalledWith(-pid, "SIGKILL");
  });
});

describe("killTree", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to child.kill when process group kill fails", () => {
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw new Error("ESRCH");
    });

    const child = new EventEmitter() as ChildProcess;
    child.pid = 12_345;
    child.kill = vi.fn();

    killTree(child, "SIGTERM");

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });
});
