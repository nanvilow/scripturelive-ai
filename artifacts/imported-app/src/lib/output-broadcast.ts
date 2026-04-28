/**
 * SSE (Server-Sent Events) broadcast manager for congregation output.
 *
 * This runs in-memory within the Next.js server process. When the live presenter
 * sends a slide update, it calls the API route which broadcasts to all connected
 * congregation displays via SSE.
 *
 * No separate process needed — works through normal HTTP.
 */

export type OutputEventType = 'state' | 'ping'

export interface OutputSlide {
  id: string
  type: string
  title: string
  subtitle: string
  content: string[]
  background: string
  notes?: string
  mediaUrl?: string
  mediaKind?: 'image' | 'video'
  mediaFit?: 'fit' | 'fill' | 'stretch' | '16:9' | '4:3'
  // Operator transport state for video media. When true the
  // congregation renderer must call .pause() on the live <video>
  // element WITHOUT rebuilding it (which would jump back to t=0),
  // so video, broadcast and operator preview stay frame-accurate.
  mediaPaused?: boolean
}

export interface OutputState {
  type: 'slide' | 'clear'
  slide?: OutputSlide | null
  // Optional next-slide hint for the stage display (speaker view).
  nextSlide?: OutputSlide | null
  // Optional 1-based progress info for the stage display.
  slideIndex?: number
  slideTotal?: number
  // Speaker notes and a countdown timer the speaker can see on
  // the stage display. countdownEndAt is a Unix-ms epoch.
  sermonNotes?: string
  countdownEndAt?: number | null
  isLive: boolean
  // When true, the secondary screen / NDI feed should show a centred
  // branded splash (transparent background) instead of an empty stage.
  // Trips to false the moment the operator first sends content.
  showStartupLogo?: boolean
  displayMode: string
  settings: {
    fontSize: string
    fontFamily: string
    textShadow: boolean
    showReferenceOnOutput: boolean
    lowerThirdHeight: string
    lowerThirdPosition: string
    customBackground: string | null
    congregationScreenTheme: string
    // v0.6.2 — every NDI tab control is now broadcast through the
    // same SSE channel so the in-app NDI Live Preview iframe + every
    // downstream NDI receiver renders against the operator's chosen
    // overrides (font/size/shadow/align/scale/aspect, bible
    // color/lineheight, reference style/position/scale, translation,
    // custom background, theme, lower-third positioning, reference-
    // on-output toggle, reference text shadow). Typed loosely
    // (`unknown`) on purpose — the renderer narrows per field.
    ndiFontFamily?: unknown
    ndiFontSize?: unknown
    ndiTextShadow?: unknown
    ndiTextAlign?: unknown
    ndiTextScale?: unknown
    ndiAspectRatio?: unknown
    ndiBibleColor?: unknown
    ndiBibleLineHeight?: unknown
    ndiRefSize?: unknown
    ndiRefStyle?: unknown
    ndiRefPosition?: unknown
    ndiRefScale?: unknown
    ndiTranslation?: unknown
    ndiCustomBackground?: unknown
    ndiTheme?: unknown
    ndiLowerThirdHeight?: unknown
    ndiLowerThirdPosition?: unknown
    /** v0.6.3 — operator's transparent-matte toggle for the NDI lower
     *  third. Renderer reads this and adds the `transparent` class to
     *  `.lt-box` so vMix/OBS receive a clean alpha matte. */
    ndiLowerThirdTransparent?: unknown
    /** v0.6.4 — Operator-tunable size multiplier for the NDI lower
     *  third. Multiplies font sizes + box width on the NDI surface
     *  only. Honoured server-side when IS_NDI=true; the in-room
     *  projector and live preview ignore it. */
    ndiLowerThirdScale?: unknown
    ndiShowReferenceOnOutput?: unknown
    ndiReferenceTextShadow?: unknown
    ndiDisplayMode?: unknown
    /** v0.6.9 — Reference-typography fields. Each is optional;
     *  `undefined` means "fall back to the body equivalent above".
     *  Pre-v0.6.9 these were never broadcast, so the renderer's
     *  `st.referenceFontSize` etc. lookup always saw `undefined` on
     *  the secondary screen and the operator's per-reference picks
     *  silently no-op'd. Typed loosely (`unknown` / specific union)
     *  on purpose — the renderer narrows per field. */
    referenceFontSize?: 'sm' | 'md' | 'lg' | 'xl'
    referenceFontFamily?: string
    referenceTextShadow?: boolean
    referenceTextScale?: number
    referenceTextAlign?: 'left' | 'center' | 'right' | 'justify'
    /** v0.6.9 — Operator-controlled Bible body line-height that
     *  applies to BOTH the secondary screen AND the NDI feed (when
     *  no NDI-only override is set). Default 1.4. */
    bibleLineHeight?: number
    slideTransitionStyle?: string
    slideTransitionDuration?: number
  }
  timestamp: number
}

// In-memory state (survives hot reloads)
let currentState: OutputState = {
  type: 'clear',
  isLive: false,
  showStartupLogo: true,
  displayMode: 'full',
  settings: {
    fontSize: 'lg',
    fontFamily: 'sans',
    textShadow: true,
    showReferenceOnOutput: true,
    lowerThirdHeight: 'md',
    lowerThirdPosition: 'bottom',
    customBackground: null,
    congregationScreenTheme: 'minimal',
  },
  timestamp: Date.now(),
}

const subscribers = new Set<{
  id: string
  write: (data: string) => boolean
}>()

let subscriberIdCounter = 0

/**
 * Get the current output state.
 */
export function getOutputState(): OutputState {
  return currentState
}

/**
 * Update the output state and broadcast to all subscribers.
 */
export function updateOutputState(partial: Partial<OutputState>): OutputState {
  currentState = {
    ...currentState,
    ...partial,
    // Once any slide has been broadcast (type === 'slide'), the
    // startup splash is over — keep the flag false for the rest of
    // the process lifetime so the congregation never sees the splash
    // bounce back between songs.
    showStartupLogo:
      partial.type === 'slide'
        ? false
        : (partial.showStartupLogo ?? currentState.showStartupLogo),
    timestamp: Date.now(),
  }

  // Broadcast to all SSE subscribers
  broadcast({ ...currentState, event: 'state' })

  return currentState
}

/**
 * Subscribe to output state changes. Returns an unsubscribe function.
 */
export function subscribeToOutput(write: (data: string) => boolean): { id: string; unsubscribe: () => void } {
  const id = `sub-${++subscriberIdCounter}`
  const subscriber = { id, write }
  subscribers.add(subscriber)

  // Send current state immediately
  try {
    write(`data: ${JSON.stringify({ ...currentState, event: 'state' })}\n\n`)
  } catch {
    // Client might have disconnected already
  }

  return {
    id,
    unsubscribe: () => {
      subscribers.delete(subscriber)
    },
  }
}

/**
 * Broadcast an event to all subscribers. Removes dead connections.
 */
function broadcast(event: Record<string, unknown>) {
  const data = `data: ${JSON.stringify(event)}\n\n`
  const toRemove: { id: string; write: (d: string) => boolean }[] = []

  subscribers.forEach((sub) => {
    try {
      const ok = sub.write(data)
      if (!ok) toRemove.push(sub)
    } catch {
      toRemove.push(sub)
    }
  })

  // Clean up dead connections
  toRemove.forEach((sub) => subscribers.delete(sub))
}

/**
 * Get the number of connected subscribers.
 */
export function getSubscriberCount(): number {
  return subscribers.size
}
