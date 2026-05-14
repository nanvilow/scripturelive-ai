/**
 * Renderer-side entry for the UI-driven close-button E2E test.
 *
 * Mounts ONLY the production `<StartupCard />` — the same component
 * shipped to operators inside Settings. Bundled by
 * `scripts/build-e2e-ui.mjs` (esbuild) into
 * `dist-electron-ui/harness.bundle.js` and loaded by the test
 * harness BrowserWindow via `harness.html`.
 *
 * Critically, this DOES NOT mock or wrap any of the StartupCard's
 * IPC plumbing — it relies on the production preload (`preload.ts`)
 * being loaded into the same window so that
 * `window.scriptureLive.quitOnClose.set` is the real
 * `ipcRenderer.invoke('app:set-quit-on-close', value)`. Clicking
 * the rendered Radix `<Switch>` therefore round-trips through:
 *   Switch.onCheckedChange
 *     → handleQuitOnCloseToggle
 *     → window.scriptureLive.quitOnClose.set
 *     → ipcRenderer.invoke('app:set-quit-on-close')
 *     → main-process handler in `test-entry.ts`
 *     → preferences.json on disk
 * If any link in that chain breaks, the UI E2E goes red.
 */
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import { StartupCard } from '../../src/components/views/startup-card'

const container = document.getElementById('root')
if (!container) throw new Error('harness.html is missing #root')

createRoot(container).render(
  <>
    <StartupCard />
    {/* Mounting the toaster keeps `toast.success(...)` calls in
        StartupCard from spamming console.warn during the test. */}
    <Toaster />
  </>,
)
