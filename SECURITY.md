# Security Policy

## Supported Versions

Only the latest stable release receives security updates.

| Version        | Supported |
| -------------- | --------- |
| 1.x.x (latest) | ✅        |
| < 1.0.0        | ❌        |

---

## SVG Sanitization Model

DiagView processes untrusted SVG content from the DOM. The built-in sanitizer (`src/core/utils.js → sanitizeSVG`) implements a three-tier security model:

### `strict` (default)

Removes all known SVG XSS vectors using a DOM-walking approach (not regex):

- **Blocked tags:** `<script>`, `<iframe>`, `<object>`, `<applet>`, `<embed>`, `<form>`, `<foreignObject>`, `<math>`, `<feimage>`, `<animate>`, `<animateColor>`, `<animateMotion>`, `<animateTransform>`, `<set>`, `<discard>`, `<mpath>`, `<tref>`
- **Blocked attributes:** All `on*` event handlers on any element
- **Blocked URIs:** `javascript:`, `vbscript:`, `data:` (except safe raster data URIs: PNG, JPEG, WebP, GIF)
- **External `<use>` references:** Blocked (`https://evil.com/...#payload`)
- **Inline styles:** Stripped if containing `expression()`, `javascript:`, `@import`, or remote `url()` references (decoded before matching to catch hex/unicode bypasses)
- **`<style>` blocks:** Stripped if containing the same patterns

### `permissive`

Blocks only the most critical vectors (legacy behavior):

- `<script>`, `<iframe>`, `<object>`, `<applet>`, `<embed>`, `<form>`
- All `on*` event attributes
- `javascript:`/`vbscript:`/`data:` URIs

### `off`

No sanitization. Only for SVG content from a **fully trusted, developer-controlled source**.

---

## Reporting a Vulnerability

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

## Known Limitations

- **`<style>` block CSS parsing** is pattern-based, not a full CSS parser. Highly obfuscated CSS injection (beyond hex/unicode escapes) is not guaranteed to be caught in `strict` mode. For maximum security, set `security.mode: 'off'` only with SVGs from sources you fully control.
- **`data-diagview-sanitize="off"`** and **`data-diagview-allow-remote="true"`** disable protections on a per-element basis. These attributes only function when `security.allowOverrides: true` is set (the default). You can disable per-element overrides globally:

```javascript
DiagView.init({ security: { allowOverrides: false } });
```

- **PDF export** lazy-loads jsPDF from a CDN with Subresource Integrity (SRI). Providing a custom `pdfLibraryUrl` without also providing `pdfLibraryIntegrity` removes SRI protection for that URL.
