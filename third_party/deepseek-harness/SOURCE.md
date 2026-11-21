# Source: DeepSeek Harness

Repository: https://github.com/deepseek-ai/deepseek-harness
Commit: 2e39e70496aa02986ca6a820c5d497e816b69d7e
License: MIT

Copied on 21 November 2026. The `LICENSE` here is the repository's MIT licence (DeepSeek). DeepSeek Harness is built on its own plugin system (Cordis) and session log, which Daksha does not use, so its code was adapted into Daksha's own folders instead of being copied whole. Each adapted file starts with a comment naming its upstream path, this commit and the licence. No DeepSeek Harness package is a dependency.

## Copied

| Upstream path | Now in Daksha |
|---|---|
| `packages/skill/skill-filesystem/src/index.ts` (frontmatter parsing, root discovery, invocation fields) | `os/packages/skills/src/loader.ts` |
| `packages/skill/skill/src/index.ts` (`isSkillName`, `renderSkillContent`, `escapeText`) | `os/packages/skills/src/loader.ts` |
| `packages/guard/repeat-tool-reminder/src/index.ts` (reminder texts, canonical arguments, thresholds, include and exclude patterns) | `os/apps/server/src/engine/guards.ts` |
| `packages/guard/timeout-policy/src/index.ts` (per-tool budget, the `TOOL_TIMEOUT` result) | `os/apps/server/src/engine/guards.ts` |
| `packages/compaction/compaction-tool-result-pruner/src/{config,index}.ts` (budgets, marker, code-point head and tail) | `os/apps/server/src/engine/compaction.ts` |
| `packages/compaction/compaction/src/tool-pairing.ts` (balanced cuts) | `os/apps/server/src/engine/compaction.ts` |
| `packages/compaction/compaction-basic/src/config.ts` (threshold and retain ratios, 0.8 and 0.16) | `os/apps/server/src/engine/compaction.ts` |
| `packages/spill/spill-policy/src/{index,notice}.ts`, `packages/spill/spill/src` (spill when over budget, keep head and tail, a notice naming the saved copy) | `os/apps/server/src/engine/spill.ts` |

## Changed

- Skills: the Cordis plugin, `ctx.fs`, file watchers and project/user skill roots are gone. Roots are a fixed list, every read must stay inside its root after symlinks, skill files over 256 KB are skipped, frontmatter is checked with zod, and the skill's text keeps its `<` and `>` (only the framing tags are neutralised).
- Guards: one guard object per model run instead of a Cordis plugin per agent (a new user message starts a new run, which is the upstream reset). The repeat reminder is added to the tool result as `guardNotice` instead of an extra user message. Daksha's tools do not take a per-call signal, so a timed-out call is left to finish on its own and the model is told not to repeat it blindly; the computer tools have no limit here because they keep their own. The time limits are Daksha's own.
- Compaction: it works on the message list of one request, not a session log, and only changes what the model is sent; the saved chat keeps everything. Characters stand in for tokens (there is no token meter). The dropped turns get a fixed note with the person's own first words instead of a model-written summary (compaction-basic's summarizer was not ported): only @debo/llm may call a model, and a summary call on every long chat costs money and time. Only tool results from earlier turns are pruned.
- Spill: characters instead of estimated tokens, no images, and the store is the owner's own records (kind `tool-results`, deleted after 7 days, with the account, and in the download) instead of local files. Tools whose results the app draws as cards are never spilled. The notice is a JSON object with the id for the new `read_tool_result` tool.
