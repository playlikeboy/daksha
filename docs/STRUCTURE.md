# Structure: what moved now, and the bigger plan for later

Written 21 November 2026, on the `power-core` branch. The package rules themselves are in [MONOREPO.md](./MONOREPO.md).

## What moved now (small steps)

These moves keep every old import working, so nothing else had to change.

- `os/apps/server/src/engine/service.ts` was about 1,260 lines. The PDF form task is now in `engine/document-task.ts` and one check of a watched page in `engine/monitor-check.ts`. `AgentService` keeps the same methods; it calls the new files.
- The new engine pieces are in their own files from the start: `engine/guards.ts` (repeat reminders and time limits), `engine/compaction.ts` (keeping long chats small for the model) and `engine/spill.ts` (saving long tool results).
- The twelve character drawing files (`debo-art-*.tsx`, `debo-paint-*.ts`) in `os/apps/mobile/src/` moved to `os/apps/mobile/src/faces/`. Each old path keeps a one-line re-export.
- Skills are a feature folder on the server (`os/apps/server/src/skills/`) with the loader as its own package (`os/packages/skills/`).
- Copied code lives in `third_party/`, one folder per upstream project (see [`third_party/README.md`](../third_party/README.md) and decision 38).

## The bigger plan (later work, not started)

Each step below is its own change, with its own tests, and none of it is promised by a date.

1. **One workspace.** Today there are two pnpm workspaces with two lockfiles: the root (`apps/site`, `apps/pitch`, `apps/web`, `packages/*`) and `os/` (`apps/mobile`, `apps/worker`, and some root packages pulled in by path). Merge them into one root workspace and one lockfile, so a package is installed once and `@debo/*` links do not need path tricks.
2. **Flatten `os/`.** Move `os/apps/server`, `os/apps/mobile`, `os/apps/worker` and `os/apps/computer` up to `apps/`, `os/packages/*` up to `packages/`, `os/infra/` to `infra/`, and `os/docs/` into `docs/`. `os/` started as a copy of the OpenFuse template and stays MIT until its code is moved; the move must keep that licence on the files that came from it (decision 9).
3. **Feature folders in the server.** `os/apps/server/src` still has about 50 flat files beside its feature folders. Group the rest the same way (for example `companion/` for people, reminders and the check-in, `mail/` and `calendar/` for Google, `browser/` and `computer/` for the two sandboxes), with a re-export at each old path during the move.
4. **Feature folders in the app.** `os/apps/mobile/src` has about 165 flat files, 72 of them starting with `debo-`. Group them the way `faces/` is grouped now (for example `journal/`, `voice/`, `custom-people/`, `settings/`, `apps-screen/`).
5. **Split the largest screens and services.** `agent-ui.tsx` (about 2,100 lines), `chat.tsx` (about 1,300), `engine/conversation.ts` (about 740) and `app.ts` (about 650) each hold several jobs. Split them along those jobs, the way `service.ts` was split, before adding more to them.
6. **Drop the re-export stubs** once nothing imports the old paths, in one change per folder.

Rules for every step: move code without changing what it does, keep the record kinds and API routes the same, run the full `os` suite and both typechecks, and run `node scripts/check-brand.mjs` and `node scripts/check-licenses.mjs`.
