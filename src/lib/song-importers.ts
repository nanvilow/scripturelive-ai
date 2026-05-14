/**
 * Song importers for common worship/lyrics formats.
 *
 * Supports:
 *   • ChordPro (.cho/.chordpro/.chopro/.crd/.pro)
 *   • OpenLP plain-text export (.txt with [Verse 1] / [Chorus] markers)
 *   • CCLI SongSelect plain-text export (.txt header block + sections)
 *   • OpenLP / OpenSong simple XML (.xml with <lyrics><verse>)
 *   • Plain text — any unrecognised file falls back to a single section
 *
 * All parsers return ParsedSong objects ready to POST to /api/songs.
 */

export interface ParsedSongSection {
  type: 'verse' | 'chorus' | 'bridge' | 'pre-chorus' | 'tag' | 'intro' | 'outro'
  label: string
  lines: string[]
}

export interface ParsedSong {
  title: string
  artist?: string
  lyrics: string
  structured: { sections: ParsedSongSection[] }
  category: string
  tags?: string
  keySignature?: string
  tempo?: number
}

const CATEGORY_DEFAULT = 'worship'

function classifySection(label: string): ParsedSongSection['type'] {
  const l = label.toLowerCase()
  if (l.includes('pre-chorus') || l.includes('pre chorus')) return 'pre-chorus'
  if (l.includes('chorus')) return 'chorus'
  if (l.includes('bridge')) return 'bridge'
  if (l.includes('intro')) return 'intro'
  if (l.includes('outro') || l.includes('ending')) return 'outro'
  if (l.includes('tag')) return 'tag'
  return 'verse'
}

/**
 * Strip ChordPro chord markers like [G] or [Am7/B] from a line.
 */
function stripChords(line: string): string {
  return line.replace(/\[[^\]]+\]/g, '').replace(/\s{2,}/g, ' ').trim()
}

function detectFormat(filename: string, content: string): 'chordpro' | 'openlp-xml' | 'ccli' | 'sectioned' | 'plain' {
  const ext = (filename.split('.').pop() || '').toLowerCase()
  if (['cho', 'chordpro', 'chopro', 'crd', 'pro'].includes(ext)) return 'chordpro'
  if (ext === 'xml' || /<lyrics[\s>]/i.test(content)) return 'openlp-xml'
  if (/^CCLI\s+(Song|License)\s*#/im.test(content)) return 'ccli'
  if (/\[(verse|chorus|bridge|pre-chorus|intro|outro|tag)\b/i.test(content)) return 'sectioned'
  return 'plain'
}

function parseSectioned(content: string): ParsedSongSection[] {
  const lines = content.split(/\r?\n/)
  const sections: ParsedSongSection[] = []
  let current: ParsedSongSection | null = null
  for (const raw of lines) {
    const line = raw.trimEnd()
    const m = line.match(/^\s*\[([^\]]+)\]\s*$/)
    if (m) {
      if (current && current.lines.length > 0) sections.push(current)
      current = { type: classifySection(m[1]), label: m[1].trim(), lines: [] }
      continue
    }
    if (!current) current = { type: 'verse', label: 'Verse 1', lines: [] }
    if (line.trim() === '' && current.lines.length === 0) continue
    current.lines.push(line)
  }
  if (current && current.lines.length > 0) sections.push(current)
  return collapseTrailingBlanks(sections)
}

function collapseTrailingBlanks(sections: ParsedSongSection[]): ParsedSongSection[] {
  return sections.map((s) => {
    const lines = [...s.lines]
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
    return { ...s, lines }
  })
}

function parseChordPro(content: string): { title: string; artist?: string; key?: string; tempo?: number; sections: ParsedSongSection[] } {
  const lines = content.split(/\r?\n/)
  let title = ''
  let artist = ''
  let key = ''
  let tempo = 0
  const sections: ParsedSongSection[] = []
  let current: ParsedSongSection | null = null

  for (const raw of lines) {
    const line = raw.trimEnd()
    const dir = line.match(/^\{\s*([a-z_]+)\s*:\s*(.*?)\s*\}\s*$/i)
    if (dir) {
      const k = dir[1].toLowerCase()
      const v = dir[2]
      if (k === 'title' || k === 't') title = v
      else if (k === 'artist' || k === 'subtitle' || k === 'st') artist = v
      else if (k === 'key') key = v
      else if (k === 'tempo') tempo = parseInt(v, 10) || 0
      else if (k === 'start_of_chorus' || k === 'soc') {
        if (current && current.lines.length) sections.push(current)
        current = { type: 'chorus', label: 'Chorus', lines: [] }
      } else if (k === 'end_of_chorus' || k === 'eoc') {
        if (current) { sections.push(current); current = null }
      } else if (k === 'start_of_verse' || k === 'sov') {
        if (current && current.lines.length) sections.push(current)
        current = { type: 'verse', label: `Verse ${sections.filter((s) => s.type === 'verse').length + 1}`, lines: [] }
      } else if (k === 'end_of_verse' || k === 'eov') {
        if (current) { sections.push(current); current = null }
      } else if (k === 'comment' || k === 'c') {
        if (current && current.lines.length) sections.push(current)
        current = { type: classifySection(v), label: v, lines: [] }
      }
      continue
    }
    if (!current) current = { type: 'verse', label: 'Verse 1', lines: [] }
    const text = stripChords(line)
    if (text === '' && current.lines.length === 0) continue
    current.lines.push(text)
  }
  if (current && current.lines.length) sections.push(current)
  return { title, artist, key, tempo, sections: collapseTrailingBlanks(sections) }
}

function parseOpenLpXml(content: string): { title: string; artist?: string; sections: ParsedSongSection[] } {
  const titleM = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const authorM = content.match(/<author[^>]*>([\s\S]*?)<\/author>/i)
  const verses = [...content.matchAll(/<verse[^>]*(?:type="([^"]+)")?[^>]*(?:label="([^"]+)")?[^>]*>([\s\S]*?)<\/verse>/gi)]
  const sections: ParsedSongSection[] = verses.map((m, i) => {
    const type = (m[1] || 'v').toLowerCase()
    const label = m[2] || (type.startsWith('c') ? 'Chorus' : type.startsWith('b') ? 'Bridge' : `Verse ${i + 1}`)
    const text = m[3]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    return { type: classifySection(label), label, lines: text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) }
  })
  return {
    title: (titleM?.[1] || '').trim(),
    artist: (authorM?.[1] || '').trim() || undefined,
    sections,
  }
}

function parseCcli(content: string): { title: string; artist?: string; key?: string; sections: ParsedSongSection[] } {
  // CCLI SongSelect plain-text format has a header block, then section
  // labels on their own line ("Verse 1", "Chorus", …) followed by the
  // section body, separated by blank lines.
  const lines = content.split(/\r?\n/)
  let title = ''
  let artist = ''
  let key = ''
  const sections: ParsedSongSection[] = []
  let current: ParsedSongSection | null = null

  // Title and artist heuristics — the first non-blank line is usually
  // the title; the next non-blank line is the artist credit.
  const headerLines: string[] = []
  let i = 0
  for (; i < lines.length; i++) {
    if (/^(Verse|Chorus|Bridge|Pre-Chorus|Intro|Outro|Tag)\b/i.test(lines[i])) break
    headerLines.push(lines[i])
  }
  const headerNonEmpty = headerLines.map((l) => l.trim()).filter(Boolean)
  title = headerNonEmpty[0] || ''
  artist = headerNonEmpty[1] || ''
  const keyM = content.match(/Key\s*of\s*([A-G][#b]?m?)/i)
  if (keyM) key = keyM[1]

  for (; i < lines.length; i++) {
    const line = lines[i].trimEnd()
    if (/^(CCLI|©|Copyright)/i.test(line.trim())) break
    const labelM = line.match(/^(Verse(?:\s*\d+)?|Chorus(?:\s*\d+)?|Pre-Chorus(?:\s*\d+)?|Bridge(?:\s*\d+)?|Intro|Outro|Tag|Ending)\s*$/i)
    if (labelM) {
      if (current && current.lines.length) sections.push(current)
      current = { type: classifySection(labelM[1]), label: labelM[1].trim(), lines: [] }
      continue
    }
    if (!current) {
      if (line.trim() === '') continue
      current = { type: 'verse', label: 'Verse 1', lines: [] }
    }
    if (line.trim() === '' && current.lines.length === 0) continue
    current.lines.push(line)
  }
  if (current && current.lines.length) sections.push(current)
  return { title, artist, key, sections: collapseTrailingBlanks(sections) }
}

export function parseSongFile(filename: string, content: string): ParsedSong {
  const fmt = detectFormat(filename, content)
  const fallbackTitle = filename.replace(/\.[^.]+$/, '')

  if (fmt === 'chordpro') {
    const r = parseChordPro(content)
    const lyrics = r.sections
      .map((s) => `[${s.label}]\n${s.lines.join('\n')}`)
      .join('\n\n')
    return {
      title: r.title || fallbackTitle,
      artist: r.artist || undefined,
      lyrics,
      structured: { sections: r.sections },
      category: CATEGORY_DEFAULT,
      keySignature: r.key || undefined,
      tempo: r.tempo || undefined,
    }
  }

  if (fmt === 'openlp-xml') {
    const r = parseOpenLpXml(content)
    const lyrics = r.sections.map((s) => `[${s.label}]\n${s.lines.join('\n')}`).join('\n\n')
    return {
      title: r.title || fallbackTitle,
      artist: r.artist,
      lyrics,
      structured: { sections: r.sections },
      category: CATEGORY_DEFAULT,
    }
  }

  if (fmt === 'ccli') {
    const r = parseCcli(content)
    const lyrics = r.sections.map((s) => `[${s.label}]\n${s.lines.join('\n')}`).join('\n\n')
    return {
      title: r.title || fallbackTitle,
      artist: r.artist || undefined,
      lyrics,
      structured: { sections: r.sections },
      category: CATEGORY_DEFAULT,
      keySignature: r.key || undefined,
    }
  }

  if (fmt === 'sectioned') {
    const sections = parseSectioned(content)
    return {
      title: fallbackTitle,
      lyrics: content.trim(),
      structured: { sections },
      category: CATEGORY_DEFAULT,
    }
  }

  // Plain text → one verse.
  const lines = content.split(/\r?\n/).map((l) => l.trimEnd()).filter((l, i, arr) => !(l === '' && (i === 0 || arr[i - 1] === '')))
  const sections: ParsedSongSection[] = [{ type: 'verse', label: 'Verse 1', lines }]
  return {
    title: fallbackTitle,
    lyrics: content.trim(),
    structured: { sections },
    category: CATEGORY_DEFAULT,
  }
}
