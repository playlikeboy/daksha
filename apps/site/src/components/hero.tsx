import { BRAND } from "../brand";
import { START_URL } from "../links";
import { DeboTomato } from "./debo-tomato";
import { ArrowIcon, PlayIcon, SourceIcon } from "./icons";

// The first screen. The question and answer floating by Debo are a real reply
// from the demo account (the same one shown in full in the Ask section).
export function Hero() {
  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <div className="wrap hero__grid">
        <div className="hero__copy">
          <h1 className="hero__title" id="hero-title">
            <span className="line">Your life, remembered.</span>
            <span className="line">
              <em>Just ask.</em>
            </span>
          </h1>
          <p className="lead">
            {BRAND} is a friendly assistant that remembers your life. Write things down or say them out loud. Later,
            ask about your own past and plans, and see the entry each answer came from.
          </p>
          <div className="btn-row">
            <a className="btn btn--primary" href={START_URL}>
              Open {BRAND}
              <ArrowIcon />
            </a>
            <a className="btn btn--secondary" href="#film">
              <PlayIcon />
              Watch the film
            </a>
          </div>
          <p className="hero__note">
            Free to start, in any web browser. It is an early version, and this page says which parts are new.{" "}
            <a href="#get-app">Get the app for your phone</a>
          </p>
        </div>

        <div className="hero__art">
          <div className="hero__disc" aria-hidden="true" />
          <div className="hero__ring" aria-hidden="true" />
          <div className="hero__debo">
            <DeboTomato />
          </div>
          <p className="float float--question">
            <span className="visually-hidden">You ask: </span>What did I plant on the balcony?
          </p>
          <div className="float float--answer">
            <p>
              <span className="visually-hidden">{BRAND} answers: </span>
              You planted basil and mint on the balcony.
            </p>
            <span className="chip">
              <SourceIcon />
              <span className="visually-hidden">Source: </span>Journal, 11 November
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
