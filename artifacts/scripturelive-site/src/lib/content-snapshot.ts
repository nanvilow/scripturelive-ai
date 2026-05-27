// Snapshot of marketing content captured from the legacy admin API on 2026-05-27.
// Source: https://scriptureliveai.com/api/{features,pricing,testimonials,page-content,downloads,hero-buttons}
// This is the source of truth for the static Cloudflare Pages deployment.
// To edit: change the values in this file on GitHub.com (pencil icon) — Cloudflare Pages will rebuild automatically.

export const SNAPSHOT_FEATURES = [
  { id: 7, title: "AI Verse Detection", description: "Detects scripture while preaching, automatically matches and displays the correct Bible verse with high accuracy — in real time.", icon: "brain", sortOrder: 1 },
  { id: 8, title: "NDI Output Integration", description: "Send output directly to OBS Studio, vMix, and Wirecast. One-click broadcasting to your entire production workflow.", icon: "video", sortOrder: 2 },
  { id: 9, title: "Dual Screen Display", description: "Preview and Live Output simultaneously. Lower Third or Full Screen modes — perfect for projectors and LED walls.", icon: "monitor", sortOrder: 3 },
  { id: 10, title: "Typography & Custom Styling", description: "Customize fonts, colors, and layout to match your church brand. Designed for clarity in any sanctuary environment.", icon: "palette", sortOrder: 4 },
  { id: 11, title: "Smart Chapter Navigator", description: "Instantly jump between verses with a single click. Preview or send to Live. Keep your sermon flow smooth and uninterrupted.", icon: "book-open", sortOrder: 5 },
  { id: 12, title: "Live Transcription Engine", description: "Converts speech to text in real-time and feeds the AI detection system — the engine behind every automatic verse match.", icon: "mic", sortOrder: 6 },
  { id: 13, title: "Speaker-Follow Mode", description: "Locks onto the preacher's microphone and intelligently ignores congregation noise, singing, and background chatter.", icon: "shield-check", sortOrder: 7 },
  { id: 14, title: "Live Translation Sync", description: "Switch from KJV to MSG instantly. The verse on screen updates immediately without having to take it off air.", icon: "refresh-cw", sortOrder: 8 },
  { id: 15, title: "Voice Commands", description: "Say 'next verse', 'go back', 'show John 3:16', or 'clear screen'. The app listens and executes immediately.", icon: "message-square", sortOrder: 9 },
]

export const SNAPSHOT_PRICING = [
  {
    id: 1, name: "Starter", price: "Free", period: "forever",
    description: "Perfect for small churches just getting started with smart scripture display.",
    features: ["AI Verse Detection (Free Trial)", "Dual Screen Display", "Up to 2 screens"],
    isPopular: false, sortOrder: 1,
  },
  {
    id: 2, name: "Pro", price: "GHS 200", period: "per month",
    description: "The full ScriptureLive experience for growing congregations.",
    features: ["NDI Output Integration", "Full Typography & Styling", "Priority Support", "AI Verse Detection (OpenAI Mode)"],
    isPopular: true, sortOrder: 2,
  },
  {
    id: 3, name: "Church License", price: "GHS 1,800", period: "Year",
    description: "A long-term license for established ministries: pay once and own it for a year without interruptions.",
    features: ["Everything in Pro", "Dedicated WhatsApp support", "AI Verse Detection (OpenAI Mode)", "Unlimited Screens", "All future updates", "Full Typography & Styling"],
    isPopular: false, sortOrder: 3,
  },
]

export const SNAPSHOT_TESTIMONIALS = [
  { id: 2, name: "Elder Ruth Owusu", church: "New Life Church, Kumasi", quote: "We used to have a dedicated person typing verses manually. Now it's all automatic. The accuracy is incredible — it never misses a verse.", photoUrl: null, sortOrder: 0 },
  { id: 3, name: "Minister David Asante", church: "Restoration Chapel, Takoradi", quote: "The NDI integration with OBS is seamless. Our live stream quality went from amateur to professional overnight. Worth every penny.", photoUrl: null, sortOrder: 0 },
  { id: 4, name: "Pastor James Mensah", church: "Grace Assembly, Accra", quote: "ScriptureLive AI has completely transformed how we do Sunday service. Verses appear before I even finish the reference. Our congregation is more engaged than ever.", photoUrl: null, sortOrder: 0 },
  { id: 6, name: "Daniel Mensah", church: "Restoration Chapel, Takoradi", quote: "ScriptureLive AI has completely transformed how we handle live services. The instant Bible verse detection keeps our congregation engaged and aligned with the message.", photoUrl: null, sortOrder: 0 },
  { id: 7, name: "Daniel Mensah", church: "Restoration Chapel, Takoradi", quote: "ScriptureLive AI has completely transformed how we handle live services. The instant Bible verse detection keeps our congregation engaged and aligned with the message.", photoUrl: null, sortOrder: 0 },
  { id: 8, name: "Grace Mensah", church: "Christ Victory Chapel", quote: "I used to struggle finding scriptures quickly during worship, but now it's instant. It feels like the app already knows what's coming next. Honestly, it's a blessing for every church.", photoUrl: null, sortOrder: 0 },
  { id: 9, name: "Kwabena Asare", church: "New Covenant Assembly", quote: "This is not just an app; it's a ministry tool. ScriptureLive AI helps us stay focused on God instead of technical problems. That alone is priceless.", photoUrl: null, sortOrder: 0 },
  { id: 10, name: "Pastor Michael Boateng", church: "Dominion Faith Church", quote: "Preaching with ScriptureLive AI feels powerful. The verse suggestions during sermons? That's next-level. It's like having an assistant led by the Holy Spirit.", photoUrl: null, sortOrder: 0 },
  { id: 11, name: "Anita Kyei", church: "House of Praise International", quote: "Our projection team used to make mistakes under pressure. Now everything is smooth and accurate. ScriptureLive AI has taken away the stress completely.", photoUrl: null, sortOrder: 0 },
  { id: 12, name: "Deacon Samuel Tetteh", church: "Redeemed Life Chapel", quote: "I've used many church presentation tools, but this one is different. It's fast, intelligent, and designed for real ministry situations, not just theory.", photoUrl: null, sortOrder: 0 },
  { id: 13, name: "Josephine Adu", church: "Glory Impact Center", quote: "This app understands the flow of worship. From scriptures to transitions, everything feels guided. It's like technology finally caught up with church needs.", photoUrl: null, sortOrder: 0 },
  { id: 14, name: "Apostle Richard Nyarko", church: "Kingdom Expansion Church", quote: "The AI sermon support is powerful. It helps connect scriptures in a way that strengthens the message. This is the future of preaching tools.", photoUrl: null, sortOrder: 0 },
]

export const SNAPSHOT_PAGE_CONTENT = [
  { id: 1, key: "hero_headline", value: "Instant Scripture Display During Live Preaching . Powered by AI" },
  { id: 2, key: "hero_subtext", value: "ScriptureLive AI listens to the pastor, detects every Bible verse in real time, and automatically pushes them to your output screens. NDI outputs for OBS, vMix, Wirecast, etc. No more typing, no more searching for the verse of scripture paraphrases on Google anymore." },
  { id: 3, key: "why_description", value: "Designed for churches that want speed, accuracy, and modern presentation — without the stress of manual operation." },
  { id: 4, key: "support_whatsapp", value: "0246798526" },
  { id: 5, key: "support_email", value: "support@scriptureliveai.com" },
  { id: 6, key: "demo_url", value: "https://www.youtube.com/watch?v=BF6BLkDvI44" },
]

export const SNAPSHOT_DOWNLOADS = [
  { id: 1, label: "ScriptureLive AI for Windows", url: "#download", version: "1.0.0", platform: "Windows", isActive: true },
]

export const SNAPSHOT_HERO_BUTTONS = [
  { id: 1, label: "How To Setup", url: "https://youtu.be/uydYsiJ0QZo", icon: "BookOpen", variant: "primary", sortOrder: 1 },
]

export const SNAPSHOT_MEDIA_ASSETS: Array<{ key: string; url: string; alt?: string }> = []
