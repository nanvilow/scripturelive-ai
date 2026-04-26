// GET  /api/license/master   — returns the master code (one-shot reveal)
// POST /api/license/master/email — emails the master code to nanvilow@gmail.com
//
// The master code is generated on first init (see storage.ts). The
// owner can read it from the licensing JSON file at any time, but for
// convenience we expose:
//
//   GET  → { masterCode, emailedAt }   (always; safe because access to
//                                        the dev console = access to
//                                        the file system anyway)
//   POST → triggers an email send + flips the masterCodeEmailedAt flag

import { NextResponse } from 'next/server'
import { getFile, markMasterEmailed } from '@/lib/licensing/storage'
import { notifyEmail, notifyWhatsApp } from '@/lib/licensing/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const f = getFile()
  return NextResponse.json({
    masterCode: f.masterCode,
    emailedAt: f.masterCodeEmailedAt,
    installId: f.installId,
  })
}

export async function POST() {
  const f = getFile()
  const body = [
    'ScriptureLive AI — Master Activation Code',
    '',
    `Install ID:    ${f.installId}`,
    `First launch:  ${f.firstLaunchAt}`,
    `Master code:   ${f.masterCode}`,
    '',
    'This code never expires and unlocks Live Transcription permanently',
    'on the install above. Keep it secret — anyone with this code can',
    'use Live Transcription on this machine forever.',
  ].join('\n')
  const e = await notifyEmail({ subject: 'ScriptureLive AI — Master Code (KEEP SAFE)', body })
  const w = await notifyWhatsApp({ subject: 'ScriptureLive AI Master Code', body })
  markMasterEmailed()
  return NextResponse.json({
    ok: true,
    masterCode: f.masterCode,
    email: { id: e.id, status: e.status, error: e.error },
    whatsapp: { id: w.id, link: w.waLink },
  })
}
