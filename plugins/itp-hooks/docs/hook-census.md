# hook-census: what the hooks are, what they did, what they cost

> Spoke of [itp-hooks CLAUDE.md](../CLAUDE.md). Code: [`scripts/hook-census.ts`](../scripts/hook-census.ts) and [`scripts/hook-census/`](../scripts/hook-census/); timing: [`hooks/lib/orchestrator-subhook-timing.ts`](../hooks/lib/orchestrator-subhook-timing.ts).

A Claude Code session on a busy machine loads well over a hundred hook registrations from several settings files and plugins, and the four itp-hooks orchestrators run 57 sub-hooks inside them. Nothing recorded what that whole system blocks, lets through or costs: Claude Code writes a transcript record only for a hook that prints something, and the orchestrators measured each sub-hook's time and discarded it. `hook-census` measures it, so a decision to add, consolidate or remove a guard is judged against numbers instead of impressions.

## Commands

```bash
C="$(cc-plugin-root itp-hooks)/scripts/hook-census.ts"
bun "$C" spec                                    # commands and flags as JSON
bun "$C" inventory                               # every handler per event, sub-hooks expanded, launcher diff
bun "$C" outcomes --since 2026-10-17             # denies, asks, contexts, timeouts, errors per guard tag
bun "$C" timing --since 2026-11-16               # p50/p95/max per hook, sub-hook and event; overhead per session
bun "$C" rules --rules ~/.claude/policy/rules.toml --hub-file ~/.claude/CLAUDE.md --exclude-heading '^Fleet rules' \
  --bullet-file <fleet rules file>               # validate a standing-rules file and join its outcomes
bun "$C" report --rules … [the same rule flags]  # everything, to <census dir>/<today>/{*.json,REPORT.md,labels.toml}
bun "$C" window --until-date 2026-11-19          # open the sub-hook timing window (closes itself on that date)
bun "$C" window --close                          # close it early
```

Defaults: config roots `$CLAUDE_CONFIG_DIR` then `~/.claude` (the first is the session's; the two are diffed); transcripts under the first root's `projects/`; the last 30 days; census directory `$ITP_HOOKS_HOOK_CENSUS_DIR` or `~/.claude/state/hook-census`. Every default is a flag.

## Where each number comes from

| Measure                            | Source                                                                                                                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registrations per event and source | `settings.json` of each config root, `enabledPlugins` resolved through `plugins/installed_plugins.json` to each plugin's `hooks/hooks.json`, module-style plugins (`$CLAUDE_CODE_PLUGIN_DIRS`), a project's `.claude/settings*.json`              |
| Sub-hooks and their timeouts       | Static parse of the four registries in the installed orchestrator sources (`BASH_GUARD_REGISTRY`, the two edit-time registries, `SUBHOOKS`); a hook module is never imported, because it runs on import                                           |
| Denies                             | Transcript `type:"user"` records with `permissionDecision {decision:"reject", source:"hook"}`; the guard is the `[TAG]` at the head of `PreToolUse:<Tool> hook error: …`                                                                          |
| Asks answered by the person        | `permissionDecision` with `reasonCode` `hook:<Event>` and a user source                                                                                                                                                                           |
| Context injections                 | `hook_additional_context`; `hook_blocking_error` on PostToolUse and Stop is counted separately as a decision block, which injects context and does not stop the tool                                                                              |
| Timeouts                           | `hook_cancelled` (Claude Code killed the hook) and `[name] timed out after Nms` (an orchestrator gave up on a sub-hook, fail-open)                                                                                                                |
| Hook durations                     | `hook_success.durationMs` (only hooks that printed), `stop_hook_summary.hookInfos` (every Stop hook), the sub-hook timing files, and Claude Code debug logs when present (`Hooks: … finished with status N (Xms)`, which covers silent hooks too) |

Per-event wall time per tool call is the slowest recorded hook of that call, because Claude Code runs a tool's matching hooks in parallel; per-session overhead sums those. Both are lower bounds unless debug logs cover the window, and the report says which sources it had.

## Privacy contract

Outputs hold guard tags (the bracketed head of a message, at most 80 characters, digits in untagged heads replaced by `N`), hook ids (a script's file name, or `inline:<hash>` for an inline shell script), event and tool names, session and tool-use ids, timestamps, counts and milliseconds. Never a command, tool input, file content, prompt or the text after a tag. `labels.toml` samples denies by id only: the operator opens the transcript to judge each one.

The timing records are built from a fixed key list (`SUBHOOK_TIMING_KEYS`); any other field a caller passes is dropped.

## The timing window

`window --until-date D` writes `timing-window.json` with `until`; while that date is in the future, the orchestrators append one line per sub-hook run to `timing-<YYYY-MM-DD>.jsonl` in the census directory. On the date the window closes itself: nothing reads a setting, nothing needs undoing. Each hook process reads the flag once. Any error in recording is swallowed, so a measurement can never change a verdict. Tests run with `ITP_HOOKS_HOOK_CENSUS_DIR` pointed at a throwaway directory (the test preload), so a test run never writes into a live window.

## Limits

- Plugin versions: transcript records keep `${CLAUDE_PLUGIN_ROOT}` unexpanded, so outcomes are not attributed to a plugin version; the inventory reports the installed versions, and debug logs name the version a session ran.
- A silent hook appears in timing only through debug logs or, for orchestrator sub-hooks, the timing window.
- A deny's tag is the guard's own label; two guards sharing a label are counted together.
- Resource use: one process, one transcript at a time; 3 days of transcripts (206 files, 477k lines) took 4.8 s and 195 MB peak RSS on 2026-11-16.
