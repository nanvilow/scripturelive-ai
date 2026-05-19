/**
 * v0.7.211 — Themed background + customBackground visibility regression net.
 *
 * Operator escalation on v0.7.210: "My background image is not showing
 * from the app" + "OBS and Wirecast are not showing with the right
 * themed background". Root cause: v0.7.209's load-time and render-time
 * `setProperty('background','#000','important')` on #output covered
 * #bgLayer (sibling z:0, where operator customBackground video/image
 * lives) AND covered the inner wrapper div's `background:transparent`
 * (used when customBg is mounted — wrapper is transparent so #bgLayer
 * shows through, but #output's inline #000 blocked it).
 *
 * Fix: #output MUST always be inline `background: transparent !important`
 * — at load time AND in render-time reset. The wrapper div emitted
 * into #output.innerHTML carries the theme gradient itself when no
 * customBg is set (class="theme-worship" etc), or stays transparent
 * when a customBg IS set (#bgLayer paints behind, visible through #output).
 *
 * The v0.7.209 OBS Custom CSS protection still works because OBS only
 * injects `body { background-color: rgba(0,0,0,0) }` — it never targets
 * #output, #stage, or html. Pinning body/html/#stage to opaque #000 is
 * sufficient to defeat OBS injection, and leaves #output free to be the
 * transparent window through which #bgLayer is visible.
 *
 * Also covers the iframe `allow="autoplay"` regression net for the
 * operator's "Video doesn't play at once when double-click or send to
 * live display" complaint — both the OutputPreview iframe and the
 * NDI Live Preview iframe MUST advertise the autoplay permission so
 * the embedded `<video autoplay muted playsinline>` element actually
 * starts playing without operator gesture inside the iframe.
 *
 * Source-grep is the appropriate test layer because route.ts is a
 * 2200-line bundled template-literal `<script>` not importable here.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const ROUTE = readFileSync('src/app/api/output/congregation/route.ts', 'utf8');
const OUTPUT_PREVIEW = readFileSync('src/components/settings/output-preview.tsx', 'utf8');
const NDI_PANEL = readFileSync('src/components/views/ndi-output-panel.tsx', 'utf8');

describe('v0.7.211 — themed background + customBackground visibility', () => {
  it('(A) load-time block — #output is ALWAYS transparent (so #bgLayer customBg shows through)', () => {
    // The exact load-bearing assertion for the v0.7.211 fix.
    expect(ROUTE).toMatch(
      /__op\.style\.setProperty\(\s*'background'\s*,\s*'transparent'\s*,\s*'important'\s*\)/,
    );
  });

  it('(B) load-time block — #output MUST NOT be set to __bgInit / #000 (would cover #bgLayer)', () => {
    expect(ROUTE).not.toMatch(
      /__op\.style\.setProperty\(\s*'background'\s*,\s*__bgInit\s*,\s*'important'\s*\)/,
    );
    expect(ROUTE).not.toMatch(
      /__op\.style\.setProperty\(\s*'background'\s*,\s*'#000'\s*,\s*'important'\s*\)/,
    );
  });

  it('(C) load-time block — html + body + #stage STILL pinned to __bgInit (OBS Custom CSS protection intact)', () => {
    expect(ROUTE).toMatch(
      /document\.documentElement\.style\.setProperty\(\s*'background'\s*,\s*__bgInit\s*,\s*'important'\s*\)/,
    );
    expect(ROUTE).toMatch(
      /document\.body\.style\.setProperty\(\s*'background'\s*,\s*__bgInit\s*,\s*'important'\s*\)/,
    );
    expect(ROUTE).toMatch(
      /__st\.style\.setProperty\(\s*'background'\s*,\s*__bgInit\s*,\s*'important'\s*\)/,
    );
  });

  it('(D) render-time reset — #output transparent in BOTH FORCE_TRANSPARENT branches', () => {
    const outputTransparent = ROUTE.match(
      /\$\('output'\)\.style\.setProperty\(\s*'background'\s*,\s*'transparent'\s*,\s*'important'\s*\)/g,
    );
    expect(outputTransparent).not.toBeNull();
    // At least 2: one in the FORCE_TRANSPARENT=true branch, one in
    // the FORCE_TRANSPARENT=false (opaque) branch. v0.7.211 unifies
    // them — #output stays transparent regardless because the wrapper
    // div + #bgLayer handle the visible bg.
    expect(outputTransparent!.length).toBeGreaterThanOrEqual(2);
  });

  it('(E) render-time reset — #output MUST NEVER be set to #000 (every render tick would cover customBg)', () => {
    expect(ROUTE).not.toMatch(
      /\$\('output'\)\.style\.setProperty\(\s*'background'\s*,\s*'#000'\s*,\s*'important'\s*\)/,
    );
  });

  it('(F) render-time reset — #stage STILL mirrors FORCE_TRANSPARENT (#000 opaque branch, transparent for alpha matte)', () => {
    expect(ROUTE).toMatch(
      /__stR\.style\.setProperty\(\s*'background'\s*,\s*'transparent'\s*,\s*'important'\s*\)/,
    );
    expect(ROUTE).toMatch(
      /__stR2\.style\.setProperty\(\s*'background'\s*,\s*'#000'\s*,\s*'important'\s*\)/,
    );
  });

  it('(G) wrapper div inside #output still carries the theme class — class="theme-*" applied in no-slide path', () => {
    // route.ts L1354 (no-slide themed-bg path).
    expect(ROUTE).toMatch(/\$\('output'\)\.innerHTML='<div class="'\+tcE\+'"/);
  });

  it('(H) wrapper div inside #output still carries the theme class — class="theme-*" applied in noMedia preview path', () => {
    // route.ts L1516 (settings preview noMedia path).
    expect(ROUTE).toMatch(/\$\('output'\)\.innerHTML='<div class="'\+tcM\+'"/);
  });

  it('(I) wrapper div inside #output still carries theme class — full-screen verse path uses fsTheme', () => {
    // route.ts L1892 (full-screen verse render).
    expect(ROUTE).toMatch(/\$\('output'\)\.innerHTML='<div class="'\+fsTheme\+'"/);
  });

  it('(J) GUARD — v0.7.210 sendMediaToPreview / sendMediaToLive direct-ref primitives unchanged', () => {
    // The v0.7.211 bg fix MUST NOT regress the v0.7.210 media-tile
    // click handlers. Re-asserts the GUARD-RAILs from v0.7.210.
    const lib = readFileSync('src/components/layout/library-compact.tsx', 'utf8');
    // v0.7.216: regex widened from `[^}]+` to `[\s\S]*?` because the
    // v0.7.216 sendMediaToPreview now contains an `if {...}` block
    // (the pause-before-pin branch that prevents 2nd HW decoder
    // competition) BEFORE the pinPreviewSlide call. The primitive
    // call itself is still asserted.
    expect(lib).toMatch(/const sendMediaToPreview[\s\S]*?pinPreviewSlide\(slide\)/);
    expect(lib).toMatch(/const sendMediaToLive[\s\S]*?setLiveAuto\(slide\)/);
  });
});

describe('v0.7.211 — iframe autoplay permission', () => {
  it('(K) OutputPreview iframe carries allow="autoplay" so embedded <video autoplay> plays without operator gesture', () => {
    // Operator: "Video doesn't play at once when double-click or send
    // to live display." The in-app Live Display iframe needs the
    // Feature-Policy autoplay permission so the muted+playsinline
    // <video autoplay> the renderer emits actually starts immediately.
    expect(OUTPUT_PREVIEW).toMatch(/allow="autoplay[^"]*"/);
  });

  it('(L) NDI output panel iframe carries allow="autoplay" (NDI Live Preview surface)', () => {
    expect(NDI_PANEL).toMatch(/allow="autoplay[^"]*"/);
  });
});
