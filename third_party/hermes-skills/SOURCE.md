# Source: Hermes Agent skills

Repository: https://github.com/NousResearch/hermes-agent
Commit: aeb5a071069dbd85d85f2c8d44337f16df29d475
License: MIT

Copied on 21 November 2026. The `LICENSE` here is the repository's MIT licence (Nous Research). Each skill's own `SKILL.md` names its authors in its `author` line, and `skills/creative/humanizer/LICENSE` and `skills/productivity/pdf/LICENSE` are those skills' own MIT licences. All of them are kept as they were.

## Copied

Whole folders, verbatim, at the same paths as upstream:

- `skills/productivity/weekly-review-planning/`
- `skills/productivity/meeting-action-items/`
- `skills/productivity/document-to-action-items/`
- `skills/email/email-inbox-triage/`
- `skills/research/grounded-citations/`
- `skills/productivity/pdf/`
- `skills/productivity/maps/`
- `skills/productivity/product-price-monitor/`
- `skills/creative/humanizer/`
- `optional-skills/health/fitness-nutrition/`
- `optional-skills/productivity/memento-flashcards/`
- `optional-skills/productivity/decision-questionnaire/`
- `optional-skills/research/rss-feeds/`
- `optional-skills/research/llm-wiki/`

## Changed

Nothing. The files are byte-for-byte copies.

How Daksha uses them is in `os/packages/skills/src/hermes.ts`: which skills it offers, which it does not and why, and a short note that maps Hermes tool names to Daksha's, added in front of a skill when it is loaded. Daksha reads only the Markdown files. It never runs the `scripts/` or `tests/` in these folders.
