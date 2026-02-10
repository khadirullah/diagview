# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.1]: https://github.com/khadirullah/diagview/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/khadirullah/diagview/releases/tag/v1.0.0