// The second launch film ("film2"), as data. Everything on screen is drawn, not recorded:
// rebuilt cards from the app, kinetic words and the five characters from docs/assets.
// Times are seconds. The engine (engine.js) draws from these times, and the audio script
// (../audio/make-audio.py) reads `cues` from here, so pictures and sounds stay in step.
// Every card shows something the app really does today (see os/docs/FEATURES.md).
function buildFilm2(L) {
  const V = L === "v";
  const W = V ? 1080 : 1920, H = V ? 1920 : 1080;
  const D = 72;

  // Word-by-word text blocks. A line is a list of words and glyphs ({ g: name }).
  // size: "xl" big words, "md" the smaller middle line of a refrain.
  const say = (t0, t1, lines, opts = {}) => ({ t0, t1, lines, ...opts });
  const refrain = (t0, t1, glyph, verb, rest) =>
    say(t0, t1, [{ size: "xl", parts: ["Debo"] }, { size: "md", parts: [{ g: glyph }, ...verb.split(" ")] }, { size: "xl", parts: rest.split(" ") }]);
  const texts = [
    say(0.3, 2.55, [{ size: "xl", parts: ["Meet", { g: "debo" }, "Debo"] }]),
    say(2.55, 5.35, [{ size: "xl", parts: ["A", "journal"] }, { size: "xl", parts: ["you", "can", { g: "chat" }, "talk", "to"] }]),
    refrain(5.35, 7.6, "pen", "remembers", "your days"),
    refrain(15.0, 17.3, "search", "answers", "from your journal"),
    refrain(26.5, 28.75, "eye", "shows you", "what it knows"),
    refrain(34.6, 36.85, "mic", "talks", "with you"),
    refrain(43.6, 45.85, "cake", "remembers", "your people"),
    refrain(56.3, 58.6, "shield", "asks", "before it acts"),
    say(64.6, 67.5, [{ size: "xl", parts: ["Debo"] }, { size: "md", parts: [{ g: "check" }, "keeps", "you"] }, { size: "xl", parts: ["in", "control"] }]),
  ];
  // When each word lands: a steady build, a little slower on the last line.
  for (const b of texts) {
    let k = 0;
    b.lines.forEach((ln, li) => {
      ln.times = ln.parts.map(() => b.t0 + 0.12 + 0.15 * k++ + (li === b.lines.length - 1 && li > 0 ? 0.05 : 0));
    });
  }

  // The card scenes. Times inside are seconds from the scene's t0.
  const S = {
    journal: { t0: 7.6, t1: 15.0, plus: 0.1, open: 0.55, type: [1.0, 3.5], save: 3.9, saved: 4.15, stack: 4.75, out: 7.05 },
    ask: { t0: 17.3, t1: 26.5, type: [0.15, 1.75], chip: 2.0, dots: [2.3, 3.4], answer: 3.4, lines: [3.65, 3.9, 4.15], chips: [4.5, 4.7, 4.9], found: 4.5, tap: 5.9, open: 6.15, out: 8.75 },
    knows: { t0: 28.75, t1: 34.6, rows: [0.35, 0.55, 0.75, 0.95], fix: 1.9, fixType: [2.15, 3.0], fixSaved: 3.1, forget: 3.75, gone: 4.0, out: 5.5 },
    talk: { t0: 36.85, t1: 43.6, burst: 0.1, pick: 1.55, focus: 1.9, listen: 2.2, b1: [2.55, 3.45], b2: [3.8, 4.85], b3: [5.15, 5.85], out: 6.4 },
    people: { t0: 45.85, t1: 53.0, cards: [0.1, 0.35, 0.6], up: 2.3, q: [2.65, 3.4], chip: 3.6, a: [3.95, 5.6], out: 6.8 },
    apps: { t0: 53.0, t1: 56.3, hub: 0.05, burst: 0.3, checks: 1.3, caption: 1.0, out: 3.0 },
    approve: { t0: 58.6, t1: 64.6, chip: 0.05, card: 0.25, press: 1.75, flip: 2.25, tiles: 2.1, done: 3.35, confetti: 3.45, out: 5.75 },
    end: { t0: 67.5, logo: 0.15, name: 0.55, sub: 0.95, url: 1.45 },
  };

  // Sound cues for the audio script.
  const cues = [];
  const cue = (t, k, extra) => cues.push({ t: Math.round(t * 1000) / 1000, k, ...extra });
  texts.forEach((b, bi) => b.lines.forEach((ln) => ln.parts.forEach((p, i) => cue(ln.times[i], p.g ? "glyph" : "word", { n: i, b: bi }))));
  const at = (sc, u) => S[sc].t0 + u;
  // Typing: a soft tick every few letters.
  const typing = (sc, [a, b]) => cue(at(sc, a), "type", { d: b - a });
  // journal
  cue(at("journal", S.journal.plus), "pop");
  cue(at("journal", S.journal.open) - 0.08, "whoosh");
  typing("journal", S.journal.type);
  cue(at("journal", S.journal.save), "tap");
  cue(at("journal", S.journal.saved), "ding");
  cue(at("journal", S.journal.stack) - 0.1, "whoosh");
  cue(at("journal", S.journal.stack) + 0.25, "swish");
  cue(at("journal", S.journal.out) - 0.05, "out");
  // ask
  cue(at("ask", 0.1), "pop");
  typing("ask", S.ask.type);
  cue(at("ask", S.ask.chip), "pop");
  cue(at("ask", S.ask.answer) - 0.08, "whoosh");
  S.ask.chips.forEach((u) => cue(at("ask", u), "chip"));
  cue(at("ask", S.ask.tap), "tap");
  cue(at("ask", S.ask.open) - 0.06, "whoosh");
  cue(at("ask", S.ask.out) - 0.05, "out");
  // knows
  cue(at("knows", 0.05), "whoosh");
  S.knows.rows.forEach((u) => cue(at("knows", u), "chip"));
  cue(at("knows", S.knows.fix), "tap");
  typing("knows", S.knows.fixType);
  cue(at("knows", S.knows.fixSaved), "ding");
  cue(at("knows", S.knows.forget), "tap");
  cue(at("knows", S.knows.gone), "swish");
  cue(at("knows", S.knows.out) - 0.05, "out");
  // talk
  [0, 1, 2, 3, 4].forEach((i) => cue(at("talk", S.talk.burst + 0.07 * i), "glyph", { n: i }));
  cue(at("talk", S.talk.pick), "tap");
  cue(at("talk", S.talk.focus), "whoosh");
  [S.talk.b1, S.talk.b2, S.talk.b3].forEach((r) => { cue(at("talk", r[0]) - 0.02, "pop"); typing("talk", r); });
  cue(at("talk", S.talk.out) - 0.05, "out");
  // people
  S.people.cards.forEach((u) => cue(at("people", u), "whoosh"));
  cue(at("people", S.people.up) - 0.05, "swish");
  cue(at("people", S.people.q[0]) - 0.02, "pop");
  typing("people", S.people.q);
  cue(at("people", S.people.chip), "pop");
  typing("people", S.people.a);
  cue(at("people", S.people.out) - 0.05, "out");
  // apps
  cue(at("apps", S.apps.hub), "pop");
  cue(at("apps", S.apps.burst), "burst");
  cue(at("apps", S.apps.checks), "sparkle", { small: true });
  cue(at("apps", S.apps.out) - 0.05, "out");
  // approve
  cue(at("approve", S.approve.chip), "pop");
  cue(at("approve", S.approve.card) - 0.05, "whoosh");
  cue(at("approve", S.approve.press), "tap");
  cue(at("approve", S.approve.tiles), "swish");
  cue(at("approve", S.approve.flip), "flip");
  cue(at("approve", S.approve.done), "check");
  cue(at("approve", S.approve.confetti), "sparkle");
  cue(at("approve", S.approve.out) - 0.05, "out");
  // end
  cue(at("end", S.end.logo), "logo");
  cue(at("end", S.end.url), "pop");

  return { W, H, D, V, texts, S, cues };
}
if (typeof module !== "undefined") module.exports = { buildFilm2 };
