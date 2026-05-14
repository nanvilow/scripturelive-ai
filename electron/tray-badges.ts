import { nativeImage, type NativeImage } from 'electron'

export type BadgeColor = 'blue' | 'orange' | 'green' | 'red'

const COLORS: Record<BadgeColor, string> = {
  blue: '#3b82f6',
  orange: '#f59e0b',
  green: '#22c55e',
  red: '#ef4444',
}

/**
 * Composite a colored circle badge onto the bottom-right corner of an
 * icon and return as an electron NativeImage. The dot diameter and
 * white outline scale as a fraction of the icon so the same helper
 * produces a readable badge on a 16px tray icon (Windows / Linux) and
 * on the 192px source we feed macOS.
 *
 * The white stroke is what makes the badge readable against both light
 * and dark system trays — without it, the orange downloading dot
 * disappears against a yellow Windows accent and the green ready dot
 * disappears against a green Linux Yaru theme.
 *
 * `sharp` is loaded via dynamic import on the first render rather than
 * a top-level `import sharp from 'sharp'`. The native binding can fail
 * to load on exotic / mis-packaged platforms; using a dynamic import
 * keeps that failure a *caught promise rejection* inside this function
 * (and therefore inside the caller's try/catch in `prepareTrayBadges`),
 * not a synchronous throw at app startup that would prevent the tray
 * from initializing at all.
 */
export async function renderBadgedIcon(
  baseIconPath: string,
  size: number,
  color: BadgeColor,
): Promise<NativeImage> {
  const sharp = (await import('sharp')).default

  // Sized to be clearly visible at a glance without obscuring the
  // base logo. 0.36 is the upper end of the typical OS-vendor unread-
  // badge ratio (Slack, Outlook, Discord all sit in 0.30-0.40); going
  // higher (we tried 0.50 first) buried the cross-and-book logo on
  // both 16px tray icons and the macOS source size.
  const dotDiameter = Math.max(5, Math.round(size * 0.36))
  const stroke = Math.max(1, Math.round(dotDiameter * 0.16))
  const offset = Math.max(0, Math.round(size * 0.02))

  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${dotDiameter}" height="${dotDiameter}">` +
      `<circle cx="${dotDiameter / 2}" cy="${dotDiameter / 2}" ` +
      `r="${dotDiameter / 2 - stroke / 2}" ` +
      `fill="${COLORS[color]}" stroke="white" stroke-width="${stroke}" />` +
      `</svg>`,
  )

  const buffer = await sharp(baseIconPath)
    .resize(size, size, { fit: 'contain' })
    .composite([{
      input: svg,
      left: size - dotDiameter - offset,
      top: size - dotDiameter - offset,
    }])
    .png()
    .toBuffer()

  return nativeImage.createFromBuffer(buffer)
}
