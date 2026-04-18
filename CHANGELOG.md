# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.4] - 2026-04-18

### Fixed
- **Minimap Clipping**: Resolved bug where tall portrait-oriented diagrams (e.g., Mermaid TD) were partially clipped in the minimap.
- **Minimap Stability**: Ensured minimap background remains static by stripping inherited panzoom transforms from the clone.
- **Viewport Layout**: Fixed UI elements (Search, FAB, Minimap) drifting on mobile when the browser is pinch-zoomed by using Visual Viewport synchronization.

### Changed
- **Mobile Responsiveness**: Minimap is now hidden on viewports < 768px to preserve screen space on mobile and small tablets.
- **UI Units**: Switched key UI components to responsive CSS units (`clamp`, `dvh`, `min`) for better cross-browser stability.

### Added
- **Mobile Viewport Lock**: Implemented industry-standard meta-tag locking when models are active to prevent broken layouts on mobile.
- **Enhanced Testing**: Added 16 new unit tests covering minimap logic, history state management, and modal lifecycles.

---

## [1.0.3] - 2026-04-07

### Fixed
- Resolved "Exit Code 128" issue in automated NPM publish workflow
- Stabilized CI/CD pipeline for fully automated releases

### Changed
- Upgraded GitHub Actions build environment to Node.js 24
- All feature enhancements from v1.0.2 are included (no functional changes)

---

## [1.0.2] - 2026-04-07

### Added
- GitHub Actions for automated CI/CD (testing, linting, and publishing)
- Jest-based unit testing suite with coverage reporting
- Official SECURITY.md policy
- Dynamic version injection in build banners via rollup.config.js

### Fixed
- Standardized all CDN references to v4.5.1 for consistency
- Extracted CSS from 1,151-line JS string to native src/ui/styles.css
- Resolved stale build artifacts in dist/esm/ during build lifecycle
- Corrected various documentation paths and broken links

## [1.0.1] - 2026-02-10

### Fixed
- TypeScript declaration files (`.d.ts`) not being generated due to `incremental` build cache

### Changed
- Updated CDN version reference from `@1.0.0` to `@1` for automatic minor/patch updates
- Clean script now removes `tsconfig.tsbuildinfo` to prevent stale builds

### Added
- Demo GIF in README (`media/demo.gif`)

---

## [1.0.0] - 2026-02-07

### Added
- \U0001f389 Initial release
- Interactive diagram viewer with zoom/pan
- Multiple export formats (PNG, SVG, PDF, WebP, Clipboard)
- Search functionality with node highlighting
- Keyboard shortcuts for navigation
- Meeting mode with laser pointer
- Share links with zoom/pan state
- 3 layout modes (header, floating, off)
- Auto-theming (light/dark mode detection)
- Mobile optimized with touch gestures
- Framework-agnostic (React, Vue, Svelte support)
- TypeScript definitions
- Comprehensive documentation

### Architecture
- Modular codebase with lazy loading
- Centralized constants and configuration
- Lifecycle management utilities
- Consolidated SVG cloning
- Button factory for DRY code
- ~85% code optimization vs initial version

[1.0.4]: https://github.com/khadirullah/diagview/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/khadirullah/diagview/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/khadirullah/diagview/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/khadirullah/diagview/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/khadirullah/diagview/releases/tag/v1.0.0