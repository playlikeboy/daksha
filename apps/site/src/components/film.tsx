import { BRAND } from "../brand";
import { LAUNCH_FILM_URL } from "../links";
import { Badge, Section, SectionHead } from "./section";

// A short animated film: the app's cards are redrawn (not screen recordings), with words that build
// on screen (source in video/launch/film2). Below it, a walkthrough of one real recording with step captions.
// Both have music and sound effects made in video/launch/audio, and no speech.
// The two descriptions say "Debo" because that is the word in the films themselves.
const LAUNCH_LABEL = `A short animated film about Debo, with music and sound effects and no speech. Words build on a white screen: Meet Debo, a journal you can talk to. Between the cards, a line repeats: Debo remembers your days, Debo answers from your journal, Debo shows you what it knows, Debo talks with you, Debo remembers your people, Debo asks before it acts. The cards show a journal entry about lunch with Neha and a Goa trip being typed and saved, next to a voice note and a video. A question, what do I need to sort out before the Goa trip, gets an answer with three things to do and the three entries it came from. On What Debo knows, a memory is fixed and another is forgotten. Five characters appear and Debo, a blue blob, is picked for a voice call, where the person says Neha's birthday is on 21 November. People in your life shows Neha, Mum and Aarav, and Debo says Neha's birthday is on Saturday. Connected apps like Gmail and Calendar circle Debo. A card waiting for your yes asks to add the Goa trip to the calendar; Approve is pressed, the days flip over and the word Done appears with confetti. It ends on Debo keeps you in control, the Debo tomato and my.debo.life.`;

const WALKTHROUGH_LABEL = `A walkthrough of one real screen recording of the Debo app, with music and sound effects and no speech. The phone screen sits on the right, and a caption on the left names each step: sign in, write a day, ask about your own life, see where each answer came from, talk to Debo, and connect your apps. A label by the phone shows when the recording is sped up or slowed down. A person signs in and writes a journal entry about lunch with Neha and a Goa trip. In a new chat they ask what to sort out before Mum visits and before the trip. Debo answers with a list of things to do and who to talk to, and shows three journal entries as sources. Then the person starts a voice call, types that they feel overwhelmed, and Debo answers kindly. Then the Apps screen, with Gmail connected. It ends on the Debo name and my.debo.life.`;

export function Film() {
  return (
    <Section id="film">
      <SectionHead
        id="film"
        badge={<Badge>About a minute</Badge>}
        title={`See ${BRAND} in a minute`}
        lead={`A short animated film. You write down a day, ask about your own life and see the entries each answer came from. Then you fix what ${BRAND} knows, talk to it, and say yes before anything changes in your apps. It has music and sound effects but no speech.`}
      />
      {/* Older links point at #demo. */}
      <span id="demo" />
      <div className="film">
        <div className="film__frame" data-reveal="blur">
          <video
            controls
            playsInline
            preload="none"
            width={1920}
            height={1080}
            poster="/debo-launch-poster.webp"
            aria-label={LAUNCH_LABEL}
          >
            <source src={LAUNCH_FILM_URL} type="video/mp4" />
            <source src="/debo-launch.webm" type="video/webm" />
            Your browser cannot play this video. <a href={LAUNCH_FILM_URL}>Download the film</a>.
          </video>
        </div>
        <p className="small film__caption">
          Drawn, not recorded: the cards are rebuilt from the app&rsquo;s own screens and words. All the names and
          entries are made-up sample text.
        </p>
      </div>

      <div className="film-more">
        <div className="section-head" style={{ marginBottom: 0 }}>
          <h3 className="h3" id="walkthrough-title">
            The full walkthrough
          </h3>
          <p className="body-lg">
            One real recording of the app, a little over a minute. The waiting is sped up and the long pauses are cut.
          </p>
        </div>
        <div className="film__frame" data-reveal="">
          <video
            controls
            playsInline
            preload="none"
            width={1920}
            height={1080}
            poster="/debo-demo-poster.webp"
            aria-label={WALKTHROUGH_LABEL}
          >
            <source src="/debo-demo.mp4" type="video/mp4" />
            <source src="/debo-demo.webm" type="video/webm" />
            Your browser cannot play this video. <a href="/debo-demo.mp4">Download the walkthrough</a>.
          </video>
        </div>
      </div>
    </Section>
  );
}
