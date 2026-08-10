/*
 * app.js — UI wiring, Japanese stick-multiplication SVG, carry landscape strip.
 * Uses the exact BigInt core in factor.js (global JD).
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const SVGNS = "http://www.w3.org/2000/svg";

  const state = {
    n: null, p: null, q: null,
    B: null,
    perfect: [],          // sorted BigInt perfect bases in the window
    scan: null,           // c0 strip data
    solveInfo: null,      // { method, stats, ms }
  };

  /* ------------------------------------------------------------ formatting */

  function fmt(x) {
    return BigInt(x).toLocaleString("en-US").replace(/,/g, "\u2009");
  }

  function setStatus(msg, isError) {
    const el = $("status");
    el.textContent = msg || "";
    el.classList.toggle("error", !!isError);
  }

  /* ---------------------------------------------------------------- parsing */

  function parseBig(str) {
    const clean = String(str).replace(/[\s,_ ]/g, "");
    if (!/^\d+$/.test(clean)) return null;
    return BigInt(clean);
  }

  /* ------------------------------------------------------------- svg helper */

  function el(name, attrs, parent) {
    const e = document.createElementNS(SVGNS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  /* ============================================================ diagram ==== */

  /*
   * Geometry: p and q each have two digits in base B inside the cube-root
   * window: p = a1·B + g1, q = a2·B + g2. Four crossing clusters form a
   * diamond:
   *
   *        (g1·a2)  B^1
   *   (a1·a2)  B^2        (g1·g2)  B^0
   *        (a1·g2)  B^1
   *
   * P lines have slope +1 (x - y = const), Q lines slope -1 (x + y = const).
   */
  const CLUSTER = {
    "0,0": [340, 280],   // a1 x a2  -> B^2 column
    "1,0": [490, 130],   // g1 x a2  -> B^1 column (upper)
    "0,1": [490, 430],   // a1 x g2  -> B^1 column (lower)
    "1,1": [640, 280],   // g1 x g2  -> B^0 column
  };
  const LINE_SPACING = 14;
  const MAX_LINES = 9;

  const COL_INK = "#2e2820";
  const COL_AI = "#33566b";
  const COL_SHU = "#c2402f";
  const COL_FAINT = "#8a816d";

  function groupLines(centerA, centerB, count, slope) {
    /* Return line constants for `count` parallel strokes through two clusters. */
    const midX = (centerA[0] + centerB[0]) / 2;
    const midY = (centerA[1] + centerB[1]) / 2;
    const shown = Math.min(count, MAX_LINES);
    const lines = [];
    for (let j = 0; j < shown; j++) {
      const off = (j - (shown - 1) / 2) * LINE_SPACING * Math.SQRT2;
      /* slope +1: const = x - y, offset moves perpendicular (-1,+1)/sqrt2 */
      /* slope -1: const = x + y, offset moves perpendicular (+1,+1)/sqrt2 */
      const c = slope > 0 ? midX - midY - off : midX + midY + off;
      lines.push(c);
    }
    return { lines, shown, hidden: count - shown };
  }

  function drawSlopeLine(svg, c, slope, color, width) {
    /* Clip line (x - y = c) or (x + y = c) to the viewBox strip. */
    const X0 = -60, X1 = 1060, Y0 = 30, Y1 = 505;
    let pts = [];
    if (slope > 0) {
      // y = x - c
      const candidates = [
        [X0, X0 - c], [X1, X1 - c], [Y0 + c, Y0], [Y1 + c, Y1],
      ];
      pts = candidates.filter(([x, y]) => x >= X0 && x <= X1 && y >= Y0 && y <= Y1);
    } else {
      // y = c - x
      const candidates = [
        [X0, c - X0], [X1, c - X1], [c - Y0, Y0], [c - Y1, Y1],
      ];
      pts = candidates.filter(([x, y]) => x >= X0 && x <= X1 && y >= Y0 && y <= Y1);
    }
    if (pts.length < 2) return;
    el("line", {
      x1: pts[0][0], y1: pts[0][1], x2: pts[1][0], y2: pts[1][1],
      stroke: color, "stroke-width": width, "stroke-linecap": "round",
      opacity: 0.82,
    }, svg);
  }

  function renderDiagram(info) {
    const svg = $("diagram");
    svg.textContent = "";

    const pDigits = [info.a1, info.g1];   // high, low
    const qDigits = [info.a2, info.g2];
    const pNames = ["a₁", "g₁"];
    const qNames = ["a₂", "g₂"];

    /* Grid guide: faint place columns */
    for (const x of [190, 340, 490, 640]) {
      el("line", { x1: x, y1: 500, x2: x, y2: 512, stroke: COL_FAINT, "stroke-width": 1 }, svg);
    }

    /* P family (ink, slope +1): group i passes through clusters (i,0) and (i,1) */
    const pGroups = [];
    for (let i = 0; i < 2; i++) {
      const g = groupLines(CLUSTER[i + ",0"], CLUSTER[i + ",1"], Number(pDigits[i] > 0n ? pDigits[i] : 0n) || 0, +1);
      pGroups.push(g);
      for (const c of g.lines) drawSlopeLine(svg, c, +1, COL_INK, 3);
    }

    /* Q family (indigo, slope -1): group j passes through clusters (0,j) and (1,j) */
    const qGroups = [];
    for (let j = 0; j < 2; j++) {
      const g = groupLines(CLUSTER["0," + j], CLUSTER["1," + j], Number(qDigits[j] > 0n ? qDigits[j] : 0n) || 0, -1);
      qGroups.push(g);
      for (const c of g.lines) drawSlopeLine(svg, c, -1, COL_AI, 3);
    }

    /* "..." continuation marks for truncated digit groups */
    function ellipsis(x, y, color) {
      for (let k = 0; k < 3; k++) {
        el("circle", { cx: x + k * 12, cy: y, r: 2.6, fill: color, opacity: 0.75 }, svg);
      }
    }

    /* text with a paper halo, readable over the strokes */
    function haloText(attrs, content) {
      const t = el("text", {
        "font-family": "Shippori Mincho, serif",
        "paint-order": "stroke", stroke: "#f6f1e4", "stroke-width": 5,
        "stroke-linejoin": "round",
        ...attrs,
      }, svg);
      t.textContent = content;
      return t;
    }

    /* Group labels along the top edge, where each family enters the field.
       P lines: x - y = cP. Q lines: x + y = cQ. At y = 30:
       P group i enters at x = 30 + cP, Q group j at x = cQ - 30. */
    const cPmid = [60, 360];    // central line constants of P groups (a1, g1)
    const cQmid = [620, 920];   // central line constants of Q groups (a2, g2)
    for (let i = 0; i < 2; i++) {
      const x = 30 + cPmid[i];
      haloText({
        x, y: 24, "text-anchor": "middle", "font-size": 16,
        fill: COL_INK, "font-weight": 700,
      }, pNames[i] + " = " + fmt(pDigits[i]));
      if (pGroups[i].hidden > 0) ellipsis(x + 52, 20, COL_INK);
    }
    for (let j = 0; j < 2; j++) {
      const x = cQmid[j] - 30;
      haloText({
        x, y: 24, "text-anchor": "middle", "font-size": 16,
        fill: COL_AI, "font-weight": 700,
      }, qNames[j] + " = " + fmt(qDigits[j]));
      if (qGroups[j].hidden > 0) ellipsis(x + 52, 20, COL_AI);
    }

    /* Intersections per cluster */
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const [cx, cy] = CLUSTER[i + "," + j];
        const dp = Number(pDigits[i]), dq = Number(qDigits[j]);
        const total = dp * dq;
        if (total <= 90 && pGroups[i].hidden === 0 && qGroups[j].hidden === 0) {
          for (const cP of pGroups[i].lines) {
            for (const cQ of qGroups[j].lines) {
              const x = (cP + cQ) / 2;
              const y = (cQ - cP) / 2;
              el("circle", { cx: x, cy: y, r: 3.1, fill: COL_SHU, opacity: 0.85 }, svg);
            }
          }
        } else {
          el("ellipse", {
            cx, cy, rx: 40, ry: 26,
            fill: "#f6f1e4", opacity: 0.55, stroke: COL_SHU, "stroke-dasharray": "4 3",
          }, svg);
        }
        /* cluster product label, centered on the crossing group */
        const prod = pDigits[i] * qDigits[j];
        haloText({
          x: cx, y: cy + 5, "text-anchor": "middle", "font-size": 15,
          fill: COL_INK,
        }, pNames[i] + "·" + qNames[j] + " = " + fmt(prod));
      }
    }

    /* Result digit cells along the bottom */
    const cells = [
      { x: 190, place: "B³", val: info.lead },
      { x: 340, place: "B²", val: info.digit2 },
      { x: 490, place: "B¹", val: info.digit1 },
      { x: 640, place: "B⁰", val: info.digit0 },
    ];
    for (const cell of cells) {
      el("rect", {
        x: cell.x - 46, y: 518, width: 92, height: 40, rx: 6,
        fill: "#fffdf4", stroke: "#d8cfba",
      }, svg);
      const t = el("text", {
        x: cell.x, y: 545, "text-anchor": "middle", "font-size": 19,
        "font-family": "Shippori Mincho, serif", fill: COL_INK, "font-weight": 700,
      }, svg);
      t.textContent = fmt(cell.val);
      const pl = el("text", {
        x: cell.x, y: 510, "text-anchor": "middle", "font-size": 11.5,
        "font-family": "Inter, sans-serif", fill: COL_FAINT,
      }, svg);
      pl.textContent = "place " + cell.place;
    }

    /* Carry arrows between columns */
    const carries = [
      { from: 640, to: 490, c: info.c0, name: "c₀" },
      { from: 490, to: 340, c: info.c1, name: "c₁" },
      { from: 340, to: 190, c: info.c2, name: "c₂" },
    ];
    for (const { from, to, c, name } of carries) {
      const zero = c === 0n;
      const color = zero ? COL_SHU : COL_INK;
      const y = 492;
      el("line", {
        x1: from - 40, y1: y, x2: to + 40, y2: y,
        stroke: color, "stroke-width": zero ? 2 : 1.4,
        "marker-end": "url(#arrowhead)", opacity: 0.9,
      }, svg);
      const t = haloText({
        x: (from + to) / 2, y: y - 7, "text-anchor": "middle",
        "font-size": 14.5,
        fill: color, "font-weight": zero ? 800 : 500,
      }, name + " = " + fmt(c) + (zero ? "  ✓" : ""));
    }

    /* Arrowhead marker */
    const defs = el("defs", {}, svg);
    const marker = el("marker", {
      id: "arrowhead", viewBox: "0 0 10 10", refX: 8, refY: 5,
      markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse",
    }, defs);
    el("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: "context-stroke" }, marker);

    /* Caption */
    const cap = $("diagram-caption");
    if (info.isPerfect) {
      cap.innerHTML = "Perfect base. Both low carries vanish, so the low digits multiply clean: " +
        "g₁·g₂ = d₀ exactly. This is the base the Diophantine solver was looking for.";
    } else {
      cap.innerHTML = "Not a perfect base: the strokes still multiply correctly, " +
        "but carries leak between columns and the carry equations no longer collapse.";
    }
  }

  /* ============================================================ result ==== */

  function digitRow(who, digits, places, highlightLow) {
    const row = document.createElement("div");
    row.className = "digit-row";
    const w = document.createElement("span");
    w.className = "who";
    w.textContent = who;
    row.appendChild(w);
    digits.forEach((d, idx) => {
      const cell = document.createElement("span");
      cell.className = "digit-cell";
      if (highlightLow && idx === digits.length - 1) cell.classList.add("highlight");
      const pl = document.createElement("span");
      pl.className = "place";
      pl.textContent = places[idx];
      cell.appendChild(pl);
      cell.appendChild(document.createTextNode(fmt(d)));
      row.appendChild(cell);
    });
    return row;
  }

  function equationCard(tag, bodyHTML, perfect) {
    const div = document.createElement("div");
    div.className = "equation" + (perfect ? " perfect" : "");
    const t = document.createElement("span");
    t.className = "tag";
    t.textContent = tag;
    div.appendChild(t);
    const body = document.createElement("span");
    body.innerHTML = bodyHTML;
    div.appendChild(body);
    return div;
  }

  function carrySpan(c) {
    return '<span class="carry' + (c === 0n ? " zero" : "") + '">' + fmt(c) + "</span>";
  }

  function renderResult() {
    const { p, q, B } = state;
    const info = JD.carryInfo(p, q, B);
    const n = state.n;

    /* factors line */
    const f = $("factors");
    f.textContent = "";
    const mk = (txt, cls) => {
      const s = document.createElement("span");
      if (cls) s.className = cls;
      s.textContent = txt;
      return s;
    };
    f.appendChild(mk(fmt(p), "big"));
    f.appendChild(mk("×", "times"));
    f.appendChild(mk(fmt(q), "big"));
    f.appendChild(mk(" = " + fmt(n), "big"));
    const nc = JD.nearestConvergent(p, q);
    if (nc) {
      f.appendChild(mk(
        "q/p ≈ " + nc.a + "/" + nc.b + "  (rel. error " + nc.err.toExponential(1) + ")",
        "meta"
      ));
    }
    if (state.solveInfo) {
      const st = state.solveInfo.stats;
      f.appendChild(mk(
        "found in " + state.solveInfo.ms + " ms · " + st.basesChecked.toLocaleString("en-US") +
        " comb bases emitted · method " + state.solveInfo.method.replace(/_/g, " "),
        "meta"
      ));
    }
    const verdict = document.createElement("div");
    verdict.style.width = "100%";
    if (info.isPerfect) {
      const seal = document.createElement("span");
      seal.className = "verdict-seal";
      seal.textContent = "完全基底 · perfect base · B = " + fmt(B);
      verdict.appendChild(seal);
    } else {
      const plain = document.createElement("span");
      plain.className = "verdict-plain";
      plain.textContent = "B = " + fmt(B) + " · not perfect (c₀ = " + fmt(info.c0) +
        ", c₁ = " + fmt(info.c1) + ")";
      verdict.appendChild(plain);
    }
    f.appendChild(verdict);

    /* digits block */
    const d = $("digits");
    d.textContent = "";
    d.appendChild(digitRow("p", [info.a1, info.g1], ["B¹", "B⁰"], true));
    d.appendChild(digitRow("q", [info.a2, info.g2], ["B¹", "B⁰"], true));
    d.appendChild(digitRow("n = p·q", [info.lead, info.d2, info.d1, info.d0], ["B³", "B²", "B¹", "B⁰"], false));

    /* equations */
    const eq = $("equations");
    eq.textContent = "";
    eq.appendChild(equationCard("E0",
      "g₁·g₂ = " + fmt(info.g1) + "·" + fmt(info.g2) + " = " + fmt(info.col0) +
      " = " + carrySpan(info.c0) + "·B + " + fmt(info.d0) +
      "   → carry c₀ = " + carrySpan(info.c0), info.c0 === 0n));
    eq.appendChild(equationCard("E1",
      "a₁g₂ + a₂g₁ + c₀ = " + fmt(info.a1) + "·" + fmt(info.g2) + " + " +
      fmt(info.a2) + "·" + fmt(info.g1) + " + " + fmt(info.c0) + " = " + fmt(info.col1) +
      " = " + carrySpan(info.c1) + "·B + " + fmt(info.d1) +
      "   → carry c₁ = " + carrySpan(info.c1), info.c1 === 0n));
    eq.appendChild(equationCard("E2",
      "a₁a₂ + c₁ = " + fmt(info.a1) + "·" + fmt(info.a2) + " + " + fmt(info.c1) +
      " = " + fmt(info.col2) + " = " + carrySpan(info.c2) + "·B + " + fmt(info.d2) +
      "   → c₂ = " + fmt(info.c2) + " is the leading digit", false));

    $("result").hidden = false;
    renderDiagram(info);
    $("diagram-section").hidden = false;
    $("diagram-base").textContent = fmt(B);

    /* explorer verdict */
    const ev = $("explorer-verdict");
    if (info.isPerfect) {
      const idx = state.perfect.findIndex((x) => x === B);
      ev.textContent = "B = " + fmt(B) + " is perfect (c₀ = c₁ = 0)" +
        (idx >= 0 ? ", tooth " + (idx + 1) + " of " + state.perfect.length + " in the window." : ".");
    } else {
      ev.textContent = "B = " + fmt(B) + ": c₀ = " + fmt(info.c0) + ", c₁ = " + fmt(info.c1) +
        ". Move onto a vermillion tooth to see the equations collapse.";
    }
    updatePerfectButtons();
  }

  /* =========================================================== explorer ==== */

  function renderStrip() {
    const canvas = $("strip");
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth * dpr;
    const H = 140 * dpr;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    if (!state.scan) return;

    const { data, B_lo, B_hi } = state.scan;
    const lo = BigInt(B_lo), hi = BigInt(B_hi);
    const span = hi - lo;
    const bw = W / data.length;

    /* bars */
    ctx.fillStyle = "rgba(46, 40, 32, 0.35)";
    for (let k = 0; k < data.length; k++) {
      const v = data[k].minRatio;
      if (v === null) continue;
      const h = Math.sqrt(Math.min(v, 1)) * (H - 34 * dpr);
      ctx.fillRect(k * bw, H - 8 * dpr - h, Math.max(bw - 1, 1), h);
    }

    /* baseline */
    ctx.strokeStyle = "#d8cfba";
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(0, H - 8 * dpr);
    ctx.lineTo(W, H - 8 * dpr);
    ctx.stroke();

    /* perfect base teeth */
    ctx.strokeStyle = "#c2402f";
    ctx.lineWidth = 1.6 * dpr;
    for (const B of state.perfect) {
      const x = Number(((B - lo) * 10000n) / span) / 10000 * W;
      ctx.beginPath();
      ctx.moveTo(x, H - 8 * dpr);
      ctx.lineTo(x, H - 30 * dpr);
      ctx.stroke();
      ctx.fillStyle = "#c2402f";
      ctx.beginPath();
      ctx.moveTo(x, H - 40 * dpr);
      ctx.lineTo(x - 4 * dpr, H - 32 * dpr);
      ctx.lineTo(x + 4 * dpr, H - 32 * dpr);
      ctx.closePath();
      ctx.fill();
    }

    /* current B marker */
    if (state.B) {
      const x = Number(((state.B - lo) * 10000n) / span) / 10000 * W;
      ctx.strokeStyle = "#29241c";
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.moveTo(x, 6 * dpr);
      ctx.lineTo(x, H - 8 * dpr);
      ctx.stroke();
    }

    /* window labels */
    ctx.fillStyle = "#8a816d";
    ctx.font = `${11 * dpr}px Inter, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText("B_lo = " + fmt(lo), 6 * dpr, 14 * dpr);
    ctx.textAlign = "right";
    ctx.fillText("B_hi = " + fmt(hi), W - 6 * dpr, 14 * dpr);
  }

  function updatePerfectButtons() {
    const has = state.perfect.length > 0;
    $("btn-prev-perfect").disabled = !has;
    $("btn-next-perfect").disabled = !has;
  }

  function stepPerfect(dir) {
    if (!state.perfect.length) return;
    const list = state.perfect;
    let idx = list.findIndex((x) => x === state.B);
    if (idx < 0) {
      /* nearest */
      idx = 0;
      let best = null;
      for (let i = 0; i < list.length; i++) {
        const diff = list[i] > state.B ? list[i] - state.B : state.B - list[i];
        if (best === null || diff < best) { best = diff; idx = i; }
      }
    } else {
      idx = (idx + dir + list.length) % list.length;
    }
    setB(list[idx]);
  }

  function setB(B) {
    const [lo, hi] = JD.windowBounds(state.n);
    if (B < lo) B = lo;
    if (B > hi) B = hi;
    state.B = B;
    $("b-input").value = B.toString();
    const slider = $("b-slider");
    slider.min = lo.toString();
    slider.max = hi.toString();
    slider.value = B.toString();
    renderResult();
    renderStrip();
  }

  /* ============================================================= driver ==== */

  function acceptFactors(p, q, solveInfo) {
    const n = p * q;
    state.n = n; state.p = p; state.q = q;
    state.solveInfo = solveInfo;

    /* balance guard: both factors must have two digits in the window */
    const [lo] = JD.windowBounds(n);
    if (q >= lo * lo) {
      setStatus("These factors are too unbalanced for the cube-root window: q would need more than two base-B digits. Try a balanced semiprime (p < q < 2p).", true);
      return;
    }

    setStatus("Scanning for perfect bases…");
    state.perfect = JD.findPerfectBases(p, q);
    state.scan = JD.scanC0(p, q, 260);

    let B0 = null;
    if (solveInfo && solveInfo.B && state.perfect.includes(solveInfo.B)) {
      B0 = solveInfo.B;
    } else if (state.perfect.length) {
      B0 = state.perfect[Math.floor(state.perfect.length / 2)];
    } else {
      const [l, h] = JD.windowBounds(n);
      B0 = (l + h) / 2n;
    }
    $("explorer").hidden = false;
    setB(B0);

    if (state.perfect.length) {
      setStatus("Done. " + state.perfect.length + " perfect bases in the window; showing B = " + fmt(state.B) + ".");
    } else {
      setStatus("Factors verified, but no perfect base exists in the window for this ratio. " +
        "Explore the carry landscape below; every base keeps nonzero carries.");
    }
  }

  function factorize() {
    const n = parseBig($("n-input").value);
    if (n === null) { setStatus("Enter a positive integer n.", true); return; }
    if (n < 15n) { setStatus("n is too small to be interesting. Try one of the examples.", true); return; }
    if (JD.bitLength(n) > 78) {
      setStatus("n has " + JD.bitLength(n) + " bits. This browser demo searches comfortably up to about 78 bits; " +
        "larger keys belong to the C++ build.", true);
      return;
    }

    $("result").hidden = true;
    $("diagram-section").hidden = true;
    $("explorer").hidden = true;
    setStatus("Searching the Farey comb for a perfect base…");

    /* let the status paint before the synchronous search */
    requestAnimationFrame(() => setTimeout(() => {
      const t0 = performance.now();
      let res = null;
      try {
        res = JD.factorSemiprime(n, { maxFullSolves: 12000 });
      } catch (err) {
        console.error(err);
      }
      const ms = Math.max(0, Math.round(performance.now() - t0));

      if (!res) {
        setStatus("No perfect base found inside the search budget. This key's ratio q/p sits away from " +
          "every low order Farey fraction, which is expected for random keys. " +
          "Try an example, or enter p and q manually.", true);
        return;
      }
      res.ms = ms;
      acceptFactors(res.p, res.q, res);
    }, 30));
  }

  function manual() {
    const p = parseBig($("p-input").value);
    const q = parseBig($("q-input").value);
    if (p === null || q === null || p < 2n || q < 2n) {
      setStatus("Enter valid integers p and q (both at least 2).", true);
      return;
    }
    const pp = p < q ? p : q;
    const qq = p < q ? q : p;
    acceptFactors(pp, qq, null);
  }

  /* ================================================================ init ==== */

  function init() {
    $("btn-factor").addEventListener("click", factorize);
    $("n-input").addEventListener("keydown", (e) => { if (e.key === "Enter") factorize(); });
    $("btn-manual").addEventListener("click", manual);
    document.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        $("n-input").value = chip.dataset.n;
        factorize();
      });
    });

    $("btn-prev-perfect").addEventListener("click", () => stepPerfect(-1));
    $("btn-next-perfect").addEventListener("click", () => stepPerfect(1));

    $("b-input").addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const B = parseBig($("b-input").value);
      if (B !== null && B >= 2n) setB(B);
    });
    $("b-slider").addEventListener("input", () => {
      setB(BigInt($("b-slider").value));
    });

    $("strip").addEventListener("click", (e) => {
      if (!state.scan) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const frac = (e.clientX - rect.left) / rect.width;
      const lo = BigInt(state.scan.B_lo), hi = BigInt(state.scan.B_hi);
      const B = lo + BigInt(Math.round(frac * 1e6)) * (hi - lo) / 1000000n;
      setB(B);
    });

    window.addEventListener("resize", () => renderStrip());

    /* shareable link: ?n=13590925537151119 auto-factorizes on load */
    const params = new URLSearchParams(location.search);
    const nParam = params.get("n");
    if (nParam) {
      $("n-input").value = nParam;
      factorize();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
