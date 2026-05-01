// v0.5.46 — Startup test email.
//
// Next.js 16 calls register() exactly once per server cold-start
// (i.e. every Node process boot — both `next dev` in the workspace
// and the production standalone server in the published deployment).
//
// Original v0.5.46 behaviour: send a test email on every cold-start
// unless SKIP_STARTUP_TEST_EMAIL=1 was set. This was useful during
// the initial SMTP setup but operators reported being spammed by
// these on every redeploy / restart once SMTP was already verified.
//
// v0.7.19 — Default flipped to OPT-IN. The startup test email now
// only fires when SEND_STARTUP_TEST_EMAIL=1 is explicitly set in
// the deployment secrets. Once an operator has confirmed SMTP works
// (one email is enough), they should NEVER receive another startup
// test email. For ad-hoc re-testing they can POST to the manual
// endpoint /api/license/test-email which fires a single email
// without restarting the server.
//
// SKIP_STARTUP_TEST_EMAIL=1 still works as before (no-op, since
// we're already off by default) so existing deployments that set
// it stay silent.

export async function register() {
  // instrumentation.ts is also called for the edge runtime; only
  // run our nodemailer / fs / nodejs-only code on the Node runtime.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // v0.7.18-hotfix — OPENAI_API_KEY load diagnostic.
  //
  // After the v0.7.18 ship a Ghana operator's transcription kept
  // failing with "OpenAI rejected the API key configured on the
  // server." even after the deployment OPENAI_API_KEY secret was
  // updated and the deployment was redeployed/stopped+started.
  // The 401 logs continued to show the OLD key suffix, suggesting
  // the running container wasn't picking up the new env var.
  //
  // This block prints the loaded key's LAST 6 CHARS (never the full
  // key) on every cold-start so we can grep deployment logs and see
  // exactly which key the runtime is using. OpenAI's own 401 error
  // message already echoes the same suffix back, so this leaks no
  // information not already in the logs.
  //
  // Once the rotation is fully verified the entire block can be
  // removed (it's < 30 lines and self-contained).
  const oaiKey = (process.env.OPENAI_API_KEY || '').trim()
  const oaiTail = oaiKey ? `...${oaiKey.slice(-6)}` : '(unset)'
  const oaiLen = oaiKey.length
  console.log(
    `[startup-key-check] OPENAI_API_KEY loaded: tail=${oaiTail} len=${oaiLen} ` +
      `(if this prints the same tail OpenAI is rejecting, the deployment secret ` +
      `update never propagated to the runtime)`,
  )

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
  // if the SMTP creds aren't there. Saves cold-start time and keeps
  // the warning message self-contained.
  // v0.5.54 — read via baked-credentials so the .exe (no env vars
  // set by default) still finds the operator's MAIL_* values.
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
    // Lazy-import so an edge build never pulls nodemailer in.
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
    // Never let a notification failure crash the server.
    console.error('[startup-test-email] crashed during send:', e)
  }
}
