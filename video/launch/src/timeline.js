// The whole edit, as data. Times are seconds on the OUTPUT clock unless noted.
// M holds the marks from the recording (seconds since the recording started), so the
// footage cut points follow the recording if it is made again.
// Cam keys are {t, fx, fy, S}: image point (fx, fy) of the phone screen sits on the
// phone anchor of the stage, at scale S. S never goes above 1.0, because the footage is
// 780 px wide and must not be enlarged.
function buildTimeline(M, L) {
  const V = L === "v";
  const W = V ? 1080 : 1920, H = V ? 1920 : 1080;
  const D = 69;

  // Phone anchor on the stage, and how far below the frame it parks.
  const anchor = V ? { x: 540, y: 1240 } : { x: 1380, y: 540 };
  const park = V ? 2400 : 1500;

  const z = (s) => (V ? 0.78 : s); // vertical cut keeps the whole phone in view
  const fy = (y) => (V ? 844 : y);
  const cam = [
    { t: 7.2, fx: 390, fy: 844, S: V ? 0.78 : 0.57, y: park },
    { t: 8.5, fx: 390, fy: 844, S: V ? 0.78 : 0.57, y: anchor.y },
    { t: 10.3, fx: 390, fy: 844, S: z(0.57), y: anchor.y },
    { t: 11.3, fx: 390, fy: fy(780), S: z(0.8), y: anchor.y },
    { t: 16.4, fx: 390, fy: fy(780), S: z(0.8), y: anchor.y },
    { t: 17.6, fx: 390, fy: fy(1000), S: z(0.8), y: anchor.y },
    { t: 24.6, fx: 390, fy: fy(1000), S: z(0.8), y: anchor.y },
    { t: 28.2, fx: 390, fy: fy(900), S: z(0.9), y: anchor.y },
    { t: 29.9, fx: 390, fy: fy(900), S: z(1.0), y: anchor.y },
    { t: 31.0, fx: 390, fy: fy(900), S: z(1.0), y: anchor.y },
    { t: 32.3, fx: 390, fy: fy(1000), S: z(0.85), y: anchor.y },
    { t: 38.0, fx: 390, fy: fy(1000), S: z(0.85), y: anchor.y },
    { t: 39.0, fx: 390, fy: fy(950), S: z(0.8), y: anchor.y },
    { t: 50.6, fx: 390, fy: fy(950), S: z(0.8), y: anchor.y },
    { t: 51.6, fx: 390, fy: fy(1000), S: z(0.8), y: anchor.y },
    { t: 61.0, fx: 390, fy: fy(1000), S: z(0.8), y: anchor.y },
    { t: 62.4, fx: 390, fy: fy(1000), S: z(0.8), y: park },
  ];

  // Footage: output time -> recording time. Each segment fades in over `fade` seconds.
  const o = M.journal_open, ty = M.journal_typed, sv = M.journal_saved;
  const qs = M.q_start, qt = M.q_typed, qn = M.q_sent;
  const screen = [
    { t0: 7.2, fade: 0, map: [[7.2, o - 0.5], [8.0, o - 0.5], [9.4, o + 0.7], [13.8, ty], [14.9, ty + 1.2], [17.6, sv + 2.6]] },
    { t0: 17.0, fade: 0.5, map: [[17.0, 35.6], [18.4, qs + 0.3], [22.6, qt], [23.6, qn + 0.6], [25.2, qn + 1.2]] },
    { t0: 25.0, fade: 0.3, map: [[25.0, 55.6], [27.0, 56.3], [31.9, 59.2]] },
    { t0: 31.5, fade: 0.4, map: [[31.5, 62.2], [33.5, 64.0], [38.4, 70.0]] },
    { t0: 38.0, fade: 0.4, map: [[38.0, M.voice_open], [39.4, 75.3], [40.4, 76.0]] },
    { t0: 40.0, fade: 0.3, map: [[40.0, 86.5], [41.5, 88.7], [41.8, 89.0], [44.6, M.feel_typed - 0.5], [45.3, M.feel_sent + 0.3], [46.3, 116.2], [48.3, 121.8], [51.0, 123.5]] },
    { t0: 50.8, fade: 0.5, map: [[50.8, M.knows_top], [57.4, M.knows_top + 5.6]] },
    { t0: 57.0, fade: 0.5, map: [[57.0, M.apps_top + 0.2], [62.4, M.apps_top + 6.5]] },
  ];

  // Backgrounds: a base colour and circular wipes that grow over it.
  const wipes = [
    { t0: 3.5, t1: 4.3, color: "#e5392b", cx: W / 2, cy: H / 2 },
    { t0: 7.3, t1: 8.2, color: "#f4f2ee", cx: V ? 540 : 1380, cy: V ? 1300 : 900 },
    { t0: 62.2, t1: 63.0, color: "#e5392b", cx: W / 2, cy: H / 2 },
  ];

  const left = V ? 90 : 120, tw = V ? 900 : 780, top = V ? 170 : 175;
  const head = V ? 84 : 92, sub = V ? 38 : 40;
  const text = [
    // Cold open
    { t0: 0.35, t1: 3.5, x: 0, y: 0, w: W, center: true, cy: H / 2 - 60, color: "#fff", size: V ? 100 : 118,
      lines: [{ text: "You wrote it down somewhere." }, { text: "But where?", delay: 1.25, color: "#ffb0a8" }] },
    // Reveal
    { t0: 5.0, t1: 7.0, x: 0, y: 0, w: W, center: true, cy: V ? 1290 : 810, color: "#fff", size: V ? 170 : 150,
      lines: [{ text: "Meet Debo." }], sub: "A friendly assistant that remembers your life.", subSize: V ? 48 : 54, subDelay: 0.6 },
    // Beats
    { t0: 8.5, t1: 16.9, x: left, y: top, w: tw, size: head, subSize: sub, lines: [{ text: "Write your day down." }],
      sub: "A few lines is enough. You can also speak it or record it." },
    { t0: 17.4, t1: 28.6, x: left, y: top, w: tw, size: head, subSize: sub, lines: [{ text: "Then ask about your own life." }],
      sub: "Plain questions, in your own words." },
    { t0: 29.0, t1: 37.6, x: left, y: top, w: tw, size: head, subSize: sub, lines: [{ text: "Every answer shows where it came from." }],
      sub: "Real entries from your journal, named." },
    { t0: 38.4, t1: 50.4, x: left, y: top, w: tw, size: head, subSize: sub, lines: [{ text: "Talk to it." }],
      sub: "Say it out loud, or type when you can't." },
    { t0: 51.2, t1: 61.2 - 4.2, x: left, y: top, w: tw, size: head, subSize: sub, lines: [{ text: "See, fix or forget anything it knows." }],
      sub: "Every memory shows the entry it came from." },
    { t0: 57.4, t1: 61.8, x: left, y: top, w: tw, size: head, subSize: sub, lines: [{ text: "Your apps, only with your yes." }],
      sub: "Debo asks before it sends, posts or changes anything outside Debo." },
    // End card
    { t0: 64.0, t1: 99, x: 0, y: 0, w: W, center: true, cy: V ? 1230 : 700, color: "#fff", size: V ? 170 : 150,
      lines: [{ text: "Debo" }], sub: "A friendly assistant that remembers your life.", subSize: V ? 46 : 50, subDelay: 0.45, noExit: true },
    { t0: 65.4, t1: 99, x: 0, y: 0, w: W, center: true, cy: V ? 1570 : 905, url: "my.debo.life", noExit: true, size: V ? 64 : 68 },
  ];

  // Callouts: a pill with a line to a real spot on the screen (image coordinates).
  const cp = V ? { x: 540, y: 485, center: true } : null;
  const hp = (y) => ({ x: left, y });
  const callouts = [
    { t0: 11.8, t1: 16.4, text: "Plain words, like a note to yourself", target: [38, 880], pos: V ? cp : hp(760) },
    { t0: 19.6, t1: 24.4, text: "Ask it the way you would ask a friend", target: [36, 1400], pos: V ? cp : hp(790) },
    { t0: 29.6, t1: 31.3, text: "Your own entries, named", target: [66, 1075], pos: V ? cp : hp(760) },
    { t0: 33.6, t1: 37.4, text: "A plan built from what you wrote", target: [58, 770], pos: V ? cp : hp(760) },
    { t0: 42.2, t1: 44.9, text: "Type if you can't talk", target: [72, 1268], pos: V ? cp : hp(790) },
    { t0: 48.2, t1: 50.6, text: "A kind answer, in plain words", target: [40, 945], pos: V ? cp : hp(760) },
    { t0: 58.4, t1: 61.4, text: "Gmail, Calendar and many more", target: [52, 1260], pos: V ? cp : hp(760) },
    { t0: 52.4, t1: 56.6, text: "Fix anything that is wrong", target: [78, 990], pos: V ? cp : hp(720) },
    { t0: 53.2, t1: 56.6, text: "Forget anything you want gone", target: [78, 1097], pos: V ? { x: 540, y: 565, center: true } : hp(820) },
  ];

  return { W, H, D, V, anchor, cam, screen, wipes, text, callouts, left };
}
