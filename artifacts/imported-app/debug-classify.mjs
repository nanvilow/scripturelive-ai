import OpenAI from 'openai';
const SYSTEM_PROMPT = 'You are an intent classifier for a church livestream operator app. Map the operator transcript to one of: next_verse, previous_verse, next_chapter, previous_chapter, go_to_reference (set args.reference), bible_says (set args.reference), scroll_up, scroll_down, autoscroll_start, autoscroll_pause, autoscroll_stop, clear_screen, blank_screen, change_translation (set args.translation: niv|kjv|esv|amp|msg|nkjv|nlt|nasb), delete_previous_verse, show_verse_n (set args.verseNumber), find_by_quote (set args.quoteText). Output VALID JSON: {"intent": "<one_of_above>" | null, "confidence": 0..100, "args": {...}}. Set intent=null and confidence=0 when the utterance is preaching/prayer/filler.';
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
async function tryClassify(model, transcript) {
  console.log(`\n=== model=${model} transcript=${JSON.stringify(transcript)} ===`);
  try {
    const completion = await client.chat.completions.create({
      model, messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `transcript: ${JSON.stringify(transcript)}` },
      ],
      response_format: { type: 'json_object' }, temperature: 0,
    });
    console.log('  raw:', completion.choices?.[0]?.message?.content);
    console.log('  finish_reason:', completion.choices?.[0]?.finish_reason);
  } catch (e) { console.log('  THREW:', e?.status, e?.code, '-', e?.message?.slice(0, 250)); }
}
await tryClassify('gpt-5-nano', 'next verse');
await tryClassify('gpt-5-nano', 'could you bring up John 3:16');
await tryClassify('gpt-4o-mini', 'next verse');
await tryClassify('gpt-4o-mini', 'could you bring up John 3:16');
