/**
 * Tool name pattern matching.
 *
 * Tool names follow conventions:
 *   - Built-in tools: `Bash`, `Read`, `Edit`, `WebSearch`, etc.
 *   - MCP tools:      `mcp__<server>__<tool>`, e.g. `mcp__api__search_skills`.
 *
 * Patterns support `*` as a glob wildcard. The most useful patterns for
 * the skills-loading problem are namespace globs like `mcp__api__*` —
 * "did any tool from the alis MCP server get called."
 */

import type { ToolPattern } from "../types/assertions";

/**
 * Test whether a fully-qualified tool name matches a pattern.
 *
 * Literal patterns (no `*`) match by string equality. Glob patterns are
 * compiled to a regex on each call — fine for our scale (dozens of patterns,
 * thousands of calls per run). If this becomes a hot path, memoize.
 */
export function toolMatches(toolName: string, pattern: ToolPattern): boolean {
  const p = patternString(pattern);
  if (!p.includes("*")) return toolName === p;
  return globToRegex(p).test(toolName);
}

/** Extract the underlying string from either pattern form. */
export function patternString(pattern: ToolPattern): string {
  return typeof pattern === "string" ? pattern : pattern.pattern;
}

/** Human-readable representation for diagnostic messages. */
export function describePattern(pattern: ToolPattern): string {
  return patternString(pattern);
}

/**
 * Convert a glob (with `*` wildcards only) to an anchored regex.
 * Other regex metacharacters in the input are escaped.
 */
function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // escape regex specials
    .replace(/\*/g, ".*"); //                 * → .*
  return new RegExp(`^${escaped}$`);
}
