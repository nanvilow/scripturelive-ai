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
  console.error(
    "[copy-standalone-assets] standalone build not found at",
    standaloneArtifact,
  );
  process.exit(1);
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

// .next/static is required by the browser for JS/CSS chunks. Next's
// standalone output excludes it by design — it has to be copied in.
copyDir(
  path.join(artifactRoot, ".next", "static"),
  path.join(standaloneArtifact, ".next", "static"),
  ".next/static",
);

// public/ is occasionally auto-copied but we mirror it for safety.
copyDir(
  path.join(artifactRoot, "public"),
  path.join(standaloneArtifact, "public"),
  "public",
);

// `ws` is imported by server-transcribe-stream.mjs but Next's tracer
// doesn't see it (custom server file outside the Next graph). Copy from
// the workspace's hoisted node_modules into the standalone tree so the
// runtime container can resolve it.
const wsSrc = path.join(workspaceRoot, "node_modules", "ws");
const wsDst = path.join(standaloneRoot, "node_modules", "ws");
copyDir(wsSrc, wsDst, "node_modules/ws");
