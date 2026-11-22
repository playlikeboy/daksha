import { BRAND } from "../brand";
import { SourceIcon } from "./icons";
import { Section, SectionHead, stagger } from "./section";

// Both exchanges are real replies from the demo account, set again here in
// larger type so they are easy to read. Nothing in them is made up.
function Source({ label }: { label: string }) {
  return (
    <span className="chip">
      <SourceIcon />
      {label}
    </span>
  );
}

export function Ask() {
  return (
    <Section id="sources" tone="band">
      <div className="ask">
        <div className="ask__copy">
          <SectionHead
            id="sources"
            title="Every answer shows where it came from"
            lead={`Under every answer is a source for each entry ${BRAND} used, with the date. One press opens the original, so you can always check.`}
          />
          <div className="ask__promise" data-reveal="" style={stagger(2)}>
            <h3 className="h3">No source, no guess</h3>
            <p className="body-lg">
              If {BRAND} can&rsquo;t find it, or the entry is unclear, it tells you honestly instead of guessing.
            </p>
          </div>
        </div>

        <figure className="chat" data-reveal="blur">
          <p className="bubble bubble--me" data-reveal="pop" style={stagger(2)}>
            <span className="visually-hidden">You ask: </span>What did I plant on the balcony?
          </p>
          <div className="bubble bubble--debo" data-reveal="pop" style={stagger(4)}>
            <p>
              <span className="visually-hidden">{BRAND} answers: </span>
              You planted basil and mint on the balcony. This comes from your journal entry from 11 November.
            </p>
            <div className="bubble__sources">
              <span className="small">Where this came from</span>
              <div>
                <Source label="Journal, 11 November" />
              </div>
            </div>
          </div>
          <div className="chat__sep" aria-hidden="true" />
          <p className="bubble bubble--me" data-reveal="pop" style={stagger(6)}>
            <span className="visually-hidden">You ask: </span>When is the launch now?
          </p>
          <div className="bubble bubble--debo" data-reveal="pop" style={stagger(8)}>
            <p>
              <span className="visually-hidden">{BRAND} answers: </span>
              The latest note I can find is from 11 November 2026. It says the launch moved to &ldquo;next Friday&rdquo;
              because the payment page needs more testing. It doesn&rsquo;t give an exact date, so &ldquo;next
              Friday&rdquo; is ambiguous, and I don&rsquo;t have anything newer about the launch date.
            </p>
            <div>
              <Source label="Journal, 11 November" />
            </div>
          </div>
          <figcaption className="small">Real replies from a demo account, shown here in larger type.</figcaption>
        </figure>
      </div>
    </Section>
  );
}
