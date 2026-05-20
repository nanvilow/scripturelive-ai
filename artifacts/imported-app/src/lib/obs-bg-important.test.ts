/**
 * v0.7.209 — OBS Browser Source `body { background-color: rgba(0,0,0,0) }`
 * Custom CSS override regression net.
 *
 * The renderer in `src/app/api/output/congregation/route.ts` MUST paint
 * the operator-chosen background with `style.setProperty(..., 'important')`
 * at THREE sites so that OBS's appended Custom CSS (same specificity,
 * later declaration, would otherwise win the cascade) is beaten:
 *
 *   (1) Load-time block (just after URL-param parsing, ~L351-357)
 *   (2) Render-time reset (top of render(), ~L1198-1204)
 *   (3) Lower-third surrounding-area paint (~L1847-1853)
 *
 * Source-level grep guards are the appropriate test layer because the
 * renderer lives inside a 2200-line bundled template-literal `<script>`
 * that is not importable. Same constraint as v0.7.205 / v0.7.207.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const ROUTE = readFileSync('src/app/api/output/congregation/route.ts', 'utf8');

describe('v0.7.209 — OBS Custom-CSS override regression net', () => {
  it('(1) load-time block uses setProperty(...,"important") for html/body/#stage (opaque __bgInit) and #output (always transparent — v0.7.211)', () => {
    // html, body, #stage carry __bgInit (#000 unless FORCE_TRANSPARENT).
    expect(ROUTE).toMatch(
      /document\.documentElement\.style\.setProperty\(\s*'background'\s*,\s*__bgInit\s*,\s*'important'\s*\)/,
    );
    expect(ROUTE).toMatch(
      /document\.body\.style\.setProperty\(\s*'background'\s*,\s*__bgInit\s*,\s*'important'\s*\)/,
    );
    expect(ROUTE).toMatch(
      /__st\.style\.setProperty\(\s*'background'\s*,\s*__bgInit\s*,\s*'important'\s*\)/,
    );
    // v0.7.211 — #output MUST be transparent so #bgLayer (sibling z:0)
    // showing the operator customBackground is visible through #output (z:1).
    expect(ROUTE).toMatch(
      /__op\.style\.setProperty\(\s*'background'\s*,\s*'transparent'\s*,\s*'important'\s*\)/,
    );
    // v0.7.211 GUARD — #output MUST NOT carry __bgInit (would re-introduce
    // the v0.7.209 regression that covered customBackground with #000).
    expect(ROUTE).not.toMatch(
      /__op\.style\.setProperty\(\s*'background'\s*,\s*__bgInit\s*,\s*'important'\s*\)/,
    );
  });

  it('(1) load-time block picks #000 when FORCE_TRANSPARENT=false, transparent when true', () => {
    expect(ROUTE).toMatch(
      /var __bgInit\s*=\s*FORCE_TRANSPARENT\s*\?\s*'transparent'\s*:\s*'#000'/,
    );
  });

  it('(2) render-time reset uses setProperty(...,"important") in BOTH branches — #output ALWAYS transparent (v0.7.211), #stage mirrors FORCE_TRANSPARENT', () => {
    // Two #output transparent setProperty calls (FORCE_TRANSPARENT branch + opaque branch).
    const outputTransparent = ROUTE.match(
      /\$\('output'\)\.style\.setProperty\(\s*'background'\s*,\s*'transparent'\s*,\s*'important'\s*\)/g,
    );
    expect(outputTransparent).not.toBeNull();
    expect(outputTransparent!.length).toBeGreaterThanOrEqual(2);
    // v0.7.211 GUARD — #output MUST NEVER be set to #000 in render reset
    // (would cover #bgLayer / customBackground on every render tick).
    expect(ROUTE).not.toMatch(
      /\$\('output'\)\.style\.setProperty\(\s*'background'\s*,\s*'#000'\s*,\s*'important'\s*\)/,
    );
    // #stage still mirrors FORCE_TRANSPARENT: transparent branch + opaque branch.
    expect(ROUTE).toMatch(/__stR\.style\.setProperty\(\s*'background'\s*,\s*'transparent'\s*,\s*'important'\s*\)/);
    expect(ROUTE).toMatch(/__stR2\.style\.setProperty\(\s*'background'\s*,\s*'#000'\s*,\s*'important'\s*\)/);
  });

  it('(2) render-time reset MUST NOT use plain `style.background=""` anywhere (would let OBS Custom CSS re-win)', () => {
    // Plain clear of #output / #stage bg in the renderer reset would
    // re-introduce the bug — OBS's body{background-color:rgba(0,0,0,0)}
    // would re-win the cascade on the next paint.
    expect(ROUTE).not.toMatch(/\$\('output'\)\.style\.background\s*=\s*''\s*;/);
    expect(ROUTE).not.toMatch(/__stR\.style\.background\s*=\s*''\s*;/);
  });

  it('(3) lower-third surrounding-area paint uses setProperty(...,"important")', () => {
    expect(ROUTE).toMatch(
      /document\.documentElement\.style\.setProperty\(\s*'background'\s*,\s*__bg\s*,\s*'important'\s*\)/,
    );
    expect(ROUTE).toMatch(
      /document\.body\.style\.setProperty\(\s*'background'\s*,\s*__bg\s*,\s*'important'\s*\)/,
    );
    expect(ROUTE).toMatch(/__st2\.style\.setProperty\(\s*'background'\s*,\s*__bg\s*,\s*'important'\s*\)/);
    expect(ROUTE).toMatch(/__op2\.style\.setProperty\(\s*'background'\s*,\s*__bg\s*,\s*'important'\s*\)/);
  });

  it('GUARD: no plain `document.body.style.background=` (non-setProperty) anywhere in renderer (would lose to OBS Custom CSS)', () => {
    // The renderer touches body bg in 2 places (load-time + lower-third
    // surrounding). Both must go through setProperty. A plain assignment
    // anywhere in the script means OBS Custom CSS wins on that paint.
    const m = ROUTE.match(/document\.body\.style\.background\s*=/g);
    expect(m).toBeNull();
  });

  it('GUARD: no plain `documentElement.style.background=` (non-setProperty)', () => {
    const m = ROUTE.match(/document\.documentElement\.style\.background\s*=/g);
    expect(m).toBeNull();
  });

  it('GUARD: v0.7.202 URL-param gate stays — `transparent=1` only when operator opted in OR lower-third mode', () => {
    const panel = readFileSync('src/components/views/ndi-output-panel.tsx', 'utf8');
    expect(panel).toMatch(/wantTransparent\s*=\s*\n?\s*s\.ndiFullScreenBackground\s*===\s*'transparent'\s*\|\|\s*\n?\s*s\.ndiDisplayMode\s*===\s*'lower-third'/);
    expect(panel).toMatch(/if\s*\(\s*wantTransparent\s*\)\s*\{\s*\n\s*p\.set\(\s*'transparent'\s*,\s*'1'\s*\)/);
  });
});
