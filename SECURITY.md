# Security policy

## Supported versions

Only the latest stable release receives security updates.

| Version        | Supported |
| -------------- | --------- |
| 1.x.x (latest) | ✅        |
| < 1.0.0        | ❌        |

---

## SVG sanitization model

DiagView processes untrusted SVG content from the DOM. The built-in sanitizer (`src/core/utils.js → sanitizeSVG`) implements a three-tier security model. Custom button icons from `ui.buttons.icons` always go through `strict`.

### `strict` (default)

Removes all known SVG XSS vectors using a DOM-walking approach (not regex):

- **Blocked tags:** `<script>`, `<iframe>`, `<object>`, `<applet>`, `<embed>`, `<form>`, `<link>`, `<base>`, `<meta>`, `<math>`, `<feimage>`, `<animate>`, `<animateColor>`, `<animateMotion>`, `<animateTransform>`, `<set>`, `<discard>`, `<mpath>`, `<tref>`
- **`<foreignObject>`:** Kept, so Mermaid HTML labels still render. It is removed when its `src` or `data` points at an `http(s)://` URL. Its contents go through the same checks.
- **Blocked attributes:** All `on*` event handlers on any element, and the `form` attribute, which ties a button or field in the diagram to a form on the page
- **Blocked URIs:** `javascript:`, `vbscript:` and `data:` URLs in `href`, `xlink:href`, `src`, `action` and `formaction`. Base64 images of the `allowedImageTypes` stay, which are PNG, JPEG, WebP and GIF by default
- **External `<use>` references:** Blocked (`https://evil.com/...#payload`)
- **Inline styles:** Stripped if containing `expression()`, `javascript:`, `vbscript:`, `@import`, or remote `url()` references (decoded before matching to catch hex/unicode bypasses). `@import` and remote `url()` are allowed when `security.allowRemoteResources` is `true`.
- **`<style>` blocks:** Stripped if containing the same patterns

### `permissive`

Blocks only the most critical vectors (legacy behavior):

- `<script>`, `<iframe>`, `<object>`, `<applet>`, `<embed>`, `<form>`, `<link>`, `<base>`, `<meta>`
- SMIL animation elements that target `href` or an `on*` attribute
- All `on*` event attributes
- `javascript:`, `vbscript:` and `data:` URLs in `href`, `xlink:href`, `src`, `action` and `formaction`, with the same `allowedImageTypes` exception as `strict`

`permissive` keeps the `form` attribute by design. A button in the fullscreen view with `form="checkout"` can still submit the page's form with the id `checkout`. A `formaction` with an `https://` URL on that button sends the form's fields to that address. Use `permissive` only for diagrams you wrote yourself.

### `off`

No sanitization. Only for SVG content from a **fully trusted, developer-controlled source**.

---

## Reporting a vulnerability

Please **do not** file a public GitHub Issue for security vulnerabilities.

**Preferred:** Open a [Security Advisory draft](https://github.com/khadirullah/diagview/security/advisories) on GitHub (private disclosure).

**Alternative:** Email the maintainer via the address in the npm package metadata.

**Include in your report:**

- Description of the vulnerability and attack scenario
- Steps to reproduce
- Impact assessment (what an attacker can achieve)
- Any suggested mitigations

**Response time:** You should receive an acknowledgement within 48 hours.

**Patch process:** Confirmed vulnerabilities will receive a patch release. Reporters will be credited in the `CHANGELOG.md` and release notes (unless anonymity is requested).

---

## Known limitations

- **`<style>` block CSS parsing** is pattern-based, not a full CSS parser. Highly obfuscated CSS injection (beyond hex/unicode escapes) is not guaranteed to be caught in `strict` mode. Keep `strict` mode for untrusted SVGs, and use `'off'` only for SVGs you fully control.
- **`data-diagview-sanitize="off"`** and **`data-diagview-allow-remote="true"`** disable protections on a per-element basis. These attributes only function when `security.allowOverrides: true` is set (the default). You can disable per-element overrides globally:

```javascript
DiagView.init({ security: { allowOverrides: false } });
```

- **PDF export** lazy-loads jsPDF from a CDN with Subresource Integrity (SRI). Providing a custom `pdfLibraryUrl` without also providing `pdfLibraryIntegrity` removes SRI protection for that URL.
