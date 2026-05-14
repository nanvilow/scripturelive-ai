#!/usr/bin/env bash
# Launcher for the Electron close-button E2E test (vitest +
# playwright._electron). On a Replit nix container the Electron
# binary needs:
#   - LD_LIBRARY_PATH including the mesa-libgbm store path so it can
#     find libgbm.so.1 at startup (loaded BEFORE --disable-gpu can
#     skip it).
#   - --no-sandbox (set inside the test) because the SUID sandbox
#     helper isn't installed.
#   - xvfb-run wrapping vitest, since BrowserWindow needs a display
#     even with --disable-gpu.
#
# Outside Replit/CI (e.g. a developer's macOS / Linux desktop) none
# of this scaffolding is needed; just run `vitest --config
# vitest.e2e.config.ts` directly. This script exits with the same
# code as vitest so it integrates cleanly with `pnpm run test:e2e`.
set -euo pipefail

cd "$(dirname "$0")/.."

# Locate mesa-libgbm in /nix/store. We use a single-shot find with a
# depth limit so this stays fast even on hosts with a large store.
GBM_DIR=""
for d in /nix/store/*-mesa-libgbm-*; do
  if [ -f "$d/lib/libgbm.so.1" ]; then
    GBM_DIR="$d/lib"
    break
  fi
done

# Fall back to a regular mesa store if mesa-libgbm isn't around (the
# package was renamed at some point in nixpkgs history).
if [ -z "$GBM_DIR" ]; then
  for d in /nix/store/*-mesa-2*; do
    if [ -f "$d/lib/libgbm.so.1" ]; then
      GBM_DIR="$d/lib"
      break
    fi
  done
fi

if [ -n "$GBM_DIR" ]; then
  export LD_LIBRARY_PATH="$GBM_DIR${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi

# Build dist-electron/test-entry.js (and the rest of the electron
# bundle) before launching so the test always points at fresh code.
echo "[e2e] building dist-electron…"
pnpm run electron:build >/dev/null

# Bundle the UI E2E harness (esbuild → dist-electron-ui/) so the
# `Settings UI → live toggle drives the X-button on the very next
# close` test can mount the real `<StartupCard />` against the real
# preload bridge.
echo "[e2e] building dist-electron-ui…"
node scripts/build-e2e-ui.mjs >/dev/null

# Wrap vitest in xvfb-run when one is available; outside the Replit
# container (e.g. a developer's machine with a real $DISPLAY)
# vitest can run vanilla.
if command -v xvfb-run >/dev/null && [ -z "${DISPLAY:-}" ]; then
  echo "[e2e] launching under xvfb-run…"
  exec xvfb-run -a -s "-screen 0 1280x720x24" \
    pnpm exec vitest run --config vitest.e2e.config.ts "$@"
else
  echo "[e2e] launching with existing \$DISPLAY=$DISPLAY"
  exec pnpm exec vitest run --config vitest.e2e.config.ts "$@"
fi
