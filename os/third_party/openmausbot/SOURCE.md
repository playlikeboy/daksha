# OpenMausBot code in the server

Repository: https://github.com/milind-soni/OpenMausBot
Commit: da592ee7251ae853e33f6d837433fd144ca3e333
License: Apache-2.0


- **Repo:** https://github.com/milind-soni/OpenMausBot (Apache-2.0, see `LICENSE` here)
- **Commit:** `da592ee7251ae853e33f6d837433fd144ca3e333`
- **Why here and not in the root `third_party/`:** the server is built from `os/` on its own (Render and `os/infra/cloudflare/api/Dockerfile`), and `tsconfig.build.json` keeps `os/` as its root, so the copy has to live inside it. The Dockerfile copies `os/third_party`.
- **Not copied:** anything from `enterprise/` or `third_party/browser`, and no Supamaus name or mascot.

## Copied: what was copied

| Here | Upstream | Changed? |
|---|---|---|
| `triggers/app-events.ts` | `server/app-events.ts`, with `defuse()` from `server/records-block.ts` and `fromNote()` / `appEventWho()` from `server/provenance-label.ts` | Yes: the helpers are copied in and trimmed; `escapeNotes` is a short stand-in; "OpenMausBot" in model-facing text is "Daksha"; two regular expressions use `\u` escapes. The filter, preview, event block, prompt and merge logic is unchanged. |
| `triggers/app-trigger-filter.ts` | `packages/phone-protocol/src/app-triggers.ts` | Yes: only the plain filter, its limit and the Gmail search pieces are kept. |
| `meetings/` | `server/meetings/*` | Copied unchanged apart from headers, and **not wired**. See `meetings/README.md`. |

Every changed file starts with a "Changed by Daksha" line saying what changed.

## Changed: how Daksha uses it

- `apps/server/src/triggers/service.ts` runs schedules from the upkeep loop, and checks webhook and app-event deliveries. Each run goes through `eventBlock()` and `eventPrompt()`, so outside text arrives as an untrusted data block and cannot pose as the person's instructions.
- What OpenMausBot does with its own files, routine runner and phone bots is not copied. Daksha keeps triggers in its records table and runs them as ordinary background tasks.
