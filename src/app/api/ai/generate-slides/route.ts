import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

export async function POST(request: NextRequest) {
  try {
    const { topic, theme = 'minimal', translation = 'KJV' } = await request.json()

    if (!topic || !topic.trim()) {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 })
    }

    const zai = await ZAI.create()

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content: `You are a church presentation slide creator. Generate slides for a sermon or worship presentation. Return ONLY a valid JSON array. Each slide object must have: id (string), type (title|verse|lyrics|custom|blank), title (string), subtitle (string), content (string array of text lines), background (string, one of: worship, sermon, easter, christmas, praise, minimal). Generate 4-8 slides. The first slide should always be a title slide. Include Bible verses when relevant to the topic. Theme: ${theme}. Bible translation: ${translation}.`
        },
        {
          role: 'user',
          content: `Create presentation slides for: "${topic}". Make the content spiritually meaningful and suitable for a church service. Include relevant Bible verses if applicable.`
        }
      ],
      thinking: { type: 'disabled' }
    })

    const responseText = completion.choices[0]?.message?.content || ''

    // Parse the JSON response
    let slides
    try {
      // Try to extract JSON array from response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        slides = JSON.parse(jsonMatch[0])
      } else {
        slides = JSON.parse(responseText)
      }
    } catch {
      // If parsing fails, create a basic slide set
      slides = [
        {
          id: `slide-${Date.now()}-0`,
          type: 'title',
          title: topic.slice(0, 60),
          subtitle: '',
          content: [],
          background: theme,
        },
        {
          id: `slide-${Date.now()}-1`,
          type: 'custom',
          title: topic.slice(0, 60),
          subtitle: 'Scripture Reading',
          content: ['The Word of the Lord'],
          background: theme,
        },
      ]
    }

    // Ensure all slides have required fields
    slides = slides.map((slide: any, index: number) => ({
      id: slide.id || `slide-${Date.now()}-${index}`,
      type: slide.type || 'custom',
      title: slide.title || topic.slice(0, 60),
      subtitle: slide.subtitle || '',
      content: Array.isArray(slide.content) ? slide.content : [],
      background: slide.background || theme,
    }))

    return NextResponse.json({ slides, topic, theme })
  } catch (error) {
    console.error('Error generating slides:', error)
    return NextResponse.json(
      { error: 'Failed to generate slides. Please try again.' },
      { status: 500 }
    )
  }
}
