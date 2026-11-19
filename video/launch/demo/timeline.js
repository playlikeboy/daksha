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
    { clip: "welcome", dur: 3.0, step: 0 },
    { clip: "write", dur: 9.0, step: 1, taps: [1.0, 4.8] },
    { clip: "entry", dur: 5.4, step: 2 },
    { clip: "knows", dur: 5.4, step: 3 },
    { clip: "record", dur: 5.8, step: 4, taps: [1.0] },
    { clip: "talk", dur: 4.0, step: 5 },
    { clip: "tasks", dur: 4.6, step: 5 },
    { clip: "face", dur: 4.8, step: 6, taps: [1.2, 1.9, 2.6, 3.3] },
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
    { title: "Say hello", sub: "Debo shows you around the first time you open it." },
    { title: "Write a day", sub: "A few lines about what happened. It is saved when you press Save entry." },
    { title: "Open any entry", sub: "See what Debo learned from it, and the entries like it." },
    { title: "See what Debo knows", sub: "Every memory shows the entry it came from. Fix it or forget it." },
    { title: "Record a voice note", sub: "The screen shows when the microphone is on." },
    { title: "Debo asks before it acts", sub: "Anything that leaves Debo waits for your yes.", calm: true },
    { title: "Make it yours", sub: "Make a face, make someone to talk to, and pick your reminders." },
  ];
  const steps = stepText.map((s, i) => {
    const mine = segs.filter((g) => g.step === i);
    return { ...s, n: i + 1, t0: mine[0].t0, t1: mine[mine.length - 1].t1 };
  });

  const taps = segs.flatMap((g) => (g.taps ?? []).map((x) => g.t0 + x));

  return { W, H, D, intro, outro, footEnd, segs, steps, taps };
}
if (typeof module !== "undefined") module.exports = { buildDemo };
