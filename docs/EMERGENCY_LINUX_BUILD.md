# Emergency Linux cross-build of the Windows .exe

> **TL;DR**: Don't use this unless you have to. The normal ship path is to push
> to GitHub and let the **Build Windows Installer** GitHub Actions workflow run
> on a real Windows runner. That path signs the .exe, produces a real NSIS
> installer with auto-update wiring, and uploads it to a GitHub Release.
>
> The emergency script auto-selects its target: it produces a real **NSIS Setup
> installer** when the host kernel allows 32-bit ELF execution, and falls back
> to a **portable, non-auto-updating .exe** when it doesn't (the current Replit
> container — see "Why" below). In both cases the .exe is **unsigned**. Use
> only when GitHub push is blocked and an operator needs an .exe in hand right
> now.

## When to use this

Run `scripts/linux-build-windows-exe.sh` **only** when **both** are true:

1. **GitHub push is blocked.** Examples: a leaked secret in commit history
   that needs rotation + history rewrite first; the GH repo itself is
   down; the operator's Actions minutes are exhausted.
2. **The operator needs a Windows .exe right now.** Examples: a customer
   demo in <1 hour; a hotfix the operator must install in production tonight.

Every other Windows build belongs on GitHub Actions.

## How to run it

```bash
bash scripts/linux-build-windows-exe.sh
```

The script is fully idempotent. It nukes `release/` and `~/.wine` between
runs so a half-finished previous attempt cannot poison the next one.

End-to-end runtime on a fresh Replit workspace is roughly:

| Step                                 | First run | Re-run with `SKIP_INSTALL=1 SKIP_BUILD=1` |
| ------------------------------------ | --------- | ----------------------------------------- |
| `pnpm install` (workspace)           | 2–4 min   | skipped                                   |
| `next build`                         | 1–2 min   | skipped                                   |
| `tsc -p electron/tsconfig.json`      | <30 s     | skipped                                   |
| `wine64 wineboot --init` (win64-only)| ~5 s      | ~5 s                                      |
| `electron-builder --win`             | 3–6 min   | 3–6 min                                   |

Useful environment overrides:

- `SKIP_INSTALL=1` — skip `pnpm install` (use right after a fresh install)
- `SKIP_BUILD=1` — skip `next build` + `electron:build`, only re-package
- `FORCE_TARGET=portable` — force portable even if 32-bit ABI is available
- `FORCE_TARGET=nsis` — force NSIS even if 32-bit ABI is blocked (will fail)
- `WINEDEBUG=+all` — full wine traces for debugging

## What you actually get

`artifacts/imported-app/release/ScriptureLive-AI-<version>-Setup-x64.exe`

The .exe **always** has correctly stamped PE metadata (icon, file
description, product name, version) — `wine64` runs `rcedit.exe` (a
64-bit Windows PE) cleanly, so the metadata-stamping step is reliable.

The **target** depends on what the host kernel allows:

- **NSIS Setup installer** if the host can execute 32-bit ELF binaries
  (any normal Linux desktop, or a Replit container after the seccomp
  filter is relaxed). Includes Start Menu / Programs & Features entries,
  a working uninstaller, and `electron-updater` differential auto-update
  on the next release (assuming you also upload `latest.yml`).
- **Portable .exe** if the host blocks the i386 syscall ABI (the current
  Replit container — see "Why" below). Single self-extracting executable,
  runs from anywhere, no install/uninstall, **no auto-update**.

The script auto-detects which path is viable on each invocation, so you
don't need to think about it. It also overrides the target on the
electron-builder CLI, so `electron-builder.yml` always stays canonical
(NSIS) for the GH Actions Windows builds.

## What you do NOT get

- **No Authenticode signature.** SmartScreen will warn "Unknown publisher"
  on first install/launch. The operator's `.pfx` cert is not in the
  Linux Replit container, and should not be.
- **No auto-publish to GitHub Releases.** The script runs with
  `--publish never`. To activate auto-update for users (NSIS path only),
  you'd need to upload the .exe AND the matching `release/latest.yml` to
  a GitHub Release manually, with the version in `latest.yml` matching
  the .exe.

## Why this is fragile (the actual root causes)

There are **two** distinct problems that have to be solved separately.

### 1. Wine 64-only can't bootstrap a wineprefix (FIXED)

The default `pkgs.wine64` in nixpkgs is 64-bit only. `wineboot` hangs
indefinitely at the `setupapi InstallHinfSection` step trying to set up
a wineprefix without a 32-bit subsystem.

**Fix**: `replit.nix` now uses `pkgs.wineWowPackages.stable` — the
**WoW** ("Windows on Windows") build that ships both 32-bit and 64-bit
subsystems. With the script's `WINEARCH=win64` lock-in, `wineboot --init`
finishes in ~5 seconds.

### 2. Replit's seccomp filter blocks 32-bit code execution (CONTAINER LIMIT)

The Replit container has `Seccomp:2` with a filter that kills 32-bit ELF
binaries with `SIGSYS` ("Bad system call") the moment they touch the
i386 syscall ABI. A static i386 hello-world doing nothing but `int 0x80`
exits with status 159 (= 128 + SIGSYS) without printing anything.

This affects everything 32-bit:

- The 32-bit `wine` launcher itself crashes if invoked.
- The NSIS Setup stub electron-builder runs to extract the uninstaller
  is a 32-bit PE — it would be loaded by the 32-bit wine launcher,
  which the kernel kills before it can run a single instruction.
- All 32-bit Windows `.dll`s loaded by 32-bit `.exe`s are also out.

**There is no workaround inside the container.** Running 32-bit code
needs the seccomp filter to be relaxed at the Replit infrastructure
level. Until then, NSIS-on-Linux-Replit is impossible regardless of
wine version.

`wine64` and 64-bit Windows PEs (including `rcedit.exe`) are NOT
affected — they run cleanly. So metadata stamping always works.

The script auto-falls-back to `win.target = portable` whenever the
32-bit probe fails, because portable doesn't need to invoke any 32-bit
PE during packaging — there's no uninstaller to extract.

## Comparison to the v0.7.32 manual workarounds

For posterity (and so you can recognize them in the v0.7.32 worktree):

- A no-op `wine` shell stub at `~/.local/bin/wine` that returned
  `wine-10.0` to the version probe and exited 0 silently for everything
  else, so electron-builder thought wine was working when it wasn't.
- A manual edit to `electron-builder.yml` flipping `win.target` from
  `nsis` to `portable` (and a manual revert before pushing).

Both are obsolete with this script:

- The `~/.local/bin/wine` stub is automatically removed at the start of
  each run (it now SHADOWS the real wine and breaks the build).
- `electron-builder.yml` stays on `nsis` permanently. The script
  overrides the target on the CLI per-invocation, so the canonical
  config is always correct for the GH Actions Windows path.

The .exe also now has proper metadata (icon, description, product
name, version), because `rcedit.exe` actually runs through `wine64`
under WoW wine — the v0.7.32 stub no-op'd it, so the .exe shipped with
default Electron metadata.

## Troubleshooting

- **`wine64 --version timed out`** — `replit.nix` is missing
  `pkgs.wineWowPackages.stable`. Re-add it and reload the shell.
- **`wine64 wineboot --init failed or timed out`** — same root cause.
  Verify with `readlink -f "$(command -v wine64)"` — the path must
  contain `wine-wow-*`, not `wine64-*`.
- **Script picked `portable` but I wanted NSIS** — the 32-bit ABI
  probe failed. Check by running `wine --version` directly; if it
  exits non-zero with no output, the seccomp filter is blocking
  i386 binaries and NSIS is not possible from this container.
  Push to GitHub and use the Windows runner instead.
- **`No .exe found`** — read the electron-builder log above. Most
  common cause: a stale `release/` from a previous run. The script
  cleans it before building, so a second attempt usually succeeds.
- **The .exe runs but doesn't auto-update** — expected for the
  portable target. Only NSIS-built .exe's published to a GH Release
  alongside their `latest.yml` get auto-updated.
