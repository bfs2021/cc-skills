/**
 * Turn a hook `command` string into a stable, payload-free hook id (the script's file name).
 *
 * Port of parseHookCommand in scripts/validate-plugins.mjs, whose SSoT is tasks/lib/hook-command-parsing.sh: it
 * strips an `env` prefix, skips interpreter flags and a `run` subcommand, and takes the next token as the script.
 * command.test.ts fails when HOOK_COMMAND_INTERPRETERS drifts from the validator's set.
 *
 * Added here: an inline shell script (`bash -c '…'`, `sh -lc …`) has no script file, so its id is
 * `inline:<hash>` of the command; the command text itself never leaves this module.
 */
import { basename } from "node:path";

export const HOOK_COMMAND_INTERPRETERS = new Set([
  "bun",
  "bunx",
  "node",
  "go",
  "gofmt",
  "moon",
  "moonx",
  "zig",
  "deno",
  "npx",
  "bash",
  "sh",
  "zsh",
  "python",
  "python3",
  "uv",
  "uvx",
]);

const SHELLS = new Set(["bash", "sh", "zsh"]);
const ENV_OPTIONS_TAKING_A_SEPARATE_ARGUMENT = new Set(["-u", "--unset", "-C", "--chdir", "-S", "--split-string"]);

function stripEnvPrefix(tokens: string[]): string[] {
  if (tokens.length === 0 || tokens[0]?.split("/").pop() !== "env") return tokens;
  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i] ?? "";
    if (ENV_OPTIONS_TAKING_A_SEPARATE_ARGUMENT.has(token)) {
      i += 2;
      continue;
    }
    if (token.startsWith("-") || token.includes("=")) {
      i += 1;
      continue;
    }
    break;
  }
  const rest = tokens.slice(i);
  return rest.length < tokens.length ? stripEnvPrefix(rest) : rest;
}

export interface ParsedHookCommand {
  interpreter: string | null;
  scriptToken: string | null;
  inline: boolean;
}

export function parseHookCommand(command: string): ParsedHookCommand {
  const tokens = stripEnvPrefix(
    command
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.replace(/["']/g, "")),
  );
  if (tokens.length === 0) return { interpreter: null, scriptToken: null, inline: false };
  const head = tokens[0]?.split("/").pop() ?? "";
  if (!HOOK_COMMAND_INTERPRETERS.has(head)) return { interpreter: null, scriptToken: tokens[0] ?? null, inline: false };
  let i = 1;
  while (i < tokens.length && ((tokens[i] ?? "").startsWith("-") || tokens[i] === "run")) {
    const flag = tokens[i] ?? "";
    if (SHELLS.has(head) && /^-[a-z]*c[a-z]*$/.test(flag)) return { interpreter: head, scriptToken: null, inline: true };
    i += 1;
  }
  return { interpreter: head, scriptToken: tokens[i] ?? null, inline: false };
}

/** A short, stable hash so an inline command can be counted without being stored. */
export function shortHash(text: string): string {
  return Bun.hash(text).toString(16).slice(0, 10);
}

/** The id a hook is counted under: its script file name, or inline:<hash> for an inline shell script. */
export function hookIdFromCommand(command: string): string {
  const parsed = parseHookCommand(command);
  if (parsed.inline || !parsed.scriptToken) return `inline:${shortHash(command)}`;
  return basename(parsed.scriptToken);
}
