import { BRAND } from "../brand";
import { LAUNCH_FILM, WALKTHROUGH_FILM } from "../media";
import { FilmPlayer } from "./film-player";
import { Badge, Section, SectionHead } from "./section";

// A short animated film: the app's cards are redrawn (not screen recordings), with words that build
// on screen (source in video/launch/film2). Below it, a walkthrough recorded from the app in demo mode, with step captions.
// Both have music and sound effects made in video/launch/audio, and no speech.
// The files, posters and descriptions live in media.ts, so new footage is a change there.
export function Film() {
  return (
    <Section id="film">
      <SectionHead
        id="film"
        badge={<Badge>About a minute</Badge>}
        title={`See ${BRAND} in a minute`}
        lead={`A short animated film: write down a day, ask about it, and see where each answer came from. Then fix what ${BRAND} knows, talk out loud, and say yes before anything changes in your apps. Music and sound, no speech.`}
      />
      {/* Older links point at #demo. */}
      <span id="demo" />
      <div className="film">
        <div className="film__frame" data-reveal="blur">
          <FilmPlayer film={LAUNCH_FILM} describedBy="film-launch-desc" />
        </div>
        <p className="visually-hidden" id="film-launch-desc">
          {LAUNCH_FILM.description}
        </p>
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
            Recorded from the app in demo mode, just under a minute. All the entries are made-up sample text, and the
            typing is sped up.
          </p>
        </div>
        <div className="film__frame" data-reveal="">
          <FilmPlayer film={WALKTHROUGH_FILM} describedBy="film-walkthrough-desc" />
        </div>
        <p className="visually-hidden" id="film-walkthrough-desc">
          {WALKTHROUGH_FILM.description}
        </p>
      </div>
    </Section>
  );
}
