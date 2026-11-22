// The app walkthrough edit, as data. The phone plays short clips recorded from the app in
// demo mode, with made-up sample entries (os/scripts/site-media.mjs, see docs/MEDIA.md).
// Each clip is a folder of 780x1688 frames plus how long each frame stays on screen
// (clips.json). `dur` is how long the clip is on screen here; when it is longer than the
// clip, the last frame stays. `taps` are seconds into the clip where a button is pressed.
// The audio script (../audio/make-audio.py) reads this file too, so sounds follow the edit.
function buildDemo() {
  const W = 1920, H = 1080;
  const intro = 3.2; // title card before the footage
  const outro = 4.8; // end card after it

  // Clips, in order. `step` is the caption on the left.
  const raw = [
    { clip: "home", dur: 5.2, step: 0 },
    { clip: "chat", dur: 6.0, step: 1 },
    { clip: "write", dur: 9.0, step: 2, taps: [1.0, 4.8] },
    { clip: "entry", dur: 5.0, step: 3 },
    { clip: "knows", dur: 5.0, step: 3 },
    { clip: "talk", dur: 4.0, step: 4 },
    { clip: "tasks", dur: 4.4, step: 4 },
    { clip: "apps", dur: 5.4, step: 5 },
    { clip: "people", dur: 5.0, step: 6 },
    { clip: "reminders", dur: 3.4, step: 6 },
  ];
  let t = intro;
  const segs = raw.map((s) => {
    const seg = { ...s, t0: t, t1: t + s.dur, jump: true };
    t += s.dur;
    return seg;
  });
  const footEnd = t;
  const D = Math.round((footEnd + outro) * 10) / 10;

  // `calm` marks the step where the beat rests.
  const stepText = [
    { title: "Start at Home", sub: "Ask anything, or pick what you want to do today." },
    { title: "Ask in plain words", sub: "Type a question about your life, or tap a suggestion." },
    { title: "Write a day", sub: "A few lines about what happened. It is saved when you press Save entry." },
    { title: "See what Daksha knows", sub: "Open any entry to see what Daksha learned. Every memory shows where it came from." },
    { title: "Talk, and say yes first", sub: "Anything that leaves Daksha waits for your yes.", calm: true },
    { title: "Connect your apps", sub: "Mail and calendar show example data in this demo." },
    { title: "Make it yours", sub: "Make someone to talk to, and pick your reminders." },
  ];
  const steps = stepText.map((s, i) => {
    const mine = segs.filter((g) => g.step === i);
    return { ...s, n: i + 1, t0: mine[0].t0, t1: mine[mine.length - 1].t1 };
  });

  const taps = segs.flatMap((g) => (g.taps ?? []).map((x) => g.t0 + x));

  return { W, H, D, intro, outro, footEnd, segs, steps, taps };
}
if (typeof module !== "undefined") module.exports = { buildDemo };
