// v0.5.52 — Cloud-key override endpoint.
//
// Returns the admin-provided OpenAI / Deepgram key overrides (or
// empty strings when none are saved). The renderer reads this once on
// app start via `bootstrapRuntimeKeys()` and uses the override in
// preference to the baked NEXT_PUBLIC_* defaults.
//
// SECURITY NOTE — this endpoint runs ONLY inside the operator's
// Electron install (the bundled Next.js standalone server is bound to
// 127.0.0.1). It is NOT mounted on the public api-server. The same
// physical file (license.json) holds the override; admin sets it via
// /api/license/admin/config (extended in v0.5.52 to accept
// adminOpenAIKey / adminDeepgramKey).

import { NextResponse } from 'next/server'
import { getConfig } from '@/lib/licensing/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const cfg = getConfig() ?? {}
  return NextResponse.json(
    {
      openai: cfg.adminOpenAIKey ?? null,
      deepgram: cfg.adminDeepgramKey ?? null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
