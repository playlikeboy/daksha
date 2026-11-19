"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { BRAND } from "../brand";
import { AskIcon, EyeIcon, MicIcon, PenIcon } from "./icons";

// How it works: four steps on the left, and on wide screens one phone that
// stays in view on the right and changes to the screen of the step being read.
// On phones each step shows its own screenshot instead.
// The screenshots are real, from the app with a demo account (public/shots).
type Step = {
  id: string;
  icon: ReactNode;
  title: string;
  body: string;
  points: string[];
  shot: { src: string; alt: string };
};

const STEPS: Step[] = [
  {
    id: "write",
    icon: <PenIcon />,
    title: "Write it down, or record it",
    body: "Keep a journal in your own words, a line or a page. Nothing is saved until you press the button.",
    points: [
      "Write, find, change or delete any entry. Only you can read them.",
      `New, early version: record a voice note or a video, and ${BRAND} writes out the words so you can search them.`,
      "Pick the day it happened, so the past goes in the right place.",
    ],
    shot: {
      src: "/shots/journal-light.webp",
      alt: `The ${BRAND} journal. A large writing box asks: What happened today? Who did you see? Below it are the day, a Save entry button and a box to find an entry.`,
    },
  },
  {
    id: "ask",
    icon: <AskIcon />,
    title: "Ask about your life",
    body: `Ask in plain words, like "What do I need to sort out before the trip?". ${BRAND} answers only from what you wrote.`,
    points: [
      "Every answer shows the entries it came from, with the date.",
      "Press a source to open the original entry.",
      `If ${BRAND} cannot find it, it says so instead of guessing.`,
    ],
    shot: {
      src: "/shots/chat-light.webp",
      alt: `The ${BRAND} app. ${BRAND} answers a question about getting ready for Mum's visit and a Goa trip: clean the spare room before Mum arrives, talk to Neha and Aarav, and it says plainly that the journal does not give Mum's arrival date.`,
    },
  },
  {
    id: "knows",
    icon: <EyeIcon />,
    title: `See what ${BRAND} knows`,
    body: `After you save an entry, ${BRAND} picks out the lasting facts, like people, places and plans. They all live on one page.`,
    points: [
      "Every memory is one plain sentence, with the entry it came from.",
      `Got something wrong? Fix it.`,
      `Do not want it kept? Make ${BRAND} forget it.`,
    ],
    shot: {
      src: "/shots/knows-light.webp",
      alt: `The What ${BRAND} knows page. A memory reads: You plan to water them every second morning while the weather stays warm. It shows the source chip Journal, 11 November and the buttons Fix this memory and Forget this memory.`,
    },
  },
  {
    id: "talk",
    icon: <MicIcon />,
    title: "Or just talk",
    body: `Press talk and have a real conversation with ${BRAND} out loud, in English or Hindi.`,
    points: [
      `${BRAND} listens only while you talk, and the screen always says whether the microphone is on.`,
      "Each call is kept in your journal as text, so you can ask about it later.",
      "Pick who you talk to, and the voice you like.",
    ],
    shot: {
      src: "/shots/talk-light.webp",
      alt: `A voice call with ${BRAND}. The red tomato sits above the word Listening and Microphone on. ${BRAND} has said: Hey! I'm here. What's on your mind? Buttons below: Mic on, Stop ${BRAND}, Type and End.`,
    },
  },
];

export function Showcase() {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const index = Number((entry.target as HTMLElement).dataset.index);
            if (!Number.isNaN(index)) setActive(index);
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const element of stepRefs.current) if (element) observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="showcase">
      <ol className="showcase__steps" role="list">
        {STEPS.map((step, index) => (
          <li
            key={step.id}
            id={step.id}
            data-index={index}
            ref={(element) => {
              stepRefs.current[index] = element;
            }}
            className={index === active ? "step is-active" : "step"}
          >
            <div className="step__top">
              <span className="step__icon">{step.icon}</span>
              <span className="badge badge--live">Works today</span>
            </div>
            <h3 className="h3">{step.title}</h3>
            <p className="body-lg">{step.body}</p>
            <ul className="step__points" role="list">
              {step.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <div className="step__phone phone">
              <img src={step.shot.src} alt={step.shot.alt} width={780} height={1688} loading="lazy" decoding="async" />
            </div>
          </li>
        ))}
      </ol>

      {/* The same screenshots again, for wide screens. Hidden from screen readers,
          because each step above already carries its own picture and description. */}
      <div className="showcase__stage" aria-hidden="true">
        <div className="showcase__frame">
          <div className="phone">
            <div className="showcase__screens">
              {STEPS.map((step, index) => (
                <img
                  key={step.id}
                  src={step.shot.src}
                  alt=""
                  width={780}
                  height={1688}
                  loading="lazy"
                  decoding="async"
                  className={index === active ? "is-active" : undefined}
                />
              ))}
            </div>
          </div>
          <div className="showcase__dots">
            {STEPS.map((step, index) => (
              <span key={step.id} className={index === active ? "is-active" : undefined} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
