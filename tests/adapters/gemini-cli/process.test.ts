import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GEMINI_CONFIG_DIR_ENV,
  prepareGeminiCliEnv,
  resolveGeminiConfigDir,
  spawnGeminiCli,
} from "../../../src/adapters/gemini-cli/process";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";

const mockSpawn = vi.mocked(spawn);

function mockChild(stdoutData: string) {
  const stdout = Readable.from([stdoutData]);
  const stderr = Object.assign(new EventEmitter(), {
    setEncoding: vi.fn(),
  });
  const child = new EventEmitter() as EventEmitter & {
    stdout: Readable;
    stderr: typeof stderr;
    pid: number;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = stdout;
  child.stderr = stderr;
  child.pid = 42_000;
  child.kill = vi.fn();
  queueMicrotask(() => {
    child.emit("close", 0, null);
    stderr.emit("end");
  });
  return child;
}

describe("resolveGeminiConfigDir", () => {
  it("returns undefined when isolateConfig is false", () => {
    expect(resolveGeminiConfigDir({ isolateConfig: false }, "/tmp/x")).toBeUndefined();
    expect(resolveGeminiConfigDir({}, "/tmp/x")).toBeUndefined();
  });

  it("returns temp dir when isolateConfig is true", () => {
    expect(resolveGeminiConfigDir({ isolateConfig: true }, "/tmp/gemini-home")).toBe(
      "/tmp/gemini-home",
    );
  });
});

describe("prepareGeminiCliEnv", () => {
  it("sets GEMINI_CONFIG_DIR when isolateConfig is true", async () => {
    const { env, cleanup } = await prepareGeminiCliEnv({ isolateConfig: true });
    expect(env[GEMINI_CONFIG_DIR_ENV]).toBeTruthy();
    await cleanup();
  });

  it("does not set GEMINI_CONFIG_DIR by default", async () => {
    const { env, cleanup } = await prepareGeminiCliEnv({});
    expect(env[GEMINI_CONFIG_DIR_ENV]).toBeUndefined();
    await cleanup();
  });
});

describe("spawnGeminiCli", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("spawns gemini with stream-json args", async () => {
    mockSpawn.mockReturnValue(mockChild("") as never);

    await spawnGeminiCli({ prompt: "hello" });

    expect(mockSpawn).toHaveBeenCalledOnce();
    const [binary, args, options] = mockSpawn.mock.calls[0]!;
    expect(binary).toBe("gemini");
    expect(args).toContain("--output-format");
    expect(args).toContain("stream-json");
    expect(args).toContain("-p");
    expect(args).toContain("hello");
    expect(options?.stdio).toEqual(["ignore", "pipe", "pipe"]);
  });

  it("sets GEMINI_CONFIG_DIR when isolateConfig is true", async () => {
    mockSpawn.mockReturnValue(mockChild("") as never);

    await spawnGeminiCli({ prompt: "hello", isolateConfig: true });

    const [, , options] = mockSpawn.mock.calls[0]!;
    expect(options?.env?.[GEMINI_CONFIG_DIR_ENV]).toBeTruthy();
  });

  it("does not set GEMINI_CONFIG_DIR by default", async () => {
    mockSpawn.mockReturnValue(mockChild("") as never);

    await spawnGeminiCli({ prompt: "hello" });

    const [, , options] = mockSpawn.mock.calls[0]!;
    const env = options?.env ?? {};
    expect(env[GEMINI_CONFIG_DIR_ENV]).toBeUndefined();
  });
});
