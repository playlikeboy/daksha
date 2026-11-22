import { BRAND } from "../brand";
import { START_URL } from "../links";
import { DeboTomato } from "./debo-tomato";
import { HeroShot } from "./hero-shot";
import { ArrowIcon, CheckIcon, DownloadIcon, GiftIcon, PlayIcon, ShieldIcon, SourceIcon } from "./icons";

// Three small promises under the buttons. Each is true today: starting is free
// (FAQ: "Is it free?"), there are no ads and nothing is sold (Trust, "Honest
// limits"), and you can download or delete everything (Trust, "Export" and "Delete").
const PROMISES = [
  { icon: <GiftIcon />, label: "Free to start" },
  { icon: <ShieldIcon />, label: "No ads. Never sold." },
  { icon: <CheckIcon />, label: "Download or delete anything" },
];

// The first screen: one bold line, one short line, one clear way in, and the app
// itself in a phone. The question and answer beside the phone are a real reply
// from the demo account (the same one shown in full in the Ask section).
export function Hero() {
  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <div className="hero__glow" aria-hidden="true" />
      <div className="wrap hero__grid">
        <div className="hero__copy">
          <h1 className="hero__title" id="hero-title">
            <span className="line">Remember more.</span>{" "}
            <span className="line hero__title-accent">Worry less.</span>
          </h1>
          <p className="hero__sub">
            Write or talk about your day. {BRAND} keeps it safe, answers your questions later, and shows you where every
            answer came from.
          </p>
          <div className="btn-row hero__actions">
            <a className="btn btn--primary btn--large" href={START_URL}>
              Start free
              <ArrowIcon />
            </a>
            <a className="btn btn--secondary btn--large" href="#film">
              <PlayIcon />
              Watch the film
            </a>
          </div>
          <ul className="hero__promises" role="list" aria-label="What you can count on">
            {PROMISES.map((promise) => (
              <li key={promise.label}>
                {promise.icon}
                {promise.label}
              </li>
            ))}
          </ul>
          <p className="hero__note">
            Works in any web browser.{" "}
            <a href="#get-app">
              <DownloadIcon />
              Get the Android app
            </a>
          </p>
        </div>

        <div className="hero__art">
          <div className="hero__phone phone">
            <div className="hero__screen">
              <HeroShot />
            </div>
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
          <div className="hero__debo">
            <DeboTomato />
          </div>
        </div>
      </div>
    </section>
  );
}
