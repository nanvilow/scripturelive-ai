#!/usr/bin/env bash
# =============================================================================
# scripts/linux-build-windows-exe.sh
#
# EMERGENCY one-shot Windows .exe build from this Linux Replit container.
#
# WHEN TO USE THIS:
#   ONLY when GitHub push is blocked (e.g. leaked secret in history) AND the
#   operator needs a Windows .exe RIGHT NOW. The normal ship path is to push
#   to GitHub and let the "Build Windows Installer" GH Actions workflow run
#   on a real Windows runner — that path is faster, signs the .exe, and
#   produces auto-updatable artifacts. This script does none of those things.
#
# WHAT THIS PRODUCES:
#   artifacts/imported-app/release/ScriptureLive-AI-<version>-Setup-x64.exe
#   The .exe HAS rcedit-stamped PE metadata (icon, file description, product
#   name, version) — wine64 runs rcedit.exe (a 64-bit PE) successfully.
#
#   On a host where the Linux kernel + container security policy allow 32-bit
#   ELF execution, this is a real NSIS Setup installer (auto-update capable).
#
#   On the Replit NixOS container — where seccomp blocks the i386 syscall
#   ABI entirely — NSIS is not possible (the NSIS stub is 32-bit and cannot
#   be executed even via wine), so the script auto-falls-back to the
#   `portable` target. The .exe is then a single self-extracting executable
#   that runs from anywhere with no install/uninstall step. **The portable
#   variant cannot auto-update.**
#
# WHY THIS WAS HARD:
#   Two distinct issues conflated under "wine doesn't work":
#
#   1. (FIXED in v0.7.33) `pkgs.wine64` from nixpkgs is 64-bit only — wineboot
#      hung at the `setupapi InstallHinfSection` step trying to bootstrap
#      a wineprefix without a 32-bit subsystem. This script and replit.nix
#      both now use `pkgs.wineWowPackages.stable` (full WoW build) instead.
#
#   2. (CONTAINER LIMIT, cannot fix from inside the script) Replit's
#      container has Seccomp:2 with a filter that kills 32-bit ELF binaries
#      with SIGSYS the first time they hit the i386 syscall ABI. The 32-bit
#      `wine` launcher and any 32-bit Windows PE (which includes the NSIS
#      Setup stub electron-builder runs to extract the uninstaller) crash
#      the moment they try to make a syscall. This is why the script
#      detects i386 ABI availability up-front and switches the target to
#      `portable` when it's blocked — there is no point asking
#      electron-builder to invoke a binary the kernel will instantly kill.
#
#      `wine64` (and 64-bit PEs running through it) are NOT affected. rcedit
#      runs cleanly, so all PE metadata is correctly stamped either way.
#
# IDEMPOTENCY:
#   Re-running this script is safe. It cleans `release/` and the wineprefix
#   between attempts so a half-finished previous run never poisons the next.
#
# USAGE:
#   bash scripts/linux-build-windows-exe.sh
#     # auto-detect 32-bit ABI; build NSIS if available, portable otherwise
#
#   FORCE_TARGET=nsis     bash scripts/linux-build-windows-exe.sh
#     # force NSIS even if the 32-bit ABI test fails (almost certainly fails)
#
#   FORCE_TARGET=portable bash scripts/linux-build-windows-exe.sh
#     # force portable even on a host that supports 32-bit (skips a slow
#     # wine call; useful for fast iteration)
#
#   SKIP_INSTALL=1 bash scripts/linux-build-windows-exe.sh
#     # skip pnpm install (use right after a fresh install)
#
#   SKIP_BUILD=1   bash scripts/linux-build-windows-exe.sh
#     # skip Next.js + Electron build, only re-package the existing artifacts
#
# =============================================================================
set -euo pipefail

# -----------------------------------------------------------------------------
# Constants
# -----------------------------------------------------------------------------
REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${REPO_ROOT}/artifacts/imported-app"
RELEASE_DIR="${APP_DIR}/release"
WINEPREFIX_DIR="${WINEPREFIX:-${HOME}/.wine}"
STALE_WINE_STUB="${HOME}/.local/bin/wine"
I386_PROBE="${TMPDIR:-/tmp}/linux-build-win-i386-probe"

log()  { printf '\033[1;36m[linux-build-win]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[linux-build-win][warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[linux-build-win][error]\033[0m %s\n' "$*" >&2; exit 1; }

# -----------------------------------------------------------------------------
# Step 0: nuke any stale wine shell stub from the v0.7.32 workaround.
# That stub returned "wine-10.0" to the version probe and exited 0 silently
# for everything else. With real wine on PATH it now SHADOWS the real binary
# on most $PATH orderings and breaks the build, so we always remove it.
# -----------------------------------------------------------------------------
if [[ -e "${STALE_WINE_STUB}" ]]; then
  log "Removing stale wine shell stub at ${STALE_WINE_STUB} (left over from v0.7.32 workaround)."
  rm -f "${STALE_WINE_STUB}"
fi

# -----------------------------------------------------------------------------
# Step 1: verify wine (specifically wine64) works.
# We require wineWowPackages.stable in replit.nix; that ships both `wine`
# (32-bit launcher) and `wine64` (64-bit launcher). We only USE `wine64`
# below; the 32-bit launcher is interesting only as a probe for whether the
# container's seccomp filter will allow 32-bit code at all (step 2).
# -----------------------------------------------------------------------------
log "Checking wine installation..."
if ! command -v wine64 >/dev/null 2>&1; then
  die "wine64 not on PATH. Add 'pkgs.wineWowPackages.stable' to replit.nix and reload the shell."
fi
WINE64_BIN="$(command -v wine64)"
WINE64_REAL="$(readlink -f "${WINE64_BIN}")"
log "wine64 binary: ${WINE64_BIN}"
log "  -> ${WINE64_REAL}"

if ! timeout 10 wine64 --version >/dev/null 2>&1; then
  die "wine64 --version timed out or failed. wineWowPackages.stable is not functioning. Re-check replit.nix."
fi
WINE_VERSION="$(timeout 10 wine64 --version 2>/dev/null || true)"
log "wine64 reports: ${WINE_VERSION}"

# -----------------------------------------------------------------------------
# Step 2: detect whether 32-bit code can run in this container.
#
# Replit's container kills 32-bit ELF binaries with SIGSYS as soon as they
# touch the i386 syscall ABI (Seccomp:2 / Seccomp_filters:2). We probe by
# running the 32-bit `wine` launcher with `--version`; if it crashes
# (exit code 132 = SIGILL or 159 = SIGSYS or generally != 0), 32-bit is
# blocked and NSIS is not viable.
# -----------------------------------------------------------------------------
I386_OK=0
if command -v wine >/dev/null 2>&1; then
  log "Probing whether 32-bit ELF execution is allowed by the container..."
  set +e
  timeout 5 wine --version >/dev/null 2>&1
  PROBE_EXIT=$?
  set -e
  if [[ ${PROBE_EXIT} -eq 0 ]]; then
    I386_OK=1
    log "  -> 32-bit ELF runs cleanly (exit 0). NSIS target is viable."
  else
    log "  -> 32-bit ELF probe exit ${PROBE_EXIT}. Container blocks i386 syscall ABI."
    log "     NSIS target is not viable here (NSIS Setup stub is a 32-bit PE)."
  fi
else
  warn "32-bit \`wine\` launcher not found — wineWowPackages.stable may be missing the WoW subset."
fi

# -----------------------------------------------------------------------------
# Step 3: choose the electron-builder target.
# -----------------------------------------------------------------------------
TARGET="${FORCE_TARGET:-}"
if [[ -z "${TARGET}" ]]; then
  if [[ ${I386_OK} -eq 1 ]]; then
    TARGET="nsis"
  else
    TARGET="portable"
  fi
fi
case "${TARGET}" in
  nsis|portable) ;;
  *) die "FORCE_TARGET must be 'nsis' or 'portable', got '${TARGET}'" ;;
esac
log "Selected electron-builder win.target = ${TARGET}"
if [[ "${TARGET}" == "nsis" && ${I386_OK} -ne 1 ]]; then
  warn "Forcing NSIS even though the 32-bit ABI probe failed. The build will almost certainly hang or crash"
  warn "the moment electron-builder tries to extract the NSIS uninstaller stub. You have been warned."
fi
if [[ "${TARGET}" == "portable" ]]; then
  warn "Portable .exe does NOT receive electron-updater auto-updates. Operators on this build must"
  warn "manually download the next release. Use this output for one-off emergency drops only."
fi

# -----------------------------------------------------------------------------
# Step 4: idempotent cleanup.
# Wipe the output dir AND the wineprefix so a half-finished prior attempt
# (e.g. one that started before WoW wine was installed) cannot poison this
# run. WINEARCH is locked into the prefix on first init, so reusing an old
# prefix that was created with WINEARCH=win32 would also break things.
# -----------------------------------------------------------------------------
log "Cleaning previous build artifacts..."
rm -rf "${RELEASE_DIR}"
rm -rf "${WINEPREFIX_DIR}"
mkdir -p "${RELEASE_DIR}"

# -----------------------------------------------------------------------------
# Step 5: bootstrap a pure-win64 wineprefix.
# WINEARCH=win64 tells wineboot to skip the 32-bit subsystem (syswow64)
# entirely. On Replit this is mandatory: the syswow64 init spawns 32-bit
# helper processes that get instakilled by the seccomp filter, leaving a
# half-formed prefix that wine64 then refuses to use.
# -----------------------------------------------------------------------------
export WINEPREFIX="${WINEPREFIX_DIR}"
export WINEARCH="win64"
export WINEDEBUG="${WINEDEBUG:--all}"
export WINEDLLOVERRIDES="${WINEDLLOVERRIDES:-mscoree=;mshtml=}"  # don't try to fetch mono / gecko

log "Bootstrapping win64-only wineprefix at ${WINEPREFIX}..."
if ! timeout 120 wine64 wineboot --init >/dev/null 2>&1; then
  die "wine64 wineboot --init failed or timed out. wineWowPackages.stable is not working. Check replit.nix."
fi
log "Waiting for wineserver to settle..."
timeout 30 wineserver -w || true

if [[ ! -d "${WINEPREFIX}/drive_c/windows/system32" ]]; then
  die "wineprefix bootstrap looks incomplete: ${WINEPREFIX}/drive_c/windows/system32 missing."
fi
SYS32_COUNT=$(ls "${WINEPREFIX}/drive_c/windows/system32" | wc -l)
log "Wineprefix bootstrapped: ${SYS32_COUNT} files in system32."

# -----------------------------------------------------------------------------
# Step 6: install dependencies (skippable).
# -----------------------------------------------------------------------------
cd "${APP_DIR}"
if [[ "${SKIP_INSTALL:-0}" != "1" ]]; then
  log "Running pnpm install (workspace root)..."
  ( cd "${REPO_ROOT}" && pnpm install --frozen-lockfile )
else
  log "SKIP_INSTALL=1 — skipping pnpm install."
fi

# -----------------------------------------------------------------------------
# Step 7: build the Next.js app + Electron main bundles (skippable).
# -----------------------------------------------------------------------------
if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  log "Building Next.js app (pnpm run build)..."
  pnpm run build

  log "Building Electron main process (pnpm run electron:build)..."
  pnpm run electron:build
else
  log "SKIP_BUILD=1 — skipping Next.js / Electron build, re-packaging existing artifacts."
fi

# -----------------------------------------------------------------------------
# Step 8: package via electron-builder.
#
# We override `win.target` on the CLI so we never need to edit
# electron-builder.yml between Linux emergency builds and the normal
# Windows GH Actions builds (which always want NSIS). The file stays
# canonical.
#
# `--publish never` keeps electron-builder from trying to upload to GitHub
# during an emergency local build (we ship the .exe out-of-band).
# -----------------------------------------------------------------------------
log "Running electron-builder --win (target=${TARGET})..."
WINEPREFIX="${WINEPREFIX}" WINEARCH="${WINEARCH}" WINEDEBUG="${WINEDEBUG}" \
  npx --no-install electron-builder \
    --config electron-builder.yml \
    --win "${TARGET}":x64 \
    --publish never

# -----------------------------------------------------------------------------
# Step 9: verify and report.
# -----------------------------------------------------------------------------
shopt -s nullglob
EXES=( "${RELEASE_DIR}"/*.exe )
if [[ ${#EXES[@]} -eq 0 ]]; then
  die "No .exe found in ${RELEASE_DIR}. electron-builder failed silently. Check the logs above."
fi

log "Build complete. Output:"
for exe in "${EXES[@]}"; do
  size_mb=$(( $(stat -c %s "${exe}") / 1024 / 1024 ))
  log "  ${exe}  (${size_mb} MB)"
done

log ""
log "Reminder: this .exe is UNSIGNED (no Authenticode). Windows SmartScreen will warn on first launch."
if [[ "${TARGET}" == "portable" ]]; then
  log "Reminder: portable target — operators on this build will NOT receive auto-updates."
fi
log "For a signed, NSIS, auto-update-capable build, push to GitHub and let GH Actions run the Windows job."
