/**
 * Minimal argv parser — no external deps.
 */

export interface ParsedArgs {
  command?: string;
  positional: string[];
  options: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const options: Record<string, string | boolean> = {};
  let command: string | undefined;

  const args = [...argv];
  if (args.length > 0 && !args[0].startsWith("-")) {
    command = args.shift();
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") {
      positional.push(...args.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("-")) {
        options[key] = next;
        i++;
      } else {
        options[key] = true;
      }
    } else if (arg.startsWith("-") && arg.length === 2) {
      const key = arg.slice(1);
      const next = args[i + 1];
      if (next && !next.startsWith("-")) {
        options[key] = next;
        i++;
      } else {
        options[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  return { command, positional, options };
}

export function getOption(
  options: Record<string, string | boolean>,
  name: string,
): string | undefined {
  const v = options[name];
  return typeof v === "string" ? v : undefined;
}

export function getOptionInt(
  options: Record<string, string | boolean>,
  name: string,
  defaultValue: number,
): number {
  const v = getOption(options, name);
  if (v === undefined) return defaultValue;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return defaultValue;
  return n;
}

export function hasOption(
  options: Record<string, string | boolean>,
  name: string,
): boolean {
  const v = options[name];
  return v === true || (typeof v === "string" && v === "true");
}
