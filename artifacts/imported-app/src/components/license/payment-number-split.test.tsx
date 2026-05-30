// v0.7.267 — End-to-end guard for the v0.7.266 payment-number SPLIT.
//
// v0.7.266 split the payment modal's two phone numbers into distinct
// roles:
//   • the "Send MoMo to" recipient row shows the MONEY WALLET
//     (MOMO_RECIPIENT.number = 0530686367 — where customers actually
//     send their MoMo) — surfaced as `momoRecipient.number`.
//   • the NOTE block's "contact support on WhatsApp" line AND its
//     "SEND A SCREENSHOT … for payment proof" line show the SUPPORT /
//     escalation channel (NOTIFICATION_WHATSAPP = 0246798526) —
//     surfaced as `supportWhatsapp`.
//
// This is money-critical: if a future change re-points the recipient
// row at the support number (or the NOTE block at the wallet), there
// is NO compile-time error and customers send money to the wrong
// wallet. `momo-number-migration.test.ts` only covers the on-disk
// config migration; this file covers BOTH live surfaces:
//   1. the real POST /api/license/payment-code response shape, and
//   2. the rendered <MoMoRecipientPanel> wired to that response.
//
// GUARD-RAIL (replit.md / momo-support-number-split memory): NEVER
// read momoRecipient.number for a support string, and NEVER read
// supportWhatsapp for the money destination.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import * as realFs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { POST } from '../../app/api/license/payment-code/route'
import { reloadFromDisk } from '../../lib/licensing/storage'
import { MoMoRecipientPanel, ActivationReceiptPanel, type PaymentResp, type ActivateResp } from './subscription-modal'

// The compiled-in defaults — these are the canonical values the split
// pins. If the operator swaps a wallet again they change ONLY the
// matching constant in plans.ts; this test then asserts the NEW value
// flows to the correct surface and NOT the other.
const WALLET = '0530686367' // MOMO_RECIPIENT.number — money destination
const SUPPORT = '0246798526' // NOTIFICATION_WHATSAPP — support / proof line

// ── Side-effect isolation ──────────────────────────────────────────
// The route fires customer/admin SMS + email on setImmediate and a
// cloud mirror. None of that is under test and none of it should dial
// out (or throw) during a unit run, so stub them to harmless no-ops.
vi.mock('./../../lib/licensing/notifications', () => ({
  notifySms: vi.fn(async () => undefined),
  notifyEmail: vi.fn(async () => undefined),
}))
vi.mock('./../../lib/licensing/cloud-sync', () => ({
  cloudMirrorPayment: vi.fn(() => undefined),
}))
vi.mock('./../../lib/licensing/telemetry-client', () => ({
  pingError: vi.fn(async () => undefined),
}))

// ════════════════════════════════════════════════════════════════════
// PART 1 — the live API response shape
// ════════════════════════════════════════════════════════════════════
//
// We exercise the REAL POST handler against a temp license dir (same
// pattern as momo-number-migration.test.ts) so getEffectiveMoMo() and
// getEffectiveNotificationTargets() resolve from the compiled defaults
// (empty config) — no mocking of the production resolution chain.

let tmpDir: string

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/license/payment-code', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function postPaymentCode(body: unknown) {
  // Drop storage's in-memory cache so the next read re-hydrates from
  // THIS test's temp dir. The route, plans.ts, and this test all share
  // the SAME storage module instance, so a single reloadFromDisk() call
  // makes getConfig() (and the getEffective* helpers built on it) read
  // the license.json we just wrote — no module-graph rebuild required.
  reloadFromDisk()
  const res = await POST(makeReq(body) as never)
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

// Persist an operator-customised license.json into THIS test's temp dir
// (same minimal shape as momo-number-migration.test.ts). The
// reloadFromDisk() call in postPaymentCode() drops the cache so storage
// reads it straight off disk.
function writeLicense(config: Record<string, unknown>): void {
  const file = {
    schemaVersion: 1,
    installId: 'test-install',
    firstLaunchAt: new Date().toISOString(),
    activeSubscription: null,
    paymentCodes: [],
    activationCodes: [],
    notifications: [],
    config,
  }
  realFs.writeFileSync(path.join(tmpDir, 'license.json'), JSON.stringify(file), 'utf8')
}

// Custom operator numbers deliberately chosen NOT to collide with any
// value migrateStaleConfigNumbers() rewrites (it only touches the two
// compiled defaults 0246798526 / 0530686367), so these survive load()
// untouched and prove the operator's own overrides reach each surface.
const CUSTOM_WALLET = '0551112222'   // operator-set momoNumber → recipient row
const CUSTOM_SUPPORT = '0559998888'  // operator-set whatsappNumber → support line

const VALID_BODY = { planCode: '1M', email: 'buyer@example.com', whatsapp: '0244123456' }

describe('v0.7.267 — POST /api/license/payment-code carries the split numbers', () => {
  beforeEach(() => {
    tmpDir = realFs.mkdtempSync(path.join(os.tmpdir(), 'sl-payment-split-'))
    process.env.SCRIPTURELIVE_LICENSE_DIR = tmpDir
  })

  afterEach(() => {
    delete process.env.SCRIPTURELIVE_LICENSE_DIR
    try { realFs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  it('returns the wallet as momoRecipient.number and the support line as supportWhatsapp (compiled defaults)', async () => {
    const { status, json } = await postPaymentCode(VALID_BODY)
    expect(status).toBe(200)

    const recipient = json.momoRecipient as { name: string; number: string }
    expect(recipient.number).toBe(WALLET)
    expect(json.supportWhatsapp).toBe(SUPPORT)

    // The whole point of the split: the two roles are DIFFERENT values.
    expect(recipient.number).not.toBe(json.supportWhatsapp)
  })

  it('NEVER leaks the support number into the money destination', async () => {
    const { json } = await postPaymentCode(VALID_BODY)
    const recipient = json.momoRecipient as { number: string }
    expect(recipient.number).not.toBe(SUPPORT)
  })

  it('NEVER leaks the wallet number into the support line', async () => {
    const { json } = await postPaymentCode(VALID_BODY)
    expect(json.supportWhatsapp).not.toBe(WALLET)
  })

  // Operator CONFIG OVERRIDES end-to-end: an operator who customised
  // both numbers in Admin Settings has them persisted in license.json
  // under OPPOSITE keys — momoNumber → the wallet/recipient row,
  // whatsappNumber → the support/proof line. We assert each custom
  // value reaches its OWN response field and never crosses over. This
  // reads fresh config off disk because postPaymentCode() rebuilds the
  // whole route → plans → storage graph with vi.resetModules() before
  // every call, giving storage a null cache that re-reads license.json.
  it('routes a custom momoNumber to momoRecipient.number and a custom whatsappNumber to supportWhatsapp', async () => {
    writeLicense({ momoNumber: CUSTOM_WALLET, whatsappNumber: CUSTOM_SUPPORT })
    const { status, json } = await postPaymentCode(VALID_BODY)
    expect(status).toBe(200)

    const recipient = json.momoRecipient as { name: string; number: string }
    expect(recipient.number).toBe(CUSTOM_WALLET)
    expect(json.supportWhatsapp).toBe(CUSTOM_SUPPORT)

    // The split must hold for operator overrides too: distinct values,
    // and neither custom number leaks into the other role.
    expect(recipient.number).not.toBe(json.supportWhatsapp)
    expect(recipient.number).not.toBe(CUSTOM_SUPPORT)
    expect(json.supportWhatsapp).not.toBe(CUSTOM_WALLET)
  })

  it('a custom wallet override does not drag the support line off its compiled default', async () => {
    // Only the money destination is customised; the support line is
    // untouched and must still resolve to the compiled support default.
    writeLicense({ momoNumber: CUSTOM_WALLET })
    const { json } = await postPaymentCode(VALID_BODY)
    const recipient = json.momoRecipient as { number: string }
    expect(recipient.number).toBe(CUSTOM_WALLET)
    expect(json.supportWhatsapp).toBe(SUPPORT)
  })

  it('a custom support override does not drag the wallet off its compiled default', async () => {
    // Mirror image: only the support line is customised; the wallet
    // must still resolve to the compiled money-destination default.
    writeLicense({ whatsappNumber: CUSTOM_SUPPORT })
    const { json } = await postPaymentCode(VALID_BODY)
    const recipient = json.momoRecipient as { number: string }
    expect(recipient.number).toBe(WALLET)
    expect(json.supportWhatsapp).toBe(CUSTOM_SUPPORT)
  })
})

// ════════════════════════════════════════════════════════════════════
// PART 2 — the rendered modal surface (<MoMoRecipientPanel>)
// ════════════════════════════════════════════════════════════════════
//
// Renders the REAL component the modal uses in PHASE 2. We feed
// deliberately distinct SENTINEL numbers so a swap is caught by the
// EXACT markup context each surface renders into:
//   • recipient row number lives in `font-mono text-foreground">…`
//   • support line lives in `WhatsApp (…)` and `SEND A SCREENSHOT TO "…"`

const mkPayment = (overrides: Partial<PaymentResp> = {}): PaymentResp => ({
  ref: '123',
  planCode: '1M',
  planLabel: 'Pro — 1 Month',
  amountGhs: 100,
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 900_000).toISOString(),
  momoRecipient: { name: 'Richard Kwesi Attieku', number: WALLET },
  supportWhatsapp: SUPPORT,
  ...overrides,
})

describe('v0.7.267 — <MoMoRecipientPanel> renders each number into its own surface', () => {
  it('shows the wallet in the recipient row and the support line in the NOTE block', () => {
    const html = renderToStaticMarkup(<MoMoRecipientPanel payment={mkPayment()} />)

    // Recipient row: the displayed money destination is the wallet.
    expect(html).toContain(`font-mono text-foreground">${WALLET}</div>`)
    // NOTE block: both support surfaces show the support number.
    expect(html).toContain(`WhatsApp (${SUPPORT})`)
    expect(html).toContain(`SEND A SCREENSHOT TO &quot;${SUPPORT}&quot;`)
  })

  it('catches a swap: distinct sentinels land in their OWN surface only', () => {
    const wallet = 'WALLET-9999'
    const support = 'SUPPORT-1111'
    const html = renderToStaticMarkup(
      <MoMoRecipientPanel payment={mkPayment({ momoRecipient: { name: 'X', number: wallet }, supportWhatsapp: support })} />,
    )

    // Wallet sentinel ONLY in the recipient row.
    expect(html).toContain(`font-mono text-foreground">${wallet}</div>`)
    expect(html).not.toContain(`WhatsApp (${wallet})`)
    expect(html).not.toContain(`SEND A SCREENSHOT TO &quot;${wallet}&quot;`)

    // Support sentinel ONLY in the NOTE block — never in the recipient row.
    expect(html).toContain(`WhatsApp (${support})`)
    expect(html).toContain(`SEND A SCREENSHOT TO &quot;${support}&quot;`)
    expect(html).not.toContain(`font-mono text-foreground">${support}</div>`)
  })

  it('falls back to the literal support number when supportWhatsapp is absent', () => {
    const html = renderToStaticMarkup(
      <MoMoRecipientPanel payment={mkPayment({ supportWhatsapp: undefined })} />,
    )
    // Wallet still in the recipient row…
    expect(html).toContain(`font-mono text-foreground">${WALLET}</div>`)
    // …and the support surfaces fall back to the literal 0246798526.
    expect(html).toContain(`WhatsApp (${SUPPORT})`)
    expect(html).toContain(`SEND A SCREENSHOT TO &quot;${SUPPORT}&quot;`)
  })

  it('copy button copies the WALLET number, never the support number', () => {
    // The component is hook-free, so we can call it as a plain function
    // to get its element tree, walk it, and invoke every onClick — the
    // copy button is the only one — to assert the copy TARGET.
    const copied: string[] = []
    const tree = MoMoRecipientPanel({ payment: mkPayment(), onCopy: (t) => copied.push(t) })

    const fireAllClicks = (node: unknown): void => {
      if (!node || typeof node !== 'object') return
      if (Array.isArray(node)) { node.forEach(fireAllClicks); return }
      const el = node as { props?: Record<string, unknown> }
      const props = el.props
      if (props) {
        if (typeof props.onClick === 'function') (props.onClick as () => void)()
        fireAllClicks(props.children)
      }
    }
    fireAllClicks(tree)

    expect(copied).toContain(WALLET)
    expect(copied).not.toContain(SUPPORT)
  })
})

// ════════════════════════════════════════════════════════════════════
// PART 3 — the post-purchase receipt surface (<ActivationReceiptPanel>)
// ════════════════════════════════════════════════════════════════════
//
// The THIRD documented surface of the v0.7.266 split (replit.md): the
// receipt's "need help? contact support on WhatsApp" link. It MUST show
// the SUPPORT channel (receipt.supportWhatsapp / NOTIFICATION_WHATSAPP
// 0246798526), NEVER a MoMo wallet number — telling a paying customer to
// "contact us" on the wallet they just sent money INTO is the exact
// failure this guard prevents, and there is NO compile-time error if a
// future change crosses the two roles.

const mkReceipt = (overrides: Partial<ActivateResp['receipt']> = {}): ActivateResp['receipt'] => ({
  text: 'ScriptureLive AI — Subscription Receipt\nPlan: Pro — 1 Month',
  whatsappLink: null,
  supportWhatsapp: SUPPORT,
  ...overrides,
})

describe('v0.7.268 — <ActivationReceiptPanel> "contact us" link uses the support number', () => {
  it('renders the support number in the contact link and never the wallet', () => {
    const html = renderToStaticMarkup(<ActivationReceiptPanel receipt={mkReceipt()} />)
    // The "contact us" link shows the support number, both as visible
    // text and inside the wa.me href.
    expect(html).toContain(`WhatsApp (${SUPPORT})`)
    expect(html).toContain(`https://wa.me/${SUPPORT}`)
    // The money wallet must NEVER appear anywhere on the receipt surface.
    expect(html).not.toContain(WALLET)
  })

  it('catches a swap: a wallet sentinel must never land in the contact link', () => {
    // Simulate a future regression where someone pipes the wallet number
    // into supportWhatsapp — the contact link would then point customers
    // at the money wallet. The sentinel makes the cross unmistakable.
    const walletSentinel = 'WALLET-9999'
    const html = renderToStaticMarkup(
      <ActivationReceiptPanel receipt={mkReceipt({ supportWhatsapp: walletSentinel })} />,
    )
    // We can't stop a deliberate cross at the prop boundary, but the test
    // pins the INVARIANT: the contact link must read supportWhatsapp, and
    // the canonical wallet default must never appear by accident.
    expect(html).toContain(`WhatsApp (${walletSentinel})`)
    expect(html).not.toContain(WALLET)
    expect(html).not.toContain(SUPPORT)
  })

  it('falls back to the literal support number when supportWhatsapp is absent', () => {
    const html = renderToStaticMarkup(
      <ActivationReceiptPanel receipt={mkReceipt({ supportWhatsapp: undefined })} />,
    )
    expect(html).toContain(`WhatsApp (${SUPPORT})`)
    expect(html).toContain(`https://wa.me/${SUPPORT}`)
    expect(html).not.toContain(WALLET)
  })

  it('the receipt forward-to-self WhatsApp button is independent of the support link', () => {
    // receipt.whatsappLink forwards the receipt to the BUYER's own number
    // (set server-side from the buyer's entered WhatsApp). It is NOT the
    // support contact link and NOT a wallet — assert both stay distinct.
    const buyerForward = 'https://wa.me/233244999000?text=receipt'
    const html = renderToStaticMarkup(
      <ActivationReceiptPanel receipt={mkReceipt({ whatsappLink: buyerForward })} />,
    )
    expect(html).toContain(buyerForward)
    // Support contact link still resolves to the support number.
    expect(html).toContain(`WhatsApp (${SUPPORT})`)
    // And the wallet appears on neither.
    expect(html).not.toContain(WALLET)
  })
})
