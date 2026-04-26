/**
 * Bible book names + common preaching vocabulary, fed to Deepgram as
 * `keyterm` query params on every streaming connection.
 *
 * Deepgram Nova-3's keyterm prompting heavily biases the model toward
 * recognising these tokens correctly — critical for our use case
 * because Bible book names ("Galatians", "Habakkuk", "Zephaniah") and
 * spoken numbers around them are the WHOLE detection signal.
 *
 * Each entry becomes one `&keyterm=...` query param on the WSS URL.
 * Spaces are URL-encoded; we keep multi-word phrases ("Song of
 * Solomon", "1 Corinthians") as single keyterms so Deepgram boosts
 * the whole phrase, not the individual words.
 */
export const BIBLE_KEYTERMS: readonly string[] = Object.freeze([
  // ─── Old Testament ───────────────────────────────────────────────
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
  "Joshua", "Judges", "Ruth",
  "1 Samuel", "2 Samuel", "First Samuel", "Second Samuel",
  "1 Kings", "2 Kings", "First Kings", "Second Kings",
  "1 Chronicles", "2 Chronicles", "First Chronicles", "Second Chronicles",
  "Ezra", "Nehemiah", "Esther",
  "Job", "Psalms", "Psalm", "Proverbs", "Ecclesiastes", "Song of Solomon",
  "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel",
  "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah",
  "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi",

  // ─── New Testament ───────────────────────────────────────────────
  "Matthew", "Mark", "Luke", "John", "Acts", "Romans",
  "1 Corinthians", "2 Corinthians", "First Corinthians", "Second Corinthians",
  "Galatians", "Ephesians", "Philippians", "Colossians",
  "1 Thessalonians", "2 Thessalonians", "First Thessalonians", "Second Thessalonians",
  "1 Timothy", "2 Timothy", "First Timothy", "Second Timothy",
  "Titus", "Philemon", "Hebrews", "James",
  "1 Peter", "2 Peter", "First Peter", "Second Peter",
  "1 John", "2 John", "3 John", "First John", "Second John", "Third John",
  "Jude", "Revelation",

  // ─── Reference vocabulary ────────────────────────────────────────
  // The triggers that make a verse-detection commit succeed in the
  // bible-api parser — boosting them helps Deepgram emit the colon
  // form ("John 3:16") and the "chapter X verse Y" form correctly.
  "chapter", "verse", "verses",
  "the Bible says", "scripture says", "according to scripture",
  "turn to", "let us read", "open your Bibles",

  // ─── Christian vocabulary ────────────────────────────────────────
  "Jesus", "Christ", "Lord", "God", "Holy Spirit",
  "gospel", "salvation", "righteousness", "kingdom",
  "covenant", "prophet", "apostle", "disciple",
  "faith", "grace", "mercy", "repentance", "amen", "hallelujah",
])
