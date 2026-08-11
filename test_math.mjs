import "./factor.js";
const JD = globalThis.JD;

const keys = [
  ["13590925537151119", "104272433", "130340543"],
  ["21481066030206773", "131091001", "163863773"],
  ["37598511150448663", "173432429", "216790547"],
  ["6010331033629603", "69341633", "86677091"],
];

let pass = 0;
for (const [ns, ps, qs] of keys) {
  const n = BigInt(ns);
  const t0 = Date.now();
  const res = JD.factorSemiprime(n);
  const dt = Date.now() - t0;
  if (!res) { console.log(`FAIL (no result) ${ns}`); continue; }
  const ok = res.p.toString() === ps && res.q.toString() === qs && res.p * res.q === n;
  if (ok) pass++;
  console.log(`${ok ? "PASS" : "FAIL"} ${ns} -> p=${res.p} q=${res.q} B=${res.B} method=${res.method} ${dt}ms bases=${res.stats.basesChecked} scored=${res.stats.scored}`);

  // perfect-base scan with known factors
  const pbs = JD.findPerfectBases(BigInt(ps), BigInt(qs));
  console.log(`   perfect bases: [${pbs.join(", ")}]`);
  if (res.B) {
    const info = JD.carryInfo(BigInt(ps), BigInt(qs), res.B);
    console.log(`   solver B: c0=${info.c0} c1=${info.c1} perfect=${info.isPerfect} consistent=${info.consistent} inWindow=${info.inWindow}`);
  }
  const nc = JD.nearestConvergent(BigInt(ps), BigInt(qs));
  console.log(`   q/p ~ ${nc.a}/${nc.b} (rel err ${nc.err.toExponential(2)})`);

  // ---- three-digit (square-root) window checks ----
  const p3 = BigInt(ps), q3 = BigInt(qs);
  const [w3lo, w3hi] = JD.window3Bounds(n);
  const w3ok = w3lo === JD.isqrt(n / 2n) + 1n && w3hi === JD.isqrt(n) &&
    (w3hi * w3hi <= n) && ((w3hi + 1n) ** 2n > n) && ((w3lo - 1n) ** 2n <= n / 2n);
  console.log(`   3d window: [${w3lo}, ${w3hi}] ${w3ok ? "PASS" : "FAIL"}`);
  if (w3ok) pass++;

  // B = p-1 is unconditionally c0 = 0 and solves exactly
  const s1 = JD.threeDigitSolve(n, p3 - 1n);
  const s1ok = s1.verified && s1.p === p3 && s1.q === q3;
  console.log(`   3d solve at B=p-1: verified=${s1.verified} ${s1ok ? "PASS" : "FAIL"}`);
  if (s1ok) pass++;

  // zero interval: upper edge is p, and a brute-force scan around it agrees
  const iv = JD.threeDigitZeroInterval(p3, q3);
  let ivok = iv !== null && iv[1] === p3;
  if (iv) {
    const c0z = (B) => (p3 % B) * (q3 % B) < B;
    for (let B = iv[0] - 3n > 1n ? iv[0] - 3n : 1n; B <= iv[1] + 3n; B++) {
      const inIv = B >= iv[0] && B <= iv[1];
      if (c0z(B) !== inIv) { ivok = false; break; }
    }
    // every in-window interval base is a perfect 3-digit base and solves
    const pbs3 = JD.perfect3DigitBases(p3, q3);
    for (const B of pbs3) {
      const s = JD.threeDigitSolve(n, B);
      if (!s.verified) { ivok = false; break; }
    }
    console.log(`   3d zero interval: [${iv[0]}, ${iv[1]}] width=${iv[1] - iv[0] + 1n} in-window=${pbs3.length}`);
  }
  console.log(`   3d zero interval: ${ivok ? "PASS" : "FAIL"}`);
  if (ivok) pass++;
}
console.log(`\n${pass}/${4 * keys.length} checks passed (${keys.length} keys x 4)`);
