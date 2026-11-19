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

// The launch film (video/launch/film2). Before the rename the films were published as debo-*;
// those addresses now send people here with a 307 (host-redirect.ts).
export const LAUNCH_FILM: Film = {
  title: `The ${BRAND} launch film`,
  description: `A short animated film about Daksha, with music and sound effects and no speech. Words build on a white screen: Meet Daksha, a journal you can talk to. Between the cards, a line repeats: Daksha remembers your days, Daksha answers from your journal, Daksha shows you what it knows, Daksha talks with you, Daksha remembers your people, Daksha asks before it acts. The cards show a journal entry about lunch with Neha and a Goa trip being typed and saved, next to a voice note and a video. A question, what do I need to sort out before the Goa trip, gets an answer with three things to do and the three entries it came from. On What Daksha knows, a memory is fixed and another is forgotten. Five characters appear and Daksha, a blue blob, is picked for a voice call, where the person says Neha's birthday is on 21 November. People in your life shows Neha, Mum and Aarav, and Daksha says Neha's birthday is on Saturday. Connected apps like Gmail and Calendar circle Daksha. A card waiting for your yes asks to add the Goa trip to the calendar; Approve is pressed, the days flip over and the word Done appears with confetti. It ends on Daksha keeps you in control, the Daksha tomato and www.daksha.life.`,
  mp4: "/daksha-launch.mp4",
  webm: "/daksha-launch.webm",
  poster: "/daksha-launch-poster.webp",
  captions: { src: "/daksha-launch.en.vtt", label: "English (words on screen)" },
  width: 1920,
  height: 1080,
  seconds: 72,
  uploaded: "2026-11-19T23:45:00+05:30",
};

// The walkthrough: short clips recorded from the app in demo mode, with made-up sample
// entries, and a caption on screen for each step. See docs/MEDIA.md to make it again.
export const WALKTHROUGH_FILM: Film = {
  title: `The ${BRAND} app walkthrough`,
  description: `A walkthrough of the Daksha app, recorded from the app in demo mode with made-up sample entries, with music and sound effects and no speech. The phone screen sits on the right, with a chip that says Sample entries, and a caption on the left names each of seven steps. It opens on the card Daksha, a quick look: recorded from the app, with made-up sample entries, typing is sped up. Say hello: the welcome screen, Hi, I'm Daksha. Write a day: a person types a short entry about coffee with Sam and a picnic on Sunday, presses Save entry and sees Entry saved. Open any entry: the entry Long walk by the lake after work, with what Daksha learned from it and similar entries. See what Daksha knows: a list of memories, each with the journal entry it came from and the buttons Fix this and Forget this. Record a voice note: the recorder counts up while the microphone is on. Daksha asks before it acts: the Talk screen shows a card waiting for your yes, to add a calendar event, with Approve and Not now, and the Tasks screen lists it under Your actions. Make it yours: a face is made with Randomise, a person called Coach Sam is typed into Make someone new, and the reminders and check-in settings. It ends on the Daksha name and my.daksha.life.`,
  mp4: "/daksha-demo.mp4",
  webm: "/daksha-demo.webm",
  poster: "/daksha-demo-poster.webp",
  captions: { src: "/daksha-demo.en.vtt", label: "English (words on screen)" },
  width: 1920,
  height: 1080,
  seconds: 58,
  uploaded: "2026-11-19T23:45:00+05:30",
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
