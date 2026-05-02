import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artifactRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(artifactRoot, "..", "..");
const standaloneArtifact = path.join(
  artifactRoot,
  ".next",
  "standalone",
  "artifacts",
  "imported-app",
);
const standaloneRoot = path.join(artifactRoot, ".next", "standalone");

if (!fs.existsSync(standaloneArtifact)) {
  // As of v0.7.38, `output: "standalone"` is gated behind
  // NEXT_OUTPUT_STANDALONE=1 — Cloud Run autoscale builds skip it
  // because the trace step blew the cr-2-4 (4 GB) build cgroup.
  // Only the Electron `package*` scripts opt into standalone now,
  // so for any non-Electron build (`pnpm run build` on its own,
  // including the Cloud Run deploy) this postbuild step is a no-op.
  console.log(
    "[copy-standalone-assets] standalone build not produced",
    "(NEXT_OUTPUT_STANDALONE != 1) — skipping. This is normal for",
    "the Cloud Run deploy; only the Electron `package*` scripts",
    "produce a standalone tree.",
  );
  process.exit(0);
}

function copyDir(src, dst, label) {
  if (!fs.existsSync(src)) {
    console.warn(`[copy-standalone-assets] skipped ${label}: ${src} missing`);
    return;
  }
  fs.rmSync(dst, { recursive: true, force: true });
  fs.cpSync(src, dst, { recursive: true, dereference: true });
  console.log(`[copy-standalone-assets] copied ${label} -> ${dst}`);
}

// Resolve a node_modules path, preferring the workspace-hoisted location
// (pnpm typically hoists shared deps there) and falling back to the
// artifact-local node_modules. This keeps the script resilient across
// pnpm hoisting layouts, source-zip rebuilds, and CI environments.
function resolveNodeModulesPath(...segments) {
  const candidates = [
    path.join(workspaceRoot, "node_modules", ...segments),
    path.join(artifactRoot, "node_modules", ...segments),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0]; // return primary path so copyDir's missing-warn fires
}

// .next/static is required by the browser for JS/CSS chunks. Next's
// standalone output excludes it by design — it has to be copied in.
copyDir(
  path.join(artifactRoot, ".next", "static"),
  path.join(standaloneArtifact, ".next", "static"),
  ".next/static",
);

// server.mjs and server-transcribe-stream.mjs are this artifact's CUSTOM
// server entrypoint (server.mjs wraps Next via `next({ dev:false })` and
// attaches the Deepgram WebSocket via attachTranscribeStream). They live
// outside Next's source graph, so the standalone tracer never copies them
// — but the Cloud Run runtime image (and the Electron-packaged server
// child process) needs them present in the standalone tree because that
// is the directory cwd's into for `node server.mjs`. Copy by file (not
// dir) since they're individual entry files. v0.7.42: this is the missing
// piece that made v0.7.41's runtime crash with ERR_MODULE_NOT_FOUND once
// we flipped NEXT_OUTPUT_STANDALONE=1 on for the Cloud Run deploy too.
function copyFile(src, dst, label) {
  if (!fs.existsSync(src)) {
    console.warn(`[copy-standalone-assets] skipped ${label}: ${src} missing`);
    return;
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.log(`[copy-standalone-assets] copied ${label} -> ${dst}`);
}
for (const entry of ["server.mjs", "server-transcribe-stream.mjs"]) {
  copyFile(
    path.join(artifactRoot, entry),
    path.join(standaloneArtifact, entry),
    entry,
  );
}

// public/ is occasionally auto-copied but we mirror it for safety.
copyDir(
  path.join(artifactRoot, "public"),
  path.join(standaloneArtifact, "public"),
  "public",
);

// db/ holds the SQLite database that Prisma's `file:../db/custom.db`
// DATABASE_URL points at (resolved relative to schema.prisma's location,
// which lands at .next/standalone/artifacts/imported-app/db/custom.db).
// SQLite creates the FILE on first connection but it does NOT create
// missing parent directories — it just throws "unable to open database
// file". `db/` is gitignored, so production source ships without it,
// which means on first DB access in the runtime container the app
// would crash. Mirror the source `db/` if it exists (preserves any
// dev/seed data); otherwise just create the empty directory so SQLite
// can lay down custom.db on first use.
const srcDbDir = path.join(artifactRoot, "db");
const dstDbDir = path.join(standaloneArtifact, "db");
if (fs.existsSync(srcDbDir)) {
  copyDir(srcDbDir, dstDbDir, "db");
} else {
  fs.mkdirSync(dstDbDir, { recursive: true });
  console.log(`[copy-standalone-assets] created empty db dir -> ${dstDbDir}`);
}
if (!fs.existsSync(dstDbDir) || !fs.statSync(dstDbDir).isDirectory()) {
  console.error(
    "[copy-standalone-assets] FATAL: standalone db/ directory is missing.",
    "Prisma SQLite cannot create parent directories — production deploy",
    "WILL crash on first DB access with 'unable to open database file'.",
  );
  process.exit(1);
}

// `ws` is imported by server-transcribe-stream.mjs but Next's tracer
// doesn't see it (custom server file outside the Next graph). Copy from
// the workspace's hoisted node_modules into the standalone tree so the
// runtime container can resolve it.
const wsSrc = resolveNodeModulesPath("ws");
const wsDst = path.join(standaloneRoot, "node_modules", "ws");
copyDir(wsSrc, wsDst, "node_modules/ws");

// Next 16 / Turbopack standalone tracing does NOT include
// `next/dist/compiled/@babel/runtime` or `next/dist/compiled/webpack/*`
// because Next loads them via dynamic `require.resolve` calls in
// `config-utils.js#loadWebpackHook` (intentionally non-statically-analyzable,
// per the comment in that file). Locally these resolve up to the workspace
// root's `node_modules/next/`, so dev never sees the issue. In production
// the standalone bundle has no parent `node_modules` to walk to, so server
// startup throws `Cannot find package 'next/dist/compiled/@babel/runtime'`.
// Copy the small subset of compiled deps that `loadWebpackHook` requires.
const standaloneNextCompiled = path.join(
  standaloneRoot,
  "node_modules",
  "next",
  "dist",
  "compiled",
);
const REQUIRED_COMPILED_SUBDIRS = ["@babel", "webpack"];
for (const sub of REQUIRED_COMPILED_SUBDIRS) {
  copyDir(
    resolveNodeModulesPath("next", "dist", "compiled", sub),
    path.join(standaloneNextCompiled, sub),
    `next/dist/compiled/${sub}`,
  );
}

// Build-time assertion: fail fast if any required compiled dep ended up
// missing from the standalone bundle. Without this, the failure mode is a
// silent runtime crash on the autoscale container ~3s after start, which is
// what caused the v0.7.13–v0.7.17 deploy outage. Specifically check the two
// paths Next's loadWebpackHook (config-utils.js) calls require.resolve on.
const REQUIRED_RESOLVE_TARGETS = [
  ["@babel", "runtime", "package.json"],
  ["webpack", "package.js"],
];
const missing = REQUIRED_RESOLVE_TARGETS.filter(
  (segs) => !fs.existsSync(path.join(standaloneNextCompiled, ...segs)),
);
if (missing.length > 0) {
  console.error(
    "[copy-standalone-assets] FATAL: standalone bundle is missing the following",
    "files that Next's loadWebpackHook will require.resolve at startup:",
  );
  for (const segs of missing) {
    console.error("  -", path.join("next/dist/compiled", ...segs));
  }
  console.error(
    "Production deploy WILL crash on startup. Check the workspace node_modules",
    "for the upstream copies and adjust REQUIRED_COMPILED_SUBDIRS above.",
  );
  process.exit(1);
}
console.log(
  "[copy-standalone-assets] verified loadWebpackHook resolve targets exist in standalone",
);
