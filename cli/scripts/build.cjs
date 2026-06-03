#!/usr/bin/env node
// esbuild-based build: bundles TS/TSX → single ESM dist/index.js
// ink@4 requires ESM (yoga-wasm-web uses top-level await)
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const outfile = path.join(__dirname, '..', 'dist', 'index.js');
fs.mkdirSync(path.dirname(outfile), { recursive: true });

// Stub plugin: replace optional dev-only deps with empty modules
const stubPlugin = {
  name: 'stub-optional',
  setup(build) {
    // ink's reconciler dynamically imports react-devtools-core in dev mode.
    build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
      path: 'stub',
      namespace: 'stub-ns',
    }));
    build.onLoad({ filter: /.*/, namespace: 'stub-ns' }, () => ({
      contents: 'export default {}; export function connectToDevTools() {}',
      loader: 'js',
    }));
  },
};

// Standard fix for CJS packages (e.g. commander) inside ESM esbuild bundles:
// inject createRequire so esbuild's __require shim finds a working require().
// NOTE: src/index.ts already has the #!/usr/bin/env node shebang — don't duplicate here.
const BANNER = [
  "import { createRequire } from 'node:module';",
  "const require = createRequire(import.meta.url);",
].join('\n');

async function main() {
  await esbuild.build({
    entryPoints: [path.join(__dirname, '..', 'src', 'index.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    outfile,
    plugins: [stubPlugin],
    banner: { js: BANNER },
    // yoga-wasm-web loads yoga.wasm via a relative path — can't bundle WASM binaries.
    // Mark as external; node_modules version will be used at runtime.
    external: ['yoga-wasm-web'],
    jsx: 'automatic',
    jsxImportSource: 'react',
    conditions: ['node'],
    logLevel: 'warning',
  });

  // Make executable on Unix (banner already includes shebang)
  try { fs.chmodSync(outfile, 0o755); } catch (_) {}
  console.log(`build: dist/index.js (${Math.round(fs.statSync(outfile).size / 1024)} KB)`);
}

main().catch(e => { console.error(e); process.exit(1); });
