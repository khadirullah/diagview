# E2E geometry and behaviour suites

Real-browser checks for the interaction paths that jsdom cannot test:
pan/zoom geometry (CTM math), share-link restore accuracy, minimap click
precision, focus trapping, touch panning, and the gesture-scoped
`will-change` sharpness behaviour.

The suites run on the Playwright test runner in Chromium, Firefox and
WebKit. They **measure actual on-screen geometry** (which SVG coordinate
sits at the viewport centre) instead of asserting on internal state. The
share restore and minimap click bugs of v1.0.x only ever showed up under
this kind of measurement.

## Setup

`@playwright/test` is a dev dependency. Install the browsers once:

```bash
npx playwright install --with-deps
```

Locally the chromium project uses the installed Google Chrome
(`channel: "chrome"`). CI uses the bundled Chromium.

## Running

Build first so `dist/diagview.umd.js` reflects your changes, then:

```bash
npm run build
npm run test:e2e                          # all suites, all three browsers
npm run test:e2e -- --project=firefox     # one browser
npx playwright test verify-share-rotation # one file
```

`playwright.config.js` starts `serve.mjs`, which copies `dist/`, `demo/`,
`repro.html`, `fixtures/` and Panzoom into a temp folder and serves it on
127.0.0.1. The demo pages get their unpkg diagview tag pointed at the local
build. Set `E2E_PORT` to use a port other than 9340.

| File                               | Checks | Covers                                                                                                                                                                                                                                                                                    |
| ---------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `final-verify.spec.mjs`            | 9      | share restore, minimap click, drag 1:1, wheel zoom, focus trap, rememberZoom, mobile touch                                                                                                                                                                                                |
| `verify-modal-gestures.spec.mjs`   | 10     | will-change lifecycle (sharp at rest, smooth mid-gesture), two-stage Escape, closeModal single-fire                                                                                                                                                                                       |
| `verify-minimap-rotation.spec.mjs` | 8      | minimap click and indicator while rotated 90/180/270                                                                                                                                                                                                                                      |
| `verify-share-rotation.spec.mjs`   | 7      | share link restores rotation, zoom and position                                                                                                                                                                                                                                           |
| `verify-fixes.spec.mjs`            | 33     | UMD globals, removed config keys, ID references in the fullscreen clone and in exports, allowOverrides gate, background and text colour, panAnimationDuration, arrow keys while rotated, T after reopen, share links on file://, init() after destroy(), notices in and out of fullscreen |
| `verify-react-strictmode.spec.mjs` | 21     | real React 18 dev tree with StrictMode: init survives the double effect, unmount/remount/replace are error-free, anti-pattern throws                                                                                                                                                      |
| `verify-export-search.spec.mjs`    | 12     | PNG export of a 1 MB+ foreignObject diagram, search dimming, ring colour per canvas, plain SVG shape marking, rotation                                                                                                                                                                    |
| `verify-readable-text.spec.mjs`    | 38     | Text Colours menu row on Mermaid, Graphviz, PlantUML, draw.io and hand-drawn SVGs: which labels change, 4.5:1 contrast, hue kept, exact restore, canvas switch, reopen, SVG export keeps author colours                                                                                   |
| `verify-menu-buttons.spec.mjs`     | 6      | hover on the Canvas Theme and Text Colours buttons on light, dark and custom canvases, round menu button and swatches under keyboard focus                                                                                                                                                |

That is 144 checks per browser.

`verify-react-strictmode` loads React from unpkg and `verify-fixes` loads
Mermaid from jsdelivr, so both need network access. Set
`DV_CDN=<version>` (e.g. `DV_CDN=1.0.11`) to run those two against a
published build instead of the local one. `verify-export-search` and
`verify-readable-text` run offline. Set `DV_DIST=/path/to/diagview.umd.js`
to test another build.

`repro.html` is the shared test page: a 2000x1200 labelled grid SVG (cells
A1 to J6, 200 units each) so any viewport centre measurement maps to a
recognisable cell.

## Browser differences

Checks that cannot run or that hit a known browser-specific bug are
annotated in the spec, never deleted:

- The mobile touch drag check sends touch events through the Chrome
  DevTools Protocol, so it is skipped outside Chromium.
- Mobile share restore is marked as failing on WebKit. With a page scale
  other than 1, WebKit's `getScreenCTM()` includes the page scale while
  `getBoundingClientRect()` does not, and `share.js` mixes the two.
- Two draw.io Text Colours checks are marked as failing on Firefox.
  Firefox gives the undrawn `<text>` fallbacks inside a `<switch>` a
  non-zero box, so `readable-text.js` recolours them too.

A check marked as failing that starts to pass shows up as a failure, so
remove the mark once the bug is fixed.

## When to run

Whenever you touch pan/zoom, share, minimap, modal open/close, export,
search, the Text Colours menu row, or the viewport CSS. CI runs the suites
on every push and pull request and uploads the HTML report when a check
fails.
