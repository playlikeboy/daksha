import type { ReactNode } from "react";
import { BRAND } from "../brand";
import { START_URL } from "../links";
import {
  ArrowIcon,
  BookIcon,
  BriefcaseIcon,
  ChartIcon,
  ChatIcon,
  CheckIcon,
  FaceIcon,
  FlowerIcon,
  GlobeIcon,
  HeartIcon,
  StarMoonIcon,
  UploadIcon,
  WandIcon,
} from "./icons";
import { Badge, Section, SectionHead, stagger } from "./section";

// Custom people (decision 33). Every line here must stay true to the app:
// os/apps/server/src/custom-people/ (with its safety.ts rules),
// os/apps/server/src/voice-clone/, the "Custom people" and "Voice notes, calls
// and voice copies" rows of os/docs/FEATURES.md, and the privacy page.
// Change them together.

type Step = { icon: ReactNode; title: string; body: ReactNode };

const STEPS: Step[] = [
  {
    icon: <UploadIcon />,
    title: "Import or describe",
    body: (
      <>
        Describe them in a few words. Or bring their voice notes, call recordings, a WhatsApp chat export, photos and
        videos. {BRAND} tells the voices apart and keeps only that person&rsquo;s own words.
      </>
    ),
  },
  {
    icon: <FaceIcon />,
    title: "Shape their face and voice",
    body: (
      <>
        Design their face: shape, colours, hair and little extras. It smiles and blinks while you build it. Pick a voice,
        or, with their permission, make a copy of their real one. For now, a voice copy needs your own Cartesia key.
      </>
    ),
  },
  {
    icon: <ChatIcon />,
    title: "Talk any time",
    body: (
      <>
        Chat or call whenever you like. They answer in their own style, and you can make up to ten people.
      </>
    ),
  },
];

// What people can use it for. Each one is something the app can do today:
// a person made from a description, talked to in chat or on a call.
// The "try" lines are examples of what you might type, not real chats.
type UseCase = { icon: ReactNode; title: string; body: string; tone: string; wide?: boolean; try?: string };

const USES: UseCase[] = [
  {
    icon: <BriefcaseIcon />,
    title: "Practise a hard conversation",
    body: "Rehearse a job interview, asking for a raise, or saying sorry. Try it as many times as you need, until the words feel like yours.",
    tone: "sky",
    wide: true,
    try: "Be my manager. I want to ask for a raise.",
  },
  {
    icon: <HeartIcon />,
    title: "A friendly voice on a quiet evening",
    body: "Make a warm, easy-going companion to chat with or call after a long day. Always honest that it is an AI.",
    tone: "blush",
  },
  {
    icon: <FlowerIcon />,
    title: "Keep a loved one close",
    body: "From their old messages and voice notes, find their way of saying things again. It speaks gently, as a portrait made from their words, and never claims to be them.",
    tone: "lilac",
  },
  {
    icon: <GlobeIcon />,
    title: "Learn a language",
    body: "A patient partner who never minds the same question twice. Chat in the language you are learning. Calls work in English and Hindi.",
    tone: "mint",
  },
  {
    icon: <ChartIcon />,
    title: "Rehearse your pitch",
    body: "Face a tough investor who asks the hard questions, before the real meeting does.",
    tone: "butter",
    wide: true,
    try: "You're a sceptical investor. Grill me on my numbers.",
  },
  {
    icon: <BookIcon />,
    title: "A study buddy or a coach",
    body: "Someone to quiz you before a test, or to keep you on track with a goal.",
    tone: "peach",
  },
  {
    icon: <WandIcon />,
    title: "Characters you invent",
    body: "A wise old sailor, a grumpy dragon, the hero of your next story. Bring them to life for fun.",
    tone: "sky",
    wide: true,
    try: "You're Captain Ruma, an old sailor with a story for every port.",
  },
  {
    icon: <StarMoonIcon />,
    title: "Bedtime stories with your child",
    body: "Parents can make a gentle storyteller to enjoy together with their child at bedtime. Nothing adult, ever.",
    tone: "lilac",
    wide: true,
    try: "Tell us a short story about a sleepy little cloud.",
  },
];

// The promises, in warm words. Each one is built: see the comment at the top.
const PROMISES = [
  `${BRAND} reads your files once to learn how they talk, then deletes the files.`,
  "The people you make are yours alone. No one else can see them or talk to them.",
  "They are always honest that they are an AI, and never claim to be the real person.",
  "A voice copy needs a clear yes: their permission, or you are close family and they have died. Never a public figure, actor or character.",
  `A copied voice speaks only on your own ${BRAND} calls. It never calls or messages anyone.`,
  "Delete a person at any time, and everything made from your files goes with them.",
];

export function YourPeople() {
  return (
    <Section id="your-people">
      <div className="people">
        <div className="people__glow" aria-hidden="true" />
        <SectionHead
          id="your-people"
          badge={<Badge tone="new">New, early version</Badge>}
          title="Make your own people"
          lead={`Make anyone you would love to talk to: a friend, a coach, someone you miss, or a character you dream up. Describe them or bring their words, and ${BRAND} learns how they talk.`}
        />

        <ol className="people__steps" role="list" aria-label="How it works">
          {STEPS.map((step, index) => (
            <li key={step.title} className="people__step" data-reveal="" style={stagger(index)}>
              <div className="people__step-top">
                <span className="people__num" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="people__step-icon">{step.icon}</span>
              </div>
              <h3 className="h3">{step.title}</h3>
              <p className="body-lg">{step.body}</p>
            </li>
          ))}
        </ol>

        <h3 className="people__uses-title" id="people-uses-title">
          Ideas to start with
        </h3>
        <ul className="uses" role="list" aria-labelledby="people-uses-title">
          {USES.map((use, index) => (
            <li
              key={use.title}
              className={`use use--${use.tone}${use.wide ? " use--wide" : ""}`}
              data-reveal=""
              style={stagger(index % 4)}
            >
              <span className="use__icon">{use.icon}</span>
              <h4 className="use__title">{use.title}</h4>
              <p>{use.body}</p>
              {use.try ? (
                <p className="use__try">
                  <span className="visually-hidden">For example, you might type: </span>
                  {use.try}
                </p>
              ) : null}
            </li>
          ))}
        </ul>

        <div className="people__promise" data-reveal="">
          <div className="people__promise-head">
            <h3 className="h3">Private, kind and honest</h3>
            <p className="body-lg">
              This part is new and still being tested in the real world. These promises are built in from the start.
            </p>
            <a className="btn btn--primary" href={START_URL}>
              Make your first person
              <ArrowIcon />
            </a>
          </div>
          <ul className="people__promises" role="list">
            {PROMISES.map((line) => (
              <li key={line}>
                <CheckIcon />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
