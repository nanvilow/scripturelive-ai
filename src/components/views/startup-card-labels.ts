/**
 * Stable selector constants for `<StartupCard />`. Lives in its own
 * file (no React / UI-primitive imports) so the close-button UI E2E
 * (`electron/e2e/startup-card-ui.e2e.test.ts`) can `import` from
 * here without dragging in `@/components/ui/*` — those aliases are
 * resolved by Next + esbuild, not by vitest's plain-node test
 * environment, so importing from `startup-card.tsx` directly would
 * break the test loader.
 *
 * If a copy edit changes the rendered aria-label below, both the
 * production component AND the E2E test stay in sync because they
 * both read it from this single source.
 */
export const QUIT_ON_CLOSE_SWITCH_LABEL =
  'Quit ScriptureLive AI when the main window is closed'
