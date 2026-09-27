# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- **Text Colours toggle in the fullscreen menu.** A new row under the canvas swatches has two buttons, Original and Readable. Original is the default and shows the diagram as the author drew it. Readable recolours labels whose contrast is under 4.5:1 against what sits behind them, which is the label's own background, the filled shape under it, or the canvas. A dark label inside a light node stays as it is. The new shade keeps the label's hue and aims for 7:1, so red text on a dark canvas turns light red. It covers SVG text, tspans and HTML labels in `foreignObject`, skips gradient paint, and updates when the canvas or the page theme changes. The choice stays on across fullscreen sessions until `destroy()` or a page reload, and exports always keep the author's colours. `DiagView.state.readableText` reports it.
- **`rotateKeepsView` Option.** Each turn used to reset the view to fit the rotated diagram, so rotating while zoomed in lost the place. With `rotateKeepsView: true` the point at the centre of the viewer stays there and the diagram keeps its size on screen. The zoom % changes to match, and stops at `minZoomScale` and `maxZoomScale`. The default `false` keeps the reset.
- **`canvasGrid` Option.** `canvasGrid: "dots"` draws a faint dot grid behind the diagram in the fullscreen viewer. The dots move with pan and zoom, their spacing stays between 16 and 32 pixels, and they take the viewer text colour so they follow the canvas theme. Exports and clipboard copies never contain them. The default is `"none"`.
- **`warningColor` Option.** Warning notices, such as the one shown when a transparent JPEG is saved as PNG, now have their own colour. The default is amber `#f59e0b`, and `warningColor` sets another. A value the browser rejects logs one console warning and keeps the amber.
- **Browser checks for export, search and Text Colours.** `tests/e2e/verify-export-search.spec.mjs` covers PNG export of a diagram over 1 MB with `foreignObject` labels and the search outline on Mermaid-shaped and plain SVGs. `tests/e2e/verify-readable-text.spec.mjs` runs the Text Colours toggle on Mermaid, Graphviz, PlantUML, draw.io and hand-drawn SVGs.
- **Browser Suites Run in Chromium, Firefox and WebKit.** The browser checks ran by hand in Chrome only. They now run with the Playwright test runner in all three engines, through `npm run test:e2e` and a CI job. `tests/e2e/verify-share-page-zoom.spec.mjs` covers share links and the minimap on a zoomed-out phone page.
- **Type Declaration Check.** `npm run typecheck` compiles `tests/types/api.ts`, which calls every public function and sets every documented option, against the published declarations. CI runs it after the build, so a JSDoc change that breaks or loosens the types fails the check.
- **`exportFonts` Option.** It sets which page fonts go inside exported files. `"used"`, the default, embeds only the font files the diagram's labels need, matched by family, weight, style and character range. `"all"` embeds every `@font-face` rule the page can read, as export did before. `"none"` embeds no fonts, for the smallest SVG or for a font whose licence does not allow embedding.
- **`exportSearchHighlight` Option.** An export made during a fullscreen search keeps the dimmed nodes and the outlined match, as before. With `exportSearchHighlight: false` the file shows the plain diagram, and the search in the viewer stays as it was.

### Changed

- **`onExport` Fires Only After a Successful Export.** It used to fire even when the export was blocked by the size limit or failed with an error notice, and when a PDF export fell back to PNG because jsPDF did not load. Copy Image still counts as a success when it downloads the PNG because the clipboard is unavailable.
- **One Notice at a Time.** A new notice replaces the one on screen, so "Processing PNG..." gives way to "PNG saved" instead of staying under it. Errors and warnings stay for their full time under a later notice, and a new error replaces everything. "PDF engine unavailable, falling back to PNG..." is now a warning, so the PNG's success notice does not hide it.
- **Notice Icons and Colours.** Notices started with the symbols ✓ ✕ ℹ ⚠, which some systems draw as colour emoji and others in different shapes. They now start with small line icons in the style of the toolbar, and messages that added an emoji of their own, such as "🔗 Share link copied!", now show only the type icon. "Processing PNG..." and "Generating PDF..." show a spinning ring until the result replaces them. Success notices keep the accent colour but now pick white or near-black text, whichever reaches 4.5:1, and darken the accent only when neither does. The built-in blue gets dark text. Error notices use a slightly darker red, `#d73d3d`, so white text reaches 4.5:1. The text select notice shows the toolbar's I-beam icon, in the accent colour when turned on and grey when turned off.
- **Theme Hint Sits by the Menu Button.** The first-time canvas theme hint showed at the bottom centre for six seconds and covered part of the diagram, and on phones it covered the menu button it points to. It now sits just above the menu button at every width, with a tail pointing at it. That includes phone pages without a viewport meta tag, which the browser shows zoomed out.
- **Smaller Bundles.** The build inlined the stylesheet with its comments and indentation. It now minifies it first, which takes about 3 kB (brotli) off both the UMD and ESM builds. The styles are the same, and `dist/diagview.css` still ships unminified.
- **FAQ on Mermaid and Site Themes.** A new answer explains that Mermaid writes its colours into the SVG when it draws, so a site theme or accent switch needs the diagrams drawn again, and shows how to do that with `destroy()` and `init()`. The viewer's Canvas Theme and `accentColor` never recolour a diagram.
- **Docs Corrections.** `naturalPanning: true` was described as scroll-like, but the scroll-like direction is the default. With `true` the arrow keys move the diagram in the arrow's direction. `accentColor: null` reads only `--diagram-accent`, `toastDuration` covers info notices as well as success ones, and warning notices always stay 5 seconds. The README export table now lists Copy SVG, its contents links to three sections work again, and the build and test guides list the current outputs and browser suites.
- **FAQ on Export Fonts, Search and Text Colour.** New answers explain why an exported label can look cut off or use another font, why an export made during a search shows dimmed nodes, how search works on draw.io diagrams, and which text colour the viewer uses on a custom canvas.

### Removed

- **The `data-diagview-accent` Attribute.** It set `--dv-accent` on the diagram element, but nothing inside that element reads it, so it never changed a colour. Set `accentColor` in `init()` or a page variable such as `--diagram-accent` instead. A page that still sets it gets one console warning that says so.

### Fixed

- **Raster Export Failed for Large Diagrams With HTML Labels.** Above 1 MB the SVG was loaded from a `blob:` URL. Chrome taints the canvas when it draws a `blob:` SVG that contains `<foreignObject>`, and Mermaid puts every label in one, so PNG, JPEG, WebP, PDF and Copy Image failed with a security error. The image now loads from a `data:` URL first. If the browser refuses it, as some Firefox versions do above 32 MB, DiagView retries with a `blob:` URL.
- **Search Highlight Faded the Match and Hid on Some Canvases.** Labels inside a matched node faded with everything else, the edge rule never matched Mermaid 10 or 11 output, the glow used the page accent colour and could vanish against the canvas, and a pulse animation that never showed ran on every match. A match now keeps the diagram's own colours and gets a 3px outline in `--dv-search-ring`, blue on a light canvas and amber on a dark one, while everything else fades evenly to 15%. Shapes that Mermaid gives an opacity through ID-scoped rules, like pie slices, fade too. On plain SVGs a text match outlines the smallest filled shape under the text, and it still finds the right shape after a rotation.
- **The "?" Shortcut Badge Vanished on a White Canvas.** The badge set no text colour, so a host page's global `kbd` rule won. On a dark page with the canvas switched to White it came out near-white on white. It now uses the canvas text colour.
- **`accentColor` Had No Effect.** The accent came only from page CSS variables, so `DiagView.init({ accentColor })` changed nothing. The order is now `accentColor`, then `--diagram-accent`, then the built-in blue. `--diagram-accent` counts only if it holds a colour, so bare numbers such as `222.2 47.4% 11.2%` are skipped. The fullscreen menu button now follows accent changes while the viewer is open.
- **`exportDiagram()` Ignored `filename` and `silent`.** It always named the file from the diagram title and a timestamp, and it never passed `silent` on. `exportToWebP()` ignored `silent` as well. `exportDiagram()` now uses `filename` when given, passes `silent` to PNG, JPEG and WebP, and hands the name it used to `onExport`. The toolbar and menu buttons behave as before.
- **`exportDiagram()` Threw When Passed `null` Options.** `exportDiagram(el, "png", null)` failed with a `TypeError` and exported nothing. `null` now counts as no options.
- **Loose TypeScript Types.** The declarations typed `init()` and `configure()` as taking any object, `getConfiguration()` as returning one, the export functions as taking an empty options object, and `version` as `any`. Editors offered no completion, and strict TypeScript rejected `exportDiagram(el, mode, null)`. They now export `DiagViewConfig`, `DiagViewOptions`, `ExportMode` and `ExportOptions`. Known keys are checked against their real values, every nested key is optional, and unknown keys still compile because the runtime only warns about them. `watermark.style` and `watermark.position` also accept each part in capitalised or uppercase form, such as `"Corner"`, `"TOP-LEFT"` and `"Top-Left"`, which export already handled.
- **Bad Watermark Values Failed Silently.** A typo such as `position: "middle"` or `opacity: 5`, from the config or a `data-diagview-watermark-*` attribute, gave no sign of a problem. An unknown `style` also dropped the corner watermark from the export, and an unknown `position` such as `"middle"` put it in the top-left corner. Export now logs a console warning for each bad value and uses a safe one instead. An unknown `style` uses `corner`, an unknown `position` uses `bottom-right`, and an `opacity` outside 0 to 1 is clamped into that range. Positions that name only part of a corner, such as `"top right"`, `"right"` or `"bottom"`, used to land near the corner they named. They now count as unknown too and go to `bottom-right`, so change them to one of the listed positions. An `opacity` that is not a number uses 0.2 in the config. In a `data-diagview-watermark-opacity` attribute it keeps the config opacity, where before it was ignored without a word or, like `"0.5abc"`, read as far as the first letter.
- **Fullscreen Threw on a Diagram Over the Size Limit.** Past `performance.criticalFileLimit`, DiagView showed "Diagram blocked" and then hit a `TypeError` that surfaced as an unhandled promise rejection. It also emptied the viewer and left the diagram marked as active. Opening now stops right after the notice.
- **Notices Were Invisible Outside Fullscreen.** Since 1.0.10 every notice went inside the fullscreen viewer, even while it was closed and hidden. Download, copy and error notices from the header and floating toolbars, and from `exportDiagram()` and the other export functions, never reached the screen. Notices now show at the bottom of the page when fullscreen is closed, and inside the viewer when it is open.
- **Export Showed Two Notices Over the Size Limit.** Every format showed "Diagram blocked" and then a second error for the same cause. SVG export and Copy SVG Code showed an internal message, such as "Cannot destructure property 'bg' ... as it is null". PNG, JPEG, WebP, Copy Image and PDF showed "SVG preparation failed". Export now stops after "Diagram blocked".
- **`performance.largeFileThreshold` Was Documented as Doing Something.** The docs called it a style-baking cut-off, but nothing reads it, so changing it had no effect. The docs now say so. The key stays so existing configs keep working. They also say that `criticalFileLimit` counts characters of SVG markup, not bytes.
- **Permissive Mode Was Described as Blocking Only Scripts, Iframes and Objects.** It also removes applet, embed, form, link, base and meta elements, `on*` attributes, `javascript:` and `vbscript:` URLs, `data:` URLs other than allowed raster images, and SMIL animations that write `href` or `on*`. The `sanitizeSVG` comment, which ships in the type declarations, the config comment and the usage guide now list these.
- **Page Buttons Ignored the Accent Until Fullscreen Opened.** `init()` never applied the theme, so the page toolbar buttons kept the default blue until the viewer opened once or `configure()` ran. `accentColor`, `--diagram-accent` and the dark-page blue now show on the buttons right after `init()`, and again after `destroy()` and a second `init()`.
- **Hard-to-Read Text on Some Accents.** Icons and text on the accent were white, or the page text colour in a few places. On light accents such as `#60a5fa`, amber or light green they fell to about 2.3:1. They now stay white while white reaches 3:1 against the accent and turn near-black below that. The built-in blue and red keep white. The pick is published as `--dv-on-accent`.
- **Invalid Colour Overrides Warned Again and Again.** A bad `accentColor`, `backgroundColor` or `textColor` warned on every theme check, at init, on page theme changes and when the viewer opened. Each bad value now warns once, and a new bad value from `configure()` still warns.
- **The Canvas Menu Marked Two Options.** Picking a swatch left Light or Dark marked, the colour picker left the old swatch marked, and Auto left a swatch marked. Only the option in use is marked now, including after reopening the viewer.
- **`helpTimeout` Never Closed the Shortcuts Panel.** Opening it with `?` focused the close button, which paused the timer, and the pause area covered the whole screen. The panel now closes after `helpTimeout`. Hovering or focusing the panel card still pauses it.
- **Back Left the Page After a Quick Close and Reopen.** `await closeModal()` followed straight away by `openFullscreen()` opened the second diagram without a history entry, so Back left the page instead of closing the viewer. The reopen now adds its entry once the close has finished.
- **Rotating Some Diagrams Drifted and Shrank Them.** On diagrams with a `width="100%"` background, such as a large grid, each rotation padded the previous padded box again. After a full turn the view was off-centre, after eight presses the diagram filled about 40% of the viewer, and share links made after rotating opened in the wrong place. Rotation now works from the original box, so a full turn returns exactly to the start.
- **Search Stalled on Large Diagrams.** Dimming and undimming faded every shape, which on a 2,500-node diagram blocked the page for a long time on a broad query or on clearing. Dimming now switches at once, and shape transitions from the page are off inside the viewer.
- **Clearing Search Changed the Diagram's Markup.** It left empty `class=""` attributes on shapes that had no class, and collapsed repeated classes such as `node default default`. Clearing now puts each class attribute back exactly.
- **Escape Closed the Viewer With the Menu Open.** With the fullscreen ☰ menu open, one Escape closed the whole viewer. The first Escape now closes the menu and puts focus on the menu button, and the next one closes the viewer.
- **The Menu Button Turned Square With Keyboard Focus.** A focus rule gave every focused control its parent's corners, so the round ☰ button, the swatches and the theme buttons went square, for example after Escape closed the menu in Chrome and Safari. The focus ring now follows each control's own shape.
- **Canvas and Text Colour Buttons Showed No Hover on Light Canvases.** Light, Dark, Auto, Original and Readable used a white wash on hover, which could not be seen on a light canvas and was faint on dark ones. They now take a light tint and border of the accent colour, which stays different from the selected button.
- **Focus Fell to the Page After Closing an Off-Layout Diagram.** After closing the viewer opened by clicking a diagram with `layout: "off"`, focus went to the page body, so keyboard and screen reader users lost their place. It now returns to the diagram, which holds `tabindex="-1"` only while it has that focus. It never becomes a tab stop, and the page does not scroll.
- **Copy SVG Gave Nothing Without the Clipboard.** When the browser denied the clipboard write, for example in Firefox when the click was too long ago, Copy SVG showed "Copy SVG Failed". On plain HTTP it could report a copy that never happened. It now downloads the `.svg` file with the notice "SVG downloaded (Clipboard unavailable)", as Copy Image already did with the PNG.
- **Readable Text Ignored `configure()` Colour Changes.** With Text Colours set to Readable, changing `backgroundColor` through `configure()` while the viewer was open left the labels tuned to the old canvas. They now recolour for the new one, as they already did for the menu's canvas buttons.
- **Share Links Opened Off Centre in Safari on Zoomed Pages.** On a page Safari shows zoomed, such as a phone page without a viewport meta tag, a share link restored the view away from the shared point, and a link made there encoded a different point. The minimap indicator sat away from the visible area, and a minimap click landed in the wrong place. Search did not outline a large shape behind a matched label there either. Safari reports `getScreenCTM()` in zoomed pixels while `getBoundingClientRect()` stays in layout pixels, and the code mixed the two. Share links, the minimap and search now convert between them.
- **A Transparent `backgroundColor` Hid the Viewer Controls on Light Pages.** DiagView read `"transparent"` as black, so it chose near-white toolbar text, close button, search ring and dot grid, which vanished on a white page. It now takes light or dark from the page colour under the viewer, with any partly transparent colour laid over it. The shortcuts panel and the ☰ menu were see-through too, so their text sat on the diagram. They now get the solid colour seen through the viewer. Text Colours set to Readable measured labels against white, so on a dark page it left dark labels unreadable. It now measures against the page colour as well.
- **The Minimap Drew Black Boxes for CSS Variable Colours.** A diagram coloured with `var(--name)`, as Mermaid `themeCSS` and many sites do, showed black shapes in the minimap because its snapshot image cannot see the page's variables. Shapes and labels drawn with `currentColor` came out black in the same way. The snapshot now carries the values the page computes for the variables and the colour the viewer gives `currentColor`. It draws the snapshot again when the canvas theme changes while the viewer is open, so `currentColor` parts do not fade into a new dark canvas.
- **The Minimap Indicator Sat 1px Off.** It was placed from the minimap's outer edge instead of inside its border, so it sat 1px right and 1px low at every rotation and zoom.
- **Rotation Did Not Update the Minimap and Zoom Display.** The rotate button sent its change event to an element that does not exist, so the minimap and zoom % caught up only on the next pan or zoom.
- **Share Reported a Failed Copy as Copied.** Without the Clipboard API, a failed copy still showed "Share link copied!", and when the copy threw, a hidden input kept focus and keyboard shortcuts stopped working. It now shows the error notice and always gives focus back.
- **Exports Hung When the SVG Could Not Be Serialised.** The serialiser error never reached the export, so SVG, Copy SVG and image exports waited forever with no notice. They now fail with the usual error notice.
- **`onExport` Reported the Requested Format.** A transparent JPEG is saved as PNG but was reported as `"jpeg"`, and an unknown mode that exports a PNG was reported under its own name. `onExport` now gets the format of the file that was made.
- **The Transparent Export Toggle Was Invisible on Light Canvases.** Its off track was a faint white wash. On light canvases it is now grey.
- **Branding Links Opened Without `rel`.** The DiagView links that open in a new tab now set `rel="noopener noreferrer"`.
- **More Loose TypeScript Types.** `state.events.emit("name")` without data failed to compile, `utils.sanitizeSVG()` accepted any object as options, and `DiagView.state` was typed as writable although writes are ignored. The declarations now match the runtime.
- **Low Contrast Warning Repeated.** The console printed "Low contrast detected" two to four times on each page load. It now prints once per background and text colour pair.
- **Exported SVGs Embedded Every Font on the Page.** Export copied every `@font-face` rule it could read. With a Google Fonts stylesheet that is every weight and alphabet of every family, so the demo diagram's SVG grew from 90 KB to 892 KB although its labels needed three files. It now embeds only those, and the file is 249 KB.
- **Export Dropped Fonts From Other Sites Without a Word.** A stylesheet from another site, such as Google Fonts, hides its font rules unless its `<link>` has `crossorigin="anonymous"`. Export skipped it silently, so the file named a font it did not contain. A computer without that font used a wider one, and labels were cut off, for example "Mermaid" became "Mermaic". Export now logs a console warning that names the stylesheet and the attribute to add, and the demo pages load their fonts with it.
- **Viewer Text Was Hard to Read on Mid-Tone Canvases.** A custom canvas such as `#b3b3b3` counted as dark, so the toolbar, menu and notices got white text at 2.1:1. The viewer now takes whichever of its dark and light text reads better on the canvas, which gives dark text at 7:1 there, and falls back to black or white when neither reaches 4.5:1. Light, Dark, Auto and the swatches keep their colours. With Auto on a light page while the system is in dark mode, the text is now the Light theme's `#1e293b` instead of black. A `textColor` or `--diagram-text` under 4.5:1 also turns black or white, whichever reads better. Before, it turned white on `#b3b3b3` even when the colour it replaced read better.
- **Faint Menu Headings on Grey Canvases.** The headings in the ☰ menu, such as "Canvas Theme" and "Export", were the text colour at 70% opacity. On a `#6b7280` canvas that fell to 3.3:1. They now use a lighter shade that never drops under 4.5:1, published as `--dv-muted-text`. Light and dark canvases keep the softer look.
- **Search Placeholder Nearly Invisible on Some Canvases.** "Search nodes..." used the browser's own grey, which read at 1.05:1 on a `#6b7280` canvas in Chrome. It now uses `--dv-muted-text` and reaches 4.5:1 on every canvas in Chrome, Firefox and WebKit.
- **Search Missed the Visible Label on draw.io Diagrams.** draw.io writes each label twice inside a `<switch>`, an HTML label that is drawn and a plain text copy that is not. Search matched the hidden copy, so Chrome dimmed the whole diagram and outlined nothing, and Firefox outlined the box but left its label dimmed. Search now marks the visible label and outlines the box under it, and each label counts once.
- **Readable Recoloured Hidden draw.io Text in Firefox.** Firefox gives the hidden text copy in a draw.io `<switch>` a size, so Readable recoloured it along with the visible label. Nothing changed on screen, and exports kept the original colours. Readable now skips what a `<switch>` does not draw.
- **`init()` in `<head>` Crashed and Left the Viewer Off.** A script in `<head>` runs before the page has a `<body>`, and `init()` read the body's theme class right away. It threw `Cannot read properties of null`, and with `data-diagview-no-auto-init` on the library tag nothing started DiagView later, so clicking a diagram did nothing. `init()` now waits for `DOMContentLoaded` when there is no body yet, and its promise resolves once DiagView has started.
- **Bundled Apps Could Not Turn Off Auto-Init.** `data-diagview-no-auto-init` only counted on a script whose file name contains "diagview". A Vite or webpack app's script is called something like `index-4f2a9c.js`, so an app that awaited `mermaid.run()` before `init({...})` always got the defaults. The attribute now works on any element, including `<html>` and the app's own script tag. When a late `init()` meets an instance that auto-init started, the warning now says the options were ignored and how to stop auto-init.
- **Letter Shortcuts Stopped After Using the Menu.** After `Esc` closed the ☰ menu, focus stayed on the menu button, and DiagView ignored `F`, `R`, `L`, `M` and `T` while any button had focus. Ticking Transparent or picking a custom canvas colour blocked them the same way, because the checkbox and colour picker counted as text fields. Now only typing in a text field pauses the shortcuts. On a focused button, link, checkbox or colour picker, `Space` and `Enter` still press it.
- **Export File Names Ignored `data-title`.** Files were named from the first `<title>` anywhere in the SVG. PlantUML and Graphviz put one on every shape as a tooltip, so a sequence diagram with `data-title="Checkout sequence"` saved as `bob_...png`, and the header label read BOB. A diagram with only a `data-title` saved as `diagram_export`. The name and the label now use `data-title` first, then a `<title>` directly inside the `<svg>`. Export also reads the chart titles Mermaid draws on flowcharts and pie charts.
- **Demo Pages Said One Script Tag Was Enough.** The home page and the floating layout page said DiagView needs one script tag, and the floating page's code sample had only DiagView in it. Copied as written, the viewer opened with zoom and pan turned off. Both pages now say to load Panzoom first, and the sample includes its tag.
- **Demo Pages.** All eight pages have a new shared look with light and dark themes and an accent picker. The layouts title no longer hides under the header. The phone header scrolls away and the performance Scale control fits phones. The No viewBox card, the React card titles and the Deliver box are no longer cropped. Mermaid arrows and labels are readable in dark mode, and the compare page arrows run between the nodes. The React page's container example fits at any width, and the compare and performance diagrams sit centred in their cards. The home page lists every export format, drops a Security selector that did nothing and gets a Common questions section that links to the FAQ. The header page has a card that shows what its Security setting does. Link previews get an absolute `og:image`, the images carry their real type and size, and card glows follow the accent picker.

---

## [1.0.12] - 2026-09-06

### Fixed

- **Share Links on `file://` Pages** — the share URL was built from `location.origin`, which browsers report as the literal string `"null"` for pages opened from disk, so the URL constructor threw and no link was produced. The link is now built from the page URL with its query and hash removed; the no-leaking-of-existing-params behaviour is unchanged.
- **`DiagView.state` and `DiagView.utils` Missing From the Script-Tag Global** — both were only members of the default export, and the UMD build attaches named exports to `window.DiagView`, so CDN users found them `undefined` (they were reachable only as `DiagView.default.state`) while the typings and API docs promised them. Both are now named exports as well; bundler users are unaffected.
- **Gradients, Markers and Filters Referenced From Inline `style` Lost in Modal and Export** — when a diagram is cloned for fullscreen or export its IDs get a unique prefix and references are rewritten to match, but only elements with a `fill`, `stroke`, `filter`, `clip-path`, `mask` or marker _attribute_ were scanned. SVGs from Inkscape, Illustrator and hand-written files put those references in `style="fill:url(#grad)"` instead, so the clone kept pointing at the un-prefixed IDs. In fullscreen that usually resolved to the original diagram still on the page, but with two diagrams sharing an ID it borrowed the other diagram's definition, and exports taken from the fullscreen view (which serialise the clone on its own) lost the gradient, marker or filter entirely. Elements with `style` references (and `marker-mid`) are now rewritten too, including the quoted `url('#id')` form.
- **Arrow Keys Panned the Wrong Way While Rotated** — Rotation lives on an inner SVG group while Panzoom moves the outer element, so pan deltas are already in screen axes. The leftover inverse-rotation of the arrow-key delta made `ArrowUp` pan sideways at 90°/270° and inverted every arrow at 180°. Removed; arrows now match the screen at every angle.
- **`T` Text-Select Shortcut Stopped Working After the First Close** — The shortcut's event subscription is created once per modal DOM but was torn down by the per-session modal cleanup, so it silently died from the second fullscreen session onward (the toolbar button kept working). The subscription now lives until `destroy()`.
- **`security.allowOverrides: false` Was Bypassed in the Modal** — The fullscreen clone read `data-diagview-sanitize` / `data-diagview-allow-remote` directly, ignoring `allowOverrides` and accepting any value. Per-element overrides are now resolved through a single gate shared by init and modal: honoured only when `allowOverrides` is `true` and the value is `strict`, `permissive` or `off`; otherwise the global mode applies.
- **`init()` Right After `destroy()` Left Nothing Initialized** — `destroy()` is async, so an `init()` issued before it finished saw the instance as still initialized, warned and returned, and the pending teardown then reset everything. React StrictMode and hot module reload trigger exactly this sequence in development. `init()` now queues behind an in-flight `destroy()` and returns a promise that resolves when ready; a second `destroy()` during teardown returns the same promise. Normal synchronous `init()` behaviour is unchanged.
- **`backgroundColor`, `textColor` and `panAnimationDuration` Did Nothing** — All three were documented and validated but never read. `backgroundColor` and `textColor` now override auto-detection (text still passes the WCAG contrast guard); `panAnimationDuration` is applied to arrow-key panning. `configure()` clears the theme cache so colour changes apply immediately.
- **Auto-Init Pre-Empted Manual `init()` in Module, `defer` and Bundler Scripts** — auto-init ran synchronously as soon as the document was past `loading`, which is always the case when a module or deferred script evaluates, so the library initialised itself with defaults and the user's `DiagView.init({ layout: "header" })` one line later was refused with "Already initialized". Auto-init is now scheduled one task later and a synchronous manual `init()` cancels it; a bare `<script src="diagview.umd.js">` page still self-initialises. The `data-diagview-no-auto-init` opt-out is also found on any diagview script tag, not just the first one on the page.
- **SVGs Without a `viewBox` Attribute Were Hidden** — the validity check read `viewBox.baseVal`, which browsers report as a 0×0 rect when the attribute is absent, so every width/height-only SVG (Inkscape default, hand-written) got `display:none` and an error box. Only a `viewBox` that is present and declares zero width or height is rejected now.
- **`destroy()` Left Diagrams Half Initialised** — only wrapped diagrams were torn down, so `layout: "off"` diagrams kept their init flag, pointer cursor and click listener, error-boundary diagrams kept the placeholder and hidden SVG, shadow-root diagrams stayed wrapped, and the index attribute, `dv-svg-content` class, inline styles, per-element accent and the root `--dv-*` variables survived. Because the init flag survived, a following `init({ layout: "header" })` skipped those diagrams. Everything DiagView touches is now recorded and restored. `refresh()` also re-validates diagrams that previously failed and initialises them once their SVG is valid, as the docs already promised.
- **An Invalid `diagramSelector` Bricked the Instance** — `configure({ diagramSelector: "[[[" })` was accepted, the teardown's `querySelector` then threw, `destroy()` rejected before the state reset and every later `init()` was refused. The selector is validated (warn and keep the previous one) and teardown runs in try/finally so state is always reset.
- **Modern CSS Colours Forced White Text on Light Modals** — `getComputedStyle` returns `oklch()`, `lab()` and `color()` verbatim; the parser's digit scan turned `oklch(0.98 0.01 250)` into `rgb(0, 98, 0)`, the contrast guard then reported low contrast and switched to white text. Colours are parsed through the engine now (`CSS.supports` for acceptance, canvas read-back for the modern spaces). Invalid `backgroundColor`/`textColor` values such as `#zzzzzz` or `notacolour` are rejected with a warning instead of silently reusing the previous colour.
- **`data-diagview-scale` and Per-Element Watermarks Were Ignored on Export** — the attribute was parsed but never reached the exporter, and watermark overrides were only read from the diagram open in the modal, so the inline toolbar and `exportToPNG(el)` used the global values. Both are now resolved from the element being exported.
- **Shadow DOM: Unstyled Toolbar and Wrong Share Index** — styles were only injected into `document.head`, so a toolbar built by `initShadowRoot()` rendered unstyled, and shadow diagrams were indexed as `-1`, which share links encoded as the first page diagram. The stylesheet is now installed in each shadow root (`adoptedStyleSheets` where available) and removed on `destroy()`; diagrams are numbered from one list, page diagrams first then each shadow root in registration order.
- **Empty Containers Filled After `init()` Were Never Picked Up** — the mutation observer only looked at added nodes, so an SVG rendered later into a pre-existing `.diagram` container (Mermaid, fetch) did not initialise until a manual `refresh()`. The closest uninitialised container of an added node is now queued too.
- **Config Validation Gaps** — `NaN`, strings and `null` passed the numeric range checks; `security`, `watermark`, `ui` and `performance` could be replaced by non-objects; `allowedImageTypes` was never checked (a string made the modal clone throw); `minZoomScale` above `maxZoomScale` was accepted. Each case now warns and keeps the previous value.
- **`DiagView.state` Was Writable Below the Top Level** — `DiagView.state.events.clear()` dropped the library's own subscribers and nested objects such as `touchState` could be mutated. Nested values are now read-only views; `activePanzoom` stays the live instance and `events` still exposes `on`/`off`/`emit`.
- **`?` Could Not Be Typed Into the Search Box** — the help shortcut ran before the input-focus check. It now defers to focused inputs like every other shortcut. The `M`, `L` and `R` lazy chunk imports also report a failed load instead of raising an unhandled rejection.
- **Share Link Accepted 5- and 7-Digit `dv-c` Colours** — the canvas colour pattern allowed any 3–8 hex digits; only 3, 4, 6 or 8 are valid CSS.
- **Focus Trap Broken on Desktop** — hidden topbar controls (children of a `display:none` row, or the collapsed mobile search) still counted as focusable, so Tab from the last control went nowhere and Shift+Tab from the first control left the dialog. Only rendered controls outside a collapsed search container count now, and the trap steps through its own list on every Tab.
- **`rememberZoom` Ignored Wheel, Keyboard and Button Zooms** — the zoom was saved only on `panzoomend`, which Panzoom fires from pointer-up alone. It is now saved on a debounced `panzoomchange` and flushed on close.
- **Closing During an In-Flight Open Corrupted the Session** — a `closeModal()` that landed during `openFullscreen()`'s awaits let the open resume afterwards: modal listeners were re-registered after cleanup had run, a temp menu was left behind, `onOpen` fired after `onClose` and later opens were dropped. Each phase of the open now re-checks a session token and bails out; the initial-focus frame is cancelled on close as well, so it no longer steals focus back into a closed modal.
- **`openFullscreen()` While Already Open Leaked State** — a second call re-ran the open on top of the live session, stashed the wrong `scroll-behavior` (which stuck after close), leaked visual-viewport listeners and replaced the Panzoom instance without destroying it. It now returns early; switch diagrams by awaiting `closeModal()` first (documented).
- **Text-Select Mode Froze the Laser Pointer** — the viewport stopped `mousemove` in the capture phase while text selection was on, so meeting mode never saw it. Only the events that would start a pan are intercepted now.
- **Export Dropped the First `<g style="transform:…">`** — a leftover "stale Panzoom matrix" heuristic removed structural transforms authored by the diagram. Panzoom only writes to the root `<svg>`, so the block is gone.
- **Self-Hosted Fonts Were Never Embedded in Exports** — only `url(https://…)` sources were inlined; relative and root-relative `@font-face` sources are now resolved against the stylesheet URL before fetching. A failed fetch keeps the original reference and never fails the export.
- **Per-Format Export Functions Threw on Elements Without an SVG** — `exportToSVG/PNG/JPEG/WebP/PDF` and `copyToClipboard` rejected with a `TypeError`; they now show the same "No diagram found" toast as `exportDiagram`.
- **Clipboard Copy Failed on Safari** — the write happened after several awaits, outside the user gesture, and Safari rejects it with `NotAllowedError`. That case now falls back to the download path already used when the clipboard API is unavailable.
- **A Tap Right After a Pinch Reset the Zoom** — the pinch's final `touchend` recorded a tap time, so a single tap within 300 ms counted as a double tap. Pinch-ending touches no longer arm the double-tap detector.
- **Minimap Off by the `viewBox` Origin** — the thumbnail and indicator assumed a `0 0` origin, so Mermaid sequence, gitGraph and mindmap diagrams (negative origin) navigated and indicated off by exactly `(x, y)`. The rotated thumbnail is also re-fitted into its box instead of being clipped, the minimap hides after a rotation resets to 1×, and small window resizes reposition the indicator.
- **Laser Dot Sat 14px Down-Right of the Cursor** — the inline transform replaced the centring translate, and a leftover `visualViewport.scale` factor made it drift under pinch zoom. Both removed.
- **Search Counted Nested Nodes Multiple Times** — a Mermaid `g.node > g.label > text` reported "3 matches"; a whitespace-only query matched everything; and highlight classes were never removed on clear, leaking into exports. Nested candidates are de-duplicated, a blank query clears, and highlights are removed synchronously.
- **Desktop Tooltip Was Never Visible** — it was positioned above the topbar button and clipped by the modal's `overflow:hidden`. It now shows below the element.
- **CSS Cleanup** — dead `.dv-selection-allowed`/`.dv-exp-trans-hint` rules, an invalid `brightness` keyframe property, per-control `outline` rules that always lost to the modal-wide reset, an out-of-range help-modal `z-index`, and a mobile closed-search rule that was overridden by a later rule of equal specificity are fixed or removed. Under `prefers-reduced-motion` the loading spinner keeps turning while everything else, including pseudo-elements, is frozen.

### Security

- **`fixIds` Missed `textPath`, `a`, `feImage` and ARIA References** — after ID prefixing those elements still pointed at the old IDs, which in a multi-diagram page could resolve to another diagram's element. They are rewritten now, as are `aria-labelledby`/`aria-describedby` lists.
- **`fixIds` Mistook Hex-Looking IDs for Colours** — IDs such as `bed`, `fade` or `1234` were left alone inside `<style>` blocks even in `url(#…)` and `#id` selectors, breaking gradients and per-ID CSS after prefixing. The colour heuristic now applies only to property values outside `url()`; upper-case `URL(` and IDs containing `.` or `:` are handled too.
- **Export Ignored Per-Element Security Overrides** — the export clone sanitized with the global mode only, so a diagram marked `data-diagview-sanitize="permissive"` or `data-diagview-allow-remote="true"` lost animations and remote fonts on export. Modal and export now resolve the same overrides through the same `allowOverrides` gate.
- **Prefixed XML Names Bypassed the Sanitizer** — `<svg:script>`, `<svg:animate>`, `<h:iframe>` inside `foreignObject` and `xl:href="javascript:…"` slipped past the blocklists on the string path because tag and attribute names were compared with their prefix, and the serializer then emitted them unprefixed. Names are compared by local name now.
- **CSS Escape Variants Defeated the Remote-Resource Check** — with `allowRemoteResources: false`, `url(\/\/evil…)`, `url(h\ttps://…)`, `@\import`, `@import"…"` and `url(' https://…')` were not recognised. Single-character escapes are decoded and the pattern tolerates the whitespace variants; local `url(#id)` and `data:` images are unaffected.
- **Permissive Mode Let SMIL Write `href` and `on*` Attributes** — `<animate attributeName="href" values="javascript:…">` survived permissive sanitization. Animations targeting `href`/`xlink:href` or any `on*` attribute are dropped in permissive mode; other animations are kept.
- **`<link>`, `<base>` and `<meta>` Inside `foreignObject` Passed Both Modes** — they can load remote stylesheets, rebase every relative URL or redirect the page and are never legitimate in a diagram. Both modes remove them.
- **`performance.criticalFileLimit` Never Triggered** — the size guard only measured string input while the clone path always passes a Node, so the "Diagram blocked" branch was unreachable. Node input is measured by its serialized length; `sanitizeSVG(svg, mode, null)` no longer throws. The export style capture keeps its previous one-million-node cap under its own constant instead of misusing `largeFileThreshold`.

### Changed

- **npm Provenance** — the publish workflow now runs `npm publish --provenance`, so every release carries a signed attestation linking the package on npm to the exact GitHub Actions run and commit that built it. Visible as the "Provenance" badge on the npm package page.

### Added

- **React 18 + StrictMode demo and e2e check** — `demo/framework-react.html` is a real React dev-build tree (StrictMode on) with floating, header and off layout cards that mount, unmount, remount and replace DiagView diagrams, a "Detach DiagView" button that shows `destroy()`/`init()` with everything still mounted, and an "unsafe pattern" toggle that reproduces the DOM-ownership error the framework docs now warn about, contained per card by an error boundary and explained on the page. `tests/e2e/verify-react-strictmode.mjs` drives it in headless Chrome against the local build (21 checks) and, with `--cdn`, against the published version (1.0.11 fails 10 of 21).
- **Browser sweep for every fix above** — `tests/e2e/verify-fixes.mjs` loads `tests/e2e/fixtures/fix-sweep.html` from `file://` (attribute, inline-style, `<style>`-block, sanitizer-override and Mermaid diagrams) and checks the modal clone and fullscreen export for dangling `url(#id)`/`href` references, the `allowOverrides` gate, `backgroundColor`/`textColor`/`panAnimationDuration`, arrow-key panning at every rotation, the `T` shortcut across reopen, the share link on `file://` (including restoring it), the `destroy()`/`init()` race and the UMD `state`/`utils` globals — 30 checks; with `--cdn` the published 1.0.11 passes 14 of 30.

### Removed

- **`immersiveMode`** — Documented as rewriting the host page's viewport meta tag, but never implemented. The pinch-zoom drift it was meant to fix is already handled by the visual-viewport sync on modal open, so the option is removed rather than implemented. Docs and FAQ updated.
- **`printFriendly`** — Never read; the print stylesheet always hides DiagView controls and the modal, which is what the default already promised.
- **`sanitize: "auto"`** — Legacy key that nothing mapped to `security.mode`. Use `security.mode` (`strict` | `permissive` | `off`).

> Passing a removed key logs `DiagView: Unknown config key "…" ignored.` and has no other effect, since none of them ever did anything.

---

## [1.0.11] - 2026-08-31

### Fixed

- **Blurry Diagrams at Zoom on Mobile** — The static `will-change: transform` introduced in v1.0.10 made browsers cache the SVG as a fixed-resolution texture, so zooming stretched a bitmap (worst on mobile). The compositor-layer hint is now gesture-scoped: applied on mouse/touch/wheel activity and released 400 ms after the last change, so the browser re-rasterizes the vectors at the final scale. Smooth panning (including Firefox) _and_ sharp rendering at rest, at any zoom.
- **Escape While Searching Closed the Modal** — Escape is now two-stage during search: with a query it clears the query, with an empty query it exits search mode and returns focus to the modal, and the next Escape closes the modal.
- **Double-Fired Close Sequence** — Rapid Escape presses during a slow close could run the entire modal teardown twice (`onClose` fired twice, focus restore double-ran). A re-entrancy guard makes the close sequence run exactly once.
- **Minimap Broken While Rotated** — Clicking the minimap on a rotated diagram navigated to the wrong location and the viewport indicator was misplaced. Coordinate mapping now goes through the internal rotation group's CTM, pan no longer applies an incorrect rotation "correction" (pan responds in screen axes at every angle), the indicator maps through the snapshot's own CTM (correct at 90°/270° axis swaps) and re-positions after animated pans settle. Verified at 0/90/180/270 with a new e2e suite.
- **Rotation Not Restored by Share Links / rememberZoom** — Restoring a view with `dv-r` (or a remembered rotation) only wrote `state.rotationAngle` without rotating the DOM: recipients saw a rotated minimap over an unrotated diagram at the shared zoom. The rotation is now actually applied (same code path as pressing R) before the zoom/pan restore, and the share corrective pan drops its incorrect rotation compensation. Verified end-to-end: a rotated+zoomed share restores rotation on both diagram and minimap with the center within 1 SVG unit.

---

## [1.0.10] - 2026-08-31

### Fixed

- **Share Links Restoring the Wrong Position** — `@panzoom/panzoom`'s constructor schedules a forced `pan(0,0)` on a 0ms timer, which silently clobbered the restored pan of share links and `rememberZoom` (zoom was kept, position reset to the diagram center — most visible above ~200% zoom). The corrective pan is now deferred past that timer and converges over up to 3 frames; restore accuracy at 3× zoom improved from ~281 SVG units off to <1 unit.
- **Minimap Click Navigation** — Clicks navigated to the wrong location (or blank space) at higher zoom levels because viewBox coordinates were multiplied by the panzoom scale, ignoring the base render scale and letterboxing. Clicks and the viewport indicator now map through the SVG's `ScreenCTM`, landing exactly on the clicked point at any zoom or rotation.
- **Focus Trap Lost After First Modal Close** — Focus management was set up once at modal creation but torn down on every close, so from the second open onward Tab escaped the fullscreen dialog (WCAG failure) and single-key shortcuts died after clicking a toolbar button. It is now re-established on every open.
- **Memory Leak with `onZoomChange`** — The `panzoomchange` listener was registered destroy-scoped per modal open, pinning each discarded SVG clone in memory. Now modal-scoped and cleaned up on close.
- **Sanitizer URL Scheme Bypass** — `javascript:` URLs with embedded whitespace/control characters (e.g. `java&#9;script:`) passed the scheme check while browsers execute them. URL values are now normalized before testing; the anchored scheme colon also stops benign hrefs like `javascript-guide.html` from being stripped. Strict mode's external `<use>` block now also catches protocol-relative `//host/...` references.
- **Cloned Diagram Style Corruption** — Original→clone style and text-attribute copies paired nodes by index _after_ sanitization; any removed node shifted every subsequent pair, corrupting rendering and re-injecting `<style>` content the sanitizer removed. Positional copies now run before sanitization, and inlined computed styles get scrubbed by the sanitizer.
- **Broken `diagview/style` Package Export** — The exports map pointed at `dist/diagview.css`, which no build step produced; `import "diagview/style"` failed. The build now emits the CSS file and the invalid `types` condition was removed.
- **Version Sync Drift** — `scripts/sync-version.js` now also syncs the jest `__DV_VERSION__` global (stale at 1.0.6 since three releases).

### Performance

- **Firefox Pan/Zoom Smoothness** — `will-change: transform` on the modal SVG promotes it to a compositor layer, eliminating Firefox's per-frame re-rasterization during panning (Chromium already did this on its own).

### Testing

- New sanitizer test suite, including a Mermaid-shaped fixture asserting strict mode preserves text labels, `foreignObject` htmlLabels, style blocks, classes, and marker references; clone-alignment regression tests (187 tests total, up from 175).

---

## [1.0.9] - 2026-07-31

### Fixed

- **Mobile Hamburger Menu Touch Scrolling** — Excluded scrollable UI panels (`.diagview-menu`, `.diagview-help-content`) from global `touchmove` `preventDefault()` locks, restoring smooth touch momentum scrolling inside the floating menu on iOS Safari and Android Chrome.

---

## [1.0.8] - 2026-07-30

### Fixed

- **Chrome & Brave Fullscreen Color Picker Alignment** — Re-ordered swatch controls and adjusted input transform origin so the native OS color picker dialog anchors safely inside the screen in fullscreen mode on Chromium browsers (Chrome, Brave, Edge).

---

## [1.0.7] - 2026-07-30

### Added

- **ShareLink Canvas Theme Retention** — Encodes and restores canvas theme mode (`dv-t`) and custom background hex (`dv-c`) in shareable URLs while preserving all existing parameters (`dv-idx`, `dv-z`, `dv-cx`, `dv-cy`, `dv-r`, `dv-q`).
- **Canvas Theme Controls & Color Swatches** — Interactive canvas background customization menu with Light/Dark presets, 6 color swatches (`#ffffff`, `#000000`, `#0b0f19`, `#090d16`, `#0f172a`, `#18181b`), and custom `<input type="color">` hex picker.
- **First-Time Theme Hint Toast** — 6-second informational hint toast (`showFirstTimeThemeHint: true`) with `localStorage` memory (`diagview-canvas-hint-shown`).
- **iOS-Style Transparent Export Toggle** — Modern sliding toggle switch with dynamic disabling for raster background-dependent export formats (JPEG/PDF).

### Changed

- **SVG Text Contrast Normalization** — Stores original text fill in `data-original-fill` attribute. Automatically brightens low-contrast SVG text (< 4.5:1) in Dark mode with `important` priority and restores original colors when switching back to Light mode.
- **Export Grid Layout** — Updated "Copy Image" button layout to span full width (`grid-column: 1 / -1`) in the export menu grid.

---

## [1.0.6] - 2026-05-11

### Added

- **Silent Watermark Branding** — Configurable watermark system for exports (`corner`, `background`, or `both` styles) with automatic theme-based contrast-aware strokes.
- **Proportional Safe-Fit Scaling** — New boundary-aware math engine that automatically fits branding text into any aspect ratio without squashing or overflow.
- **Support for 'four-sides' Position** — Ultimate protection mode that places attribution on all four edges of the exported image.

### Fixed

- **Firefox Mobile UI Stability** — Resolved "Search bar jumping" bug by pinning the modal height to `window.innerHeight` and using GPU-accelerated `translate3d` positioning.
- **Cross-Site UI Isolation** — Replaced native checkboxes with custom-styled, theme-isolated components to prevent host-site CSS bleeding (e.g. from Bootstrap/Tailwind resets).
- **Z-Index Collision Protection** — Reinforced modal stacking context and background opacity with `!important` overrides to ensure DiagView always stays on top of sticky website headers.
- **Global Shortcut Reliability** — Overhauled focus management to ensure keyboard shortcuts (M, Space, R, etc.) remain active after using Search, UI tools, or clicking complex diagram elements.
- **Meeting Mode Cursor Artifacts** — Resolved "double pointer" bug by correctly hiding the system cursor in presentation mode.
- **Panzoom Sluggishness When Browser Zoomed** — Replaced the old counter-scaling viewport approach with a "Scale-Free" `position:fixed` layout. The modal now uses exact visual viewport dimensions with no scale transform, ensuring 1:1 CSS pixel interaction for Panzoom regardless of browser zoom level. Also fixes Firefox layout shifts caused by `pageLeft`/`pageTop` discrepancies.
- **Viewport Test Regression** — Fixed pre-existing test failure in `viewport.test.js` by aligning expectations with the Scale-Free viewport refactor.

### Changed

- **Mobile Troubleshooting Docs** — Documented known 3-finger gesture limitations in Firefox Mobile in the FAQ.
- **Codebase Audit & Cleanup** — Removed 13 dead exported functions across 7 modules (`utils.js`, `svg-clone.js`, `panzoom-integration.js`, `rotate.js`, `minimap.js`, `button-factory.js`). Eliminated duplicate `addModalCleanupFunction` definition, removed redundant `LARGE_FILE_THRESHOLD_DEFAULT` constant, added missing `UI_SYNC_THROTTLE` timing constant. Net reduction: 220 lines deleted.
- **Documentation Accuracy** — Updated Node.js version requirements in BUILD.md and CONTRIBUTING.md to match `package.json` engines (`>=20.17.0`). Corrected stale bundle size limits in BUILD.md.

---

## [1.0.5] - 2026-05-05

### Added

- **Premium UI Aesthetics** — Rebuilt the entire UI with glassmorphism, backdrop-filters, and smooth animations.
- **Enterprise Security Overhaul** — New `DOMParser`-based recursive SVG sanitization engine (Strict/Permissive modes).
- **Native Text Selection** — Added toggle to suspend Panzoom and enable native browser text selection over SVG labels.
- **Shadow DOM Support** — Full support for diagrams inside Web Components/Shadow roots.
- **Per-Diagram Overrides** — Support for mixing layout modes (`header`, `floating`, `off`), accent colors, and export scales on the same page via `data-diagview-layout`, `data-diagview-accent`, and `data-diagview-scale` attributes.
- **Sync Version Script** — Automated version synchronization across README and demo files.

### Changed

- **Optimized Interactions** — Refined Minimap, Laser Pointer (Meeting Mode), and 90° Rotation for better performance and stability.
- **Lazy Feature Loading** — Heavy modules (PDF export, search cache, minimap) are now lazy-loaded on demand.
- **Mobile Stability** — Implemented Visual Viewport Synchronization to fix UI drift on pinch-zoom.
- **Documentation Overhaul** — Audited and rewrote all primary documentation (README, API, USAGE, FAQ) for total accuracy.

### Removed

- **Legacy Regex Sanitizer** — Replaced with a more robust DOM-walking sanitizer.

---

## [1.0.4] - 2026-04-20

### Fixed

- **Minimap clipping** — Tall portrait-oriented diagrams (e.g. Mermaid `graph TD`) were partially clipped in the minimap thumbnail. Root cause: coordinate space mismatch. Fix: use `getBoundingClientRect()` for both measurements.
- **Minimap ghosting** — The minimap SVG inherited CSS transforms from Panzoom on the clone element. Fix: snapshot the original SVG via a Data URL.
- **Mobile viewport drift** — UI chrome elements drifted when the browser was pinch-zoomed. Fix: Visual Viewport Synchronization.
- **Double-prefixing of SVG IDs** — IDs on the host page's original SVG were being mutated. Fix: `fixIds()` is now called only on the internal clone.
- **`panzoom.pause()` / `panzoom.resume()` crash** — Fix: replaced with `panzoom.setOptions({ disablePan, disableZoom })`.

### Changed

- **Minimap hidden on mobile** — Minimap is now hidden on viewports narrower than 768 px.
- **Responsive CSS** — Key UI elements now use `clamp()`, `dvh`, and `min()`.
- **`resetConfig()` scope** — Now resets the entire internal state (not just `config`).

### Added

- **Visual Viewport Synchronization** (`viewport.js`) — Keeps the fullscreen modal correctly positioned when pinch-zoomed.
- **`immersiveMode` config option** — Opt-in mobile viewport locking.
- **`onError` callback** — Fires when a diagram container's SVG fails validation.
- **Per-element `data-diagview-sanitize` and `data-diagview-allow-remote`** — Fine-grained security control.

---

## [1.0.3] - 2026-04-07

### Fixed

- Resolved "Exit Code 128" issue in the automated npm publish workflow.

### Changed

- Upgraded GitHub Actions build environment to Node.js 24.

---

## [1.0.2] - 2026-04-07

### Added

- **GitHub Actions CI/CD** — Automated test, lint, build, and publish pipeline.
- **Jest unit test suite** — 25+ test files covering all major modules.
- **Coverage reporting** — Istanbul/c8 coverage with enforced thresholds.
- **`SECURITY.md`** — Responsible disclosure policy.

### Fixed

- Extracted CSS from a 1,151-line JS string into `src/ui/styles.css`.
- Standardized all demo CDN references to `@panzoom/panzoom@4.5.1`.
- Stale `dist/esm/` artifacts from previous builds no longer accumulate.

---

## [1.0.1] - 2026-02-10

### Fixed

- TypeScript declaration files (`.d.ts`) were not generated due to a stale `tsconfig.tsbuildinfo` incremental build cache.

### Changed

- Updated CDN version reference from pinned `@1.0.0` to floating `@1`.

---

## [1.0.0] - 2026-02-07

Initial public release.

[Unreleased]: https://github.com/khadirullah/diagview/compare/v1.0.12...HEAD
[1.0.12]: https://github.com/khadirullah/diagview/compare/v1.0.11...v1.0.12
[1.0.11]: https://github.com/khadirullah/diagview/compare/v1.0.10...v1.0.11
[1.0.10]: https://github.com/khadirullah/diagview/compare/v1.0.9...v1.0.10
[1.0.9]: https://github.com/khadirullah/diagview/compare/v1.0.8...v1.0.9
[1.0.8]: https://github.com/khadirullah/diagview/compare/v1.0.7...v1.0.8
[1.0.7]: https://github.com/khadirullah/diagview/compare/v1.0.6...v1.0.7
[1.0.6]: https://github.com/khadirullah/diagview/compare/v1.0.5...v1.0.6
[1.0.5]: https://github.com/khadirullah/diagview/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/khadirullah/diagview/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/khadirullah/diagview/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/khadirullah/diagview/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/khadirullah/diagview/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/khadirullah/diagview/releases/tag/v1.0.0
