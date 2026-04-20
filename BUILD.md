## 🔨 Build

### Development
```bash
# Install dependencies
npm install

# Start dev server with watch mode
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix
```

### Production Build
```bash
# Clean previous build
npm run clean

# Build library
npm run build

# Check bundle size
npm run size
```

### Output Files
- `dist/diagview.umd.js` - UMD build (browser `<script>`)
- `dist/diagview.umd.min.js` - UMD minified (production)
- `dist/esm/index.js` - ES Module (bundlers)
- `dist/index.d.ts` - TypeScript definitions


