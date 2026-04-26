// v0.5.46 — Startup test email.
//
// Next.js 16 calls register() exactly once per server cold-start
// (i.e. every Node process boot — both `next dev` in the workspace
// and the production standalone server in the published deployment).
//
// Operator request after the SMTP setup walkthrough: "Send a test
// email when app starts." Goal is to give them an instant
// confirmation that the MAIL_HOST/MAIL_USER/MAIL_PASS/MAIL_FROM
// secrets they pasted into the deployment Settings actually work,
// without having to wait for a real customer to submit a payment
// screenshot.
//
// Behavior:
//   - If SMTP env vars are missing, log a clear warning to the
//     deployment console and exit (no crash).
//   - If SMTP is configured, send one test email to NOTIFICATION_EMAIL
//     (nanvilow@gmail.com) and log SUCCESS / FAILED + reason.
//   - The operator can suppress the test by setting
//     SKIP_STARTUP_TEST_EMAIL=1 in the deployment secrets after
//     they're satisfied.
//
// The email body explains exactly what configuration was used, so
// when the operator opens it they immediately see which secrets are
// in play (MAIL_HOST, MAIL_USER, MAIL_FROM — never the password).

export async function register() {
  // instrumentation.ts is also called for the edge runtime; only
  // run our nodemailer / fs / nodejs-only code on the Node runtime.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // Operator opt-out for after they're done verifying.
  if (process.env.SKIP_STARTUP_TEST_EMAIL === '1') {
    console.log('[startup-test-email] skipped (SKIP_STARTUP_TEST_EMAIL=1)')
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
