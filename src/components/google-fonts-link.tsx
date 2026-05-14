'use client'

import { useEffect } from 'react'
import { googleFontsHref } from '@/lib/fonts'

/**
 * Injects the Google Fonts stylesheet link client-side only.
 *
 * Doing this server-side caused a React hydration mismatch in dev because
 * the Replit dev-tools script (`/__replco/static/devtools/injected.js`)
 * also lives in the server-rendered `<head>` but is not present on the
 * client, so React's reconciliation of `<head>` children failed. Loading
 * the link from `useEffect` keeps the server HTML untouched and avoids the
 * mismatch entirely while still pulling the operator's chosen fonts when
 * the machine is online.
 */
export function GoogleFontsLink() {
  useEffect(() => {
    if (typeof document === 'undefined') return
    const id = 'scripturelive-google-fonts'
    if (document.getElementById(id)) return
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = googleFontsHref
    document.head.appendChild(link)
  }, [])
  return null
}
