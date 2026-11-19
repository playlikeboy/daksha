// A slow ribbon of things you can do today, under the hero. Every item is live
// in the app; keep it that way. The list is drawn twice so the loop is seamless;
// the copy is hidden from screen readers, and with reduced motion it is not
// shown at all and the first list simply wraps.
const THINGS = [
  "Write a journal",
  "Record a voice note",
  "Ask about your past",
  "See every source",
  "Talk out loud",
  "Fix a memory",
  "Forget a memory",
  "Get birthday reminders",
  "Make a picture",
  "Connect your mail",
  "Use your own key",
  "Download everything",
  "Delete anything",
];

export function Marquee() {
  return (
    <div className="marquee">
      <div className="marquee__track">
        <ul className="marquee__list" role="list" aria-label="Things you can do">
          {THINGS.map((thing) => (
            <li key={thing}>{thing}</li>
          ))}
        </ul>
        <ul className="marquee__list" role="list" aria-hidden="true">
          {THINGS.map((thing) => (
            <li key={thing}>{thing}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
