// Renderer-side typing for the bridged API exposed by preload.ts
import type { ScriptureLiveApi } from './preload'

declare global {
  interface Window {
    scriptureLive?: ScriptureLiveApi
  }
}

export {}
