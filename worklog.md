---
Task ID: 1
Agent: Main
Task: Fix all user-reported issues for ScriptureLive AI

Work Log:
- Read all project files to understand current codebase state
- Fixed background image upload: Changed upload route to save to `uploads/` directory and serve files via GET handler on `/api/upload?file=filename` instead of relying on Next.js static file serving from `public/` (which doesn't hot-reload new files)
- Fixed speech recognition to never stop: Rewrote `use-speech-recognition.ts` to auto-restart on `onend` events and recover from transient network errors. Uses refs for restart scheduling to avoid circular callback dependencies
- Strengthened scripture detection: Added 4 new regex patterns to `bible-api.ts` for conversational references: "Book chapter X verse Y", abbreviated conversational "Gen ch3 v16", contextual "turn to / read in / as we see in", and "the Bible says in" patterns
- Added autocomplete for Bible search: Created `getAutocompleteSuggestions()` function in `bible-api.ts` that shows suggestions with just 2+ letters typed (e.g., "joh" shows John, "joh 10" shows John 10:1, "joh 10 30" shows John 10:30)
- Added auto go-live settings: Added `autoGoLiveOnDetection` and `autoGoLiveOnLookup` to store/AppSettings with toggle buttons in both the Scripture Detection view and Bible Lookup view, plus a dedicated settings section
- Added Enter key support: Enter key now shows results in Bible lookup, with arrow key navigation for autocomplete suggestions
- Added "Auto Go-Live on Lookup" toggle button in Bible Lookup view header
- Added Bible download/upload section in Settings with links to 4 public domain Bibles (KJV, WEB, ASV, YLT) and file import capability
- Added reset transcript button in Scripture Detection view
- All ESLint checks pass with 0 errors

Stage Summary:
- Files modified: `src/app/api/upload/route.ts`, `src/hooks/use-speech-recognition.ts`, `src/lib/bible-api.ts`, `src/lib/store.ts`, `src/components/views/bible-lookup.tsx`, `src/components/views/scripture-detection.tsx`, `src/components/views/settings.tsx`
- Background images now served through API route (no more Next.js static file caching issue)
- Speech recognition now continuously runs and auto-recovers from errors
- 6 total regex patterns for verse detection (up from 2)
- Autocomplete supports all 66 book names with multiple aliases each
- Auto go-live available as toggle in both detection and lookup views, configurable in settings

---
Task ID: 2
Agent: Main
Task: Make speech recognition persistent across all views (continue when switching pages, minimizing app)

Work Log:
- Analyzed architecture: `useSpeechRecognition` hook was only called inside `ScriptureDetectionView`, so it unmounted when switching views
- Added 7 new state fields to Zustand store: `liveTranscript`, `liveInterimTranscript`, `speechSupported`, `speechError`, `speechCommand` (not persisted to localStorage)
- Created `SpeechProvider` component at `src/components/providers/speech-provider.tsx`:
  - Wraps the entire app and never unmounts
  - Uses `useSpeechRecognition` hook internally at the top level
  - Syncs all speech state (transcript, interim, isListening, error, supported) to the Zustand store via effects
  - Handles verse detection processing on every speech result (using `useAppStore.getState()` for latest state to avoid stale closures)
  - Processes auto go-live logic without navigating away from current page
  - Uses a ref-based callback pattern (`processCallbackRef`) to ensure the latest processing logic is always used
  - Responds to `speechCommand` from store ('start', 'stop', 'reset') for cross-component control
- Updated `page.tsx`: Wrapped `AppContent` with `SpeechProvider`
- Rewrote `ScriptureDetectionView`: Removed local `useSpeechRecognition` hook call, now reads all speech state from the store and controls via `setSpeechCommand()`
- Updated `AppShell`: Enhanced header with pulsing "LISTENING" badge on all pages when active, dynamic Mic button text
- Fixed ESLint `react-hooks/refs` error by moving ref assignment into `useEffect`
- All ESLint checks pass (0 errors), dev server compiles successfully

Stage Summary:
- Speech recognition now persists across ALL view changes, app minimization, and tab switching
- The LIVE/LISTENING indicator appears in the header on every page when active
- Verse detection and auto go-live continue working even when user is on a different page
- Files modified: `src/lib/store.ts`, `src/components/providers/speech-provider.tsx` (new), `src/app/page.tsx`, `src/components/views/scripture-detection.tsx`, `src/components/layout/app-shell.tsx`

---
Task ID: 3
Agent: Main
Task: Fix NDI output for vMix/Wirecast with limited video connectivity

Work Log:
- Analyzed existing NDI architecture: separate WebSocket service on port 3003, congregation display using Zustand store (only works in same browser), no auto-reconnect, no keepalive
- Discovered output service (port 3003) was NOT running and standalone processes are killed by the sandbox environment
- Discovered Caddy uses IPv6 (`[::1]`) while output service only bound to IPv4 (`0.0.0.0`) - causing 502 errors
- **Pivoted from WebSocket to SSE (Server-Sent Events)** approach - no separate process needed, works through normal HTTP:
  - Created `src/lib/output-broadcast.ts` - in-memory SSE broadcast manager with subscriber tracking
  - Created `src/app/api/output/route.ts` - GET endpoint for SSE stream, POST endpoint for slide updates, OPTIONS for CORS
  - Created `src/app/api/output/congregation/route.ts` - serves standalone congregation HTML page that connects via SSE (EventSource API) with auto-reconnect
- Rewrote `src/components/views/live-presenter.tsx`:
  - Replaced WebSocket connection with simple HTTP POST to `/api/output` for sending slide updates
  - Added output service status polling (subscriber count)
  - Added "Output" toggle button with subscriber count display
  - Auto-activates output when NDI/WebSocket mode is selected in settings
  - Built-in setup guide card with step-by-step NDI instructions
- Updated `src/components/views/settings.tsx`:
  - Updated NDI/vMix/Wirecast guide with correct SSE-based URLs (`/api/output/congregation`)
  - Updated troubleshooting section (no extra ports needed, no firewall changes)
  - Updated limited connectivity section (works through normal HTTP)
- All ESLint checks pass (0 errors), dev server compiles successfully

Stage Summary:
- NDI output completely rewritten using SSE instead of WebSocket - no separate process needed
- Congregation display connects via EventSource (auto-reconnects, works in any browser window)
- Live presenter sends slide updates via simple HTTP POST
- `/api/output/congregation` serves a standalone fullscreen display page
- `/api/output` SSE endpoint streams real-time updates to all connected displays
- No extra ports to open, no firewall changes, no separate service to manage
- Files modified: `src/lib/output-broadcast.ts` (new), `src/app/api/output/route.ts` (new), `src/app/api/output/congregation/route.ts` (new), `src/components/views/live-presenter.tsx`, `src/components/views/settings.tsx`
