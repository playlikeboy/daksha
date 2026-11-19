// Every film on the page, in one place: the files, the poster, the words-on-screen track,
// and the description read out to people who cannot see it.
// To swap in new footage, put the new files in public/ and change the entry here.
// If the new film shows different things, rewrite its `description` and its .vtt too:
// both must only say what is really in the film. The `uploaded` time is when the
// current file was added, and goes to search engines, so change it with the file.
import { BRAND, SITE_URL } from "./brand";

export type Film = {
  // Short name, used for the play button and the player's label.
  title: string;
  // Everything the film shows, for screen readers and search engines.
  description: string;
  // Files in public/, so they are served from the site itself.
  mp4: string;
  webm: string;
  poster: string;
  // Words that appear on screen, as a WebVTT track. The films have no speech.
  captions?: { src: string; label: string };
  width: number;
  height: number;
  seconds: number;
  // When this file went on the site (ISO 8601, from the commit that added it).
  uploaded: string;
};

// The launch film. The README links to https://about.debo.life/debo-launch.mp4, so keep that name.
// The description says "Debo" because that is the word in the film itself.
export const LAUNCH_FILM: Film = {
  title: `The ${BRAND} launch film`,
  description: `A short animated film about Debo, with music and sound effects and no speech. Words build on a white screen: Meet Debo, a journal you can talk to. Between the cards, a line repeats: Debo remembers your days, Debo answers from your journal, Debo shows you what it knows, Debo talks with you, Debo remembers your people, Debo asks before it acts. The cards show a journal entry about lunch with Neha and a Goa trip being typed and saved, next to a voice note and a video. A question, what do I need to sort out before the Goa trip, gets an answer with three things to do and the three entries it came from. On What Debo knows, a memory is fixed and another is forgotten. Five characters appear and Debo, a blue blob, is picked for a voice call, where the person says Neha's birthday is on 21 November. People in your life shows Neha, Mum and Aarav, and Debo says Neha's birthday is on Saturday. Connected apps like Gmail and Calendar circle Debo. A card waiting for your yes asks to add the Goa trip to the calendar; Approve is pressed, the days flip over and the word Done appears with confetti. It ends on Debo keeps you in control, the Debo tomato and my.debo.life.`,
  mp4: "/debo-launch.mp4",
  webm: "/debo-launch.webm",
  poster: "/debo-launch-poster.webp",
  captions: { src: "/debo-launch.en.vtt", label: "English (words on screen)" },
  width: 1920,
  height: 1080,
  seconds: 72,
  uploaded: "2026-11-15T13:25:19+05:30",
};

// The walkthrough: one real screen recording of the app, with step captions on screen.
export const WALKTHROUGH_FILM: Film = {
  title: `The ${BRAND} app walkthrough`,
  description: `A walkthrough of one real screen recording of the Debo app, with music and sound effects and no speech. The phone screen sits on the right, and a caption on the left names each step: sign in, write a day, ask about your own life, see where each answer came from, talk to Debo, and connect your apps. A label by the phone shows when the recording is sped up or slowed down. A person signs in and writes a journal entry about lunch with Neha and a Goa trip. In a new chat they ask what to sort out before Mum visits and before the trip. Debo answers with a list of things to do and who to talk to, and shows three journal entries as sources. Then the person starts a voice call, types that they feel overwhelmed, and Debo answers kindly. Then the Apps screen, with Gmail connected. It ends on the Debo name and my.debo.life.`,
  mp4: "/debo-demo.mp4",
  webm: "/debo-demo.webm",
  poster: "/debo-demo-poster.webp",
  captions: { src: "/debo-demo.en.vtt", label: "English (words on screen)" },
  width: 1920,
  height: 1080,
  seconds: 66,
  uploaded: "2026-11-15T12:00:42+05:30",
};

// Search engines read this. Every field comes from the entry above, so it stays true.
export function videoJsonLd(film: Film) {
  const m = Math.floor(film.seconds / 60);
  const s = film.seconds % 60;
  return {
    "@type": "VideoObject",
    name: film.title,
    description: film.description,
    thumbnailUrl: `${SITE_URL}${film.poster}`,
    contentUrl: `${SITE_URL}${film.mp4}`,
    uploadDate: film.uploaded,
    duration: `PT${m}M${s}S`,
    width: film.width,
    height: film.height,
  };
}
