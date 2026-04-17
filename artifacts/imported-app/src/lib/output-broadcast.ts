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

export interface OutputState {
  type: 'slide' | 'clear'
  slide?: {
    id: string
    type: string
    title: string
    subtitle: string
    content: string[]
    background: string
  } | null
  isLive: boolean
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
  }
  timestamp: number
}

// In-memory state (survives hot reloads)
let currentState: OutputState = {
  type: 'clear',
  isLive: false,
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
    timestamp: Date.now(),
  }

  // Broadcast to all SSE subscribers
  broadcast({ type: 'state', ...currentState })

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
    write(`data: ${JSON.stringify({ type: 'state', ...currentState })}\n\n`)
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
