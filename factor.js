/**
 * factor.js — Perfect-base Diophantine factorization core.
 *
 * Exact BigInt port of the carry-equation method (see METHOD.md of the
 * Diophantine-search project):
 *
 *   n = p*q,  p = a1*B + g1,  q = a2*B + g2,  B in [cbrt(n/2), cbrt(n)]
 *
 *   (E0)  g1*g2              = c0*B + d0
 *   (E1)  a1*g2 + a2*g1 + c0 = c1*B + d1
 *   (E2)  a1*a2 + c1         = B  + d2        (leading digit is 1 in the window)
 *
 * A base is "perfect" when c0 = c1 = 0. Perfect bases sit on the comb
 * B_m = round(p/(b*m)) when q/p is near a continued-fraction convergent a/b.
 *
 * Works in the browser (attaches JD to window) and in Node (globalThis.JD).
 */
(function (root) {
  "use strict";

  /* ------------------------------------------------------------ integer roots */

  function bitLength(n) {
    return n.toString(2).length;
  }

  function isqrt(n) {
    if (n < 0n) throw new Error("isqrt of negative");
    if (n < 2n) return n;
    let x = 1n << BigInt((bitLength(n) + 1) >> 1);
    for (;;) {
      const y = (x + n / x) >> 1n;
      if (y >= x) {
        // settle: x may still overshoot by one in rare cases
        while (x * x > n) x -= 1n;
        return x;
      }
      x = y;
    }
  }

  function icbrt(n) {
    if (n <= 0n) return 0n;
    let lo = 1n;
    let hi = 1n << BigInt(Math.ceil(bitLength(n) / 3) + 1);
    while (lo < hi) {
      const mid = (lo + hi + 1n) >> 1n;
      if (mid * mid * mid <= n) lo = mid;
      else hi = mid - 1n;
    }
    return lo;
  }

  function roundDiv(num, den) {
    return (num + den / 2n) / den;
  }

  /* ------------------------------------------------------------- small helpers */

  function gcdSmall(a, b) {
    while (b) { const t = a % b; a = b; b = t; }
    return a;
  }

  /* Reduced fractions a/b with 1 < a/b < 2 and a + b <= L. */
  function reducedRatios(L) {
    const out = [];
    for (let b = 1; b <= L; b++) {
      const aMax = Math.min(2 * b - 1, L - b);
      for (let a = b + 1; a <= aMax; a++) {
        if (gcdSmall(a, b) === 1) out.push([a, b]);
      }
    }
    return out;
  }

  /* All divisor pairs (g1, g2), g1 <= g2, g1*g2 === m, both < limit (Number math). */
  function divisorPairsBelow(m, limit) {
    const pairs = [];
    for (let g1 = 1; g1 * g1 <= m; g1++) {
      if (m % g1 !== 0) continue;
      const g2 = m / g1;
      if (g1 < limit && g2 < limit) pairs.push([BigInt(g1), BigInt(g2)]);
    }
    return pairs;
  }

  /* -------------------------------------------------------- base-B digit tools */

  function digitsBE(value, B) {
    if (value === 0n) return [0n];
    const out = [];
    let v = value;
    while (v > 0n) {
      out.unshift(v % B);
      v /= B;
    }
    return out;
  }

  function windowBounds(n) {
    const B_lo = icbrt(n / 2n) > 2n ? icbrt(n / 2n) : 2n;
    const B_hi = icbrt(n) > 2n ? icbrt(n) : 2n;
    return [B_lo, B_hi];
  }

  /* Carry structure of p*q written in base B. All BigInt. */
  function carryInfo(p, q, B) {
    const n = p * q;
    const g1 = p % B, g2 = q % B;
    const a1 = p / B, a2 = q / B;
    const d0 = n % B;
    const d1 = (n / B) % B;
    const d2 = (n / (B * B)) % B;
    const lead = n / (B * B * B);
    const col0 = g1 * g2;
    const c0 = col0 / B;
    const col1 = a1 * g2 + a2 * g1 + c0;
    const c1 = col1 / B;
    const col2 = a1 * a2 + c1;
    const c2 = col2 / B;
    return {
      B, n, p, q, g1, g2, a1, a2,
      d0, d1, d2, lead,
      col0, col1, col2,
      c0, c1, c2,
      digit0: col0 % B, digit1: col1 % B, digit2: col2 % B,
      inWindow: lead === 1n,
      isPerfect: c0 === 0n && c1 === 0n,
      consistent:
        col0 % B === d0 && col1 % B === d1 && col2 % B === d2 && c2 === lead,
    };
  }

  /* ----------------------------------------------------- single-base recovery */

  /* Fast path: assume c0 = c1 = 0. Uses only n and B. */
  function recoverFastPath(n, B) {
    const d0 = n % B;
    if (d0 === 0n) return null;
    const d1 = (n / B) % B;
    const d2 = (n / (B * B)) % B;
    const d3 = n / (B * B * B);
    if (d3 !== 1n) return null;

    const pairs = divisorPairsBelow(Number(d0), Number(B));
    const S = d1;
    const T = B + d2;
    for (const [g1, g2] of pairs) {
      const disc = S * S - 4n * g1 * g2 * T;
      if (disc < 0n) continue;
      const r = isqrt(disc);
      if (r * r !== disc) continue;
      for (const sign of [1n, -1n]) {
        const num = S + sign * r;
        const den = 2n * g2;
        if (den === 0n || num % den !== 0n) continue;
        const a1 = num / den;
        if (a1 < 0n) continue;
        const num2 = S - a1 * g2;
        if (g1 === 0n || num2 % g1 !== 0n) continue;
        const a2 = num2 / g1;
        if (a2 < 0n) continue;
        const pc = a1 * B + g1;
        const qc = a2 * B + g2;
        if (pc > 1n && qc > 1n && pc * qc === n) {
          return pc < qc ? [pc, qc] : [qc, pc];
        }
      }
    }
    return null;
  }

  /* Full bounded-carry solve at one base. Uses only n and B. */
  function recoverFull(n, B, maxC0, maxC1) {
    const d0 = n % B;
    const d1 = (n / B) % B;
    const d2 = (n / (B * B)) % B;
    const d3 = n / (B * B * B);
    if (d3 !== 1n) return null;

    const Bi = Number(B), d0n = Number(d0);
    for (let c0 = 0; c0 <= maxC0; c0++) {
      const Nc = c0 * Bi + d0n;
      if (Nc <= 0) continue;
      const pairs = divisorPairsBelow(Nc, Bi);
      for (const [g1, g2] of pairs) {
        for (let c1 = 0; c1 <= maxC1; c1++) {
          const S = BigInt(c1) * B + d1 - BigInt(c0);
          const T = B + d2 - BigInt(c1);
          const disc = S * S - 4n * g1 * g2 * T;
          if (disc < 0n) continue;
          const r = isqrt(disc);
          if (r * r !== disc) continue;
          for (const sign of [1n, -1n]) {
            const num = S + sign * r;
            const den = 2n * g2;
            if (den === 0n || num % den !== 0n) continue;
            const a1 = num / den;
            if (a1 < 0n) continue;
            const num2 = S - a1 * g2;
            if (g1 === 0n || num2 % g1 !== 0n) continue;
            const a2 = num2 / g1;
            if (a2 < 0n) continue;
            const pc = a1 * B + g1;
            const qc = a2 * B + g2;
            if (pc > 1n && qc > 1n && pc * qc === n) {
              return pc < qc ? [pc, qc] : [qc, pc];
            }
          }
        }
      }
    }
    return null;
  }

  /* ------------------------------------------------------------- the driver */

  function adaptiveParams(bits) {
    if (bits <= 40) return { L: 16, mc0: 3, mc1: 3 };
    if (bits <= 60) return { L: 24, mc0: 4, mc1: 4 };
    if (bits <= 72) return { L: 28, mc0: 5, mc1: 5 };
    if (bits <= 100) return { L: 32, mc0: 5, mc1: 5 };
    return { L: 40, mc0: 6, mc1: 6 };
  }

  /*
   * factorSemiprime(n) — comb emission over low-order ratios, quality scoring,
   * interleaved fast path / full solve. Uses only n.
   * Returns { p, q, B, method, stats } or null.
   */
  function factorSemiprime(n, opts) {
    const maxFullSolves = (opts && opts.maxFullSolves) || 8000;
    const bits = bitLength(n);
    const { L, mc0, mc1 } = adaptiveParams(bits);
    const [B_lo, B_hi] = windowBounds(n);

    const stats = {
      bits, L, ratios: 0, basesChecked: 0, scored: 0,
      fastPathTried: 0, fullSolves: 0, budgetExhausted: false,
    };

    /* Phase 0: trivial small factors. */
    for (let f = 3n; f <= 5000n; f += 2n) {
      if (n % f === 0n) {
        const p = f < n / f ? f : n / f;
        const q = n / p;
        return { p, q, B: null, method: "small_factor", stats };
      }
    }

    /* Phase 1: comb generation + quality scoring. */
    const seen = new Set();
    const candidates = [];
    for (const [a, b] of reducedRatios(L)) {
      stats.ratios++;
      const pEst = isqrt((n * BigInt(b)) / BigInt(a));
      if (pEst === 0n) continue;
      const bb = BigInt(b);
      let m = pEst / (bb * B_hi);
      if (m < 1n) m = 1n;
      const mMax = pEst / (bb * B_lo) + 1n;
      for (; m <= mMax; m++) {
        const B = roundDiv(pEst, bb * m);
        if (B < B_lo || B > B_hi) continue;
        const key = B.toString();
        if (seen.has(key)) continue;
        seen.add(key);
        stats.basesChecked++;
        const d0 = n % B;
        if (d0 === 0n) {
          const p = B < n / B ? B : n / B;
          const q = n / p;
          return { p, q, B, method: "lucky_divisor", stats };
        }
        if (d0 < B / 4n) {
          const score = Number(d0) / Number(B);
          candidates.push([score, B]);
          stats.scored++;
        }
      }
    }
    candidates.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));

    /* Phase 2a: fast path on the 50 best-scoring bases. */
    const head = candidates.slice(0, 50);
    const tried = new Set();
    for (const [, B] of head) {
      tried.add(B.toString());
      stats.fastPathTried++;
      const res = recoverFastPath(n, B);
      if (res) return { p: res[0], q: res[1], B, method: "fast_path", stats };
    }

    /* Phase 2b: full bounded-carry solve, best candidates first. */
    for (const [, B] of candidates) {
      if (tried.has(B.toString())) continue;
      if (stats.fullSolves >= maxFullSolves) { stats.budgetExhausted = true; break; }
      tried.add(B.toString());
      stats.fullSolves++;
      const res = recoverFull(n, B, mc0, mc1);
      if (res) return { p: res[0], q: res[1], B, method: "single_base", stats };
    }
    for (const [, B] of head) {
      if (stats.fullSolves >= maxFullSolves) { stats.budgetExhausted = true; break; }
      stats.fullSolves++;
      const res = recoverFull(n, B, mc0, mc1);
      if (res) return { p: res[0], q: res[1], B, method: "single_base", stats };
    }
    return null;
  }

  /* ------------------------------------------------------ perfect-base search */

  /*
   * Given known factors, enumerate perfect bases in the cube-root window via
   * the comb of the true ratio's continued-fraction convergents.
   */
  function cfConvergents(p, q, maxDen) {
    /* convergents a/b of q/p with b <= maxDen */
    let num = q, den = p;
    let hm2 = 0n, hm1 = 1n, km2 = 1n, km1 = 0n;
    const out = [];
    for (;;) {
      const a0 = num / den;
      const h = a0 * hm1 + hm2;
      const k = a0 * km1 + km2;
      if (k > BigInt(maxDen)) break;
      out.push([h, k]); /* h/k ≈ q/p */
      hm2 = hm1; hm1 = h; km2 = km1; km1 = k;
      const rem = num % den;
      if (rem === 0n) break;
      num = den; den = rem;
    }
    return out;
  }

  function findPerfectBases(p, q, maxB) {
    const n = p * q;
    const [B_lo, B_hi] = windowBounds(n);
    const found = new Map();
    for (const [a, b] of cfConvergents(p, q, 64)) {
      /* comb B_m = round(p/(b*m)) */
      let m = 1n;
      for (;;) {
        const B = roundDiv(p, b * m);
        if (B < B_lo) break;
        if (B <= B_hi) {
          const info = carryInfo(p, q, B);
          if (info.isPerfect && info.inWindow) found.set(B.toString(), B);
        }
        m++;
        if (m > 100000n) break;
      }
    }
    const list = [...found.values()].sort((x, y) => (x < y ? -1 : 1));
    if (maxB) return list.slice(0, maxB);
    return list;
  }

  /* Nearest low-order rational to q/p (for display). */
  function nearestConvergent(p, q) {
    const convs = cfConvergents(p, q, 256);
    if (!convs.length) return null;
    const [a, b] = convs[convs.length - 1];
    /* relative error |q/p - a/b| / (q/p) = |q*b - a*p| / (q*b) */
    const err = Number((q * b > a * p ? q * b - a * p : a * p - q * b)) / Number(q * b);
    return { a: a.toString(), b: b.toString(), err };
  }

  /* ------------------------------------------------------------ c0 strip scan */

  /*
   * Sample c0(B)/B over [B_lo, B_hi] into `buckets` buckets.
   * value = c0/B in [0,1); 0 means perfect column-0 carry.
   * Optional lo/hi overrides scan a different band (e.g. the 3-digit window).
   */
  function scanC0(p, q, buckets, loOverride, hiOverride) {
    const n = p * q;
    let B_lo, B_hi;
    if (loOverride !== undefined && hiOverride !== undefined) {
      B_lo = loOverride;
      B_hi = hiOverride;
    } else {
      [B_lo, B_hi] = windowBounds(n);
    }
    const width = B_hi - B_lo + 1n;
    const data = new Array(buckets).fill(null);
    const perBucket = width / BigInt(buckets) + 1n;
    const stride = perBucket > 400n ? perBucket / 200n : 1n;
    for (let k = 0; k < buckets; k++) {
      const start = B_lo + (width * BigInt(k)) / BigInt(buckets);
      const end = B_lo + (width * BigInt(k + 1)) / BigInt(buckets);
      let best = null;
      for (let B = start; B < end; B += stride) {
        const g1 = p % B, g2 = q % B;
        const c0 = (g1 * g2) / B;
        const v = Number(c0) / Number(B);
        if (best === null || v < best) best = v;
      }
      data[k] = { B: start.toString(), minRatio: best };
    }
    return { data, B_lo: B_lo.toString(), B_hi: B_hi.toString() };
  }

  /* --------------------------------------- three-digit (square-root) window */

  /*
   * The band sqrt(n/2) < B <= sqrt(n): n has exactly three base-B digits
   * and the leading (B^2) digit is 1. For p < q < 2p the whole band below p
   * is one (a1, a2) = (1, 1) segment, and its c0 = 0 bases form ONE interval
   * (B-, p] — no comb search needed.
   */
  function window3Bounds(n) {
    const lo = isqrt(n / 2n) + 1n;
    const hi = isqrt(n);
    return [lo > 2n ? lo : 2n, hi];
  }

  /*
   * Exact solve at base B in the three-digit window, using only n and B.
   * n = B^2 + d1*B + d0; when c0 = c1 = 0 the remainders g1, g2 are the roots
   * of x^2 - d1*x + d0, and p = B + g1, q = B + g2. Self-verifies.
   */
  function threeDigitSolve(n, B) {
    const d0 = n % B;
    const rem = n - B * B - d0;
    const out = {
      B, d0, d1: -1n, disc: -1n, isSquare: false,
      g1: null, g2: null, p: null, q: null, verified: false,
    };
    if (rem < 0n || rem % B !== 0n) return out;
    const d1 = rem / B;
    const disc = d1 * d1 - 4n * d0;
    out.d1 = d1;
    out.disc = disc;
    if (disc < 0n) return out;
    const r = isqrt(disc);
    if (r * r !== disc) return out;
    out.isSquare = true;
    if (((d1 - r) % 2n) !== 0n) return out;
    const g1 = (d1 - r) / 2n;
    const g2 = (d1 + r) / 2n;
    out.g1 = g1;
    out.g2 = g2;
    const pc = B + g1, qc = B + g2;
    out.p = pc < qc ? pc : qc;
    out.q = pc < qc ? qc : pc;
    out.verified = pc > 1n && qc > 1n && pc * qc === n;
    return out;
  }

  /*
   * The c0 = 0 interval hugging p. c0 = 0 means (p%B)*(q%B) < B; in the
   * (1,1) segment that is B^2 - (p+q+1)*B + p*q < 0, a quadratic negative
   * between its roots, so the zeros are one interval (B-, p]. The estimate
   * below lands inside it; the two loops settle on its exact lower edge.
   * Returns [B-, p] as BigInts, or null.
   */
  function threeDigitZeroInterval(p, q) {
    if (p > q) { const t = p; p = q; q = t; }
    const c0z = (B) => (p % B) * (q % B) < B;
    const s = p + q + 1n;
    const delta = s * s - 4n * p * q; /* = (q-p)^2 + 2(p+q) + 1 */
    let lo = (s - isqrt(delta) + 1n) / 2n;
    if (lo < 1n) lo = 1n;
    while (lo > 1n && c0z(lo - 1n)) lo -= 1n;
    let guard = 0;
    while (!c0z(lo)) {
      lo += 1n;
      if (lo > p || ++guard > 1000000) return null;
    }
    return [lo, p];
  }

  /*
   * Perfect bases of the three-digit window: the in-window part of the zero
   * interval. Every base there has c0 = c1 = 0 (for 1/2 <= p/q <= 2 the
   * window lower bound sqrt(pq/2) >= (p+q)/3 forces c1 = 0), so
   * threeDigitSolve succeeds at each of them.
   */
  function perfect3DigitBases(p, q) {
    const n = p * q;
    const iv = threeDigitZeroInterval(p, q);
    if (!iv) return [];
    const [wlo, whi] = window3Bounds(n);
    let lo = iv[0] > wlo ? iv[0] : wlo;
    const pp = p < q ? p : q;
    let hi = iv[1] < whi ? iv[1] : whi;
    if (hi > pp) hi = pp;
    if (hi < lo) return [];
    if (hi - lo + 1n > 100000n) lo = hi - 99999n; /* keep the bases hugging p */
    const out = [];
    for (let B = lo; B <= hi; B++) out.push(B);
    return out;
  }

  root.JD = {
    isqrt, icbrt, roundDiv, bitLength,
    reducedRatios, digitsBE, windowBounds,
    carryInfo, recoverFastPath, recoverFull,
    factorSemiprime, cfConvergents, findPerfectBases,
    nearestConvergent, scanC0,
    window3Bounds, threeDigitSolve, threeDigitZeroInterval, perfect3DigitBases,
  };
})(typeof window !== "undefined" ? window : globalThis);
