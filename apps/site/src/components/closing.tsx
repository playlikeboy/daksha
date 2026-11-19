import { BRAND } from "../brand";
import { START_URL } from "../links";
import { ArrowIcon } from "./icons";
import { Section } from "./section";

export function Closing() {
  return (
    <Section id="start">
      <div className="closing" data-reveal="blur">
        <img src="/debo.svg" alt="" width={152} height={152} loading="lazy" />
        <h2 className="h2" id="start-title">
          Start with one line about today
        </h2>
        <p className="lead">
          Write it down. Ask about it later. {BRAND} will show you where the answer came from. It is free to start.
        </p>
        <div className="btn-row">
          <a className="btn btn--primary" href={START_URL}>
            Open {BRAND}
            <ArrowIcon />
          </a>
          <a className="btn btn--secondary" href="#get-app">
            Get the app
          </a>
        </div>
      </div>
    </Section>
  );
}
