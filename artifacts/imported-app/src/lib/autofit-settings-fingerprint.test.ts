/**
 * v0.7.207 — Regression test for the "NDI / Display & Output typography
 * settings silently do nothing" operator bug.
 *
 * Root cause (pre-fix): the autofit cache key `__fitKey` in
 * `src/app/api/output/congregation/route.ts` was
 *   `(textContent.length) + '|' + parent.clientWidth + 'x' + parent.clientHeight`
 * — NO typography fingerprint. When the operator changed any of
 * Font, Size, Align, Drop shadow, Aspect ratio, Bible line-height,
 * Bible text scale, Reference Label {Size, Style, Position, Scale}
 * for either Display & Output, NDI Full, or NDI Lower-Third panels,
 * `render()` rebuilt the DOM with a new `clamp()` inline style on
 * `.slide-paragraph`, but `fitVerseText` hit the early-return at
 * L963 (text-length + parent-dims unchanged) and reapplied the
 * STALE `__fitBase * __fitScale` pixel value — silently overwriting
 * the operator's freshly-set typography. Operator on v0.7.206 said:
 * "Nothing apply when users set auto fit takes over".
 *
 * Fix: introduce a module-level `__renderSettingsFP` stamped by
 * `render()` from `settingsRenderKey(s.settings)` on every paint,
 * and include it in `__fitKey`. Now any typography knob change
 * → new settingsRenderKey → new FP → __fitKey miss → autofit
 * re-measures from the new clamp() → operator's setting actually
 * applies on Display & Output, NDI Full, NDI Lower-Third, and
 * Reference Label panels uniformly.
 *
 * Per v0.7.205 PROCESS GR: regression tests for render-pipeline
 * bugs that live inside the iframe's pre-bundled template-literal
 * <script> can only be validated at the source level (the JS is
 * not importable) or via a Replit headless browser proof. This
 * test does the cheap, deterministic source-level check; the
 * full browser proof was run via `.local/diag-v207.mjs` before
 * push (see CHANGELOG entry for v0.7.207).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROUTE_TS = resolve(
  __dirname,
  '..',
  'app',
  'api',
  'output',
  'congregation',
  'route.ts',
);
const SRC = readFileSync(ROUTE_TS, 'utf8');

describe('v0.7.207 — autofit settings fingerprint', () => {
  it('declares __renderSettingsFP at module level inside the iframe template', () => {
    // The var MUST exist; without it the FP read in __fitKey is
    // `undefined` and the cache will always invalidate (acceptable,
    // but defeats the cache benefit). With it AND the render() stamp
    // (next test) the cache correctly invalidates on settings change
    // but stays warm on no-op re-renders.
    expect(SRC).toMatch(/var __renderSettingsFP\s*=\s*['"]['"]/);
  });

  it('__fitKey MUST include __renderSettingsFP', () => {
    // This is THE LOAD-BEARING ASSERTION. If this fails, the
    // operator's typography settings will be silently ignored
    // by autofit (the v0.7.206 bug is back).
    const m = SRC.match(
      /var key=\(p\.textContent\|\|''\)\.length\+'\|'\+parent\.clientWidth\+'x'\+parent\.clientHeight\+'\|'\+__renderSettingsFP/,
    );
    expect(m, '__fitKey MUST include +"|"+__renderSettingsFP suffix').toBeTruthy();
  });

  it('render() MUST stamp __renderSettingsFP from settingsRenderKey(s.settings)', () => {
    // Without this stamp, __renderSettingsFP stays '' forever and
    // the cache key never reflects settings changes — same bug.
    expect(SRC).toMatch(
      /__renderSettingsFP\s*=\s*settingsRenderKey\(s\.settings\)/,
    );
  });

  it('settingsRenderKey MUST include all NDI Full typography fields the operator can change', () => {
    // If a new NDI Full field is added to settings but NOT to
    // settingsRenderKey, render() won't re-fire on operator change
    // → DOM stays at old clamp() → no fingerprint change → no fix.
    const required = [
      'ndFs',
      'ndFf',
      'ndSh',
      'ndTs',
      'ndTa',
      'ndAr',
      'ndBc',
      'ndBlh',
    ];
    for (const f of required) {
      expect(SRC, `settingsRenderKey must include ${f}`).toMatch(
        new RegExp(`\\b${f}\\s*:\\s*st\\.\\w+`),
      );
    }
  });

  it('settingsRenderKey MUST include all NDI Lower-Third typography fields', () => {
    const required = ['ltFf', 'ltFs', 'ltSh', 'ltTs', 'ltTa', 'ltBc', 'ltBlh', 'ndLtSc'];
    for (const f of required) {
      expect(SRC, `settingsRenderKey must include ${f}`).toMatch(
        new RegExp(`\\b${f}\\s*:\\s*st\\.\\w+`),
      );
    }
  });

  it('settingsRenderKey MUST include all Reference Label fields (global + NDI)', () => {
    const required = [
      'rfFs',
      'rfFf',
      'rfSh',
      'rfTs',
      'rfTa',
      'ndRfFs',
      'ndRfSt',
      'ndRfPos',
      'ndRfTs',
    ];
    for (const f of required) {
      expect(SRC, `settingsRenderKey must include ${f}`).toMatch(
        new RegExp(`\\b${f}\\s*:\\s*st\\.\\w+`),
      );
    }
  });

  it('settingsRenderKey MUST include Display & Output Typography fields (fs, ff, sh, ts, ta, blh)', () => {
    // The operator's complaint specifically called out "Display &
    // Output setting auto fit has taking over users cant apply any
    // settings" — these are the global (non-NDI, non-LT) fields.
    const required = ['fs', 'ff', 'sh', 'ts', 'ta', 'blh'];
    for (const f of required) {
      expect(SRC, `settingsRenderKey must include ${f}`).toMatch(
        new RegExp(`\\b${f}\\s*:\\s*st\\.\\w+`),
      );
    }
  });

  it('fitVerseText MUST stay shrink-only (maxK=1.00) — operator typography is the CAP', () => {
    // If a future PR raises maxK above 1.00, autofit will grow text
    // beyond the operator's Typography bucket and re-introduce the
    // v0.7.194-hotfix.9 "garbled fragments behind ASV" overflow.
    // The operator's slider is the UPPER bound; autofit only ever
    // shrinks to prevent overflow.
    expect(SRC).toMatch(/var maxK=1\.00;/);
  });
});
