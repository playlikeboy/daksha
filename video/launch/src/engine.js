// Draws the video as a pure function of time: seek(t) puts every element where it
// belongs at time t. Nothing runs on its own, so the renderer can step through frames.
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const eo3 = (x) => 1 - Math.pow(1 - x, 3);
const eio3 = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const eoBack = (x) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const tr = (t, a, b, f = eio3) => f(clamp((t - a) / (b - a)));
const lerp = (a, b, k) => a + (b - a) * k;

const TOMATO = `<svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" class="tomato-svg">
<ellipse cx="120" cy="226" rx="70" ry="8" fill="#1b1b1b" opacity="0.14"/>
<path d="M120 66C150 52 204 60 221 118C234 174 190 218 120 218C50 218 6 174 19 118C36 60 90 52 120 66Z" fill="#e5392b"/>
<path d="M221 118C234 174 190 218 120 218C62 218 22 188 17 142C40 190 100 200 150 186C196 172 214 150 221 118Z" fill="#c42a20"/>
<ellipse cx="56" cy="112" rx="17" ry="8" fill="#fff" opacity="0.4" transform="rotate(-48 56 112)"/>
<circle cx="45" cy="134" r="4.5" fill="#fff" opacity="0.4"/>
<g fill="#3f9b45"><path d="M120 66C108 58 84 56 64 70C86 76 106 76 120 66Z"/><path d="M120 66C132 58 156 56 176 70C154 76 134 76 120 66Z"/><path d="M120 66C102 66 82 78 76 96C98 94 114 84 120 66Z"/><path d="M120 66C138 66 158 78 164 96C142 94 126 84 120 66Z"/></g>
<path d="M120 70C112 82 114 96 120 104C126 96 128 82 120 70Z" fill="#2f7d33"/>
<path d="M120 70C119 56 122 46 130 38" fill="none" stroke="#2f7d33" stroke-width="9" stroke-linecap="round"/>
<ellipse cx="60" cy="158" rx="16" ry="10" fill="#ffb0a8" opacity="0.85"/><ellipse cx="180" cy="158" rx="16" ry="10" fill="#ffb0a8" opacity="0.85"/>
<g class="eyes" style="transform-origin:120px 136px"><ellipse cx="88" cy="136" rx="13" ry="16" fill="#1b1b1b"/><circle cx="93" cy="130" r="5" fill="#fff"/><circle cx="84" cy="142" r="2.2" fill="#fff"/>
<ellipse cx="152" cy="136" rx="13" ry="16" fill="#1b1b1b"/><circle cx="157" cy="130" r="5" fill="#fff"/><circle cx="148" cy="142" r="2.2" fill="#fff"/></g>
<path d="M106 158Q120 174 134 158" fill="none" stroke="#1b1b1b" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const pad = (n) => String(n).padStart(6, "0");

async function init() {
  const L = new URLSearchParams(location.search).get("layout") === "v" ? "v" : "h";
  const [stamps, marks] = await Promise.all([fetch("/cap/clips/all/stamps.json").then((r) => r.json()), fetch("/cap/marks.json").then((r) => r.json())]);
  const t0 = marks.start;
  const rel = stamps.map((s) => s - t0);
  const M = {}; for (const k in marks) M[k] = marks[k] - t0;
  const TL = buildTimeline(M, L);
  const stage = document.getElementById("stage");
  stage.style.width = TL.W + "px"; stage.style.height = TL.H + "px";
  await document.fonts.ready;
  await Promise.all(["500", "700", "800"].map((w) => document.fonts.load(`${w} 40px Figtree`)));

  // Layers, bottom to top.
  const wipeEls = TL.wipes.map((w) => { const d = el("div", "wipe", stage); d.style.background = w.color; return d; });
  const blob = el("div", "", stage); blob.id = "blob";
  const phone = el("div", "", stage); phone.id = "phone";
  el("div", "body", phone);
  const scr = el("div", "screen", phone);
  const imgs = TL.screen.map((s, i) => { const im = el("img", "", scr); im.style.zIndex = i; im.decoding = "sync"; im.style.opacity = 0; return im; });
  const svgNS = "http://www.w3.org/2000/svg";
  const lines = document.createElementNS(svgNS, "svg"); lines.id = "lines"; lines.setAttribute("viewBox", `0 0 ${TL.W} ${TL.H}`); stage.appendChild(lines);
  const bug = el("div", "", stage); bug.id = "bug"; bug.innerHTML = TOMATO.replace('class="tomato-svg"', "") + "<span>Debo</span>";
  bug.style.left = (TL.V ? 90 : 120) + "px"; bug.style.top = (TL.V ? 70 : 60) + "px";

  // Big tomato for the reveal and the end card.
  const big = el("div", "tomato", stage); big.innerHTML = TOMATO;
  const bigSize = TL.V ? 440 : 400;
  big.style.width = big.style.height = bigSize + "px";
  big.style.left = (TL.W - bigSize) / 2 + "px";
  const bigSvg = big.querySelector("svg"); bigSvg.style.width = "100%"; bigSvg.style.height = "100%";

  // Text blocks.
  const blocks = TL.text.map((b) => {
    const d = el("div", "tb", stage);
    d.style.width = b.w + "px";
    if (b.center) d.style.textAlign = "center";
    const parts = { d, words: [], b };
    if (b.badge) { const bd = el("div", "badge", d, b.badge); parts.badge = bd; }
    if (b.lines) {
      const h = el("h1", "", d); h.style.fontSize = b.size + "px"; h.style.color = b.color || "#1b1b1b";
      b.lines.forEach((ln) => {
        const l = el("span", "ln", h); if (ln.color) l.style.color = ln.color;
        ln.text.split(" ").forEach((word, i, arr) => {
          const w = el("span", "w", l); const wi = el("span", "wi", w, word); if (i < arr.length - 1) l.appendChild(document.createTextNode(" "));
          parts.words.push({ wi, delay: (ln.delay || 0) });
        });
      });
    }
    if (b.sub) { const p = el("p", "", d, b.sub); p.style.fontSize = b.subSize + "px"; p.style.marginTop = (b.center ? 26 : 30) + "px"; p.style.color = b.color || "#1b1b1b"; if (b.center) p.style.opacity = 0.9; parts.sub = p; }
    if (b.url) { const u = el("span", "url", d, b.url); u.style.fontSize = b.size + "px"; u.style.padding = "0.28em 0.8em 0.32em"; parts.url = u; }
    return parts;
  });

  // Callouts.
  const callEls = TL.callouts.map((c) => {
    const pill = el("div", "pill", stage); pill.innerHTML = "<i></i><span></span>"; pill.lastChild.textContent = c.text;
    pill.style.fontSize = (TL.V ? 34 : 36) + "px"; pill.style.padding = "20px 34px 22px 28px";
    const path = document.createElementNS(svgNS, "path"); path.setAttribute("fill", "none"); path.setAttribute("stroke", "#1b1b1b"); path.setAttribute("stroke-width", "4"); path.setAttribute("stroke-linecap", "round"); lines.appendChild(path);
    const dot = document.createElementNS(svgNS, "circle"); dot.setAttribute("r", "11"); dot.setAttribute("fill", "#e5392b"); dot.setAttribute("stroke", "#fff"); dot.setAttribute("stroke-width", "4"); lines.appendChild(dot);
    const ring = document.createElementNS(svgNS, "circle"); ring.setAttribute("fill", "none"); ring.setAttribute("stroke", "#e5392b"); ring.setAttribute("stroke-width", "3"); lines.appendChild(ring);
    return { c, pill, path, dot, ring, w: pill.offsetWidth, h: pill.offsetHeight };
  });

  const camAt = (t) => {
    const k = TL.cam; if (t <= k[0].t) return k[0]; if (t >= k.at(-1).t) return k.at(-1);
    let i = 0; while (k[i + 1].t < t) i++;
    const a = k[i], b = k[i + 1], f = eio3((t - a.t) / (b.t - a.t));
    return { fx: lerp(a.fx, b.fx, f), fy: lerp(a.fy, b.fy, f), S: lerp(a.S, b.S, f), y: lerp(a.y, b.y, f) };
  };
  const toStage = (cm, x, y) => [TL.anchor.x + cm.S * (x - cm.fx), cm.y + cm.S * (y - cm.fy)];

  const srcT = (seg, t) => {
    const m = seg.map; if (t <= m[0][0]) return m[0][1]; if (t >= m.at(-1)[0]) return m.at(-1)[1];
    let i = 0; while (m[i + 1][0] < t) i++;
    return lerp(m[i][1], m[i + 1][1], (t - m[i][0]) / (m[i + 1][0] - m[i][0]));
  };
  const frameFor = (s) => { let lo = 0, hi = rel.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (rel[mid] <= s) lo = mid; else hi = mid - 1; } return lo + 1; };

  async function seek(t) {
    // Backgrounds
    let base = "#1b1b1b";
    TL.wipes.forEach((w, i) => {
      const k = tr(t, w.t0, w.t1, eio3), R = Math.hypot(TL.W, TL.H) * 1.05;
      wipeEls[i].style.clipPath = `circle(${k * R}px at ${w.cx}px ${w.cy}px)`;
      wipeEls[i].style.display = k > 0 ? "block" : "none";
    });
    stage.style.background = base;

    // Camera
    const cm = camAt(t);
    const visible = t > 7.1 && t < 62.6;
    phone.style.display = visible ? "block" : "none";
    phone.style.transform = `translate(${TL.anchor.x - cm.S * cm.fx}px, ${cm.y - cm.S * cm.fy}px) scale(${cm.S})`;
    const bs = 1180 * tr(t, 7.6, 8.8, eo3) * (t > 61.4 ? 1 - tr(t, 61.4, 62.2) : 1);
    blob.style.display = visible ? "block" : "none";
    blob.style.width = blob.style.height = bs + "px";
    blob.style.left = TL.anchor.x - bs / 2 + "px"; blob.style.top = (TL.V ? 1180 : 540) - bs / 2 + "px";

    // Footage
    const jobs = [];
    TL.screen.forEach((s, i) => {
      const im = imgs[i];
      const next = TL.screen[i + 1];
      const covered = next && t > next.t0 + next.fade + 0.01;
      const op = t < s.t0 ? 0 : s.fade ? tr(t, s.t0, s.t0 + s.fade, (x) => x) : 1;
      if (op <= 0 || covered || t > s.map.at(-1)[0] + 0.6) { im.style.opacity = 0; im.style.visibility = "hidden"; return; }
      im.style.visibility = "visible"; im.style.opacity = op;
      const url = `/cap/clips/all/${pad(frameFor(srcT(s, t)))}.jpg`;
      if (im.dataset.u !== url) { im.dataset.u = url; im.src = url; jobs.push(im.decode().catch(() => {})); }
    });

    // Brand bug
    bug.style.opacity = Math.min(tr(t, 8.4, 9.0, (x) => x), 1 - tr(t, 61.0, 61.6, (x) => x));

    // Big tomato: reveal at 4.3 and the end card at 63.0
    let tom = null;
    if (t >= 4.2 && t < 7.4) {
      const a = t - 4.3, k = a < 0 ? 0 : eoBack(clamp(a / 0.8)), out = tr(t, 7.0, 7.4);
      tom = { s: k * (1 - 0.15 * out), rot: a > 0.6 ? Math.sin((a - 0.6) * 9) * 4 * Math.exp(-(a - 0.6) * 1.6) : 0, op: 1 - out, y: TL.V ? 620 : 250, blink: t > 5.8 && t < 5.95 };
    } else if (t >= 62.9) {
      const a = t - 63.0, k = a < 0 ? 0 : eoBack(clamp(a / 0.8));
      tom = { s: k, rot: a > 0.6 ? Math.sin((a - 0.6) * 9) * 4 * Math.exp(-(a - 0.6) * 1.6) : 0, op: 1, y: TL.V ? 560 : 130, blink: t > 66.4 && t < 66.55 };
    }
    big.style.display = tom ? "block" : "none";
    if (tom) {
      big.style.top = tom.y + "px"; big.style.opacity = tom.op;
      big.style.transform = `scale(${tom.s}) rotate(${tom.rot}deg)`;
      big.querySelector(".eyes").style.transform = tom.blink ? "scaleY(0.12)" : "none";
    }

    // Text
    blocks.forEach((p) => {
      const b = p.b, a = t - b.t0, outK = b.noExit ? 0 : tr(t, b.t1 - 0.4, b.t1, eio3);
      const on = a > -0.01 && t < b.t1 + 0.05;
      p.d.style.display = on ? "block" : "none";
      if (!on) return;
      if (b.center) { p.d.style.left = "0px"; p.d.style.top = (b.cy - p.d.offsetHeight / 2) + "px"; }
      else { p.d.style.left = b.x + "px"; p.d.style.top = b.y + "px"; }
      p.d.style.opacity = 1 - outK;
      p.d.style.transform = `translateY(${-24 * outK}px)`;
      if (p.badge) { const k = tr(t, b.t0, b.t0 + 0.4, eo3); p.badge.style.opacity = k; p.badge.style.transform = `translateY(${(1 - k) * 20}px)`; }
      p.words.forEach((w, i) => { const k = tr(t, b.t0 + w.delay + i * 0.07, b.t0 + w.delay + i * 0.07 + 0.55, eo3); w.wi.style.transform = `translateY(${(1 - k) * 115}%)`; w.wi.style.opacity = k > 0 ? 1 : 0; });
      if (p.sub) { const d0 = b.t0 + (b.subDelay != null ? b.subDelay : 0.5), k = tr(t, d0, d0 + 0.6, eo3); p.sub.style.transform = `translateY(${(1 - k) * 26}px)`; p.sub.style.opacity = k * (b.center ? 0.9 : 0.72); }
      if (p.url) { const k = tr(t, b.t0, b.t0 + 0.6, eoBack); p.url.style.transform = `scale(${0.6 + 0.4 * k})`; p.url.style.opacity = clamp(k * 2); }
    });

    // Callouts
    callEls.forEach((ce) => {
      const c = ce.c, on = t >= c.t0 && t <= c.t1 + 0.01;
      ce.pill.style.display = ce.path.style.display = ce.dot.style.display = ce.ring.style.display = on ? "" : "none";
      if (!on) return;
      const inK = tr(t, c.t0, c.t0 + 0.45, eo3), outK = tr(t, c.t1 - 0.35, c.t1, eio3), op = inK * (1 - outK);
      const p = c.pos;
      const px = p.center ? p.x - ce.w / 2 : p.x, py = p.y;
      ce.pill.style.left = px + "px"; ce.pill.style.top = py + "px";
      ce.pill.style.opacity = op; ce.pill.style.transform = `translateY(${(1 - inK) * 24}px)`;
      const [tx, ty] = toStage(cm, c.target[0], c.target[1]);
      const sx = p.center ? p.x : px + ce.w, sy = p.center ? py + ce.h : py + ce.h / 2;
      const len = Math.hypot(tx - sx, ty - sy), k = tr(t, c.t0 + 0.2, c.t0 + 0.8, eo3);
      const ex = sx + (tx - sx) * k, ey = sy + (ty - sy) * k;
      ce.path.setAttribute("d", TL.V ? "" : `M${sx},${sy} L${ex},${ey}`);
      ce.path.style.opacity = op; ce.dot.style.opacity = op * (k > 0.98 ? 1 : 0);
      ce.dot.setAttribute("cx", tx); ce.dot.setAttribute("cy", ty);
      const pulse = ((t - c.t0) * 1.2) % 1;
      ce.ring.setAttribute("cx", tx); ce.ring.setAttribute("cy", ty); ce.ring.setAttribute("r", 11 + 26 * pulse);
      ce.ring.style.opacity = op * (k > 0.98 ? 1 - pulse : 0);
    });
    await Promise.all(jobs);
  }
  window.seek = seek; window.DURATION = TL.D; window.SIZE = [TL.W, TL.H];
  window.ready = true;
}
init();
