// v0.7.65 — Preacher Phrase Detection Engine.
//
// Extends the existing Bible-detection pipeline with a curated
// dictionary of ~190 preacher-style phrases mapped to references.
// Where reference-engine.ts handles "Book chapter:verse" addressed
// scripture (e.g. "John 3:16"), this engine handles UN-addressed
// quotations the speaker assumes the congregation already knows
// ("the heavens declare the glory of God", "trouble don't last
// always", "Lazarus come forth"). Same pipeline position as the
// existing keyword-search and semantic-match recovery paths, but
// strictly local — no API call, no embeddings, no network.
//
// Pipeline:
//   1. NORMALISE       lowercase, strip punctuation, collapse spaces
//                      → both the input transcript AND each catalogue
//                      phrase share the same normaliser so substring
//                      scans align.
//   2. SUBSTRING SCAN  fast O(N·M) sliding scan of the recent
//                      transcript tail against every catalogue
//                      phrase. Catalogue is ~190 entries so even a
//                      naive scan stays well under 1ms per chunk on
//                      the operator's hardware.
//   3. FUZZY FALLBACK  if no exact substring hit, slide a window of
//                      the same word-count over the tail and accept a
//                      match when ≥ MIN_TOKEN_OVERLAP fraction of
//                      catalogue tokens appear in the window (with
//                      Levenshtein-1 tolerance per token, reusing the
//                      same forgiveness model as verseTextSimilarity
//                      in speech-provider). Default: 0.80, matching
//                      the operator's spec.
//   4. DEDUPE          callers pass a `recentlyDetected` set so the
//                      same reference doesn't re-fire on every chunk.
//
// "General Sermon Phrase" entries (e.g. "say amen somebody") are
// marked sermonOnly:true. They MAY surface to UI for diagnostics but
// MUST NOT push a Bible slide — they have no reference to push.

export interface PreacherPhrase {
  /** Original wording from the operator's catalogue. */
  phrase: string
  /** Bible reference like "John 3:16", or "General Sermon Phrase". */
  reference: string
  /** True for entries with no real Bible address (filler / call-and-response). */
  sermonOnly: boolean
  /** Pre-normalised phrase (lowercase, no punctuation, single spaces). */
  normalized: string
  /** Pre-tokenised normalised phrase. */
  tokens: string[]
}

export interface PreacherPhraseHit {
  phrase: string
  reference: string
  sermonOnly: boolean
  /** 0..1 — 1.0 for exact substring, 0.80..0.99 for fuzzy. */
  score: number
  /** 'exact' | 'fuzzy'. */
  matchType: 'exact' | 'fuzzy'
  /** Index into the ORIGINAL (un-normalised) input where the match starts. */
  startIndex: number
}

export interface DetectOptions {
  /** Minimum token-overlap fraction for fuzzy match. Default 0.80. */
  minFuzzy?: number
  /** Skip phrases whose reference is in this set (recent-detection cache). */
  excludeReferences?: ReadonlySet<string>
  /** Limit scan to last N chars of input (perf guard). Default 600. */
  tailChars?: number
}

// ─────────────────────────────────────────────────────────────────────
// Catalogue — combined from three operator-supplied lists
// (Pasted-the-heavens-declare…, Pasted--phrase-say-amen-somebody…,
// MASTER-INSTRUCTION-BIBLE-VERSE-DETECTION-SYSTEM). Duplicates
// across lists are kept once; near-duplicate variants ("is anything
// too hard for the Lord" vs "is there anything too hard for God")
// are kept as separate entries because each surfaces different
// transcription mistakes.
// ─────────────────────────────────────────────────────────────────────
const RAW_CATALOGUE: ReadonlyArray<{ phrase: string; reference: string }> = [
  // ── Foundational verses ────────────────────────────────────────────
  { phrase: 'jesus wept', reference: 'John 11:35' },
  { phrase: 'for god so loved the world', reference: 'John 3:16' },
  { phrase: 'the lord is my shepherd', reference: 'Psalm 23:1' },
  { phrase: 'i shall not want', reference: 'Psalm 23:1' },
  { phrase: 'in the beginning god created', reference: 'Genesis 1:1' },
  { phrase: 'let there be light', reference: 'Genesis 1:3' },
  { phrase: 'be fruitful and multiply', reference: 'Genesis 1:28' },
  { phrase: "am i my brother's keeper", reference: 'Genesis 4:9' },
  { phrase: 'is anything too hard for the lord', reference: 'Genesis 18:14' },
  { phrase: 'is there anything too hard for god', reference: 'Genesis 18:14' },
  { phrase: 'you meant it for evil but god meant it for good', reference: 'Genesis 50:20' },

  // ── Exodus / Joshua / 1 Samuel ─────────────────────────────────────
  { phrase: 'the lord will fight for you', reference: 'Exodus 14:14' },
  { phrase: 'stand still and see the salvation of the lord', reference: 'Exodus 14:13' },
  { phrase: 'choose you this day whom you will serve', reference: 'Joshua 24:15' },
  { phrase: 'as for me and my house we will serve the lord', reference: 'Joshua 24:15' },
  { phrase: "the battle is the lord's", reference: '1 Samuel 17:47' },
  { phrase: 'man looks at the outward appearance', reference: '1 Samuel 16:7' },
  { phrase: 'the lord looks at the heart', reference: '1 Samuel 16:7' },

  // ── Job ────────────────────────────────────────────────────────────
  { phrase: 'your latter shall be greater than your former', reference: 'Job 8:7' },
  { phrase: 'the lord gave and the lord has taken away', reference: 'Job 1:21' },
  { phrase: 'though he slay me yet will i trust him', reference: 'Job 13:15' },

  // ── Psalms ─────────────────────────────────────────────────────────
  { phrase: 'the heavens declare the glory of god', reference: 'Psalm 19:1' },
  { phrase: 'the firmament shows his handiwork', reference: 'Psalm 19:1' },
  { phrase: 'your rod and your staff they comfort me', reference: 'Psalm 23:4' },
  { phrase: 'surely goodness and mercy shall follow me', reference: 'Psalm 23:6' },
  { phrase: 'the lord is my light and my salvation', reference: 'Psalm 27:1' },
  { phrase: 'whom shall i fear', reference: 'Psalm 27:1' },
  { phrase: 'wait on the lord', reference: 'Psalm 27:14' },
  { phrase: 'be of good courage', reference: 'Psalm 27:14' },
  { phrase: 'weeping may endure for a night', reference: 'Psalm 30:5' },
  { phrase: 'joy comes in the morning', reference: 'Psalm 30:5' },
  { phrase: "trouble don't last always", reference: 'Psalm 30:5' },
  { phrase: 'if you delight yourself in the lord', reference: 'Psalm 37:4' },
  { phrase: 'he will give you the desires of your heart', reference: 'Psalm 37:4' },
  { phrase: "i once was young and now i'm old", reference: 'Psalm 37:25' },
  { phrase: 'never seen the righteous forsaken', reference: 'Psalm 37:25' },
  { phrase: 'as the deer pants for the water', reference: 'Psalm 42:1' },
  { phrase: 'so my soul longs after thee', reference: 'Psalm 42:1' },
  { phrase: 'deep calls unto deep', reference: 'Psalm 42:7' },
  { phrase: 'why are you cast down oh my soul', reference: 'Psalm 42:11' },
  { phrase: 'hope thou in god', reference: 'Psalm 42:11' },
  { phrase: 'god is a present help in trouble', reference: 'Psalm 46:1' },
  { phrase: 'he may not come when you want him', reference: 'Psalm 46:1' },
  { phrase: "but he's always on time", reference: 'Psalm 46:1' },
  { phrase: 'be still and know that i am god', reference: 'Psalm 46:10' },
  { phrase: 'if i regard iniquity in my heart', reference: 'Psalm 66:18' },
  { phrase: 'no good thing will he withhold', reference: 'Psalm 84:11' },
  { phrase: 'bless the lord oh my soul', reference: 'Psalm 103:1' },
  { phrase: 'forget not all his benefits', reference: 'Psalm 103:2' },
  { phrase: 'he forgives all your iniquities', reference: 'Psalm 103:3' },
  { phrase: 'he heals all your diseases', reference: 'Psalm 103:3' },
  { phrase: 'touch not my anointed', reference: 'Psalm 105:15' },
  { phrase: 'do my prophets no harm', reference: 'Psalm 105:15' },
  { phrase: 'god sits high and looks low', reference: 'Psalm 113:5-6' },
  { phrase: 'the stone the builders rejected', reference: 'Psalm 118:22' },
  { phrase: 'has become the cornerstone', reference: 'Psalm 118:22' },
  { phrase: 'this is the day the lord has made', reference: 'Psalm 118:24' },
  { phrase: 'we will rejoice and be glad in it', reference: 'Psalm 118:24' },
  { phrase: 'how can a young man cleanse his way', reference: 'Psalm 119:9' },
  { phrase: 'forever oh lord your word is settled in heaven', reference: 'Psalm 119:89' },
  { phrase: 'the entrance of your word gives light', reference: 'Psalm 119:130' },
  { phrase: 'your mercy endures forever', reference: 'Psalm 136:1' },
  { phrase: 'give thanks unto the lord for he is good', reference: 'Psalm 136:1' },
  { phrase: 'enter his gates with thanksgiving', reference: 'Psalm 100:4' },

  // ── Proverbs ───────────────────────────────────────────────────────
  { phrase: 'trust in the lord with all your heart', reference: 'Proverbs 3:5' },
  { phrase: 'lean not on your own understanding', reference: 'Proverbs 3:5' },
  { phrase: 'acknowledge him and he shall direct your paths', reference: 'Proverbs 3:6' },
  { phrase: 'wisdom is the principal thing', reference: 'Proverbs 4:7' },
  { phrase: 'guard your heart with all diligence', reference: 'Proverbs 4:23' },
  { phrase: 'the blessing of the lord makes rich', reference: 'Proverbs 10:22' },
  { phrase: 'riches profit not in the day of wrath', reference: 'Proverbs 11:4' },
  { phrase: 'he who wins souls is wise', reference: 'Proverbs 11:30' },
  { phrase: 'righteousness exalts a nation', reference: 'Proverbs 14:34' },
  { phrase: 'commit your works unto the lord', reference: 'Proverbs 16:3' },
  { phrase: 'pride goes before destruction', reference: 'Proverbs 16:18' },
  { phrase: 'a merry heart does good like medicine', reference: 'Proverbs 17:22' },
  { phrase: 'the name of the lord is a strong tower', reference: 'Proverbs 18:10' },
  { phrase: 'life and death are in the power of the tongue', reference: 'Proverbs 18:21' },
  { phrase: 'he that finds a wife finds a good thing', reference: 'Proverbs 18:22' },

  // ── Ecclesiastes / Isaiah / Jeremiah / Joel / Malachi ─────────────
  { phrase: 'the race is not to the swift', reference: 'Ecclesiastes 9:11' },
  { phrase: 'nor the battle to the strong', reference: 'Ecclesiastes 9:11' },
  { phrase: 'though your sins be as scarlet', reference: 'Isaiah 1:18' },
  { phrase: 'they shall be white as snow', reference: 'Isaiah 1:18' },
  { phrase: 'unto us a child is born', reference: 'Isaiah 9:6' },
  { phrase: 'the government shall be upon his shoulder', reference: 'Isaiah 9:6' },
  { phrase: 'behold i do a new thing', reference: 'Isaiah 43:19' },
  { phrase: 'shall you not know it', reference: 'Isaiah 43:19' },
  { phrase: 'god will make a way somehow', reference: 'Isaiah 43:19' },
  { phrase: 'god will make a way', reference: 'Isaiah 43:19' },
  { phrase: 'he was wounded for our transgressions', reference: 'Isaiah 53:5' },
  { phrase: 'the chastisement of our peace was upon him', reference: 'Isaiah 53:5' },
  { phrase: 'no weapon formed against you shall prosper', reference: 'Isaiah 54:17' },
  { phrase: 'when the enemy comes in like a flood', reference: 'Isaiah 59:19' },
  { phrase: 'the spirit of the lord will lift up a standard', reference: 'Isaiah 59:19' },
  { phrase: 'arise shine for your light has come', reference: 'Isaiah 60:1' },
  { phrase: 'i know the plans i have for you', reference: 'Jeremiah 29:11' },
  { phrase: 'plans to prosper you and not to harm you', reference: 'Jeremiah 29:11' },
  { phrase: 'call upon me and i will answer you', reference: 'Jeremiah 33:3' },
  { phrase: 'i will pour out my spirit upon all flesh', reference: 'Joel 2:28' },
  { phrase: 'your sons and daughters shall prophesy', reference: 'Joel 2:28' },
  { phrase: 'old men shall dream dreams', reference: 'Joel 2:28' },
  { phrase: 'young men shall see visions', reference: 'Joel 2:28' },
  { phrase: 'let the weak say i am strong', reference: 'Joel 3:10' },
  { phrase: 'multitudes in the valley of decision', reference: 'Joel 3:14' },
  { phrase: 'return unto me and i will return unto you', reference: 'Malachi 3:7' },
  { phrase: 'open the windows of heaven', reference: 'Malachi 3:10' },
  { phrase: 'pour you out a blessing', reference: 'Malachi 3:10' },
  { phrase: 'the sun of righteousness shall arise', reference: 'Malachi 4:2' },

  // ── Matthew / Mark / Luke ─────────────────────────────────────────
  { phrase: 'blessed are the pure in heart', reference: 'Matthew 5:8' },
  { phrase: 'blessed are the peacemakers', reference: 'Matthew 5:9' },
  { phrase: 'you are the light of the world', reference: 'Matthew 5:14' },
  { phrase: 'let your light so shine before men', reference: 'Matthew 5:16' },
  { phrase: 'lay not up treasures on earth', reference: 'Matthew 6:19' },
  { phrase: 'where your treasure is there your heart will be also', reference: 'Matthew 6:21' },
  { phrase: 'no man can serve two masters', reference: 'Matthew 6:24' },
  { phrase: 'judge not that you be not judged', reference: 'Matthew 7:1' },
  { phrase: 'narrow is the way which leads to life', reference: 'Matthew 7:14' },
  { phrase: 'stretch forth your hand', reference: 'Matthew 12:13' },
  { phrase: "healing is the children's bread", reference: 'Matthew 15:26' },
  { phrase: 'this kind does not go out except by prayer and fasting', reference: 'Matthew 17:21' },
  { phrase: 'many are called but few are chosen', reference: 'Matthew 22:14' },
  { phrase: "render unto caesar the things that are caesar's", reference: 'Matthew 22:21' },
  { phrase: 'he who has ears to hear let him hear', reference: 'Mark 4:9' },
  { phrase: 'peace be still', reference: 'Mark 4:39' },
  { phrase: 'who touched me', reference: 'Mark 5:30' },
  { phrase: 'your faith has made you whole', reference: 'Mark 5:34' },
  { phrase: 'go into all the world and preach the gospel', reference: 'Mark 16:15' },
  { phrase: 'these signs shall follow them that believe', reference: 'Mark 16:17' },
  { phrase: 'give and it shall be given unto you', reference: 'Luke 6:38' },
  { phrase: 'pressed down shaken together and running over', reference: 'Luke 6:38' },
  { phrase: 'the kingdom of god is within you', reference: 'Luke 17:21' },
  { phrase: 'occupy till i come', reference: 'Luke 19:13' },

  // ── John / Acts ────────────────────────────────────────────────────
  { phrase: 'take up your bed and walk', reference: 'John 5:8' },
  { phrase: 'you shall know the truth', reference: 'John 8:32' },
  { phrase: 'if the son therefore shall make you free', reference: 'John 8:36' },
  { phrase: 'you shall be free indeed', reference: 'John 8:36' },
  { phrase: 'my sheep hear my voice', reference: 'John 10:27' },
  { phrase: 'i and my father are one', reference: 'John 10:30' },
  { phrase: 'roll away the stone', reference: 'John 11:39' },
  { phrase: 'lazarus come forth', reference: 'John 11:43' },
  { phrase: 'peace i leave with you', reference: 'John 14:27' },
  { phrase: 'my peace i give unto you', reference: 'John 14:27' },
  { phrase: 'you did not choose me but i chose you', reference: 'John 15:16' },
  { phrase: 'you shall receive power', reference: 'Acts 1:8' },
  { phrase: 'repent and be baptized every one of you', reference: 'Acts 2:38' },
  { phrase: 'they continued steadfastly in the apostles doctrine', reference: 'Acts 2:42' },
  { phrase: 'we ought to obey god rather than men', reference: 'Acts 5:29' },

  // ── Romans / Corinthians / Galatians ──────────────────────────────
  { phrase: 'the just shall live by faith', reference: 'Romans 1:17' },
  { phrase: 'all have sinned', reference: 'Romans 3:23' },
  { phrase: 'what shall we say then', reference: 'Romans 6:1' },
  { phrase: 'shall we continue in sin that grace may abound', reference: 'Romans 6:1' },
  { phrase: 'the wages of sin is death', reference: 'Romans 6:23' },
  { phrase: 'the gift of god is eternal life', reference: 'Romans 6:23' },
  { phrase: 'there is therefore now no condemnation', reference: 'Romans 8:1' },
  { phrase: 'the law of the spirit of life in christ jesus', reference: 'Romans 8:2' },
  { phrase: 'be not conformed to this world', reference: 'Romans 12:2' },
  { phrase: 'be transformed by the renewing of your mind', reference: 'Romans 12:2' },
  { phrase: 'love never fails', reference: '1 Corinthians 13:8' },
  { phrase: 'now abides faith hope and love', reference: '1 Corinthians 13:13' },
  { phrase: 'god is not the author of confusion', reference: '1 Corinthians 14:33' },
  { phrase: 'we have this treasure in earthen vessels', reference: '2 Corinthians 4:7' },
  { phrase: 'walk by faith not by sight', reference: '2 Corinthians 5:7' },
  { phrase: 'walk by faith', reference: '2 Corinthians 5:7' },
  { phrase: 'step out on faith', reference: '2 Corinthians 5:7' },
  { phrase: 'if any man be in christ he is a new creature', reference: '2 Corinthians 5:17' },
  { phrase: 'old things are passed away', reference: '2 Corinthians 5:17' },
  { phrase: 'my grace is sufficient for you', reference: '2 Corinthians 12:9' },
  { phrase: 'the fruit of the spirit is love joy peace', reference: 'Galatians 5:22' },
  { phrase: "bear one another's burdens", reference: 'Galatians 6:2' },

  // ── Ephesians / Philippians / Colossians / Thessalonians / Timothy ──
  { phrase: 'god is able to do exceedingly abundantly', reference: 'Ephesians 3:20' },
  { phrase: 'above all that we ask or think', reference: 'Ephesians 3:20' },
  { phrase: 'put on the whole armor of god', reference: 'Ephesians 6:11' },
  { phrase: 'we wrestle not against flesh and blood', reference: 'Ephesians 6:12' },
  { phrase: 'having done all to stand', reference: 'Ephesians 6:13' },
  { phrase: 'stand therefore having your loins girt about with truth', reference: 'Ephesians 6:14' },
  { phrase: 'stand therefore', reference: 'Ephesians 6:14' },
  { phrase: 'having your loins girt with truth', reference: 'Ephesians 6:14' },
  { phrase: 'take the shield of faith', reference: 'Ephesians 6:16' },
  { phrase: 'quench all the fiery darts', reference: 'Ephesians 6:16' },
  { phrase: 'put on the helmet of salvation', reference: 'Ephesians 6:17' },
  { phrase: 'let this mind be in you which was also in christ jesus', reference: 'Philippians 2:5' },
  { phrase: 'press toward the mark', reference: 'Philippians 3:14' },
  { phrase: 'rejoice in the lord always', reference: 'Philippians 4:4' },
  { phrase: 'i can do all things through christ', reference: 'Philippians 4:13' },
  { phrase: 'christ in you the hope of glory', reference: 'Colossians 1:27' },
  { phrase: 'continue in prayer and watch in the same', reference: 'Colossians 4:2' },
  { phrase: 'pray without ceasing', reference: '1 Thessalonians 5:17' },
  { phrase: 'prove all things hold fast that which is good', reference: '1 Thessalonians 5:21' },
  { phrase: 'study to show yourself approved', reference: '2 Timothy 2:15' },
  { phrase: 'all scripture is given by inspiration of god', reference: '2 Timothy 3:16' },

  // ── Hebrews / James / Peter / John / Jude / Revelation ───────────
  { phrase: 'the joy of the lord is your strength', reference: 'Nehemiah 8:10' },
  { phrase: 'lay aside every weight', reference: 'Hebrews 12:1' },
  { phrase: 'run the race set before you', reference: 'Hebrews 12:1' },
  { phrase: 'looking unto jesus the author and finisher of our faith', reference: 'Hebrews 12:2' },
  { phrase: 'jesus christ the same yesterday and today and forever', reference: 'Hebrews 13:8' },
  { phrase: "hold on to god's unchanging hand", reference: 'Hebrews 13:8' },
  { phrase: 'be doers of the word and not hearers only', reference: 'James 1:22' },
  { phrase: 'resist the devil and he will flee', reference: 'James 4:7' },
  { phrase: 'draw near to god and he will draw near to you', reference: 'James 4:8' },
  { phrase: 'the effective fervent prayer of a righteous man avails much', reference: 'James 5:16' },
  { phrase: 'the effectual fervent prayer', reference: 'James 5:16' },
  { phrase: 'faith without works is dead', reference: 'James 2:26' },
  { phrase: 'humble yourselves under the mighty hand of god', reference: '1 Peter 5:6' },
  { phrase: 'be sober be vigilant', reference: '1 Peter 5:8' },
  { phrase: 'walk in the light as he is in the light', reference: '1 John 1:7' },
  { phrase: 'greater is he that is in you', reference: '1 John 4:4' },
  { phrase: 'perfect love casts out fear', reference: '1 John 4:18' },
  { phrase: 'keep yourselves in the love of god', reference: 'Jude 1:21' },
  { phrase: 'worthy is the lamb that was slain', reference: 'Revelation 5:12' },
  { phrase: 'hallelujah for the lord god omnipotent reigns', reference: 'Revelation 19:6' },
  { phrase: 'it is done i am alpha and omega', reference: 'Revelation 21:6' },

  // ── Sermon-only filler (no Bible address) ─────────────────────────
  { phrase: 'say amen somebody', reference: 'General Sermon Phrase' },
  { phrase: 'can i get an amen', reference: 'General Sermon Phrase' },
]

// ─────────────────────────────────────────────────────────────────────
// Normaliser — shared by both catalogue compile-time and runtime input.
// ─────────────────────────────────────────────────────────────────────
export function normalizePhrase(s: string): string {
  return s
    .toLowerCase()
    .replace(/['\u2018\u2019\u02bc]/g, '') // strip apostrophes (don't → dont)
    .replace(/[^a-z0-9\s]+/g, ' ')         // strip remaining punctuation
    .replace(/\s+/g, ' ')                  // collapse whitespace
    .trim()
}

// ─────────────────────────────────────────────────────────────────────
// Compile catalogue once at module load. Dedupe by normalised form so
// duplicates across the three operator lists collapse to one entry
// (preferring the first reference seen).
// ─────────────────────────────────────────────────────────────────────
export const PREACHER_PHRASES: ReadonlyArray<PreacherPhrase> = (() => {
  const seen = new Set<string>()
  const out: PreacherPhrase[] = []
  for (const { phrase, reference } of RAW_CATALOGUE) {
    const normalized = normalizePhrase(phrase)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push({
      phrase,
      reference,
      sermonOnly: reference === 'General Sermon Phrase',
      normalized,
      tokens: normalized.split(' '),
    })
  }
  return out
})()

// ─────────────────────────────────────────────────────────────────────
// Levenshtein distance, capped at 2 (same shape as verseTextSimilarity
// in speech-provider.tsx — keeps the forgiveness model consistent).
// ─────────────────────────────────────────────────────────────────────
function lev2(a: string, b: string): number {
  if (a === b) return 0
  const la = a.length
  const lb = b.length
  if (Math.abs(la - lb) > 2) return 3
  let prev = new Array<number>(lb + 1)
  let curr = new Array<number>(lb + 1)
  for (let j = 0; j <= lb; j++) prev[j] = j
  for (let i = 1; i <= la; i++) {
    curr[0] = i
    let rowMin = curr[0]
    for (let j = 1; j <= lb; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
      if (curr[j] < rowMin) rowMin = curr[j]
    }
    if (rowMin > 2) return 3
    ;[prev, curr] = [curr, prev]
  }
  return prev[lb]
}

function tokenMatches(a: string, b: string): boolean {
  if (a === b) return true
  // Levenshtein-1 forgiveness for words ≥ 4 chars (same threshold as
  // verseTextSimilarity). "salvation" ↔ "salavation", "lazarus" ↔
  // "lazerus", etc. Sub-4-char tokens require exact match.
  if (a.length >= 4 && b.length >= 4 && lev2(a, b) <= 1) return true
  return false
}

// ─────────────────────────────────────────────────────────────────────
// Public detector
// ─────────────────────────────────────────────────────────────────────
export function detectPreacherPhrases(
  rawText: string,
  opts: DetectOptions = {},
): PreacherPhraseHit[] {
  const tailChars = opts.tailChars ?? 600
  const minFuzzy = opts.minFuzzy ?? 0.80
  const exclude = opts.excludeReferences

  // Trim to the recent tail to keep scans cheap on long transcripts.
  const sliced = rawText.length > tailChars ? rawText.slice(-tailChars) : rawText
  const baseOffset = rawText.length - sliced.length
  const normInput = normalizePhrase(sliced)
  if (!normInput) return []
  const inputTokens = normInput.split(' ')

  const hits: PreacherPhraseHit[] = []
  const seenRefs = new Set<string>()

  for (const entry of PREACHER_PHRASES) {
    if (exclude && exclude.has(entry.reference)) continue
    if (seenRefs.has(entry.reference)) continue

    // ── 1. Exact normalised substring ────────────────────────────────
    const idxNorm = normInput.indexOf(entry.normalized)
    if (idxNorm !== -1) {
      // Map normalised offset back to a raw-text offset by counting
      // word boundaries — good enough for highlighting purposes.
      const wordIdxInNorm = normInput.slice(0, idxNorm).split(' ').filter(Boolean).length
      const rawIdx = approximateRawIndex(sliced, wordIdxInNorm) + baseOffset
      hits.push({
        phrase: entry.phrase,
        reference: entry.reference,
        sermonOnly: entry.sermonOnly,
        score: 1.0,
        matchType: 'exact',
        startIndex: rawIdx,
      })
      seenRefs.add(entry.reference)
      continue
    }

    // ── 2. Fuzzy: sliding window of same length ──────────────────────
    const need = entry.tokens.length
    if (need < 3 || inputTokens.length < need) continue // <3-token phrases too noisy for fuzzy
    let bestScore = 0
    let bestStart = -1
    for (let i = 0; i + need <= inputTokens.length; i++) {
      let hit = 0
      for (let j = 0; j < need; j++) {
        if (tokenMatches(inputTokens[i + j], entry.tokens[j])) hit++
      }
      const score = hit / need
      if (score > bestScore) {
        bestScore = score
        bestStart = i
      }
    }
    if (bestScore >= minFuzzy && bestStart !== -1) {
      const rawIdx = approximateRawIndex(sliced, bestStart) + baseOffset
      hits.push({
        phrase: entry.phrase,
        reference: entry.reference,
        sermonOnly: entry.sermonOnly,
        score: Math.min(0.99, bestScore),
        matchType: 'fuzzy',
        startIndex: rawIdx,
      })
      seenRefs.add(entry.reference)
    }
  }

  // Highest-confidence first.
  hits.sort((a, b) => b.score - a.score)
  return hits
}

export function detectBestPreacherPhrase(
  rawText: string,
  opts: DetectOptions = {},
): PreacherPhraseHit | null {
  const all = detectPreacherPhrases(rawText, opts)
  return all.length ? all[0] : null
}

// Best-effort mapping from a normalised word-index back to the raw
// input. We walk the raw string counting alphanumeric runs as words;
// when we've passed `wordIdx` of them we return the start of the next
// run. Off-by-a-few characters is acceptable — this index is only
// used for UI highlighting.
function approximateRawIndex(raw: string, wordIdx: number): number {
  if (wordIdx <= 0) return 0
  let count = 0
  let inWord = false
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i)
    const isWord =
      (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122)
    if (isWord && !inWord) {
      if (count === wordIdx) return i
      count++
      inWord = true
    } else if (!isWord) {
      inWord = false
    }
  }
  return raw.length
}
