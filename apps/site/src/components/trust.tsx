import { BRAND } from "../brand";
import { PRIVACY_URL } from "../links";
import { ArrowIcon } from "./icons";
import { Section, SectionHead, stagger } from "./section";

// The four things a person can always do with their data. Each is built:
// see (What Debo knows, the journal), fix, export (Download my data), delete.
const CONTROLS = [
  { word: "See", body: `Read every entry, and every memory ${BRAND} made from them, with where it came from.` },
  { word: "Fix", body: `If ${BRAND} got something wrong, correct it, or make ${BRAND} forget it.` },
  { word: "Export", body: `Download everything as plain files that open without ${BRAND}.` },
  { word: "Delete", body: "Delete any entry, and the memories made from it go a few seconds later. Or delete all your data." },
];

// Every line here matches apps/web/src/app/privacy/page.tsx. Change them together.
const FACTS = [
  {
    title: "Where it lives",
    body: "Your account, entries and files are stored with Neon, in the United States. Your memories are stored with Mem0. Cloudflare runs this website.",
  },
  {
    title: "Who sees it",
    body: `You can read your entries. ${BRAND}’s servers read them so they can search and answer. To write an answer, the matching pieces go to an AI company, and the privacy page names each one.`,
  },
];

export function Trust() {
  return (
    <Section id="trust">
      <SectionHead
        id="trust"
        title="It is your life. You stay in charge of it."
        lead={`${BRAND} keeps personal things, so here is what happens to them, in plain words.`}
      />
      <ul className="controls" role="list">
        {CONTROLS.map((control, index) => (
          <li key={control.word} data-reveal="" style={stagger(index)}>
            <h3 className="controls__word">{control.word}</h3>
            <p className="body-lg">{control.body}</p>
          </li>
        ))}
      </ul>
      <div className="facts">
        {FACTS.map((fact, index) => (
          <div className="fact" key={fact.title} data-reveal="" style={stagger(index)}>
            <h3 className="h3">{fact.title}</h3>
            <p className="body-lg">{fact.body}</p>
          </div>
        ))}
      </div>
      <div className="limits" data-reveal="">
        <h3 className="h3">Honest limits</h3>
        <p className="body-lg" style={{ color: "var(--ink)", maxWidth: "68ch" }}>
          {BRAND} is an early version. It is not end-to-end encrypted, because its servers have to read your entries
          to search them. We do not sell your data, show ads, or train AI on it ourselves. Some companies that help{" "}
          {BRAND} may keep data for a time, and we have not yet confirmed all of their rules. The privacy page says
          which.
        </p>
        <a className="btn btn--primary" href={PRIVACY_URL}>
          Read how {BRAND} handles your data
          <ArrowIcon />
        </a>
      </div>
    </Section>
  );
}
