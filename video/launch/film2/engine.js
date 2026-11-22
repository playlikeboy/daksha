// Draws the second launch film as a pure function of time: seek(t) sets every element for
// time t, so any frame can be rendered in any order. The edit lives in timeline.js.
// Nothing here is a screenshot: the cards are rebuilt from the app's real screens and words.
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const eo3 = (x) => 1 - Math.pow(1 - x, 3);
const eo5 = (x) => 1 - Math.pow(1 - x, 5);
const eio3 = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const ei3 = (x) => x * x * x;
const tr = (t, a, b, f = eio3) => f(clamp((t - a) / (b - a)));
// A damped spring, from the moment it starts (dt in seconds). f: wobbles a second, d: damping.
const spr = (dt, f = 2.1, d = 7) => (dt <= 0 ? 0 : 1 - Math.exp(-d * dt) * Math.cos(2 * Math.PI * f * dt));
const sprS = (dt) => spr(dt, 1.5, 7.5);
const bump = (t, a, d = 0.24) => (t < a || t > a + d ? 0 : Math.sin(Math.PI * (t - a) / d));
const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const css = (e, o) => Object.assign(e.style, o);

// Simple line glyphs (our own drawings, 24x24). No brand logos anywhere.
const G = {
  pen: '<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 013 3L8 18.5z"/><path d="M13.5 7l3 3"/>',
  chat: '<path d="M5 5h14a2 2 0 012 2v8a2 2 0 01-2 2h-8l-5 4v-4H5a2 2 0 01-2-2V7a2 2 0 012-2z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21"/>',
  cake: '<path d="M4 20v-7.5h16V20z"/><path d="M4 16c2.7 1.6 5.3-1.6 8 0s5.3 1.6 8 0"/><path d="M12 12.5V9"/><path d="M12 4c1 1 1 2.4 0 3.2-1-.8-1-2.2 0-3.2z"/>',
  shield: '<path d="M12 3l8 3v6c0 4.8-3.4 8-8 9-4.6-1-8-4.2-8-9V6z"/><path d="M8.6 12.2l2.4 2.4 4.6-4.8"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="3"/><path d="M3.5 7.5l8.5 6 8.5-6"/>',
  book: '<path d="M5 5.5A2.5 2.5 0 017.5 3H19v15H7.5A2.5 2.5 0 005 20.5z"/><path d="M5 20.5A2.5 2.5 0 007.5 23H19v-5"/>',
  doc: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  folder: '<path d="M3 7a2 2 0 012-2h4l2 2.5h8a2 2 0 012 2V18a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  list: '<path d="M10 6.5h10M10 12h10M10 17.5h10"/><path d="M3.5 6.5l1.5 1.5 2.5-3M3.5 12l1.5 1.5 2.5-3M3.5 17.5l1.5 1.5 2.5-3"/>',
  note: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M9 8h6M9 12h6M9 16h3.5"/>',
  grid: '<rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="M3.5 9.5h17M3.5 15h17M9.5 4v16"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="3"/><path d="M16 10.5l5-3v9l-5-3z"/>',
  play: '<path d="M8 5.5l10.5 6.5L8 18.5z" fill="currentColor"/>',
  heart: '<path d="M12 20s-8-4.8-8-10.8A4.2 4.2 0 0112 7a4.2 4.2 0 018 2.2C20 15.2 12 20 12 20z"/>',
  bag: '<rect x="3.5" y="7.5" width="17" height="12.5" rx="2.5"/><path d="M9 7.5V6a2 2 0 012-2h2a2 2 0 012 2v1.5M3.5 12.5h17"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
};
const GC = {
  pen: ["#ffb36b", "#ff8a3d"], chat: ["#6aa8ff", "#3451d1"], search: ["#6aa8ff", "#3451d1"], eye: ["#b39bff", "#8a6cf0"],
  mic: ["#ff8fb0", "#f2668f"], cake: ["#ff9a8a", "#f36b5a"], shield: ["#5fd6a0", "#22b273"], check: ["#6aa8ff", "#3451d1"],
  calendar: ["#ff8a80", "#ef5b4f"], mail: ["#6aa8ff", "#3451d1"], book: ["#ffc65c", "#f5a524"], doc: ["#6aa8ff", "#3a6fd8"],
  folder: ["#ffd36b", "#f2b233"], list: ["#5fd6a0", "#22b273"], note: ["#ffc65c", "#f5a524"], grid: ["#5fd6a0", "#1f9e63"],
  video: ["#b39bff", "#8a6cf0"], heart: ["#ff8fb0", "#f2668f"], bag: ["#6aa8ff", "#3451d1"], sun: ["#ffc65c", "#f5a524"],
};
const svg = (name, size, extra = "") => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" ${extra}>${G[name]}</svg>`;
const gtile = (parent, name, size, radius = 0.28) => {
  const t = el("span", "tile", parent, svg(name, Math.round(size * 0.58)));
  const [a, b] = GC[name] || GC.chat;
  css(t, { width: size + "px", height: size + "px", borderRadius: size * radius + "px", background: `linear-gradient(160deg, ${a}, ${b})`, boxShadow: `0 ${size * 0.12}px ${size * 0.3}px -${size * 0.1}px ${b}99` });
  return t;
};
const ART = (n) => `/art/avatar-${n}.svg`;

async function init() {
  const L = new URLSearchParams(location.search).get("layout") || "h";
  const T = buildFilm2(L);
  const { W, H, V, S } = T;
  const stage = document.getElementById("stage");
  css(stage, { width: W + "px", height: H + "px" });
  document.body.style.width = W + "px";
  await document.fonts.ready;
  await Promise.all(["500", "700", "800"].map((w) => document.fonts.load(`${w} 40px Figtree`)));
  const imgs = [];
  const img = (parent, src, cls) => { const i = el("img", cls || "", parent); i.src = src; i.decoding = "sync"; imgs.push(i); return i; };
  const lay = (h, v) => (V ? v : h);

  // Soft colour drifting in the gradient at the bottom.
  const bg = document.getElementById("bg");
  const blobs = [["#c4d9ff", 900, 0.55], ["#dcd0ff", 700, 0.4], ["#ffd3e1", 800, 0.35]].map(([c, s, o]) => {
    const b = el("div", "blob", bg); css(b, { width: s + "px", height: s * 0.6 + "px", background: c, opacity: o }); return { b, s };
  });

  const world = document.getElementById("world");
  css(world, { left: W / 2 + "px", top: H / 2 + lay(0, 70) + "px", transform: `scale(${lay(1.12, 1.08)})` });
  const texts = el("div", "", stage); css(texts, { position: "absolute", left: 0, top: 0, width: W + "px", height: H + "px" });

  // ---------------------------------------------------------------- kinetic words
  const blocks = T.texts.map((b) => {
    const box = el("div", "block", texts);
    const lines = b.lines.map((ln) => {
      const d = el("div", "line " + ln.size, box);
      const base = ln.size === "xl" ? lay(128, 120) : lay(78, 74);
      d.style.fontSize = base + "px";
      const toks = ln.parts.map((p, i) => {
        let e;
        if (typeof p === "string") e = el("span", "tok", d, p);
        else if (p.g === "debo") { e = el("span", "tok gt face", d); img(e, ART("debo")); }
        else {
          e = el("span", "tok gt", d, svg(p.g, 24));
          const [c1, c2] = GC[p.g]; e.style.background = `linear-gradient(160deg, ${c1}, ${c2})`;
        }
        return { e, t: ln.times[i], g: typeof p !== "string" };
      });
      return { d, toks, base };
    });
    return { b, box, lines };
  });
  // Fit each line in the frame, then centre the block a little above the middle.
  const maxW = lay(1560, 940);
  for (const bl of blocks) {
    for (const ln of bl.lines) { const w = ln.d.scrollWidth; if (w > maxW) ln.d.style.fontSize = (ln.base * maxW) / w + "px"; }
    const h = bl.box.offsetHeight;
    bl.box.style.top = H / 2 - h / 2 - lay(20, 60) + "px";
  }
  const drawBlock = (bl, t) => {
    const { t0, t1 } = bl.b;
    const on = t >= t0 - 0.01 && t < t1;
    bl.box.style.display = on ? "flex" : "none";
    if (!on) return;
    let n = 0;
    for (const ln of bl.lines) for (const k of ln.toks) {
      const dt = t - k.t, e = tr(t, t1 - 0.42 + n * 0.018, t1 - 0.1 + n * 0.018, (x) => x * x);
      n++;
      if (dt < 0) { k.e.style.opacity = 0; continue; }
      if (k.g) {
        const s = spr(dt, 1.9, 6.5);
        k.e.style.transform = `translateY(${-e * 50}px) scale(${s * (1 - 0.3 * e)}) rotate(${(1 - s) * -28}deg)`;
        k.e.style.opacity = clamp(dt / 0.06) * (1 - e);
        k.e.style.filter = "none";
      } else {
        const s = spr(dt, 2.0, 7.5);
        k.e.style.transform = `translateY(${(1 - s) * 0.55 - e * 0.4}em) scale(${0.86 + 0.14 * s})`;
        k.e.style.opacity = clamp(dt / 0.1) * (1 - e);
        const bl2 = Math.max(0, 1 - dt / 0.16) * 10 + e * 8;
        k.e.style.filter = bl2 > 0.2 ? `blur(${bl2}px)` : "none";
      }
    }
  };

  // ---------------------------------------------------------------- shared helpers
  // place(): x, y from the middle of the frame; ax, ay: which point of the element sits there.
  const place = (e, p) => {
    const o = p.o == null ? 1 : p.o;
    if (e._d === undefined) e._d = e.style.display; // keep any inline display (flex) it was built with
    if (o <= 0.002) { e.style.display = "none"; return; }
    e.style.display = e._d;
    e.style.opacity = o;
    e.style.transform = `translate3d(${p.x || 0}px, ${p.y || 0}px, 0) translate(${p.ax || "-50%"}, ${p.ay || "-50%"}) perspective(1800px) rotateX(${p.rx || 0}deg) rotateY(${p.ry || 0}deg) rotate(${p.rz || 0}deg) scale(${p.s == null ? 1 : p.s})`;
  };
  const scene = (key) => { const r = el("div", "scene", world); return { r, ...S[key] }; };
  // Exit for a whole scene: up, a little smaller, faded.
  const exitK = (sc, u) => tr(u, sc.out, sc.out + 0.42, (x) => x * x);
  const showScene = (sc, t) => {
    const on = t >= sc.t0 - 0.01 && t < sc.t1;
    sc.r.style.display = on ? "" : "none";
    if (!on) return null;
    const u = t - sc.t0, e = exitK(sc, u);
    sc.r.style.opacity = 1 - e;
    sc.r.style.transform = `translateY(${-e * 140}px) scale(${1 - 0.05 * e})`;
    return u;
  };
  // Typing text that keeps its final size from the first frame.
  const typer = (parent, full) => {
    const a = el("span", "", parent), c = el("span", "caret", parent), r = el("span", "ghost", parent, full);
    let last = -1;
    return (k, caretOn = true) => {
      const n = Math.round(clamp(k) * full.length);
      if (n !== last) { a.textContent = full.slice(0, n); r.textContent = full.slice(n); last = n; }
      c.style.opacity = caretOn ? 1 : 0;
    };
  };
  const typeK = (u, [a, b]) => clamp((u - a) / (b - a));
  // The avatar chip: a round face with a name pill and a status line.
  const chip = (parent, who, size) => {
    const w = el("div", "abs", parent); css(w, { display: "flex", flexDirection: "column", alignItems: "center" });
    const f = el("div", "face", w); css(f, { width: size + "px", height: size + "px", boxShadow: "var(--shadow-s)" }); img(f, ART(who));
    const pill = el("div", "", w); css(pill, { marginTop: -size * 0.12 + "px", background: "#fff", borderRadius: "28px", padding: "10px 30px 12px", boxShadow: "var(--shadow-s)", textAlign: "center", position: "relative" });
    el("div", "", pill, "Daksha").style.cssText = "font-weight:700;font-size:34px;line-height:1.15";
    const st = el("div", "shim", pill); st.style.cssText += "font-weight:600;font-size:29px;line-height:1.3;white-space:nowrap";
    return { w, f, pill, st, set(text, u) { if (st.textContent !== text) st.textContent = text; st.style.backgroundPosition = `${100 - ((u * 55) % 300)}% 0`; } };
  };
  const popIn = (dt) => ({ s: spr(dt, 1.9, 7), o: clamp(dt / 0.08) });

  // ---------------------------------------------------------------- journal
  const J = scene("journal");
  const jW = lay(1000, 900), jH = lay(500, 520);
  const jc = el("div", "abs card", J.r); css(jc, { overflow: "hidden" });
  const jPlus = el("div", "abs", jc, '<svg viewBox="0 0 24 24" width="76" height="76" fill="none" stroke="#161a2b" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>');
  css(jPlus, { left: "50%", top: "50%" });
  const jIn = el("div", "", jc); css(jIn, { position: "absolute", left: 0, top: 0, width: jW + "px", height: jH + "px", padding: "40px 46px", display: "flex", flexDirection: "column", gap: "24px" });
  const jHead = el("div", "row", jIn); jHead.style.gap = "18px";
  gtile(jHead, "book", 58);
  el("div", "", jHead, "Journal").style.cssText = "font-weight:700;font-size:38px;flex:1";
  el("div", "pill", jHead, "Thursday, 12 November").style.cssText += "background:#eef2f8;color:#4a5872;font-weight:600;font-size:26px;padding:10px 22px";
  const jText = el("div", "", jIn); jText.style.cssText = "position:relative;flex:1;font-size:42px;font-weight:500;line-height:1.36;color:#161a2b";
  const jPh = el("div", "", jText, "What happened today? Who did you see?"); jPh.style.cssText = "position:absolute;left:0;top:0;color:#9aa5b8";
  const jType = typer(jText, "Lunch with Neha. She wants Goa on 17 to 19 January. I still have to book the stay.");
  const jFoot = el("div", "row", jIn); jFoot.style.gap = "16px";
  const jSpeak = el("div", "btn sec", jFoot, svg("mic", 30) + "Speak"); jSpeak.style.cssText += "font-size:30px;padding:16px 28px";
  el("div", "", jFoot).style.flex = "1";
  const jSave = el("div", "btn pri", jFoot, "Save entry"); jSave.style.cssText += "font-size:32px;padding:18px 40px";
  const jToast = el("div", "abs pill", J.r, svg("check", 30, 'fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"') + "Entry saved.");
  jToast.style.cssText += "background:#161a2b;color:#fff;font-weight:700;font-size:30px;padding:16px 30px 16px 22px;box-shadow:var(--shadow-s)";
  // The two other entries that join it: a voice note and a video.
  const mkEntry = (kind, label, text) => {
    const c = el("div", "abs card", J.r); css(c, { width: lay(640, 860) + "px", padding: "34px 38px", display: "flex", flexDirection: "column", gap: "22px" });
    const h = el("div", "row", c); h.style.gap = "16px"; gtile(h, kind === "voice" ? "mic" : "video", 52);
    el("div", "", h, label).style.cssText = "font-weight:700;font-size:32px";
    if (kind === "voice") {
      const wv = el("div", "row", c); wv.style.gap = "6px";
      const pb = el("div", "tile", wv, svg("play", 26, 'style="color:#fff;stroke:none"')); css(pb, { width: "64px", height: "64px", borderRadius: "50%", background: "var(--blue)", marginRight: "14px" });
      for (let i = 0; i < 34; i++) { const b = el("i", "", wv); const hh = 10 + Math.round(42 * Math.abs(Math.sin(i * 1.7) * Math.sin(i * 0.45 + 1))); css(b, { display: "block", width: "7px", height: hh + "px", borderRadius: "4px", background: i < 13 ? "var(--blue)" : "#c8d6ee" }); }
    } else {
      const th = el("div", "", c); css(th, { height: "170px", borderRadius: "26px", background: "linear-gradient(135deg, #ffd9c4 0%, #ffc1d2 45%, #c9d8ff 100%)", display: "flex", alignItems: "center", justifyContent: "center" });
      const pb = el("div", "tile", th, svg("play", 34, 'style="color:#3451d1;stroke:none"')); css(pb, { width: "86px", height: "86px", borderRadius: "50%", background: "rgba(255,255,255,.92)", boxShadow: "var(--shadow-s)" });
    }
    el("div", "", c, text).style.cssText = "font-size:30px;font-weight:500;line-height:1.35;color:#2f3448";
    return c;
  };
  const jVoice = mkEntry("voice", "Voice note, 11 November", "“Mum is coming soon. Clean the spare room first.”");
  const jVideo = mkEntry("video", "Video, 9 November", "“Aarav starts his new job on 1 December.”");
  function drawJournal(t) {
    const sc = J, u = showScene(sc, t); if (u == null) return;
    const p = popIn(u - sc.plus), m = spr(u - sc.open, 1.3, 7.5);
    const w = lerp(170, jW, m), h = lerp(170, jH, m);
    css(jc, { width: w + "px", height: h + "px", borderRadius: lerp(85, 40, clamp(m)) + "px" });
    jPlus.style.transform = `translate(-50%,-50%) rotate(${m * 90}deg)`; jPlus.style.opacity = 1 - clamp(m * 3);
    jIn.style.opacity = tr(u, sc.open + 0.2, sc.open + 0.5);
    jIn.style.transform = `translate(${(w - jW) / 2}px, ${(h - jH) / 2}px)`;
    jPh.style.opacity = u < sc.type[0] ? 1 : 0;
    jType(typeK(u, sc.type), u > sc.type[0] && u < sc.saved && Math.floor(u * 2.6) % 2 === 0 || (u > sc.type[0] && u < sc.type[1]));
    jSave.style.transform = `scale(${1 - 0.1 * bump(u, sc.save, 0.22)})`;
    jSave.style.filter = u > sc.save && u < sc.save + 0.3 ? "brightness(1.12)" : "none";
    // Stack: the entry shrinks back and the voice note and video slide in beside it.
    const st = sprS(u - sc.stack), drift = Math.sin(u * 0.9) * 2;
    const jx = lay(0, 0), jy = lay(lerp(0, 10, st), lerp(0, -20, st));
    place(jc, { x: jx, y: jy, s: p.s * lerp(1, lay(0.8, 0.8), st), o: p.o, ry: drift * st });
    jc.style.zIndex = 3;
    const side = (e, i) => {
      const k = sprS(u - sc.stack - 0.12 - 0.1 * i), dir = i ? 1 : -1;
      if (V) place(e, { x: dir * 600 * (1 - k), y: dir * 560, s: 0.84, ry: dir * -30 * (1 - k) - drift, rz: dir * 1.5, o: clamp(k * 4) });
      else place(e, { x: dir * lerp(1300, 590, k), y: lerp(40, 30, k), s: 0.84, ry: dir * lerp(-40, -16, k) + drift, rz: dir * 2, o: clamp(k * 4) });
    };
    side(jVideo, 0); side(jVoice, 1);
    const tk = popIn(u - sc.saved), tout = tr(u, sc.stack - 0.15, sc.stack + 0.1);
    place(jToast, { x: 0, y: jH / 2 + lay(80, 90), s: tk.s * (1 - 0.2 * tout), o: tk.o * (1 - tout) });
  }

  // ---------------------------------------------------------------- ask
  const A = scene("ask");
  const aChip = chip(A.r, "debo", 116);
  const aQ = el("div", "abs bubble me", A.r); css(aQ, { fontSize: "40px", padding: "24px 34px", maxWidth: lay(760, 820) + "px" });
  const aQType = typer(aQ, "What do I need to sort out before the Goa trip?");
  const aDots = el("div", "abs bubble debo row", A.r); css(aDots, { padding: "28px 34px", gap: "12px" });
  const dots = [0, 1, 2].map(() => { const d = el("i", "", aDots); css(d, { display: "block", width: "18px", height: "18px", borderRadius: "50%", background: "#9aa5b8" }); return d; });
  const aAns = el("div", "abs card", A.r); css(aAns, { width: lay(960, 920) + "px", padding: "38px 44px", display: "flex", flexDirection: "column", gap: "18px" });
  const aHead = el("div", "row", aAns); aHead.style.gap = "16px"; gtile(aHead, "book", 48);
  el("div", "", aHead, "From your journal").style.cssText = "font-weight:700;font-size:32px;color:#3451d1";
  const aLines = ["Book the stay for 17 to 19 January.", "Clean the spare room before Mum comes.", "Talk to Neha and Aarav about the dates."].map((s) => {
    const r = el("div", "row", aAns); r.style.gap = "18px"; r.style.alignItems = "flex-start";
    const dot = el("i", "", r); css(dot, { display: "block", width: "12px", height: "12px", borderRadius: "50%", background: "var(--blue)", marginTop: "20px", flex: "none" });
    el("div", "", r, s).style.cssText = "font-size:36px;font-weight:500;line-height:1.35";
    return r;
  });
  const aChips = el("div", "row", aAns); css(aChips, { gap: "12px", flexWrap: "wrap", marginTop: "8px" });
  const srcChip = (parent, icon, text, fs = 25) => { const c = el("div", "pill src", parent, svg(icon, fs + 3) + text); c.style.cssText += `font-size:${fs}px;padding:10px 20px 10px 16px`; return c; };
  const aC = [["doc", "Journal, 12 November"], ["mic", "Voice note, 11 November"], ["video", "Video, 9 November"]].map(([i, s]) => srcChip(aChips, i, s));
  const aEntry = el("div", "abs card", A.r); css(aEntry, { width: lay(640, 860) + "px", padding: "36px 40px", display: "flex", flexDirection: "column", gap: "18px" });
  const aeh = el("div", "row", aEntry); aeh.style.gap = "16px"; gtile(aeh, "doc", 50);
  el("div", "", aeh, "Journal, 12 November").style.cssText = "font-weight:700;font-size:32px";
  const aeT = el("div", "", aEntry); aeT.style.cssText = "font-size:34px;font-weight:500;line-height:1.42;color:#2f3448";
  aeT.innerHTML = 'Lunch with Neha. She wants Goa on 17 to 19 January. I still have to <span class="hl">book the stay</span>.';
  const hl = aeT.querySelector(".hl"); css(hl, { backgroundRepeat: "no-repeat", backgroundImage: "linear-gradient(#ffe48a, #ffe48a)", backgroundPosition: "0 88%", borderRadius: "6px", padding: "0 4px", margin: "0 -4px" });
  function drawAsk(t) {
    const sc = A, u = showScene(sc, t); if (u == null) return;
    const q = popIn(u - 0.1);
    if (V) place(aQ, { x: 470, y: -470, ax: "-100%", s: lerp(0.9, 1, q.s), o: q.o });
    else place(aQ, { x: 640, y: -165, ax: "-100%", s: lerp(0.9, 1, q.s), o: q.o });
    aQType(typeK(u, sc.type), u < sc.type[1] + 0.3);
    const c = popIn(u - sc.chip);
    place(aChip.w, { x: 0, y: lay(-370, -720), s: c.s, o: c.o });
    aChip.set(u < sc.found ? "Looking through your journal…" : "Found 3 entries", u);
    const dIn = popIn(u - sc.dots[0]), dOut = tr(u, sc.dots[1] - 0.1, sc.dots[1] + 0.1);
    place(aDots, { x: lay(-640, -470), y: lay(90, -250), ax: "0%", s: dIn.s * (1 - dOut), o: dIn.o * (1 - dOut) });
    dots.forEach((d, i) => { d.style.transform = `translateY(${-8 * Math.max(0, Math.sin(u * 9 - i * 0.9))}px)`; });
    const a = sprS(u - sc.answer), op = sprS(u - sc.open);
    if (V) place(aAns, { x: 0, y: lerp(160, -40, a) - 40 * op, s: 1 - 0.05 * op, o: clamp((u - sc.answer) / 0.15), rx: (1 - a) * 12 });
    else place(aAns, { x: lerp(-170, -250, op), y: lerp(380, 205, a), s: 1 - 0.05 * op, o: clamp((u - sc.answer) / 0.15), rx: (1 - a) * 12, ry: 4 * op });
    aAns.style.filter = op > 0.01 ? `brightness(${1 - 0.04 * op})` : "none";
    aLines.forEach((r, i) => { const k = sprS(u - sc.lines[i]); r.style.opacity = clamp((u - sc.lines[i]) / 0.15); r.style.transform = `translateY(${(1 - k) * 30}px)`; });
    aC.forEach((ch, i) => { const k = popIn(u - sc.chips[i]); ch.style.opacity = k.o; ch.style.transform = `scale(${k.s * (1 - (i === 0 ? 0.1 * bump(u, sc.tap, 0.22) : 0))})`; ch.style.boxShadow = i === 0 && u > sc.tap ? "0 0 0 3px #3451d1" : "none"; });
    if (V) place(aEntry, { x: lerp(900, 40, op), y: 520, ry: lerp(-40, -6, op), rz: 2, o: clamp(op * 3) });
    else place(aEntry, { x: lerp(1400, 540, op), y: lerp(90, 120, op), ry: lerp(-40, -12, op), rz: lerp(8, 3, op), o: clamp(op * 3) });
    aEntry.style.zIndex = 4;
    const hk = tr(u, sc.open + 0.55, sc.open + 1.05, eo3); hl.style.backgroundSize = `${hk * 100}% 42%`;
  }

  // ---------------------------------------------------------------- what Daksha knows
  const K = scene("knows");
  const kc = el("div", "abs card", K.r); css(kc, { width: lay(1080, 930) + "px", padding: "40px 44px", display: "flex", flexDirection: "column", gap: "16px" });
  const kh = el("div", "row", kc); kh.style.gap = "18px"; gtile(kh, "eye", 58);
  const khT = el("div", "", kh); el("div", "", khT, "What Daksha knows").style.cssText = "font-weight:700;font-size:42px";
  el("div", "", khT, "Each memory shows the entry it came from.").style.cssText = "font-size:27px;color:#4d5366;font-weight:500;margin-top:2px";
  const mem = [
    ["Neha wants Goa on 17 to 19 January.", "doc", "Journal, 12 November"],
    ["Aarav starts a new job on 1 December.", "video", "Video, 9 November"],
    ["Mum is visiting soon.", "mic", "Voice note, 11 November"],
    ["Loves pineapple on pizza.", "doc", "Journal, 2 November"],
  ].map(([text, icon, src]) => {
    const r = el("div", "", kc); css(r, { background: "#f5f8fd", borderRadius: "26px", padding: "20px 26px", display: "flex", flexDirection: V ? "column" : "row", alignItems: V ? "flex-start" : "center", gap: V ? "14px" : "18px", overflow: "hidden" });
    const left = el("div", "", r); left.style.flex = "1";
    const tx = el("div", "", left, text); tx.style.cssText = "font-size:34px;font-weight:600;line-height:1.3;border-radius:12px;margin:-4px -10px;padding:4px 10px";
    const sr = el("div", "", left); sr.style.marginTop = "8px"; srcChip(sr, icon, src, 22);
    const bs = el("div", "row", r); bs.style.gap = "10px";
    const fix = el("div", "btn sec", bs, svg("pen", 24) + "Fix this memory"); fix.style.cssText += "font-size:24px;padding:12px 20px";
    const fg = el("div", "btn sec", bs, svg("x", 24) + "Forget this memory"); fg.style.cssText += "font-size:24px;padding:12px 20px";
    return { r, tx, text, fix, fg };
  });
  const kFixed = "on 20 November.";
  const kTxt3a = el("span", "", null, "Mum is visiting "); const kTxt3b = el("span", "", null, "soon.");
  const kType = (() => { const w = el("span", "", null); mem[2].tx.textContent = ""; mem[2].tx.append(kTxt3a, kTxt3b, w); return typer(w, kFixed); })();
  const kSaved = el("span", "pill", null, svg("check", 22, 'fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"') + "Saved");
  kSaved.style.cssText += "background:#23b072;color:#fff;font-size:22px;font-weight:700;padding:6px 14px 6px 10px;margin-left:14px;vertical-align:4px";
  mem[2].tx.append(kSaved);
  let kH4 = 0;
  function drawKnows(t) {
    const sc = K, u = showScene(sc, t); if (u == null) return;
    const k = sprS(u - 0.05);
    place(kc, { x: 0, y: lay(10, -40) + (1 - k) * 160, rx: (1 - k) * 18, o: clamp(u / 0.15), ry: Math.sin(u * 0.8) * 1.5 });
    mem.forEach((m, i) => { const kk = sprS(u - sc.rows[i]); m.r.style.opacity = clamp((u - sc.rows[i]) / 0.12); m.r.style.transform = `translateY(${(1 - kk) * 40}px)`; });
    // Fix: the third memory is corrected.
    const m3 = mem[2];
    m3.fix.style.transform = `scale(${1 - 0.1 * bump(u, sc.fix, 0.22)})`;
    m3.fix.style.boxShadow = u > sc.fix && u < sc.fixSaved + 0.4 ? "0 0 0 3px #3451d1" : "none";
    const editing = u > sc.fix + 0.12 && u < sc.fixSaved + 0.2;
    m3.tx.style.boxShadow = editing ? "0 0 0 3px #3451d1" : "none"; m3.tx.style.background = editing ? "#fff" : "transparent";
    kTxt3b.style.display = u > sc.fix + 0.2 ? "none" : "";
    kType(typeK(u, sc.fixType), editing && u < sc.fixType[1] + 0.1);
    const sv = popIn(u - sc.fixSaved); kSaved.style.display = u > sc.fixSaved ? "" : "none"; kSaved.style.opacity = sv.o; kSaved.style.transform = `scale(${sv.s})`;
    // Forget: the last memory leaves.
    const m4 = mem[3];
    if (!kH4) kH4 = m4.r.offsetHeight;
    m4.fg.style.transform = `scale(${1 - 0.1 * bump(u, sc.forget, 0.22)})`;
    m4.fg.style.boxShadow = u > sc.forget && u < sc.gone + 0.2 ? "0 0 0 3px #e5534b" : "none";
    const g = tr(u, sc.gone, sc.gone + 0.5, eio3);
    if (u > sc.rows[3] + 0.3) { m4.r.style.opacity = 1 - clamp(g * 1.6); m4.r.style.transform = `translateX(${g * 120}px) scale(${1 - 0.1 * g})`; }
    css(m4.r, { height: g > 0 ? kH4 * (1 - g) + "px" : "", marginBottom: -16 * g + "px", padding: g > 0 ? `${20 * (1 - g)}px 26px` : "" });
  }

  // ---------------------------------------------------------------- talk
  const Tk = scene("talk");
  const who = ["debo", "diya", "anaya", "mishti", "kabir"], names = ["Daksha", "Diya", "Anaya", "Mishti", "Kabir"];
  const fsz = lay(196, 150), gap = lay(270, 180);
  const tCap = el("div", "abs", Tk.r, "Choose who you talk to"); tCap.style.cssText += `font-weight:700;font-size:${lay(52, 50)}px;color:#2f3448;white-space:nowrap`;
  const faces = who.map((w, i) => {
    const b = el("div", "abs", Tk.r); css(b, { display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" });
    const f = el("div", "face", b); css(f, { width: fsz + "px", height: fsz + "px", boxShadow: "var(--shadow-s)" }); img(f, ART(w));
    const n = el("div", "", b, names[i]); n.style.cssText = `font-weight:700;font-size:${lay(34, 30)}px`;
    return { b, f, n };
  });
  const tListen = el("div", "abs pill", Tk.r); tListen.style.cssText += "background:#fff;box-shadow:var(--shadow-s);padding:16px 30px;gap:16px;font-weight:700;font-size:30px";
  const tl1 = el("span", "tile", tListen, svg("mic", 26)); css(tl1, { width: "46px", height: "46px", borderRadius: "50%", background: "var(--blue)" });
  el("span", "", tListen, "Listening");
  const bars = [0, 1, 2, 3, 4].map(() => { const b = el("i", "", tListen); css(b, { display: "block", width: "6px", height: "30px", borderRadius: "3px", background: "var(--blue)" }); return b; });
  const tb = [["debo", "Hey! I’m here. What’s on your mind?"], ["me", "Neha’s birthday is on 21 November."], ["debo", "Got it. I’ll remember that."]].map(([k, s]) => {
    const b = el("div", "abs bubble " + k, Tk.r); css(b, { fontSize: lay(40, 38) + "px", padding: "24px 34px", maxWidth: lay(800, 860) + "px", whiteSpace: "nowrap" });
    return { b, k, type: typer(b, s) };
  });
  function drawTalk(t) {
    const sc = Tk, u = showScene(sc, t); if (u == null) return;
    const fo = tr(u, sc.focus, sc.focus + 0.55, eio3), fs = sprS(u - sc.focus);
    faces.forEach((f, i) => {
      const k = spr(u - sc.burst - 0.07 * i, 1.8, 6.5);
      const x0 = (i - 2) * gap * k, y0 = lay(40, -40);
      if (i === 0) {
        const talking = (u > sc.b1[0] && u < sc.b1[1]) || (u > sc.b3[0] && u < sc.b3[1]);
        const pulse = talking ? 0.03 * Math.abs(Math.sin(u * 13)) : 0;
        place(f.b, { x: lerp(x0, 0, fs), y: lerp(y0, lay(-250, -560), fs), s: k * (1 + 0.08 * bump(u, sc.pick, 0.3)) * lerp(1, lay(0.8, 1), fs) + pulse, o: clamp((u - sc.burst) / 0.06) });
        f.f.style.boxShadow = u > sc.pick ? "0 0 0 8px #5b73e0, var(--shadow-s)" : "var(--shadow-s)";
        f.n.style.opacity = 1 - fo;
      } else {
        place(f.b, { x: x0, y: y0 + fo * 120, s: k * (1 - 0.4 * fo), o: clamp((u - sc.burst - 0.07 * i) / 0.06) * (1 - fo) });
      }
    });
    const cp = popIn(u - sc.burst - 0.35);
    place(tCap, { x: 0, y: lay(-250, -330), s: lerp(0.9, 1, cp.s), o: cp.o * (1 - tr(u, sc.pick, sc.focus + 0.05)) });
    const lp = popIn(u - sc.listen);
    place(tListen, { x: 0, y: lay(-95, -360), s: lp.s, o: lp.o });
    bars.forEach((b, i) => { b.style.transform = `scaleY(${0.3 + 0.7 * Math.abs(Math.sin(u * 7 + i * 1.3) * Math.sin(u * 3.1 + i))})`; });
    const rng = [sc.b1, sc.b2, sc.b3];
    tb.forEach((b, i) => {
      const k = popIn(u - rng[i][0] + 0.02), y = lay(40 + 140 * i, -200 + 160 * i);
      const me = b.k === "me";
      place(b.b, { x: me ? lay(560, 480) : lay(-560, -480), y, ax: me ? "-100%" : "0%", s: lerp(0.85, 1, k.s), o: k.o });
      b.b.style.transformOrigin = me ? "100% 100%" : "0 100%";
      b.type(typeK(u, rng[i]), u < rng[i][1] + 0.2);
    });
  }

  // ---------------------------------------------------------------- people
  const P = scene("people");
  const pHead = el("div", "abs", P.r, "People in your life"); pHead.style.cssText += `font-weight:700;font-size:${lay(46, 46)}px;color:#2f3448;white-space:nowrap`;
  const ppl = [
    ["N", "#ffb36b", "Neha", "Friend", "cake", "Birthday 21 November"],
    ["M", "#b39bff", "Mum", "Mother", "heart", "Visiting on 20 November"],
    ["A", "#5fd6a0", "Aarav", "Neha’s husband", "bag", "New job on 1 December"],
  ].map(([ini, col, name, rel, icon, note]) => {
    const c = el("div", "abs card", P.r); css(c, { width: lay(880, 900) + "px", padding: "28px 34px", display: "flex", alignItems: "center", gap: "24px", borderRadius: "34px" });
    const av = el("div", "", c, ini); css(av, { width: "92px", height: "92px", borderRadius: "50%", background: col, color: "#fff", fontWeight: 800, fontSize: "42px", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" });
    const mid = el("div", "", c); mid.style.flex = "1";
    el("div", "", mid, name).style.cssText = "font-weight:700;font-size:40px;line-height:1.15";
    el("div", "", mid, rel).style.cssText = "font-weight:500;font-size:28px;color:#4d5366;margin-top:2px";
    const pl = el("div", "pill", c); pl.style.cssText += "background:#f5f8fd;padding:10px 20px 10px 10px;font-weight:600;font-size:26px;color:#2f3448";
    gtile(pl, icon, 44, 0.5); el("span", "", pl, note);
    return c;
  });
  const pQ = el("div", "abs bubble me", P.r); css(pQ, { fontSize: "40px", padding: "24px 34px", whiteSpace: "nowrap" });
  const pQType = typer(pQ, "What’s on this week?");
  const pAWrap = el("div", "abs", P.r); css(pAWrap, { display: "flex", alignItems: "flex-end", gap: "18px" });
  const pFace = el("div", "face", pAWrap); css(pFace, { width: "84px", height: "84px", flex: "none", boxShadow: "var(--shadow-s)" }); img(pFace, ART("debo"));
  const pA = el("div", "bubble debo", pAWrap); css(pA, { fontSize: lay(40, 38) + "px", padding: "24px 34px", width: lay(820, 780) + "px" });
  const pAType = typer(pA, "Neha’s birthday is on Saturday. And the Goa stay still needs booking.");
  function drawPeople(t) {
    const sc = P, u = showScene(sc, t); if (u == null) return;
    const up = tr(u, sc.up, sc.up + 0.6, eio3), upS = sprS(u - sc.up);
    const hp = popIn(u - 0.05);
    place(pHead, { x: 0, y: lay(-340, -470), s: lerp(0.9, 1, hp.s), o: hp.o * (1 - up) });
    ppl.forEach((c, i) => {
      const k = sprS(u - sc.cards[i]);
      const y1 = lay(-180 + 180 * i, -280 + 190 * i);
      // Deck at the top: Neha in front, the others peeking out behind.
      const y2 = lay(-300 - 34 * i, -640 - 38 * i), s2 = 0.86 - 0.05 * i;
      c.style.zIndex = 10 - i;
      place(c, { x: lerp(1500, 0, k), y: lerp(y1, y2, upS), s: lerp(1, s2, up), ry: lerp(-38, 0, k) + Math.sin(u * 0.9 + i) * 1.2, rz: (1 - k) * 6, o: clamp((u - sc.cards[i]) / 0.08) });
      c.style.filter = up > 0 && i > 0 ? `brightness(${1 - 0.05 * up * i})` : "none";
    });
    const q = popIn(u - sc.q[0] + 0.02);
    place(pQ, { x: lay(560, 480), y: lay(-60, -300), ax: "-100%", s: lerp(0.85, 1, q.s), o: q.o });
    pQType(typeK(u, sc.q), u < sc.q[1] + 0.2);
    const a = popIn(u - sc.chip);
    place(pAWrap, { x: lay(-560, -480), y: lay(140, -90), ax: "0%", ay: "0%", s: lerp(0.85, 1, a.s), o: a.o });
    pAType(typeK(u, sc.a), u < sc.a[1] + 0.2);
  }

  // ---------------------------------------------------------------- apps
  const X = scene("apps");
  const xs = el("div", "abs", X.r); css(xs, { width: W + "px", height: H + "px", left: -W / 2 + "px", top: -H / 2 + "px" });
  const ns = "http://www.w3.org/2000/svg";
  const xsv = document.createElementNS(ns, "svg"); xsv.setAttribute("width", W); xsv.setAttribute("height", H); xs.appendChild(xsv);
  const apps = [["mail", "Mail"], ["calendar", "Calendar"], ["doc", "Docs"], ["folder", "Files"], ["chat", "Chat"], ["note", "Notes"], ["list", "Tasks"], ["grid", "Sheets"]];
  const rx = lay(600, 360), ry = lay(290, 560), cy0 = lay(-30, -40);
  const xApps = apps.map(([icon, label], i) => {
    const ang = -Math.PI / 2 + (i / apps.length) * Math.PI * 2 + 0.39;
    const line = document.createElementNS(ns, "line"); xsv.appendChild(line);
    line.setAttribute("stroke", "#9dbcf0"); line.setAttribute("stroke-width", "4"); line.setAttribute("stroke-linecap", "round"); line.setAttribute("stroke-dasharray", "2 14");
    const b = el("div", "abs", X.r); css(b, { display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" });
    const tl = el("div", "", b); css(tl, { width: "132px", height: "132px", borderRadius: "36px", background: "#fff", boxShadow: "var(--shadow-s)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" });
    gtile(tl, icon, 84, 0.3);
    const ck = el("div", "tile", tl, svg("check", 22, 'style="stroke-width:3.4"')); css(ck, { position: "absolute", right: "-10px", top: "-10px", width: "42px", height: "42px", borderRadius: "50%", background: "#23b072", boxShadow: "0 0 0 5px #fff" });
    el("div", "", b, label).style.cssText = "font-weight:700;font-size:28px;color:#2f3448";
    return { b, ck, line, x: Math.cos(ang) * rx, y: cy0 + Math.sin(ang) * ry };
  });
  const xHub = el("div", "abs face", X.r); css(xHub, { width: "200px", height: "200px", boxShadow: "0 0 0 14px rgba(79,143,242,.14), var(--shadow)" }); img(xHub, ART("debo"));
  const xCap = el("div", "abs", X.r); xCap.style.cssText += `font-weight:700;font-size:${lay(50, 48)}px;color:#2f3448;white-space:nowrap`;
  xCap.innerHTML = "Gmail, Calendar and more";
  function drawApps(t) {
    const sc = X, u = showScene(sc, t); if (u == null) return;
    const h = popIn(u - sc.hub);
    place(xHub, { x: 0, y: cy0, s: h.s * (1 + 0.04 * Math.sin(u * 5) * clamp(u - 0.6)), o: h.o });
    xApps.forEach((a, i) => {
      const dt = u - sc.burst - 0.035 * i, k = spr(dt, 1.6, 6);
      const x = a.x * k, y = cy0 + (a.y - cy0) * k;
      place(a.b, { x, y, s: 0.3 + 0.7 * clamp(k * 1.1, 0, 1.2), rz: (1 - k) * (i % 2 ? 40 : -40), o: clamp(dt / 0.06) });
      a.line.setAttribute("x1", W / 2); a.line.setAttribute("y1", H / 2 + cy0);
      a.line.setAttribute("x2", W / 2 + x); a.line.setAttribute("y2", H / 2 + y - 20);
      a.line.setAttribute("stroke-dashoffset", -u * 40);
      a.line.style.opacity = clamp(dt / 0.3) * 0.9;
      const c = popIn(u - sc.checks - 0.05 * i); a.ck.style.opacity = c.o; a.ck.style.transform = `scale(${c.s})`;
    });
    const cp = popIn(u - sc.caption);
    place(xCap, { x: 0, y: lay(445, 790), s: lerp(0.9, 1, cp.s), o: cp.o });
  }

  // ---------------------------------------------------------------- approve, calendar, done
  const Y = scene("approve");
  const yChip = chip(Y.r, "debo", 116);
  const yc = el("div", "abs card", Y.r); css(yc, { width: lay(880, 880) + "px", padding: "40px 46px", display: "flex", flexDirection: "column", gap: "14px" });
  el("div", "", yc, "Waiting for your yes").style.cssText = "font-weight:700;font-size:28px;color:#3451d1";
  const ych = el("div", "row", yc); ych.style.gap = "18px"; gtile(ych, "calendar", 60);
  el("div", "", ych, "Add to your calendar").style.cssText = "font-weight:700;font-size:46px";
  el("div", "", yc, "Goa trip, 17 to 19 January").style.cssText = "font-weight:500;font-size:38px;color:#2f3448";
  el("div", "", yc, "Nothing changes outside Daksha until you say yes.").style.cssText = "font-weight:500;font-size:27px;color:#4d5366";
  const yb = el("div", "row", yc); css(yb, { gap: "16px", marginTop: "18px" });
  const yOk = el("div", "btn pri", yb, svg("check", 30) + "Approve"); yOk.style.cssText += "font-size:34px;padding:20px 40px;position:relative";
  const yNo = el("div", "btn sec", yb, svg("x", 30) + "Not now"); yNo.style.cssText += "font-size:34px;padding:20px 40px";
  const yRip = el("i", "", yOk); css(yRip, { position: "absolute", left: "50%", top: "50%", width: "120px", height: "120px", margin: "-60px", borderRadius: "50%", border: "6px solid #3451d1" });
  const ts = lay(232, 210), tg = lay(262, 232);
  const yMonth = el("div", "abs", Y.r, "January"); yMonth.style.cssText += "font-weight:700;font-size:40px;color:#4d5366";
  const tiles = [16, 17, 18, 19].map((d, i) => {
    const w = el("div", "abs", Y.r); css(w, { width: ts + "px", height: ts + "px" });
    const inner = el("div", "", w); css(inner, { position: "absolute", inset: 0 });
    const front = el("div", "cal face2", inner); el("div", "", front, String(d)).style.cssText = `font-weight:700;font-size:${ts * 0.4}px;color:#161a2b;letter-spacing:-0.02em`;
    const back = el("div", "cal face2", inner); css(back, { background: "linear-gradient(160deg,#5b9bff,#3a74e0)" });
    el("div", "", back, String(d)).style.cssText = `font-weight:700;font-size:${ts * 0.4}px;color:#fff;letter-spacing:-0.02em;line-height:1`;
    if (i > 0) { const tag = el("div", "", back, i === 1 ? "Goa trip" : " "); tag.style.cssText = `font-weight:700;font-size:${ts * 0.12}px;color:#fff;margin-top:${ts * 0.06}px;opacity:.95`; if (i > 1) css(tag, { width: "60%", height: "8px", borderRadius: "4px", background: "rgba(255,255,255,.6)", fontSize: "0", marginTop: ts * 0.09 + "px" }); }
    return { w, front, back, i };
  });
  const yDone = el("div", "abs row", Y.r); css(yDone, { gap: "34px" });
  const dsz = lay(150, 130);
  const ck = document.createElementNS(ns, "svg"); ck.setAttribute("viewBox", "0 0 100 100"); ck.setAttribute("width", dsz); ck.setAttribute("height", dsz); yDone.appendChild(ck);
  ck.innerHTML = '<circle cx="50" cy="50" r="44" fill="none" stroke="#3451d1" stroke-width="8" stroke-linecap="round" transform="rotate(-90 50 50)"/><path d="M29 51.5l14 14L72 36" fill="none" stroke="#3451d1" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>';
  const [ckC, ckP] = ck.children; const cLen = 2 * Math.PI * 44, pLen = 64;
  ckC.setAttribute("stroke-dasharray", cLen); ckP.setAttribute("stroke-dasharray", pLen);
  const dWord = el("div", "row", yDone); css(dWord, { fontWeight: 700, fontSize: lay(200, 170) + "px", letterSpacing: "-0.03em" });
  const dLetters = [..."Done!"].map((c) => el("span", "tok", dWord, c));
  // Confetti: the same seed every time, so every frame is repeatable.
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const confCols = ["#5b73e0", "#ff7a6b", "#ffc94a", "#3ccf8e", "#9b7bff", "#ff8fb0", "#6ad1ff"];
  const conf = Array.from({ length: 130 }, (_, i) => {
    const e = el("div", "conf", Y.r), w = 10 + rnd() * 14, h = rnd() < 0.3 ? w : w * (0.4 + rnd() * 0.3);
    css(e, { width: w + "px", height: h + "px", background: confCols[i % confCols.length], borderRadius: rnd() < 0.3 ? "50%" : "3px" });
    const a = -Math.PI / 2 + (rnd() - 0.5) * Math.PI * 1.25, v = 900 + rnd() * 1500;
    return { e, vx: Math.cos(a) * v * lay(1.25, 0.8), vy: Math.sin(a) * v * lay(1, 1.35), x0: (rnd() - 0.5) * 160, sp: (rnd() - 0.5) * 1400, fl: 6 + rnd() * 10, ph: rnd() * 6, delay: rnd() * 0.12 };
  });
  function drawApprove(t) {
    const sc = Y, u = showScene(sc, t); if (u == null) return;
    const c = popIn(u - sc.chip);
    place(yChip.w, { x: 0, y: lay(-370, -720), s: c.s, o: c.o });
    yChip.set(u < sc.press + 0.1 ? "Waiting for your yes" : u < sc.done ? "Adding it to your calendar…" : "Done", u);
    const k = sprS(u - sc.card), gone = tr(u, sc.tiles - 0.05, sc.tiles + 0.3, eio3);
    place(yc, { x: 0, y: lay(70, -60) + (1 - k) * 200 + gone * 120, rx: (1 - k) * 20, ry: Math.sin(u * 0.9) * 2, s: 1 - 0.12 * gone, o: clamp((u - sc.card) / 0.12) * (1 - gone) });
    const pr = bump(u, sc.press, 0.24); yOk.style.transform = `scale(${1 - 0.1 * pr})`;
    const rp = clamp((u - sc.press) / 0.5); yRip.style.opacity = u > sc.press ? (1 - rp) * 0.8 : 0; yRip.style.transform = `scale(${0.6 + rp * 2.4})`;
    // Calendar tiles, then the trip days flip over.
    const tOut = tr(u, sc.done - 0.25, sc.done + 0.1, (x) => x * x);
    const mk = popIn(u - sc.tiles - 0.1);
    place(yMonth, { x: 0, y: lay(-200, -190), s: lerp(0.9, 1, mk.s), o: mk.o * (1 - tOut) });
    tiles.forEach((tl) => {
      const kk = spr(u - sc.tiles - 0.05 * tl.i, 1.7, 7);
      place(tl.w, { x: (tl.i - 1.5) * tg, y: lay(60, 60) + (1 - kk) * 160 - tOut * 140, s: 0.6 + 0.4 * kk, o: clamp((u - sc.tiles - 0.05 * tl.i) / 0.08) * (1 - tOut) });
      const f = tl.i === 0 ? 0 : spr(u - sc.flip - 0.12 * (tl.i - 1), 1.2, 6.5);
      const a = f * 180;
      tl.front.style.display = a < 90 ? "" : "none"; tl.back.style.display = a < 90 ? "none" : "";
      tl.front.style.transform = `perspective(900px) rotateX(${a}deg)`;
      tl.back.style.transform = `perspective(900px) rotateX(${a - 180}deg)`;
    });
    // Done!
    const dn = u - sc.done;
    yDone.style.display = dn > -0.01 ? "" : "none";
    if (dn > -0.01) {
      place(yDone, { x: 0, y: lay(40, 0), o: 1 });
      ckC.setAttribute("stroke-dashoffset", cLen * (1 - tr(dn, 0, 0.45, eo3)));
      ckP.setAttribute("stroke-dashoffset", pLen * (1 - tr(dn, 0.3, 0.6, eo3)));
      const cs = spr(dn, 1.8, 7); ck.style.transform = `scale(${0.5 + 0.5 * cs})`;
      dLetters.forEach((l, i) => { const s = spr(dn - 0.08 - 0.05 * i, 2, 7); l.style.opacity = clamp((dn - 0.08 - 0.05 * i) / 0.06); l.style.transform = `translateY(${(1 - s) * 0.5}em) rotate(${(1 - s) * (i % 2 ? 12 : -12)}deg)`; });
    }
    const cf = u - sc.confetti;
    conf.forEach((p) => {
      const d = cf - p.delay;
      if (d <= 0 || d > 2.6) { p.e.style.display = "none"; return; }
      p.e.style.display = "";
      const drag = (1 - Math.exp(-2.6 * d)) / 2.6;
      const x = p.x0 + p.vx * drag, y = lay(0, -80) + p.vy * drag + 420 * d * d;
      p.e.style.opacity = 1 - tr(d, 1.7, 2.5, (q) => q);
      p.e.style.transform = `translate(${x}px, ${y}px) rotate(${p.sp * d}deg) scaleY(${Math.cos(p.fl * d + p.ph)})`;
    });
  }

  // ---------------------------------------------------------------- end card
  const E = scene("end"); E.t1 = T.D + 1; E.out = 99;
  const eLogo = el("div", "abs", E.r); css(eLogo, { width: lay(250, 260) + "px", height: lay(250, 260) + "px" }); img(eLogo, "/art/debo.svg").style.cssText = "width:100%;height:100%";
  const eName = el("div", "abs", E.r, "Daksha"); eName.style.cssText += `font-weight:800;font-size:${lay(150, 150)}px;letter-spacing:-0.03em`;
  const eSub = el("div", "abs", E.r, "A friendly assistant that remembers your life."); eSub.style.cssText += `font-weight:500;font-size:${lay(44, 40)}px;color:#4a5872;white-space:nowrap`;
  const eUrl = el("div", "abs pill", E.r, "www.daksha.life"); eUrl.style.cssText += `background:#161a2b;color:#fff;font-weight:700;font-size:${lay(46, 46)}px;padding:20px 46px 22px;box-shadow:var(--shadow-s)`;
  function drawEnd(t) {
    const sc = E, u = showScene(sc, t); if (u == null) return;
    const l = spr(u - sc.logo, 1.6, 5.5);
    const bob = Math.sin((u - 1) * 2.2) * 6 * clamp(u - 1);
    place(eLogo, { x: 0, y: lay(-200, -330) + bob, s: l, rz: (1 - l) * -30, o: clamp((u - sc.logo) / 0.06) });
    const n = popIn(u - sc.name), sb = sprS(u - sc.sub), ur = popIn(u - sc.url);
    place(eName, { x: 0, y: lay(10, -110) + (1 - n.s) * 40, o: n.o, s: lerp(0.9, 1, n.s) });
    place(eSub, { x: 0, y: lay(125, 10) + (1 - sb) * 30, o: clamp((u - sc.sub) / 0.2) });
    place(eUrl, { x: 0, y: lay(250, 150), s: ur.s, o: ur.o });
  }

  // ---------------------------------------------------------------- the clock
  await Promise.all(imgs.map((i) => i.decode().catch(() => {})));
  const draws = [drawJournal, drawAsk, drawKnows, drawTalk, drawPeople, drawApps, drawApprove, drawEnd];
  function seek(t) {
    blobs.forEach(({ b, s }, i) => {
      const x = W * (0.2 + 0.3 * i) + Math.sin(t * 0.21 + i * 2) * 160 - s / 2;
      const y = H - s * 0.26 + Math.cos(t * 0.17 + i) * 50;
      b.style.transform = `translate(${x}px, ${y}px)`;
    });
    for (const bl of blocks) drawBlock(bl, t);
    for (const d of draws) d(t);
  }
  window.seek = seek; window.DURATION = T.D; window.SIZE = [W, H];
  seek(0);
  window.ready = true;
}
init();
