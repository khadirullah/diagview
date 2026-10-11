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

| File                                  | Checks | Covers                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `final-verify.spec.mjs`               | 9      | share restore, minimap click, drag 1:1, wheel zoom, focus trap, rememberZoom, mobile touch                                                                                                                                                                                                                                                                                                                                          |
| `verify-modal-gestures.spec.mjs`      | 10     | will-change lifecycle (sharp at rest, smooth mid-gesture), two-stage Escape, closeModal single-fire                                                                                                                                                                                                                                                                                                                                 |
| `verify-minimap-rotation.spec.mjs`    | 8      | minimap click and indicator while rotated 90/180/270                                                                                                                                                                                                                                                                                                                                                                                |
| `verify-share-rotation.spec.mjs`      | 8      | share link restores rotation, zoom and position, within a pixel of the sender's view at zoom 10                                                                                                                                                                                                                                                                                                                                     |
| `verify-fixes.spec.mjs`               | 33     | UMD globals, removed config keys, ID references in the fullscreen clone and in exports, allowOverrides gate, background and text colour, panAnimationDuration, arrow keys while rotated, T after reopen, share links on file://, init() after destroy(), notices in and out of fullscreen                                                                                                                                           |
| `verify-react-strictmode.spec.mjs`    | 21     | real React 18 dev tree with StrictMode: init survives the double effect, unmount/remount/replace are error-free, anti-pattern throws                                                                                                                                                                                                                                                                                                |
| `verify-export-search.spec.mjs`       | 24     | PNG export of a 1 MB+ foreignObject diagram, search dimming, ring colour per canvas, plain SVG shape marking, rotation, draw.io drawn label and box, Mermaid 12 state group titles and event modeling boxes with their outline, timeline events drawn with runs of spaces                                                                                                                                                           |
| `verify-readable-text.spec.mjs`       | 42     | Text Colours menu row on Mermaid, Graphviz, PlantUML, draw.io and hand-drawn SVGs: which labels change, 4.5:1 contrast, hue kept, exact restore, canvas switch, reopen, SVG export follows Readable, transparent keeps author colours, header title reaches 4.5:1 on a white page with a light or dark OS                                                                                                                           |
| `verify-menu-buttons.spec.mjs`        | 9      | hover on the Canvas Theme and Text Colours buttons on light, dark and custom canvases, round menu button and swatches under keyboard focus, the menu opens at the top again, a key press draws no ring around the menu panel, and the footer line sits as close under the tools as the other lines                                                                                                                                  |
| `verify-minimap-colour.spec.mjs`      | 4      | minimap redraws `currentColor` parts after a canvas swatch or an Auto mode page theme change, indicator and click still work, other diagrams keep their image                                                                                                                                                                                                                                                                       |
| `verify-minimap-picture.spec.mjs`     | 9      | the minimap picture sits where the minimap maps the diagram for a viewBox that starts right of or left of 0 0, for an SVG with only width and height and for one 100% wide with no viewBox, a click on a box in the picture centres that box, and one zoom step past the viewport shows the minimap                                                                                                                                 |
| `verify-share-page-zoom.spec.mjs`     | 6      | share link restore at 0 and 90 degrees, minimap indicator, rotateKeepsView and search outline behind a matched label, all on a zoomed-out phone page                                                                                                                                                                                                                                                                                |
| `verify-theme-hint.spec.mjs`          | 7      | first-time theme hint sits above the menu button on desktop and on phone pages with and without a viewport meta tag, shows its two sentences on two lines also on a 320px phone, and closes on a drag, a wheel or a tap on the diagram                                                                                                                                                                                              |
| `verify-search-export.spec.mjs`       | 5      | SVG and PNG exports during a search with exportSearchHighlight on and off, and the viewer keeps its search after each export                                                                                                                                                                                                                                                                                                        |
| `verify-export-fonts.spec.mjs`        | 3      | SVG export embeds only the @font-face rules its labels use (family, nearest weight and style, unicode-range), labels keep their width, `exportFonts` "all" and "none"                                                                                                                                                                                                                                                               |
| `verify-image-handler.spec.mjs`       | 3      | an image `onerror` in the diagram runs once on page load and not again for fullscreen or PNG export in strict and permissive mode, which log one warning about it, and does run again in "off" mode                                                                                                                                                                                                                                 |
| `verify-keyboard.spec.mjs`            | 4      | Down and Up on the open menu button enter the menu, the open `?` panel blocks every shortcut and its list scrolls with the arrows, `?`, Esc, Enter and Space close it, and it closes on time under a resting mouse                                                                                                                                                                                                                  |
| `verify-phone-topbar.spec.mjs`        | 5      | a query from `openFullscreen()` or a share link opens the phone search bar without the keyboard, Back clears it, desktop keeps its topbar, and a zoomed-out phone page keeps room for the search box                                                                                                                                                                                                                                |
| `verify-section-links.spec.mjs`       | 4      | a `#` link in the viewer lands on the page's copy of a diagram node at the top of the window, also in a diagram taller than the window and under the page's `scroll-padding-top`, scrolls to a page section, and scrolls again when the address already names it                                                                                                                                                                    |
| `verify-reset-duration.spec.mjs`      | 6      | double click and the reset after a window resize take `zoomAnimationDuration` by default, at 0 and at 700                                                                                                                                                                                                                                                                                                                           |
| `verify-off-layout-keyboard.spec.mjs` | 8      | a diagram with layout "off" shows the zoom-in cursor of a card, is in the tab order with an accent ring drawn inside its box, Enter and Space open the viewer without scrolling the page, Esc and the close button return focus without a ring after a click, and Enter on a link inside it follows the link                                                                                                                        |
| `verify-off-hint.spec.mjs`            | 8      | a layout "off" diagram gets no offHint by default, the icon badge shows on hover and keyboard focus, the label reads "Click to expand", the line below stays hidden with a mouse, a touch screen shows all three with "Tap to expand", a bare `<svg>` gets its hint on a line under it, a click on the badge opens a viewer with no hint, destroy restores the page                                                                 |
| `verify-key-badges.spec.mjs`          | 3      | a touch phone hides the menu's key badges until a key press shows them, typing into the search box keeps them hidden, and a desktop shows them and the shortcut hint from the start                                                                                                                                                                                                                                                 |
| `verify-floating-toolbar.spec.mjs`    | 8      | a hovered floating card shows one bottom edge with no toolbar line above it, the header toolbar keeps its line under the title, a touch screen shows the floating toolbar where a desktop hover puts it with 44px buttons in one row on a 320px phone, a desktop keeps 36px and 34px, a tap on a page or viewer button leaves no hover look behind, and a desktop hover still shows it                                              |
| `verify-diagram-size.spec.mjs`        | 18     | diagrams keep their own size, centred in any wrapper, a card is as wide as its column, a diagram that fills it as wide as with layout "off", `--dv-card-padding` adds side room, wide or viewBox-only SVGs fill a card, tall ones keep their height, a short one's card hugs it over the floating toolbar, captions sit under, phones fit all, a page rule widens all or some, `--dv-max-height` caps height, fullscreen ignores it |
| `verify-search-lines.spec.mjs`        | 11     | a phrase across a line break finds Mermaid 12 and 11 HTML labels with `<br>`, Mermaid 12 plain SVG rows, a wrapped timeline event, a sequence note and message drawn as one text per line, and Graphviz node and edge labels, while one-line labels match as before and the joined lines do not                                                                                                                                     |
| `verify-mermaid-errors.spec.mjs`      | 9      | the error box shows Mermaid 12's parser message, 11 and 10 give none, the box fits a phone inside `<pre>`, a Mermaid 12, 11 or 10 diagram fixed in place gets its toolbar, one that breaks shows the error box, also in the viewer, and `destroy()` and `init()` leave one toolbar                                                                                                                                                  |
| `verify-bare-svg.spec.mjs`            | 9      | an `<svg>` the selector matches gets a card and toolbar where it stood, keeps its attributes and own size, fits a phone, opens fullscreen, searches, downloads a PNG named after its title, takes focus with layout "off", one inside another SVG is left alone, an empty one waits, destroy restores it                                                                                                                            |
| `verify-search-pan.spec.mjs`          | 8      | at zoom 4 a typed query with every match off screen pans the nearest to the middle, keeping the zoom, a match in view keeps the view, Enter and Shift+Enter step in reading order with a thicker current outline, also at 90 degrees, on a Mermaid label, with reduced motion and on a phone                                                                                                                                        |
| `verify-header-title.spec.mjs`        | 12     | the header title on Mermaid 11 and 12 comes from data-title, then accTitle, then the chart title, export files take the same name, a diagram with none reads DIAGRAM, Graphviz shape tooltips, a node label, a picture in an HTML label and a figure caption do not count, markup stays text, and a long title ends in an ellipsis and shows whole on hover                                                                         |
| `verify-host-form.spec.mjs`           | 3      | a diagram inside the page's `<form>` copies, downloads and opens fullscreen from its floating and header toolbars without submitting the form, and Enter in a field of the form submits it with the page's own button                                                                                                                                                                                                               |
| `verify-detached-diagrams.spec.mjs`   | 4      | a route a single-page app takes out and puts back at once keeps its cards and opens fullscreen, one swapped out without `destroy()` is released with its own markup back, one put back later gets its cards again and opens fullscreen, a diagram removed from inside its card takes the empty card with it, and `destroy()` restores the rest                                                                                      |

That is 321 checks per browser.

`verify-react-strictmode` loads React from unpkg, and `verify-fixes`,
`verify-mermaid-errors` and `verify-header-title` load Mermaid from
jsdelivr, so these four need network access. Set `DV_CDN=<version>`
(e.g. `DV_CDN=1.0.11`) to run `verify-react-strictmode` and `verify-fixes`
against a published build instead of the local one. The other suites run
offline. `verify-export-search`, `verify-search-export`, `verify-readable-text`,
`verify-image-handler`, `verify-diagram-size`, `verify-search-lines`,
`verify-export-fonts`, `verify-search-pan`, `verify-mermaid-errors`,
`verify-bare-svg`, `verify-off-hint`, `verify-header-title`,
`verify-host-form` and `verify-detached-diagrams` inject the build
themselves. Set `DV_DIST=/path/to/diagview.umd.js` to test another build
with those suites.

`repro.html` is the shared test page: a 2000x1200 labelled grid SVG (cells
A1 to J6, 200 units each) so any viewport centre measurement maps to a
recognisable cell.

## Browser differences

Checks that cannot run or that hit a known browser-specific bug are
annotated in the spec, never deleted:

- The mobile touch drag check sends touch events through the Chrome
  DevTools Protocol, so it is skipped outside Chromium.
- The zoomed-out phone page checks in `verify-theme-hint` and
  `verify-phone-topbar` are skipped on Firefox, which cannot emulate a
  phone page without a viewport meta tag.

A check marked as failing that starts to pass shows up as a failure, so
remove the mark once the bug is fixed.

## When to run

Whenever you touch pan/zoom, share, minimap, modal open/close, export,
search, the menu buttons, keyboard shortcuts, the key badges, layout "off"
diagrams, the `?` panel, the canvas theme, the theme hint, the Text Colours
menu row, or the viewport CSS. CI runs the suites on every push to `main`
and every pull request against it, and uploads the HTML report when a check
fails.
