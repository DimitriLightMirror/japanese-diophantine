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
}
console.log(`\n${pass}/${keys.length} factored correctly`);
