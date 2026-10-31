// Munchkin's animated body: her painted parts (img/rig) layered and moved in code,
// with a thin outline around the whole cat and soft shadows made on the fly.
// Same rig as the test page (anim.html).

const OFF = { tail: [722, 603], body: [240, 621], bib: [387, 727], paw_r: [656, 757], paw_l: [240, 720], foot_r: [615, 1048], foot_l: [264, 1044], ear_r: [655, 129], ear_l: [157, 81], head: [105, 121], nose: [539, 565], blush_l: [208, 527], blush_r: [775, 613], whiskers_r: [851, 644], whiskers_l: [73, 553] };
const ORDER = ["tail", "body", "bib", "paw_r", "paw_l", "foot_r", "foot_l", "ear_r", "ear_l", "head", "nose", "blush_l", "blush_r", "whiskers_r", "whiskers_l"];
const PIV = { ground: [580, 1195], body: [580, 1185], neck: [575, 745], chest: [575, 1010], tail: [790, 1035], earL: [440, 400], earR: [770, 440],
  pawL: [420, 765], pawR: [700, 790], whiskL: [262, 605], whiskR: [862, 690], blushL: [283, 593], blushR: [846, 673] };
const CAST = { body: [4, 10, 14, .22], paw_r: [3, 12, 12, .28], paw_l: [3, 12, 12, .28], head: [6, 24, 22, .30], bib: [2, 6, 8, .18] };
const OUTLINE = "#481379";
const ART = 1254; // the rig's square canvas, in rig units
const BOX = { x: 73, y: 81, w: 1134 }; // where the cat itself sits inside it (matches the still picture)

// ---------- loading the parts once ----------
let parts = null;
function loadParts() {
  parts ||= Promise.all(ORDER.map((n) => new Promise((ok, bad) => {
    const i = new Image();
    i.onload = () => ok([n, i]); i.onerror = bad;
    i.src = `img/rig/${n}.webp`;
  }))).then((list) => {
    const imgs = {}, sils = {};
    for (const [n, i] of list) {
      imgs[n] = i;
      const s = document.createElement("canvas"); s.width = i.width; s.height = i.height;
      const g = s.getContext("2d"); g.drawImage(i, 0, 0); g.globalCompositeOperation = "source-in"; g.fillStyle = "#000"; g.fillRect(0, 0, s.width, s.height);
      sils[n] = s;
    }
    return { imgs, sils };
  });
  return parts;
}

// ---------- poses ----------
const D = Math.PI / 180;
const ss = (x) => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
function flick(t, period, off) { const p = (t + off) % period; return p < 0.3 ? Math.sin(Math.PI * p / 0.3) : 0; }
const BASE = { rootY: 0, rootSx: 1, rootSy: 1, bodySx: 1, bodySy: 1, headRot: 0, headDx: 0, headDy: 0, earL: 0, earR: 0, tail: 0, pawL: 0, pawR: 0, whisk: 0, blush: 1, shadow: 1, z: 0, nom: 0, hi: 0 };

export const STATES = {
  idle(t) {
    const b = Math.sin(t * 2.2);
    return { bodySy: 1 + .014 * b, bodySx: 1 - .007 * b, headRot: 1.6 * Math.sin(t * .9), headDy: 2.5 * Math.sin(t * 2.2 + .6),
      tail: 6 * Math.sin(t * 1.6), earL: -11 * flick(t, 4.3, 0), earR: 11 * flick(t, 5.7, 2.1), whisk: 2.5 * Math.sin(t * 3) };
  },
  happy(t, st) {
    const T = .8, p = (st % T) / T, g = (p + .15) % 1;
    let h = 0, sq = 0, str = 0, a = 0;
    if (g < .35) sq = Math.sin(Math.PI * g / .35);
    else { a = (g - .35) / .65; h = Math.sin(Math.PI * a) * 95; str = (1 - Math.sin(Math.PI * a)) * .06; }
    const up = Math.sin(Math.PI * a);
    return { rootY: -h, rootSy: 1 - .1 * sq + str, rootSx: 1 + .07 * sq - str * .6, pawL: 10 + 32 * up, pawR: -10 - 32 * up,
      earL: -5 + 8 * sq, earR: 5 - 8 * sq, tail: 14 * Math.sin(t * 9), headRot: 3 * Math.sin(st * 2 * Math.PI / T), headDy: 6 * sq,
      whisk: 5 * Math.sin(t * 10), shadow: 1 - h / 260, blush: 1 + .08 * up };
  },
  munch(t, st) {
    const c = Math.abs(Math.sin(Math.PI * st / .45)), b = Math.sin(t * 2.2);
    return { bodySy: 1 + .012 * b, bodySx: 1 - .006 * b, headDy: 7 * c, headRot: -2 + 1.5 * Math.sin(t * 1.3), pawL: -12 - 4 * c, pawR: 12 + 4 * c,
      blush: 1.06 + .1 * (.5 + .5 * Math.sin(t * 4)), tail: 8 * Math.sin(t * 2.4), whisk: 4 * c, earL: -3 * c, earR: 3 * c, nom: 1 };
  },
  hello(t, st) {
    const T = 2.6, p = (st % T) / T, b = Math.sin(t * 2.2);
    const tilt = p < .28 ? ss(p / .28) : p < .68 ? 1 : 1 - ss((p - .68) / .28);
    const hop = p < .18 ? Math.sin(Math.PI * p / .18) : 0;
    const land = p >= .18 && p < .3 ? Math.sin(Math.PI * (p - .18) / .12) : 0;
    return { rootY: -34 * hop, rootSy: 1 - .06 * land + .03 * hop, rootSx: 1 + .045 * land - .02 * hop,
      bodySy: 1 + .01 * b, bodySx: 1 - .005 * b,
      headRot: -11 * tilt + 1.2 * Math.sin(t * 3) * tilt, headDx: -6 * tilt, headDy: 2 * land,
      earL: 8 * tilt - 6 * land, earR: -8 * tilt + 6 * land, blush: 1 + .14 * tilt,
      tail: 4 * Math.sin(t * 1.6) + 16 * Math.sin(st * 8) * tilt, whisk: 4 * Math.sin(t * 6) * tilt, hi: tilt };
  },
  sleepy(t) {
    const b = Math.sin(t * .9);
    return { bodySy: 1 + .028 * b, bodySx: 1 - .014 * b, headRot: 7 + 2 * Math.sin(t * .45), headDy: 16 + 3 * b, earL: -15, earR: 15,
      tail: 3 * Math.sin(t * .7), whisk: -3, pawL: -4, pawR: 4, z: 1, shadow: 1.02 };
  },
};

const around = (m, [px, py], fn) => { m.translateSelf(px, py); fn(m); m.translateSelf(-px, -py); return m; };
const rot = (m, p, deg) => around(m, p, (q) => q.rotateSelf(deg));
const scl = (m, p, sx, sy) => around(m, p, (q) => q.scaleSelf(sx, sy));
const popIn = (q) => q < .18 ? .4 + .8 * Math.sin(Math.PI / 2 * q / .18) * (1 + .15 * Math.sin(Math.PI * q / .18)) : 1;

// Make one animated cat.
// width: how wide the cat itself is on screen (css px). The canvas is bigger than that, so jumps,
// "nom nom nom" and z's can float outside her box; it's placed so the cat lines up with her box.
export function createCat({ width = 100, pad = { l: 60, r: 560, t: 430, b: 70 }, outline = true, shadows = true } = {}) {
  const W = { x: -pad.l, y: -pad.t, w: ART + pad.l + pad.r, h: ART + pad.t + pad.b };
  const cv = document.createElement("canvas");
  cv.className = "cat-anim";
  cv.setAttribute("role", "img");
  cv.setAttribute("aria-label", "Munchkin the cat");
  const ctx = cv.getContext("2d");
  const buf = document.createElement("canvas"), bx = buf.getContext("2d");
  const tmp = document.createElement("canvas"), tx = tmp.getContext("2d");
  const sil = document.createElement("canvas"), sx = sil.getContext("2d");
  let dpr = 1, k = 1, cssScale = 1, ready = null, raf = 0, running = false;
  let state = "idle", base = "idle", since = 0, from = null, blendStart = 0, simT = 0, last = 0, until = 0, current = { ...BASE };
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  function size(w) {
    width = w || width;
    cssScale = width / BOX.w;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = W.w * cssScale, ch = W.h * cssScale;
    for (const c of [cv, buf, tmp, sil]) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
    Object.assign(cv.style, { width: cw + "px", height: ch + "px", left: -(pad.l + BOX.x) * cssScale + "px", top: -(pad.t + BOX.y) * cssScale + "px" });
    k = cv.width / W.w;
  }
  const view = () => new DOMMatrix([k, 0, 0, k, -W.x * k, -W.y * k]);

  function matrices(P) {
    const root = view().translateSelf(0, P.rootY); scl(root, PIV.ground, P.rootSx, P.rootSy);
    const bodyLean = P.headRot * .15, chestLean = P.headRot * .75 - bodyLean;
    const leaned = rot(DOMMatrix.fromMatrix(root), PIV.body, bodyLean);
    const body = scl(DOMMatrix.fromMatrix(leaned), PIV.body, P.bodySx, P.bodySy);
    const neckShift = (PIV.neck[1] - PIV.body[1]) * (P.bodySy - 1);
    const chest = rot(DOMMatrix.fromMatrix(body).translateSelf(P.headDx * .75, P.headDy * .6), PIV.chest, chestLean);
    const head = DOMMatrix.fromMatrix(leaned).translateSelf(P.headDx, neckShift + P.headDy); rot(head, PIV.neck, P.headRot - bodyLean);
    const c = (m) => DOMMatrix.fromMatrix(m);
    return {
      tail: rot(c(body), PIV.tail, P.tail), body, bib: chest,
      paw_l: rot(c(chest), PIV.pawL, P.pawL), paw_r: rot(c(chest), PIV.pawR, P.pawR),
      foot_l: root, foot_r: root,
      ear_l: rot(c(head), PIV.earL, P.earL), ear_r: rot(c(head), PIV.earR, P.earR),
      head, nose: head,
      blush_l: scl(c(head), PIV.blushL, P.blush, P.blush), blush_r: scl(c(head), PIV.blushR, P.blush, P.blush),
      whiskers_l: rot(c(head), PIV.whiskL, -P.whisk), whiskers_r: rot(c(head), PIV.whiskR, P.whisk),
    };
  }

  function draw(P, { imgs, sils }) {
    const part = (g, n, m, src = imgs[n]) => { g.setTransform(m); g.drawImage(src, OFF[n][0], OFF[n][1], src.width * 2, src.height * 2); };
    const M = matrices(P);
    bx.setTransform(1, 0, 0, 1, 0, 0); bx.clearRect(0, 0, buf.width, buf.height);
    for (const n of ORDER) {
      const cs = CAST[n];
      if (shadows && cs) {
        const [dx, dy, blur, alpha] = cs, off = tmp.width * 2;
        tx.setTransform(1, 0, 0, 1, 0, 0); tx.clearRect(0, 0, tmp.width, tmp.height);
        tx.shadowColor = `rgba(52,14,96,${alpha})`; tx.shadowBlur = blur * k; tx.shadowOffsetX = off + dx * k; tx.shadowOffsetY = dy * k;
        part(tx, n, new DOMMatrix([1, 0, 0, 1, -off, 0]).multiply(M[n]), sils[n]);
        tx.shadowColor = "transparent";
        bx.setTransform(1, 0, 0, 1, 0, 0); bx.globalCompositeOperation = "source-atop"; bx.drawImage(tmp, 0, 0); bx.globalCompositeOperation = "source-over";
      }
      part(bx, n, M[n]);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    if (shadows) {
      ctx.setTransform(view());
      const s = Math.max(.45, P.shadow);
      const gr = ctx.createRadialGradient(580, 1205, 0, 580, 1205, 330 * s);
      gr.addColorStop(0, `rgba(52,14,96,${.28 * s})`); gr.addColorStop(1, "rgba(52,14,96,0)");
      ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(580, 1205, 330 * s, 42 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (outline) {
      sx.setTransform(1, 0, 0, 1, 0, 0); sx.clearRect(0, 0, sil.width, sil.height);
      sx.drawImage(buf, 0, 0); sx.globalCompositeOperation = "source-in"; sx.fillStyle = OUTLINE; sx.fillRect(0, 0, sil.width, sil.height); sx.globalCompositeOperation = "source-over";
      const r = Math.max(1, 1.4 * dpr * Math.min(1, width / 120 + .35));
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ctx.drawImage(sil, Math.cos(a) * r, Math.sin(a) * r); }
    }
    ctx.drawImage(buf, 0, 0);
    extras(P);
  }

  // chunky white letters with a firm purple shadow; never smaller than ~13px on screen
  function bubble(txt, x, y, size, alpha, pop = 1) {
    if (alpha <= .01) return;
    const boost = Math.max(1, 13 / (size * cssScale));
    size *= boost;
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.translate(x, y); ctx.scale(pop, pop);
    ctx.font = `700 ${size}px Fredoka, "Nunito", system-ui, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    ctx.fillStyle = OUTLINE; ctx.strokeStyle = OUTLINE; ctx.lineWidth = size * .2;
    ctx.strokeText(txt, 0, size * .12); ctx.fillText(txt, 0, size * .12);
    ctx.strokeText(txt, 0, 0);
    ctx.fillStyle = "#fff"; ctx.fillText(txt, 0, 0);
    ctx.restore();
  }
  function extras(P) {
    const now = simT * 1000;
    ctx.setTransform(view());
    if (P.z > .05) {
      for (let i = 0; i < 3; i++) {
        const q = ((now / 1000 * .32) + i / 3) % 1;
        bubble("z", 980 + 170 * q + 30 * Math.sin(q * 6), 230 - 520 * q, 70 + 55 * q, P.z * Math.min(1, Math.sin(Math.PI * q) * 1.6), popIn(q) * (1 + .05 * Math.sin(now / 300 + i)));
      }
    }
    if (P.nom > .05) {
      const T = 1.8, q = ((now / 1000) % T) / T;
      [[1020, 230, -8], [1260, 40, 6], [1080, -170, -4]].forEach(([x, y, r], i) => {
        const s0 = i * .14, local = (q - s0) / (1 - s0);
        if (local < 0) return;
        const fade = local > .78 ? 1 - (local - .78) / .22 : 1;
        ctx.save(); ctx.translate(x, y - 20 * local); ctx.rotate(r * D);
        bubble("nom", 0, 0, 78, P.nom * fade, popIn(local * 1.4));
        ctx.restore();
      });
      ctx.setTransform(view());
    }
    if (P.hi > .05) bubble("hi!", 1080, 150, 96, P.hi, .6 + .4 * P.hi + .03 * Math.sin(now / 160));
    ctx.globalAlpha = 1;
  }

  function setState(s) {
    if (!STATES[s] || s === state) return;
    from = { ...current }; blendStart = simT; state = s; since = simT;
  }
  function tick(t) {
    raf = 0;
    if (!running) return;
    const dt = last ? Math.min(.05, (t - last) / 1000) : 0; last = t;
    simT += dt;
    if (until && simT > until) { until = 0; setState(base); }
    let P = { ...BASE, ...STATES[state](simT, simT - since) };
    if (from) {
      const w = ss((simT - blendStart) / .35);
      if (w >= 1) from = null; else for (const key in P) P[key] = from[key] + (P[key] - from[key]) * w;
    }
    current = P;
    ready.then((p) => { draw(P, p); });
    // keep going only while she's on screen and the app is visible
    if (cv.isConnected && !document.hidden && !reduceMotion) raf = requestAnimationFrame(tick);
    else running = false;
  }
  function start() {
    ready ||= loadParts();
    if (running) return;
    running = true; last = 0;
    if (reduceMotion) { ready.then((p) => draw({ ...BASE, ...STATES[state](0, 0) }, p)); running = false; return; }
    raf = requestAnimationFrame(tick);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && cv.isConnected) start(); });

  size(width);
  return {
    canvas: cv,
    ready: () => (ready ||= loadParts()),
    start,
    resize: (w) => { size(w); },
    // the mood she returns to after a short animation (idle in the day, sleepy at night)
    setBase(s) { base = s; if (!until) setState(s); },
    // play an animation for a few seconds, then go back to the base mood
    play(s, seconds = 2.5) { setState(s); until = simT + seconds; start(); },
    get state() { return state; },
  };
}
