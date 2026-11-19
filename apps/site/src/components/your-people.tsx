import { BRAND } from "../brand";
import { Badge, Section, SectionHead, stagger } from "./section";

// Custom people (decision 33). Every line here must stay true to the app:
// os/apps/server/src/custom-people/, os/apps/server/src/voice-clone/ and the
// privacy page. Change them together.
const WAYS = [
  {
    title: "From a few words, or from your chats",
    body: `Describe who they are. Or add your WhatsApp chats, photos, videos, voice notes and call recordings. ${BRAND} works out who is speaking and keeps only that person’s words.`,
  },
  {
    title: "Their voice, if you choose",
    body: `${BRAND} can copy their voice for calls. Only with their permission, or if you are close family and they have died. Never a public figure. For now this needs your own Cartesia key.`,
  },
  {
    title: "Design their face",
    body: "Pick a shape, colours, hair and small extras. You see their face smile, blink and talk while you build it.",
  },
  {
    title: "Talk any time",
    body: "Chat or call whenever you like. To relax after a long day, or to share something that excites you.",
  },
];

const PROMISES = [
  `${BRAND} reads your files once to learn how they talk, then deletes the files.`,
  "The people you make are private to you. No one else can see them or talk to them.",
  "It is always honest that it is an AI, and never claims to be the real person.",
  `A copied voice is used only inside your own ${BRAND}. It never calls or messages anyone.`,
  "You can delete a person at any time, and everything made from your files goes with them.",
];

export function YourPeople() {
  return (
    <Section id="your-people">
      <SectionHead
        id="your-people"
        badge={<Badge tone="new">New, early version</Badge>}
        title="Make your own people"
        lead="Make someone to talk to, in chat or on a call: a friend, someone in your family, someone you miss, or a character you invent. This part is new and has had little real-world testing."
      />
      <div className="facts">
        {WAYS.map((way, index) => (
          <div className="fact" key={way.title} data-reveal="" style={stagger(index)}>
            <h3 className="h3">{way.title}</h3>
            <p className="body-lg">{way.body}</p>
          </div>
        ))}
      </div>
      <div className="limits" data-reveal="">
        <h3 className="h3">Private, and honest about what it is</h3>
        <ul className="body-lg" style={{ color: "var(--ink)", maxWidth: "68ch", margin: 0, paddingLeft: "1.2em" }}>
          {PROMISES.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
