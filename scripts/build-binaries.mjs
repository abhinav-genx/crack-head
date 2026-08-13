// Compiles dist/crack-head.cjs into standalone, no-Node-required executables for
// every supported platform using @yao-pkg/pkg. pkg downloads (and caches) a
// prebuilt Node base binary per target, so all platforms cross-build from a
// single machine / CI runner. Output asset names are normalized to
// `<os>-<arch>` so install.sh can map `uname` output straight to a download.
import { exec } from "@yao-pkg/pkg";
import { mkdirSync } from "node:fs";

const NODE_RANGE = "node22";
const OUT_DIR = "binaries";
const ENTRY = "dist/crack-head.mjs";

// asset === the file name uploaded to the GitHub Release (see install.sh).
const TARGETS = [
  { platform: "macos-arm64", asset: "crack-head-darwin-arm64" },
  { platform: "macos-x64", asset: "crack-head-darwin-x64" },
  { platform: "linux-x64", asset: "crack-head-linux-x64" },
  { platform: "linux-arm64", asset: "crack-head-linux-arm64" },
  { platform: "win-x64", asset: "crack-head-windows-x64.exe" },
];

// Allow building a single target in CI matrices: `node scripts/build-binaries.mjs macos-arm64`
const only = process.argv[2];
const targets = only ? TARGETS.filter((t) => t.platform === only) : TARGETS;
if (only && targets.length === 0) {
  console.error(`Unknown target "${only}". Known: ${TARGETS.map((t) => t.platform).join(", ")}`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

for (const t of targets) {
  console.log(`\n=== building ${t.asset} (${NODE_RANGE}-${t.platform}) ===`);
  await exec([
    ENTRY,
    "--targets",
    `${NODE_RANGE}-${t.platform}`,
    "--output",
    `${OUT_DIR}/${t.asset}`,
    "--compress",
    "GZip",
  ]);
}

console.log(`\nDone. Binaries written to ./${OUT_DIR}/`);
