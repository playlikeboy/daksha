# Plan: Daksha as a warm daily companion

Written 15 November 2026. The owner asked: make Daksha "more nicer and daily personal, family like assistant and everything for a human".

This is a plan. The "Built" column says what is in the code today; everything else is not built yet. Check the code before you say Daksha does any of it.

## What "a daily, family-like companion" means here

A good friend or a caring family member:

- remembers the people in your life, by name, and asks after them;
- remembers what you said last week and asks how it went;
- knows when a birthday is coming and reminds you once, kindly;
- notices when you have been low for a while and checks in without lecturing;
- keeps track of the little things (the shopping list, the call you promised);
- never nags, never guilt-trips, never pretends to be human, and drops everything to help if you are in trouble.

Daksha already has the pieces: the journal, memories (Mem0), tasks and goals, the person's notes about themselves, chat and voice through one `ConversationAgent`. The work is to join them up and give her the habit of using them warmly.

## Rules that do not bend

- **Honest AI.** If the person sincerely asks whether she is a human, she says she is an AI, warmly, then carries on. A role never changes that.
- **Crisis first.** If someone seems in crisis, at risk of harming themselves or someone else, or in danger, she speaks as herself, takes it seriously, points to a local emergency number, a helpline or a trusted person, and stays in the conversation. This line is in the main character text and applies at all times, not only during role-play.
- **Every fact has a source.** Follow-ups quote the entry they came from (source label such as "Journal, 12 November"). People facts come from the person's own words.
- **The person owns it.** Anything new that is stored can be seen, fixed, exported and deleted, with the delete path built with the write path.
- **No nagging.** One gentle mention, then let it go. Never a guilt line. Never a list of everything she knows.
- **Inside Daksha is done at once; outside Daksha and deleting need a tap** (decision 28).

## Ideas, ranked

Value: how much it makes Daksha feel like a companion. Effort and risk: S, M, L. "Consent / privacy page" says whether the privacy page must change or the person must agree first.

| # | Idea | Value | Effort | Risk | Consent / privacy page | Built |
|---|---|---|---|---|---|---|
| 1 | Warmer character: follows up once, uses names, notices mood kindly, celebrates small wins, never nags; crisis line that always applies | High | S | Low | No new data | **Yes** (`engine/personality.ts`) |
| 2 | People in your life: name, relation, birthday, special days (anniversaries), short notes; saved from chat or voice with `note_person`, listed with `list_people`, shown to the model so she uses names | High | M | Low: own data, inside Daksha | Privacy page: yes (new stored data) | **Yes** (`people.ts`, `companion.ts`, app card) |
| 3 | Daily check-in brief (`daily_checkin` tool and `GET /api/checkin`): birthdays and special days this week, tasks waiting for the person, active goals and their next step, entries from the last week worth asking about | High | M | Low: reads only what Daksha holds | Privacy page: yes (says what it reads); nothing stored | **Yes** (`companion.ts`) |
| 4 | Follow-ups from the journal ("how did the interview go?") | High | S on top of 3 | Low | Covered by 3 | **Partly**: the check-in returns recent entries with sources and she may ask about one. No smarter picking yet. |
| 5 | Birthday and promise reminders that arrive on their own (a notification on the day, or the day before) | High | M | Medium: a nudge can feel pushy; needs a quiet hours rule | Yes: the person turns reminders on; privacy page | **Yes** (decision 31): in-app updates the day before at 18:00 and the morning of at 08:00, on unless turned off; push only on devices where the person turns it on; quiet hours 22:00 to 07:00 |
| 6 | Promises found in the journal ("I told Mum I'd call Sunday") turned into a suggested reminder the person accepts | High | M | Medium: the model can misread; must be a suggestion, never automatic | Yes: suggestion card, person accepts; privacy page | **Yes** (decision 31): typed entries only, Ideas of kind `promise`, "Remind me" or "Dismiss" |
| 7 | Scheduled good-morning / good-evening check-in (the brief arrives at a time the person picks) | Medium | M | Medium: push notifications, time zones | Yes: opt-in, choose time; privacy page | **Morning only** (decision 31): off by default, default 08:00, sent within three hours of the time. No evening check-in |
| 8 | Mood over time: a gentle "you've sounded tired this week, how are you doing?" built from the tone of recent entries | Medium | M | High: easy to feel creepy or clinical; must never diagnose | Yes: opt-in, visible, can be turned off; privacy page must say what is inferred and that nothing is stored as a "mood score" unless the person chooses | No |
| 9 | Household lists (shopping, packing, chores) the family can share | Medium | M | Medium: sharing means a second person sees data | Yes, for sharing; a private list needs only a privacy-page line | No |
| 10 | Habits and routines (drink water, walk, medicine) with gentle streaks | Medium | M | Medium: streaks can turn into guilt; medicine needs care | Opt-in; privacy page | No |
| 11 | Warm, plain words in every tool result and error (no "Request failed", always what to do next) | Medium | S each | Low | No | **Partly**: the new tools use plain words. An audit of older tools is still to do. |
| 12 | Time zone from the app, so "today" and "good morning" are right without asking | Medium | S | Low | No (a time zone is not personal content), but say it on the privacy page if stored | No: the check-in takes a time zone if she knows it, otherwise UTC |
| 13 | Family space: a parent and child, or partners, each with their own Daksha, sharing selected people and lists | High | L | High: consent of two people, minors | Yes: full design and privacy review first | No |

## Suggested order

1. Done in this change: 1, 2, 3, and the start of 4 and 11.
2. Next, small: 12 (send the device time zone with each chat run), then finish 11 (audit tool errors for plain words).
3. Then: 6 as suggestions only, then 5 with an opt-in and quiet hours, using the existing notifications and worker.
4. Later, with a design and privacy review first: 7, 8, 10, 9, and last 13.

## What was built in this change, in plain words

- Daksha's character text asks her to be a steady daily companion: use names, follow up once, notice how the person feels, never nag. The crisis line now applies all the time.
- "People in your life": Daksha keeps a short card for each person the person tells her about (name, who they are, birthday, special days, a few notes). She saves it at once when told, and says so. The person sees, fixes, adds and removes people in the app ("People in your life", on the Apps screen and in "How she talks and what she knows"). Chat cannot remove a person; the app can.
- Up to 40 people (name, relation and the first 200 characters of notes) and the birthdays in the next week are sent with each chat or call to the assistant model, as the person's own data, the same way as "Things she should always know".
- Daily check-in: when the person says good morning (or asks how the day looks) she calls `daily_checkin` and gives a short brief of at most three things. It reads only what Daksha already holds and stores nothing.

Storage: people are rows of kind `people` in the existing records table that holds all the new app's own rows (`os.records` when it shares the Daksha database), so no migration was needed. They are part of "Download my data" and deleted with "Delete my data", like every other row of that table.

## Not checked yet

- Nothing here was run against a real model. Check by hand that she saves people from a normal sentence, does not save guesses, follows up once and does not nag, and keeps the brief short.
- The check-in uses UTC unless she knows the person's time zone, so "today" can be wrong near midnight.
- People's names and notes go to the assistant model with every reply. That is said on the privacy page. Watch the prompt size for people with many saved people (capped at 40).

## Built on 15 November 2026 (decision 31)

- Birthday and special-day reminders, the opt-in morning check-in, and reminders the person asked for, checked once a minute in the person's saved time zone (`os/apps/server/src/companion-jobs.ts`, `reminders.ts`). Each arrives once as an update in Chat. Nothing between 22:00 and 07:00.
- Promises in a saved or edited typed entry become suggestions on the Ideas screen with the words and a link to the entry (`promises.ts`, `findPromises` in `@debo/llm`). "Remind me" makes a reminder; nothing happens without the tap. Deleting the entry deletes them.
- "Send me reminders" per device: web push in a browser (needs the VAPID keys on the server), local notifications held by the phone in the app. Title only.
- Settings: "Reminders and check-in" in "How she talks and what she knows".

Not checked yet: the promise finder against a real model; web push against a real browser push service; phone notifications on a real phone. Voice notes and calls are not looked at for promises.

