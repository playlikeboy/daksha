# Third-party folders

Code and content copied from other open-source projects lives here, one folder per source. We copy instead of rewriting where we can, so the work of the people who made it stays visible and easy to update.

## The rules for every folder

Each folder in `third_party/` must have:

1. **`LICENSE`**: the upstream licence file, unchanged. If a part of the folder has its own licence (for example one skill with its own credits), that part keeps its own `LICENSE` too.
2. **`SOURCE.md`**: where it came from and what we did with it, with these lines:
   - `Repository:` the upstream address.
   - `Commit:` the full commit SHA we copied from (`git -C <clone> rev-parse HEAD`). Pin every copy to one commit, so updating is a deliberate step.
   - `License:` the SPDX name, for example `MIT` or `Apache-2.0`.
   - `## Copied`: what was copied, by upstream path.
   - `## Changed`: what we changed, or "Nothing" for a verbatim copy.
   - `## Changed files` (Apache-2.0 only): one path per line, each starting with `- `, for every copied file we changed.

`scripts/check-licenses.mjs` checks this in CI (the brand job in `.github/workflows/check.yml`).

## Changed Apache-2.0 files

Apache-2.0 section 4(b) says a changed file must carry a notice that it was changed. Put this line near the top of every changed file, in the file's comment style:

```
Modified by Daksha (Shaswat Raj): <one line on what changed>. Original: <upstream path>.
```

List the file under `## Changed files` in `SOURCE.md`. The check fails if a listed file does not carry the line. Keep the upstream copyright and licence header lines in the file as they were. If the upstream project has a `NOTICE` file, copy it into the folder and add its text to the root `NOTICE`.

## Code we adapted into our own folders

Sometimes a copy only makes sense inside Daksha's own code (for example a small function ported into the engine). Then:

- the new file starts with a comment naming the upstream repository, path, commit and licence;
- the source still gets a folder here with its `LICENSE` and a `SOURCE.md` that lists where each piece now lives.

## What never comes in

- Copyleft code (GPL, LGPL, AGPL, MPL, EUPL, SSPL and the like). The check looks for their licence text.
- Source-available or "enterprise" folders, even from a project that is otherwise open source.
- Trademarks: other projects' product names, logos and mascots are never used as Daksha's.
- Anything we have not read. Copied folders are data until reviewed; we never run their scripts.

## Folders

| Folder | From | Licence |
|---|---|---|
| `hermes-skills/` | NousResearch/hermes-agent, skill folders | MIT (each skill keeps its own credits) |
| `hermes-mcps/` | NousResearch/hermes-agent, `optional-mcps/*/manifest.yaml` | MIT |
| `deepseek-harness/` | deepseek-ai/deepseek-harness, code adapted into `os/` | MIT |
