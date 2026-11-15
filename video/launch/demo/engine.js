// Draws the demo walkthrough as a pure function of time, like ../src/engine.js.
// The phone shows real frames from the recording (/cap/000001.jpg is the first frame, 24 fps).
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const eo3 = (x) => 1 - Math.pow(1 - x, 3);
const eio3 = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const eoBack = (x) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const tr = (t, a, b, f = eio3) => f(clamp((t - a) / (b - a)));
const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const SRC_FPS = 24, LAST_FRAME = 2546;
const frameUrl = (s) => `/cap/${String(clamp(Math.floor(s * SRC_FPS + 1e-6) + 1, 1, LAST_FRAME)).padStart(6, "0")}.jpg`;
const words = (parent, text) => text.split(" ").map((word, i, arr) => {
  const w = el("span", "w", parent); const wi = el("span", "wi", w, word);
  if (i < arr.length - 1) parent.appendChild(document.createTextNode(" "));
  return wi;
});
const speedText = (s) => (s === 1 ? "Real speed" : s === 0.5 ? "Half speed" : `${s}x speed`);

async function init() {
  const TL = buildDemo();
  const stage = document.getElementById("stage");
  await document.fonts.ready;
  await Promise.all(["500", "700", "800"].map((w) => document.fonts.load(`${w} 40px Figtree`)));

  const PX = 1360, PY = 540, S = 0.555;
  // Title card background, under everything else: red, then a paper circle opens from the phone.
  const red = el("div", "wipe", stage);
  const paper = el("div", "wipe", stage); paper.style.background = "var(--paper)";
  const blob = el("div", "circle", stage);
  Object.assign(blob.style, { width: "1000px", height: "1000px", left: PX - 500 + "px", top: PY + 20 - 500 + "px", background: "var(--blush)" });
  const dot = el("div", "circle", stage);
  Object.assign(dot.style, { width: "300px", height: "300px", left: "1690px", top: "760px", background: "var(--peach)", opacity: 0.55 });

  const bug = el("div", "", stage); bug.id = "bug"; bug.innerHTML = TOMATO.replace('class="tomato-svg"', "") + "<span>Debo</span>";

  const cap = el("div", "", stage); cap.id = "cap";
  const capParts = TL.steps.map((s) => {
    const box = el("div", "", cap); box.style.position = "absolute"; box.style.width = "780px";
    const label = el("div", "label", box, `Step ${s.n} of ${TL.steps.length}`);
    const h = el("h1", "", box); const ws = words(h, s.title);
    const p = el("p", "", box, s.sub);
    return { s, box, label, ws, p };
  });
  const dots = el("div", "", stage); dots.id = "dots";
  const dotEls = TL.steps.map(() => el("i", "", dots));

  const phone = el("div", "", stage); phone.id = "phone";
  el("div", "body", phone);
  const scr = el("div", "screen", phone);
  const under = el("img", "", scr), over = el("img", "", scr);
  under.decoding = over.decoding = "sync";
  const speed = el("div", "", stage); speed.id = "speed";

  // Intro and end cards, on red.
  const intro = el("div", "card", stage);
  const ih = el("h1", "", intro); ih.style.fontSize = "120px"; const iws = words(ih, "Debo, start to finish");
  const ip = el("p", "", intro, "A real recording of the app. The waiting is sped up."); ip.style.fontSize = "50px"; ip.style.marginTop = "30px";
  const endRed = el("div", "wipe", stage);
  const big = el("div", "tomato", stage); big.innerHTML = TOMATO;
  Object.assign(big.style, { width: "360px", height: "360px", left: (1920 - 360) / 2 + "px", top: "120px" });
  const bigSvg = big.querySelector("svg"); bigSvg.style.width = "100%"; bigSvg.style.height = "100%";
  const end = el("div", "card", stage);
  const eh = el("h1", "", end); eh.style.fontSize = "150px"; const ews = words(eh, "Debo");
  const ep = el("p", "", end, "A friendly assistant that remembers your life."); ep.style.fontSize = "50px"; ep.style.marginTop = "26px";
  const eu = el("div", "", end); eu.style.marginTop = "56px"; const url = el("span", "url", eu, "my.debo.life");

  const segAt = (t) => { const s = TL.segs; if (t < s[0].t0) return 0; for (let i = 0; i < s.length; i++) if (t < s[i].t1) return i; return s.length - 1; };
  const srcAt = (g, t) => g.src[0] + clamp(t - g.t0, 0, g.t1 - g.t0) * g.speed;
  const setSrc = (im, u, jobs) => { if (im.dataset.u !== u) { im.dataset.u = u; im.src = u; jobs.push(im.decode().catch(() => {})); } };
  const F = TL.footEnd;

  async function seek(t) {
    const jobs = [];
    // Footage, with a short dissolve where the edit skips part of the recording.
    const i = segAt(t), g = TL.segs[i];
    setSrc(over, frameUrl(srcAt(g, Math.min(t, F - 0.001))), jobs);
    const XF = 0.3;
    if (i > 0 && g.jump && t < g.t0 + XF) {
      const pg = TL.segs[i - 1];
      setSrc(under, frameUrl(pg.src[1] - 0.05), jobs);
      under.style.visibility = "visible"; over.style.opacity = tr(t, g.t0, g.t0 + XF, (x) => x);
    } else { under.style.visibility = "hidden"; over.style.opacity = 1; }

    // Phone rises in after the title card and stays to the end card.
    const rise = 1150 * (1 - tr(t, 2.9, 3.7, eo3));
    phone.style.transform = `translate(${PX - 390 * S}px, ${PY - 844 * S + rise}px) scale(${S})`;
    phone.style.display = t < 2.85 || t > F + 1.0 ? "none" : "block";

    // Speed chip next to the phone.
    const chipOn = t >= TL.intro + 0.4 && t < F - 0.3;
    speed.style.display = chipOn ? "block" : "none";
    if (chipOn) {
      speed.textContent = speedText(g.speed);
      speed.style.left = PX + 390 * S + 48 + "px"; speed.style.top = "110px";
      speed.style.opacity = Math.min(tr(t, TL.intro + 0.4, TL.intro + 0.8, (x) => x), 1 - tr(t, F - 0.6, F - 0.3, (x) => x));
    }

    const bk = tr(t, 2.9, 3.5, (x) => x); blob.style.opacity = bk; dot.style.opacity = 0.55 * bk;
    bug.style.opacity = Math.min(tr(t, 3.3, 3.8, (x) => x), 1 - tr(t, F - 0.4, F, (x) => x));
    const lastIdx = TL.steps.length - 1;
    capParts.forEach((c, k) => {
      const s = c.s, t1 = k === lastIdx ? F - 0.1 : s.t1;
      const on = t >= s.t0 && t < t1;
      c.box.style.display = on ? "block" : "none";
      if (!on) return;
      const a0 = s.t0 + (k === 0 ? 0.5 : 0.1), outK = tr(t, t1 - 0.35, t1);
      c.box.style.opacity = 1 - outK; c.box.style.transform = `translateY(${-24 * outK}px)`;
      const lk = tr(t, a0, a0 + 0.4, eo3); c.label.style.opacity = lk; c.label.style.transform = `translateY(${(1 - lk) * 20}px)`;
      c.ws.forEach((w, j) => { const kk = tr(t, a0 + 0.1 + j * 0.07, a0 + 0.65 + j * 0.07, eo3); w.style.transform = `translateY(${(1 - kk) * 115}%)`; w.style.opacity = kk > 0 ? 1 : 0; });
      const pk = tr(t, a0 + 0.6, a0 + 1.2, eo3); c.p.style.opacity = 0.72 * pk; c.p.style.transform = `translateY(${(1 - pk) * 26}px)`;
    });
    const cur = TL.steps.findIndex((s) => t >= s.t0 && t < s.t1);
    dots.style.opacity = Math.min(tr(t, 3.6, 4.2, (x) => x), 1 - tr(t, F - 0.4, F, (x) => x));
    dotEls.forEach((d, k) => { d.className = k === cur ? "on" : k < cur || t >= F ? "done" : ""; });

    // Title card.
    red.style.display = t < 3.6 ? "block" : "none";
    const pk = tr(t, 2.7, 3.5);
    paper.style.display = t < 3.6 && pk > 0 ? "block" : "none";
    paper.style.clipPath = `circle(${pk * 2300}px at ${PX}px ${PY}px)`;
    intro.style.display = t < 3.0 ? "block" : "none";
    if (t < 3.0) {
      const outK = tr(t, 2.4, 2.8);
      intro.style.top = 540 - intro.offsetHeight / 2 - 24 * outK + "px"; intro.style.opacity = 1 - outK;
      iws.forEach((w, j) => { const k = tr(t, 0.25 + j * 0.08, 0.8 + j * 0.08, eo3); w.style.transform = `translateY(${(1 - k) * 115}%)`; w.style.opacity = k > 0 ? 1 : 0; });
      const k = tr(t, 0.9, 1.5, eo3); ip.style.opacity = 0.9 * k; ip.style.transform = `translateY(${(1 - k) * 26}px)`;
    }

    // End card.
    const ek = tr(t, F + 0.05, F + 0.85);
    endRed.style.display = ek > 0 ? "block" : "none";
    endRed.style.clipPath = `circle(${ek * 2300}px at 960px 540px)`;
    const a = t - (F + 0.75);
    big.style.display = a > -0.1 ? "block" : "none";
    if (a > -0.1) {
      const k = a < 0 ? 0 : eoBack(clamp(a / 0.8));
      const rot = a > 0.6 ? Math.sin((a - 0.6) * 9) * 4 * Math.exp(-(a - 0.6) * 1.6) : 0;
      big.style.transform = `scale(${k}) rotate(${rot}deg)`;
      big.querySelector(".eyes").style.transform = a > 2.6 && a < 2.75 ? "scaleY(0.12)" : "none";
    }
    const b0 = F + 1.35;
    end.style.display = t >= b0 - 0.01 ? "block" : "none";
    if (t >= b0 - 0.01) {
      end.style.top = "520px";
      ews.forEach((w) => { const k = tr(t, b0, b0 + 0.55, eo3); w.style.transform = `translateY(${(1 - k) * 115}%)`; w.style.opacity = k > 0 ? 1 : 0; });
      const k = tr(t, b0 + 0.45, b0 + 1.05, eo3); ep.style.opacity = 0.9 * k; ep.style.transform = `translateY(${(1 - k) * 26}px)`;
      const u = tr(t, b0 + 1.2, b0 + 1.8, eoBack); url.style.transform = `scale(${0.6 + 0.4 * u})`; url.style.opacity = clamp(u * 2);
    }
    await Promise.all(jobs);
  }
  window.seek = seek; window.DURATION = TL.D; window.SIZE = [TL.W, TL.H];
  window.ready = true;
}
init();
