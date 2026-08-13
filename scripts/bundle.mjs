// Bundles the compiled ESM output (dist/) into a single file that
// @yao-pkg/pkg can turn into a standalone binary. This collapses every
// dependency (ink, react, yoga's inlined wasm, etc.) and the app's dynamic
// imports into one self-contained file. Output stays ESM because ink/yoga use
// top-level await, which cannot be represented in CommonJS.
import { build } from "esbuild";
import { rmSync } from "node:fs";

const OUTFILE = "dist/crack-head.mjs";

rmSync(OUTFILE, { force: true });

// ink statically imports `react-devtools-core` from its (dynamically loaded)
// devtools module. That import only ever runs under `DEV=true` with a live
// devtools server, but esbuild still hoists the external ESM import to the top
// of the bundle and fails to link it. Replace it with an inert stub so the
// bundle is self-contained; the stub is never evaluated in normal use.
const stubDevtools = {
  name: "stub-react-devtools-core",
  setup(b) {
    b.onResolve({ filter: /^react-devtools-core$/ }, () => ({
      path: "react-devtools-core",
      namespace: "stub",
    }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: "export default {};",
      loader: "js",
    }));
  },
};

await build({
  entryPoints: ["dist/cli.js"],
  outfile: OUTFILE,
  bundle: true,
  platform: "node",
  format: "esm",
  // Match the oldest runtime @yao-pkg/pkg ships a base binary for below.
  target: "node18",
  plugins: [stubDevtools],
  // Optional native accelerators pulled in transitively by ink -> ws. They are
  // require()'d inside try/catch, so leaving them out is safe and keeps the
  // bundle resolvable when they aren't installed.
  external: ["bufferutil", "utf-8-validate"],
  // ink/ws call require() at runtime; give the ESM output a working require.
  banner: {
    js: "import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);",
  },
  legalComments: "none",
  logLevel: "info",
});

console.log(`bundled -> ${OUTFILE}`);

