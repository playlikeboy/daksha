// DEV ONLY. Made-up journal entries for the in-memory journal, so the screens can be
// seen and photographed with realistic content and no real person's words.
//
// Switched on by DEBO_DEV_SEED=1 together with DEBO_DEV_MEMORY=1, and only in a sample
// workspace (see createDebo). Off by default. Every name, place and event here is invented.
import type { DeboBackend } from "./backend.ts";

const day = 24 * 60 * 60 * 1000;

/** Days ago, at a set hour, so the list has a real spread of dates. */
const at = (daysAgo: number, hour: number) => {
  const d = new Date(Date.now() - daysAgo * day);
  d.setHours(hour, 15, 0, 0);
  return d;
};

const entries: { text: string; daysAgo: number; hour: number }[] = [
  {
    text: "Long walk by the lake after work\nThe light was soft and the ducks were out. I want to do this every Thursday, even when I feel too tired. Called Meera on the way home and we planned lunch for Sunday.",
    daysAgo: 0,
    hour: 19,
  },
  {
    text: "Dentist on the 28th at 4 pm\nDr. Rao moved my check-up. Bring the old X-ray. Leave the office by 3:30.",
    daysAgo: 1,
    hour: 9,
  },
  {
    text: "Started the pottery class\nMy first bowl leaned to one side, but the teacher said that is normal. Classes are on Saturday mornings for six weeks. I liked how quiet my head felt.",
    daysAgo: 3,
    hour: 13,
  },
  {
    text: "Mum's birthday ideas\nShe mentioned the blue shawl from the market twice. Maybe that, and a printed photo of all of us from Goa. Her birthday is on the 12th.",
    daysAgo: 6,
    hour: 21,
  },
  {
    text: "Hard day at work\nThe report took longer than I planned and I skipped lunch. Note to self: block an hour on Mondays for the weekly numbers, and eat something before 2.",
    daysAgo: 9,
    hour: 22,
  },
  {
    text: "Book club picked our next book\nWe are reading 'The Old Garden' for the 5th. Priya is hosting. I said I would bring the samosas.",
    daysAgo: 14,
    hour: 20,
  },
];

/** Fills the in-memory journal of `owner` with the made-up entries above. */
export async function seedDevJournal(backend: DeboBackend, owner: string): Promise<void> {
  for (const entry of entries) {
    const saved = await backend.entries.create(owner, entry.text, at(entry.daysAgo, entry.hour));
    await backend.afterChange(owner, saved.id, "saved");
  }
}
