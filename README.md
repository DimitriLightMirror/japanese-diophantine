# Japanese Diophantine Factorizer

An interactive browser demo that ties two views of one idea together:

1. **Perfect-base Diophantine factorization.** For a semiprime `n = p·q`, write the
   product in a base `B` from the cube-root window `[cbrt(n/2), cbrt(n)]`, where `n`
   has exactly four digits with leading 1. With `p = a1·B + g1` and `q = a2·B + g2`,
   digit comparison gives the carry equations

   ```
   (E0)  g1·g2               = c0·B + d0
   (E1)  a1·g2 + a2·g1 + c0  = c1·B + d1
   (E2)  a1·a2 + c1          = B   + d2
   ```

   A **perfect base** has `c0 = c1 = 0`, the system collapses to one quadratic, and
   `p, q` fall out. Perfect bases sit on the comb `B_m = round(p/(b·m))` whenever
   `q/p` lies near a continued-fraction convergent `a/b`, so the solver emits the
   comb from `n` alone and tests bases until the discriminant is a perfect square.

   **Three-digit window (default view).** In the tighter band `sqrt(n/2) < B <=
   sqrt(n)`, `n` has exactly three base-`B` digits with leading digit 1. For
   `p < q < 2p` the whole band below `p` is one `(a1, a2) = (1, 1)` segment, and
   the `c0 = 0` condition becomes the quadratic inequality
   `B^2 - (p+q+1)·B + p·q < 0` — so the zero-carry bases form **one interval
   hugging p**, and every base in it also has `c1 = 0`. At any of them the
   remainders are the roots of `x^2 - d1·x + d0 = 0`, an exact solve from `n`
   and `B` alone (shown in the "Exact solve" panel). `B = p - 1` always works.

2. **Japanese stick multiplication.** Once the factors are known, the app draws
   `p × q` in base `B` as crossing line families: one family of strokes per digit
   of `p`, one per digit of `q`, intersections counted per place column. At a
   perfect base you can *see* the two low carries vanish.

Everything runs in the browser with exact BigInt arithmetic. No server, no build
step needed for the math: open `index.html` or serve the folder statically.

## Run locally

```bash
npm install
npm run dev
```

Then open the printed URL (default http://localhost:5173).

Any static file server works just as well, since the app is plain HTML/CSS/JS.

## What to try

- Click one of the example chips (53–55 bit semiprimes with `q/p ≈ 5/4`).
- The default view is the **three-digit window**: the strip shows c₀/B over
  `(sqrt(n/2), sqrt(n)]`, and the perfect buttons walk the zero-carry interval
  that hugs `p`. The "Exact solve" panel recovers `p, q` from `n` and `B` alone.
- Switch the **Window** radio to the cube-root band for the classic four-digit
  view with the Farey comb teeth.
- "Already know the factors?" lets you visualize any `p, q` pair directly.
- Shareable links: append `?n=13590925537151119` to auto-factorize on load,
  plus `&mode=4d` for the cube-root window.

## Honest limits

- The search is **ratio dependent**. Keys with `q/p` away from every low-order
  Farey fraction are not found within the demo budget; that is the measured
  behavior of the method, not a bug.
- Practical in-browser range: up to roughly 72–78 bit keys. The production C++
  implementation of the same method reaches ~190 bits.
- This is research/visualization code. It does not threaten real RSA keys, whose
  ratios avoid low-order fractions by a wide margin.

## Related

- [Diophantine-search](https://github.com/DimitriLightMirror/Diophantine-search):
  the production C++ factorizer, papers, and measured results.

## License

MIT
