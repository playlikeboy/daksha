import { BRAND } from "../brand";
import { Section, SectionHead } from "./section";

// Also used for the FAQ structured data in page.tsx, so the answers stay plain text.
export const QUESTIONS = [
  {
    q: `Is ${BRAND} finished?`,
    a: `No. ${BRAND} is an early version. Accounts, the journal, asking about your life, memories and talking out loud work today. Voice and video notes, connecting your apps, reminders, pictures and your own keys work too, but they are new and have had little real-world testing.`,
  },
  {
    q: "Is it free?",
    a: "You can start for free. Each person has a daily limit on questions, so no one account can run up a big bill. Plans are not set yet, and we will tell you before anything costs money.",
  },
  {
    q: `Does ${BRAND} make things up?`,
    a: `${BRAND} answers only from what you have written, and shows the entry it used. When it finds nothing, it says it does not know instead of guessing.`,
  },
  {
    q: `Can I use ${BRAND} in Hindi?`,
    a: `You can talk to ${BRAND} out loud in English or Hindi.`,
  },
  {
    q: "Who can read my entries?",
    a: `You can. ${BRAND}’s servers also read them so they can search and answer. To answer a question, the matching pieces go to an AI company that writes the reply. The privacy page lists each company and what it does.`,
  },
  {
    q: "How do I get my data out, or delete it?",
    a: "You can download your data from the app, and delete any entry or memory. The privacy page explains exactly what each delete button removes.",
  },
  {
    q: `Will ${BRAND} do things without asking?`,
    a: `Not outside ${BRAND}. Before it sends, posts, pays, deletes or changes anything in your other apps, it asks for a clear yes on the screen. It also asks before deleting anything inside ${BRAND}. Small changes inside ${BRAND} that you asked for, like saving an entry, happen straight away.`,
  },
];

// Native <details>: it opens and closes with a keyboard and a screen reader
// without any script.
export function Faq() {
  return (
    <Section id="faq" tone="band">
      <SectionHead id="faq" align="center" title="Questions people ask" />
      <div className="faq">
        {QUESTIONS.map((item) => (
          <details key={item.q} name="faq">
            <summary>
              {item.q}
              <span className="faq__icon" aria-hidden="true" />
            </summary>
            <p className="faq__answer">{item.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
