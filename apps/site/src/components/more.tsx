import type { ReactNode } from "react";
import { BRAND } from "../brand";
import { BellIcon, ImageIcon, KeyIcon, PageIcon, PlugIcon } from "./icons";
import { Badge, Section, SectionHead, stagger } from "./section";

// More things that work in the app today. They are all new and have had little
// real-world testing, so each says "New, early version". Every line here must
// stay true to the app: see os/docs/FEATURES.md.
type TileProps = {
  id?: string;
  className: string;
  icon: ReactNode;
  title: string;
  index: number;
  children: ReactNode;
};

function Tile({ id, className, icon, title, index, children }: TileProps) {
  return (
    <article id={id} className={`tile ${className}`} data-reveal="" style={stagger(index)}>
      <div className="tile__top">
        <span className="tile__icon">{icon}</span>
        <Badge tone="new">New, early version</Badge>
      </div>
      <h3 className="h3">{title}</h3>
      {children}
    </article>
  );
}

export function More() {
  return (
    <Section id="more" tone="band">
      <SectionHead
        id="more"
        title={`And a few more things ${BRAND} does`}
        lead="These parts are new. They work in the app today, but have had little real-world testing."
      />
      <div className="bento">
        <Tile id="apps" className="tile--apps" icon={<PlugIcon />} title="Connect your apps" index={0}>
          <p className="body-lg">
            Connect places like your mail and calendar, so {BRAND} can answer from more than your journal. You sign
            in on the app&rsquo;s own page, and {BRAND} never sees your password.
          </p>
          <p className="body-lg">
            Before it sends, posts, pays, deletes or changes anything outside {BRAND}, it waits for a clear yes from
            you on the screen.
          </p>
          <figure className="approve">
            <p>
              <strong>Waiting for your yes.</strong> Add &ldquo;Goa trip&rdquo; to your calendar?
            </p>
            <div className="approve__row" aria-hidden="true">
              <span className="approve__btn approve__btn--yes">Approve</span>
              <span className="approve__btn">Not now</span>
            </div>
            <figcaption className="small">An example of how {BRAND} asks first, with sample words.</figcaption>
          </figure>
        </Tile>

        <Tile className="tile--remind" icon={<BellIcon />} title="Reminders that come to you" index={1}>
          <p className="body-lg">
            Birthdays and special days, the day before and that morning. A morning check-in, if you want one. And
            anything you ask {BRAND} to remind you about. Never between 10 at night and 7 in the morning.
          </p>
        </Tile>

        <Tile className="tile--pages" icon={<PageIcon />} title="A page for every entry" index={0}>
          <p className="body-lg">
            Play a voice note or a video, tap a word to jump to that moment, and see what {BRAND} learned from it and
            which entries are like it.
          </p>
        </Tile>

        <Tile className="tile--pictures" icon={<ImageIcon />} title="Make a picture" index={1}>
          <p className="body-lg">
            Describe a picture in chat or on a call, and {BRAND} draws it. Up to 20 a day. Only you can see them, and
            you can delete each one.
          </p>
        </Tile>

        <Tile className="tile--keys" icon={<KeyIcon />} title="Use your own key" index={2}>
          <p className="body-lg">
            If you pay an AI company like Anthropic or OpenRouter yourself, add your own key in settings. {BRAND}{" "}
            checks it, keeps it locked away, and only ever shows its last four characters.
          </p>
        </Tile>
      </div>
    </Section>
  );
}
