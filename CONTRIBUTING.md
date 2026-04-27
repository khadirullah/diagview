# Contributing to DiagView

Thank you for considering contributing! 🎉

## How to Contribute

### Reporting Bugs

1. Check if the bug already exists in [Issues](https://github.com/khadirullah/diagview/issues)
2. If not, create a new issue with:
   - Clear title
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable
   - Environment details (browser, OS)

### Suggesting Features

1. Check [existing feature requests](https://github.com/khadirullah/diagview/issues?q=is%3Aissue+label%3Aenhancement)
2. Create a new issue with `[FEATURE]` prefix
3. Describe the problem it solves
4. Explain your proposed solution

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Add tests if applicable (optional)
5. Run linter: `npm run lint`
6. Commit with clear message: `git commit -m "Add my feature"`
7. Push: `git push origin feature/my-feature`
8. Open a Pull Request

### Code Style

- Use ESLint configuration provided
- Follow existing code patterns
- Add JSDoc comments for public APIs
- Keep functions small and focused

### Documentation

- Update README.md if needed
- Add/update JSDoc comments
- Update USAGE.md for new features

## Subresource Integrity (SRI) Management

DiagView uses external CDNs for optional dependencies like jsPDF. To prevent silent failures when the CDN updates:
1. Always specify an exact version in the URL (e.g., `.../jspdf/2.5.1/...`).
2. Provide a matching `pdfLibraryIntegrity` hash in the default config.
3. If you update the URL, you **must** update the hash. A mismatch will cause the browser to block the script, falling back to PNG export silently.
4. Users modifying the `pdfLibraryUrl` at runtime without providing a new hash will have the SRI check disabled to prevent breakages.

## Technical Architecture

### Module Singletons
DiagView uses a centralized `state` object for most data. However, for performance and simplicity, some modules (like `observer.js` and `meeting-mode.js`) use **module-level singletons** for state that doesn't need to be multi-instance aware. 

- **Lifecycle**: If you add new module-level variables, ensure you export a reset function (e.g., `resetSearch()`) and call it inside the `destroy()` flow in `src/index.js`. This prevents state "leaks" in Single Page Applications where DiagView might be initialized multiple times.
- **Deduplication**: We assume a standard build environment where the bundler (Rollup, Webpack, etc.) deduplicates these modules correctly.

### Design Principles
- **Lazy Loading**: Keep the core bundle small. Complex features (Minimap, PDF Export, Search) should be dynamically imported only when used.
- **Accessibility**: All UI elements must maintain high contrast ratios (WCAG 2.0). Use the utility functions in `theme.js` to verify colors.
- **Security**: Avoid `innerHTML`. Use `createTextNode` or `insertAdjacentHTML` with trusted SVG strings for UI construction.

## Development Setup
```bash
# Clone your fork
git clone https://github.com/khadirullah/diagview.git
cd diagview

# Install dependencies
npm install

# Start dev server
npm run dev
```

## Questions?

Open an issue or reach out to maintainers!

Thank you for contributing! ❤️
