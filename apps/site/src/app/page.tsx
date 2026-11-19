import { BRAND, SITE_URL } from "../brand";
import { Ask } from "../components/ask";
import { Characters } from "../components/characters";
import { Closing } from "../components/closing";
import { Faq, QUESTIONS } from "../components/faq";
import { Film } from "../components/film";
import { GetApp } from "../components/get-app";
import { Hero } from "../components/hero";
import { Marquee } from "../components/marquee";
import { More } from "../components/more";
import { Section, SectionHead } from "../components/section";
import { Showcase } from "../components/showcase";
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import { Trust } from "../components/trust";
import { YourPeople } from "../components/your-people";
import { LAUNCH_FILM, videoJsonLd, WALKTHROUGH_FILM } from "../media";

// Structured data for search engines. It says what Debo is and nothing more:
// no ratings, no prices, no counts, because none exist yet. The two films
// come from media.ts, so their entries change with the files.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: BRAND,
      url: SITE_URL,
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Web, Android",
      description:
        "A friendly assistant that remembers your life. Write a journal or talk out loud, then ask about your own past and plans. Every answer shows its source.",
      image: `${SITE_URL}/og.png?v=3`,
    },
    {
      "@type": "FAQPage",
      mainEntity: QUESTIONS.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
    videoJsonLd(LAUNCH_FILM),
    videoJsonLd(WALKTHROUGH_FILM),
  ],
};

// How it works: the four steps, with the phone that follows along.
function HowItWorks() {
  return (
    <Section id="how">
      <SectionHead
        id="how"
        title="Write it. Ask it. See it."
        lead={`${BRAND} keeps your days safe in one place, and helps you find them again when you need them.`}
      />
      <Showcase />
    </Section>
  );
}

// The page, top to bottom. Each section is one component, so a new one slots
// in with one line. Keep the order a story: what it is, how it works, why you
// can trust the answers, who you talk to, what else it does, then the film,
// the apps, your data, questions and a last call to start.
export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <a className="skip-link" href="#main">
        Skip to the main content
      </a>
      <SiteHeader />
      <main id="main">
        <Hero />
        <Marquee />
        <HowItWorks />
        <Ask />
        <Characters />
        <YourPeople />
        <More />
        <Film />
        <GetApp />
        <Trust />
        <Faq />
        <Closing />
      </main>
      <SiteFooter />
    </>
  );
}
