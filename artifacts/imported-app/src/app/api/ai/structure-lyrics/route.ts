import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

export async function POST(request: NextRequest) {
  try {
    const { lyrics } = await request.json()

    if (!lyrics || !lyrics.trim()) {
      return NextResponse.json({ error: 'Lyrics text is required' }, { status: 400 })
    }

    const zai = await ZAI.create()

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content: `You are a worship music expert. Restructure raw song lyrics into properly formatted sections. Return ONLY the restructured lyrics text — no explanations, no markdown code blocks. Use the following section header format:

[Verse 1]
(lines here)

[Chorus]
(lines here)

[Bridge]
(lines here)

[Pre-Chorus]
(lines here)

[Tag]
(lines here)

[Intro]
(lines here)

[Outro]
(lines here)

Rules:
- Detect verse, chorus, bridge, pre-chorus sections automatically
- If a section repeats, number it (Verse 1, Verse 2, Chorus 1, etc.)
- Add [Verse 1], [Chorus], [Bridge] headers where they belong
- Preserve the original lyrics text exactly as-is within sections
- Do NOT modify the actual lyric lines
- If lyrics have no clear structure, split into logical 4-line verses and label them
- Remove any existing bracketed headers and replace with standardized ones`
        },
        {
          role: 'user',
          content: `Structure these song lyrics into sections:\n\n${lyrics}`
        }
      ],
      thinking: { type: 'disabled' }
    })

    const responseText = completion.choices[0]?.message?.content || ''

    // Clean up any markdown code block wrapper
    let structuredLyrics = responseText
    if (structuredLyrics.startsWith('```')) {
      structuredLyrics = structuredLyrics
        .replace(/^```[\w]*\n/, '')
        .replace(/\n```$/, '')
    }

    return NextResponse.json({ structuredLyrics })
  } catch (error) {
    console.error('Error structuring lyrics:', error)
    return NextResponse.json(
      { error: 'Failed to structure lyrics. Please try again.' },
      { status: 500 }
    )
  }
}
