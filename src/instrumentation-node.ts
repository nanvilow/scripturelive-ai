// v0.7.170 — Node-only instrumentation, split out of `instrumentation.ts`
// because Turbopack's static analyzer prints an "A Node.js API is used"
// warning on EVERY compile when it sees `process.on` in the same module
// as `register()`, even though the runtime check at the top of register()
// short-circuits the edge bundle. Dynamic-importing this module from
// instrumentation.ts (gated on `process.env.NEXT_RUNTIME === 'nodejs'`)
// keeps the warning out of the dev console — the imported-app workflow
// card was showing red status because the warning printed on every page
// hit, even though typecheck and runtime are both healthy.

export async function registerNode() {
  // v0.7.86 — Last-resort crash guards for the bundled Next.js
  // server child process. ROOT CAUSE of the recurring "This page
  // couldn't load" chrome-error page that Windows operators keep
  // reporting (v0.7.82–v0.7.85): an unhandled exception inside an
  // async route handler — most often EPERM/EBUSY raised by
  // licensing storage.persist() when antivirus briefly locks the
  // rename target — was killing the whole Next child process. The
  // electron/main.ts auto-restart we shipped in v0.7.84 catches the
  // exit and respawns, but the renderer briefly sees the dead
  // server and Chromium paints its built-in error page until the
  // restart completes (which is what the screenshots show).
  //
  // The proper fix is to never let those errors crash the process
  // at all. We register catch-all handlers that LOG and keep going.
  // We register only once per process. `(globalThis as any).__SL_CRASH_GUARDS_INSTALLED`
  // protects against double-registration if Next reloads the module
  // (e.g. during HMR in `next dev`).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any
  if (!g.__SL_CRASH_GUARDS_INSTALLED) {
    g.__SL_CRASH_GUARDS_INSTALLED = true
    process.on('uncaughtException', (err) => {
      // eslint-disable-next-line no-console
      console.error('[crash-guard] uncaughtException — keeping process alive:', err)
    })
    process.on('unhandledRejection', (err) => {
      // eslint-disable-next-line no-console
      console.error('[crash-guard] unhandledRejection — keeping process alive:', err)
    })
    // eslint-disable-next-line no-console
    console.log('[crash-guard] installed uncaughtException + unhandledRejection handlers')
  }

  // v0.7.19 — Opt-IN gate. Default is OFF; the operator must
  // explicitly set SEND_STARTUP_TEST_EMAIL=1 to receive one. The
  // legacy SKIP_STARTUP_TEST_EMAIL=1 opt-out still short-circuits
  // for any deployment that already had it set.
  if (process.env.SKIP_STARTUP_TEST_EMAIL === '1') {
    console.log('[startup-test-email] skipped (SKIP_STARTUP_TEST_EMAIL=1)')
    return
  }
  if (process.env.SEND_STARTUP_TEST_EMAIL !== '1') {
    console.log(
      '[startup-test-email] skipped (default off; set SEND_STARTUP_TEST_EMAIL=1 ' +
        'to fire one on next boot, or POST /api/license/test-email for ad-hoc tests)',
    )
    return
  }

  // Cheap early-out: don't even import the notification machinery
  // if the SMTP creds aren't there.
  const { getMailHost, getMailUser, getMailPass, getMailFrom } =
    await import('./lib/baked-credentials')
  const host = getMailHost()
  const user = getMailUser()
  const pass = getMailPass()
  if (!host || !user || !pass) {
    console.warn(
      '[startup-test-email] SMTP not configured — set MAIL_HOST / MAIL_USER / ' +
        'MAIL_PASS / MAIL_FROM in the deployment secrets to receive operator ' +
        'notifications. Add SKIP_STARTUP_TEST_EMAIL=1 to silence this on every boot.',
    )
    return
  }

  try {
    const { notifyEmail } = await import('./lib/licensing/notifications')
    const { NOTIFICATION_EMAIL } = await import('./lib/licensing/plans')

    const ts = new Date().toISOString()
    const from = getMailFrom() || user
    const subject = `ScriptureLive AI - startup test email (${ts})`
    const body = [
      'This is an automatic test email from ScriptureLive AI.',
      '',
      'If you are reading this, your SMTP configuration is working',
      'correctly and real customer notifications will arrive at this',
      'address whenever someone:',
      '  - submits a payment screenshot through the Activate flow,',
      '  - is approved by you via the Ctrl+Shift+P admin panel,',
      '  - has their license activated.',
      '',
      'Configuration used for this test:',
      `  MAIL_HOST   = ${host}`,
      `  MAIL_USER   = ${user}`,
      `  MAIL_FROM   = ${from}`,
      `  Recipient   = ${NOTIFICATION_EMAIL}`,
      `  Server time = ${ts}`,
      '',
      'To stop receiving these test emails on every cold-start, set',
      'SKIP_STARTUP_TEST_EMAIL=1 in your Replit deployment secrets and',
      'redeploy.',
      '',
      '-- ScriptureLive AI',
    ].join('\n')

    console.log('[startup-test-email] sending test email to', NOTIFICATION_EMAIL, 'via', host, '...')
    const note = await notifyEmail({ subject, body })
    if (note.status === 'sent') {
      console.log('[startup-test-email] SUCCESS — delivered to', NOTIFICATION_EMAIL)
    } else {
      console.error(
        '[startup-test-email] FAILED — status =',
        note.status,
        '  error =',
        note.error || '(none reported)',
      )
    }
  } catch (e) {
    console.error('[startup-test-email] crashed during send:', e)
  }
}
