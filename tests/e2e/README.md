# E2E geometry & behavior harness

Real-browser verification for the interaction paths that jsdom cannot test:
pan/zoom geometry (CTM math), share-link restore accuracy, minimap click
precision, focus trapping, touch panning, and the gesture-scoped
`will-change` sharpness behavior.

These scripts drive headless Chrome via Playwright and **measure actual
on-screen geometry** (which SVG coordinate sits at the viewport center)
instead of asserting on internal state — the two long-standing v1.0.x bugs
(share restore, minimap clicks) only ever showed up under this kind of
measurement.

## Requirements

- Google Chrome installed (the scripts use the system binary; adjust
  `executablePath` at the top of each script if yours differs)
- `playwright-core` (not a project dependency — install ad hoc):

```bash
npm install --no-save playwright-core
```

## Running

Build first so `dist/diagview.umd.js` reflects your changes, then:

```bash
npm run build
node tests/e2e/final-verify.mjs    # core suite: share restore, minimap click,
                                   # drag 1:1, wheel zoom, focus trap,
                                   # rememberZoom, mobile touch (9 checks)
node tests/e2e/verify-v1011.mjs    # will-change lifecycle (sharp at rest /
                                   # smooth mid-gesture), two-stage Escape,
                                   # closeModal single-fire (10 checks)
```

Both exit non-zero on any failed check. `repro.html` is the shared test
page: a 2000×1200 labeled grid SVG (cells A1–J6, 200 units each) so any
viewport center measurement maps to a recognizable cell.

## When to run

Whenever you touch pan/zoom, share, minimap, modal open/close, or the
viewport CSS. These are not wired into CI on purpose (browser setup cost,
flakiness) — they are a pre-release manual gate.
