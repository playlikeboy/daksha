# suparagent code in the server

- **Repo:** https://github.com/Anil-matcha/suparagent (Apache-2.0, see `LICENSE` here)
- **Commit:** `f2ae9d0f5cc40e9acca9133be1b7abe9cb9af4fc`
- **Language:** upstream is Python, so nothing could be copied file for file. The pieces below were rewritten in TypeScript, keeping the same rules, patterns and wording where it fits. The rewritten files live in the server and say where they came from at the top.
- **Not used:** any product name or mascot from the upstream project.

## What was rewritten

| Daksha file | Upstream | What carried over |
|---|---|---|
| `apps/server/src/proposals/redact.ts` | `backend/app/services/agent_memory.py` (`redact_secrets` and its patterns), `backend/app/services/agent_skills.py` (skill warnings) | The secret patterns, the labelled-value patterns, the private-key block, and the three skill warnings. Python's `(?i)` became the `i` flag. |
| `apps/server/src/proposals/service.ts` (memory suggestions) | `backend/app/services/memory_proposals.py` | Only the person's own messages are read, after the chat has been quiet; the "lasting statement" patterns; questions skipped; quoted words, never rewritten; secrets mean no suggestion; a rejected line is never offered again; caps per chat and in total. |
| `apps/server/src/proposals/service.ts` (skill drafts) | `backend/app/services/skill_learning.py` | One finished request and reply become a draft with fixed sections; redaction before the cut; byte limits; the "read before reuse" reference section; the warnings. |

## What is different

- Records live in Daksha's records table (kinds `proposals` and `proposal-state`), scoped to the person, and are removed with the account.
- Suggestions are found when the person opens the Suggestions list, or asks in chat, not by a background worker.
- An approved skill draft is saved as a record of kind `skills`.
