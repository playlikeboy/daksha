// The demo walkthrough edit, as data. It is cut from one real screen recording of the app
// (780x1688, 24 fps). Nothing is added to the footage: parts where the app waits are sped up,
// and the long pauses are cut out. Times in `src` are seconds in the recording.
// The audio script (../audio/make-audio.py) reads this file too, so sounds follow the edit.
function buildDemo() {
  const W = 1920, H = 1080;
  const intro = 3.2; // title card before the footage
  const outro = 4.8; // end card after it

  // Footage segments, in order. speed > 1 is faster than real time, < 1 is slower.
  const raw = [
    { src: [3.0, 7.6], speed: 1.5, step: 0 }, // sign in
    { src: [7.6, 11.0], speed: 3, step: 0 }, // opening the workspace
    { src: [11.0, 12.5], speed: 3, step: 1 }, // journal opens
    { src: [12.5, 22.0], speed: 1.5, step: 1 }, // typing the entry
    { src: [22.0, 25.4], speed: 1, step: 1 }, // save, "Entry saved"
    { src: [29.2, 32.0], speed: 2, step: 2 }, // to the chat, new side chat
    { src: [32.0, 39.6], speed: 1.5, step: 2 }, // typing the question
    { src: [39.6, 49.3], speed: 5, step: 2 }, // Debo looks through the journal
    { src: [49.3, 51.0], speed: 0.5, step: 3 }, // the entries it found, shown slowly
    { src: [51.0, 58.0], speed: 1, step: 3 }, // the answer
    { src: [63.0, 65.5], speed: 1, step: 4 }, // talk: tap to start
    { src: [65.5, 68.5], speed: 3, step: 4 }, // connecting
    { src: [68.5, 73.0], speed: 1.25, step: 4 }, // Debo says hello
    { src: [73.0, 77.5], speed: 3, step: 4 }, // listening
    { src: [77.5, 81.5], speed: 1.25, step: 4 }, // typing instead of talking
    { src: [81.5, 84.5], speed: 3, step: 4 }, // thinking
    { src: [84.5, 89.0], speed: 1.25, step: 4 }, // Debo answers
    { src: [97.3, 99.0], speed: 1, step: 5 }, // call ends, on to Apps
    { src: [99.0, 105.9], speed: 1, step: 5 }, // the Apps screen
  ];
  let t = intro;
  const segs = raw.map((s, i) => {
    const d = (s.src[1] - s.src[0]) / s.speed;
    const prev = raw[i - 1];
    const seg = { ...s, t0: t, t1: t + d, jump: !prev || Math.abs(prev.src[1] - s.src[0]) > 0.05 };
    t += d;
    return seg;
  });
  const footEnd = t;
  const D = Math.round((footEnd + outro) * 10) / 10;

  const stepText = [
    { title: "Sign in", sub: "Your journal, chats and apps in one private place." },
    { title: "Write a day", sub: "A few lines about what happened. Debo keeps it." },
    { title: "Ask about your own life", sub: "Plain questions, in your own words." },
    { title: "See where each answer came from", sub: "Debo names the journal entries it used." },
    { title: "Talk to Debo", sub: "Say it out loud, or type when you can't talk." },
    { title: "Connect your apps", sub: "Debo asks before it sends or changes anything outside Debo." },
  ];
  const steps = stepText.map((s, i) => {
    const mine = segs.filter((g) => g.step === i);
    return { ...s, n: i + 1, t0: mine[0].t0, t1: mine[mine.length - 1].t1 };
  });

  // Recording time -> output time (null if that moment was cut).
  const out = (x) => {
    for (const s of segs) if (x >= s.src[0] && x <= s.src[1]) return s.t0 + (x - s.src[0]) / s.speed;
    return null;
  };
  // Moments in the recording where a button is pressed, for the tap sounds.
  const tapsSrc = [6.9, 21.9, 31.6, 39.5, 65.3, 77.6, 81.4, 97.4, 98.9];
  const taps = tapsSrc.map(out).filter((x) => x != null);

  return { W, H, D, intro, outro, footEnd, segs, steps, taps };
}
if (typeof module !== "undefined") module.exports = { buildDemo };
