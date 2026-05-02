import { describe, it, expect } from 'vitest'
import { cleanReleaseNotes, previewReleaseNotes } from './release-notes'

describe('cleanReleaseNotes', () => {
  it('returns an empty string for null input', () => {
    expect(cleanReleaseNotes(null)).toBe('')
  })

  it('returns an empty string for undefined input', () => {
    expect(cleanReleaseNotes(undefined)).toBe('')
  })

  it('returns an empty string for an empty input', () => {
    expect(cleanReleaseNotes('')).toBe('')
  })

  it('strips a typical GitHub auto-generated notes block', () => {
    const input = [
      "## What's Changed",
      '* Fix thing by @alice in https://github.com/org/repo/pull/12',
      '* Add thing by @bob in https://github.com/org/repo/pull/13',
      '',
      '## New Contributors',
      '* @carol made their first contribution in https://github.com/org/repo/pull/9',
      '',
      '**Full Changelog**: https://github.com/org/repo/compare/v1.0.0...v1.1.0',
    ].join('\n')

    const out = cleanReleaseNotes(input)

    expect(out).not.toMatch(/What['’]s Changed/)
    expect(out).not.toMatch(/New Contributors/)
    expect(out).not.toMatch(/Full Changelog/)
    expect(out).not.toMatch(/@carol made their first contribution/)
    expect(out).toContain('Fix thing by @alice in https://github.com/org/repo/pull/12')
    expect(out).toContain('Add thing by @bob in https://github.com/org/repo/pull/13')
  })

  it('preserves manual notes mixed with auto-generated boilerplate', () => {
    const input = [
      '### Highlights',
      '',
      '- New mixer view',
      '- Faster startup',
      '',
      "## What's Changed",
      '* Fix thing by @alice in https://github.com/org/repo/pull/12',
      '',
      '## New Contributors',
      '* @carol made their first contribution in https://github.com/org/repo/pull/9',
      '',
      '**Full Changelog**: https://github.com/org/repo/compare/v1.0.0...v1.1.0',
    ].join('\n')

    const out = cleanReleaseNotes(input)

    expect(out).toContain('### Highlights')
    expect(out).toContain('- New mixer view')
    expect(out).toContain('- Faster startup')
    expect(out).toContain('Fix thing by @alice')
    expect(out).not.toMatch(/What['’]s Changed/)
    expect(out).not.toMatch(/New Contributors/)
    expect(out).not.toMatch(/Full Changelog/)
  })

  it('leaves manual-only notes (no GitHub boilerplate) untouched aside from trimming', () => {
    const input = [
      '### Bug fixes',
      '',
      '- Fixed crash when the NDI runtime is missing',
      '- Improved Bible search accuracy',
      '',
    ].join('\n')

    const out = cleanReleaseNotes(input)

    expect(out).toBe(input.trim())
  })

  it('strips a plain (non-bold) "Full Changelog" line', () => {
    const input = [
      '- Bug fix',
      '',
      'Full Changelog: https://github.com/org/repo/compare/v1.0.0...v1.1.0',
    ].join('\n')

    const out = cleanReleaseNotes(input)

    expect(out).not.toMatch(/Full Changelog/)
    expect(out).toContain('- Bug fix')
  })

  it('strips an italic "Full Changelog" line', () => {
    const input = [
      '- Bug fix',
      '',
      '*Full Changelog*: https://github.com/org/repo/compare/v1.0.0...v1.1.0',
    ].join('\n')

    const out = cleanReleaseNotes(input)

    expect(out).not.toMatch(/Full Changelog/)
    expect(out).toContain('- Bug fix')
  })

  it('removes a "New Contributors" section that runs to end-of-input (no trailing footer)', () => {
    const input = [
      '### Notes',
      '',
      '- Something happened',
      '',
      '## New Contributors',
      '* @dave made their first contribution in https://github.com/org/repo/pull/20',
      '* @eve made their first contribution in https://github.com/org/repo/pull/21',
    ].join('\n')

    const out = cleanReleaseNotes(input)

    expect(out).toContain('### Notes')
    expect(out).toContain('- Something happened')
    expect(out).not.toMatch(/New Contributors/)
    expect(out).not.toMatch(/@dave/)
    expect(out).not.toMatch(/@eve/)
  })

  it('stops the "New Contributors" strip at the next heading', () => {
    const input = [
      '## New Contributors',
      '* @dave made their first contribution in https://github.com/org/repo/pull/20',
      '',
      '## Acknowledgements',
      'Thanks to everyone who tested the beta.',
    ].join('\n')

    const out = cleanReleaseNotes(input)

    expect(out).not.toMatch(/New Contributors/)
    expect(out).not.toMatch(/@dave/)
    expect(out).toContain('## Acknowledgements')
    expect(out).toContain('Thanks to everyone who tested the beta.')
  })

  it('handles CRLF line endings the same as LF', () => {
    const lf = [
      "## What's Changed",
      '* Fix thing by @alice in https://github.com/org/repo/pull/12',
      '',
      '**Full Changelog**: https://github.com/org/repo/compare/v1.0.0...v1.1.0',
    ].join('\n')
    const crlf = lf.replace(/\n/g, '\r\n')

    expect(cleanReleaseNotes(crlf)).toBe(cleanReleaseNotes(lf))
  })

  it('collapses runs of 3+ blank lines left behind after stripping', () => {
    // The "What's Changed" heading and the "Full Changelog" footer each
    // get removed independently; combined with the surrounding blank
    // lines that's a 3+ blank-line gap that should collapse to one.
    const input = [
      '- Before',
      '',
      "## What's Changed",
      '',
      '* Fix thing by @alice in https://github.com/org/repo/pull/12',
      '',
      '**Full Changelog**: https://github.com/org/repo/compare/v1.0.0...v1.1.0',
      '',
      '- After footer',
    ].join('\n')

    const out = cleanReleaseNotes(input)

    expect(out).not.toMatch(/\n{3,}/)
    expect(out).toContain('- Before')
    expect(out).toContain('* Fix thing by @alice')
    expect(out).toContain('- After footer')
  })

  it('is case-insensitive for the auto-generated headings', () => {
    const input = [
      '## what\'s changed',
      '* Fix by @alice',
      '',
      '## NEW CONTRIBUTORS',
      '* @bob made their first contribution',
      '',
      '**full changelog**: https://github.com/org/repo/compare/v1.0.0...v1.1.0',
    ].join('\n')

    const out = cleanReleaseNotes(input)

    expect(out).not.toMatch(/changed/i)
    expect(out).not.toMatch(/contributors/i)
    expect(out).not.toMatch(/changelog/i)
    expect(out).toContain('Fix by @alice')
  })
})

describe('previewReleaseNotes', () => {
  it('returns undefined for nullish or blank input', () => {
    expect(previewReleaseNotes(null)).toBeUndefined()
    expect(previewReleaseNotes(undefined)).toBeUndefined()
    expect(previewReleaseNotes('')).toBeUndefined()
    expect(previewReleaseNotes('   \n\t  ')).toBeUndefined()
  })

  it('returns undefined when only GitHub boilerplate is present', () => {
    const input = [
      "## What's Changed",
      '',
      '## New Contributors',
      '* @carol made their first contribution in https://github.com/org/repo/pull/9',
      '',
      '**Full Changelog**: https://github.com/org/repo/compare/v1.0.0...v1.1.0',
    ].join('\n')
    expect(previewReleaseNotes(input)).toBeUndefined()
  })

  it('collapses a markdown link to just its visible label', () => {
    const out = previewReleaseNotes(
      'See [the issue tracker](https://github.com/org/repo/issues/12) for details.',
    )
    expect(out).toBe('See the issue tracker for details.')
    expect(out).not.toMatch(/https?:\/\//)
    expect(out).not.toMatch(/github\.com/)
  })

  it('collapses multiple markdown links in the same paragraph', () => {
    const out = previewReleaseNotes(
      'Fixes [issue 12](https://github.com/org/repo/issues/12) and [issue 13](https://github.com/org/repo/issues/13).',
    )
    expect(out).toBe('Fixes issue 12 and issue 13.')
    expect(out).not.toMatch(/https?:\/\//)
  })

  it('drops bare URLs that are not part of a markdown link', () => {
    const out = previewReleaseNotes(
      'New mixer view shipped. https://github.com/org/repo/pull/42 was merged.',
    )
    expect(out).not.toMatch(/https?:\/\//)
    expect(out).toContain('New mixer view shipped.')
    expect(out).toContain('was merged.')
  })

  it('drops markdown image syntax wholesale', () => {
    const out = previewReleaseNotes(
      'Before. ![mixer screenshot](https://example.com/img.png) After.',
    )
    expect(out).toBe('Before. After.')
  })

  it('strips HTML tags including `<https://...>` autolinks', () => {
    const out = previewReleaseNotes(
      'Mixer view ships. <https://github.com/org/repo/pull/42> Thanks all.',
    )
    expect(out).not.toMatch(/https?:\/\//)
    expect(out).toContain('Mixer view ships.')
    expect(out).toContain('Thanks all.')
  })

  it('strips markdown punctuation from the surviving prose', () => {
    const out = previewReleaseNotes('### Highlights\n\n- **Faster** startup\n- New `mixer` view')
    expect(out).not.toMatch(/[#*`>~\[\]()]/)
    expect(out).toContain('Highlights')
    expect(out).toContain('Faster startup')
    expect(out).toContain('New mixer view')
  })

  it('truncates to 180 characters with an ellipsis and never exceeds the budget', () => {
    const long = 'x'.repeat(500)
    const out = previewReleaseNotes(long)!
    expect(out.length).toBeLessThanOrEqual(180)
    expect(out.endsWith('…')).toBe(true)
  })

  it('does NOT truncate prose that fits inside the budget', () => {
    const out = previewReleaseNotes('Short and sweet.')
    expect(out).toBe('Short and sweet.')
  })

  it('respects a custom maxLen', () => {
    const out = previewReleaseNotes('abcdefghij', 5)!
    expect(out.length).toBeLessThanOrEqual(5)
    expect(out.endsWith('…')).toBe(true)
  })

  it('keeps the prose budget even when release notes contain a giant URL', () => {
    // Reproduces the reported scenario from task #60: a single long
    // GitHub URL (here amplified) would otherwise eat the entire 180-
    // char preview budget. With link-collapse + bare-URL drop, the
    // surrounding prose survives instead.
    const url = 'https://github.com/' + 'a'.repeat(400)
    const input = `[Click here](${url}) to read the full migration guide.`
    const out = previewReleaseNotes(input)!
    expect(out).toBe('Click here to read the full migration guide.')
    expect(out).not.toMatch(/https?:\/\//)
    expect(out.length).toBeLessThanOrEqual(180)
  })

  it('handles a realistic GitHub release-notes block end to end', () => {
    const input = [
      '### Highlights',
      '',
      '- New mixer view — see [PR 42](https://github.com/org/repo/pull/42)',
      '- Faster startup',
      '',
      "## What's Changed",
      '* Fix thing by @alice in https://github.com/org/repo/pull/12',
      '',
      '## New Contributors',
      '* @carol made their first contribution in https://github.com/org/repo/pull/9',
      '',
      '**Full Changelog**: https://github.com/org/repo/compare/v1.0.0...v1.1.0',
    ].join('\n')
    const out = previewReleaseNotes(input)!
    expect(out).toContain('Highlights')
    expect(out).toContain('New mixer view')
    expect(out).toContain('PR 42')
    expect(out).toContain('Faster startup')
    expect(out).toContain('Fix thing by @alice')
    expect(out).not.toMatch(/https?:\/\//)
    expect(out).not.toMatch(/github\.com/)
    expect(out).not.toMatch(/What['’]s Changed/)
    expect(out).not.toMatch(/Full Changelog/)
    expect(out).not.toMatch(/New Contributors/)
  })

})
