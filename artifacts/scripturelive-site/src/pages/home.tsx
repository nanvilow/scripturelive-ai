import { useEffect, useState } from "react";
import defaultLogoPath from "@/logo.png";
import { Button } from "@/components/ui/button";
import {
  useListFeatures,
  useListPricing,
  useListTestimonials,
  useListPageContent,
  useListMediaAssets,
  useListDownloads,
  useListHeroButtons,
} from "@/lib/api-stubs";
import {
  Check,
  CheckCircle2,
  MonitorPlay,
  Zap,
  ArrowRight,
  PlayCircle,
  Mic,
  Cpu,
  MonitorUp,
  ShieldCheck,
  Globe2,
  Clock,
  Sparkles,
  Download,
  Brain,
  Video,
  Monitor,
  Palette,
  BookOpen,
  RefreshCw,
  MessageSquare,
  Star,
  Plus,
  Minus,
  ChevronDown,
  Menu,
  X,
  HelpCircle,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";

const HERO_BUTTON_ICONS: Record<string, LucideIcon> = {
  PlayCircle,
  Video,
  BookOpen,
  HelpCircle,
  Globe: Globe2,
  Globe2,
  Download,
  Sparkles,
  ExternalLink,
};

function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

const GITHUB_RELEASES_PAGE =
  "https://github.com/nanvilow/scripturelive-ai/releases/latest";
const GITHUB_RELEASES_API =
  "https://api.github.com/repos/nanvilow/scripturelive-ai/releases/latest";
const FALLBACK_DOWNLOAD_URL = GITHUB_RELEASES_PAGE;

function isValidDownloadUrl(url: string | undefined | null): url is string {
  if (!url) return false;
  return /^(https?:\/\/|\/)/i.test(url);
}

type ReleaseInfo = {
  version: string;
  name: string;
  publishedAt: string;
  releaseUrl: string;
  notes: string;
  assetUrl: string | null;
  assetName: string | null;
  assetSize: number | null;
};

function useLatestRelease(): ReleaseInfo | null {
  const [info, setInfo] = useState<ReleaseInfo | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(GITHUB_RELEASES_API, {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: any) => {
        if (cancelled || !data) return;
        const tag: string = data.tag_name || "";
        const version = tag.replace(/^v/, "");
        const assets: any[] = Array.isArray(data.assets) ? data.assets : [];
        const exe = assets.find((a) =>
          /\.exe$/i.test(a?.name ?? ""),
        );
        setInfo({
          version,
          name: data.name || tag,
          publishedAt: data.published_at || "",
          releaseUrl: data.html_url || GITHUB_RELEASES_PAGE,
          notes: data.body || "",
          assetUrl: exe?.browser_download_url ?? null,
          assetName: exe?.name ?? null,
          assetSize: typeof exe?.size === "number" ? exe.size : null,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return info;
}

function formatRelativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  if (!then) return "";
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "1 month ago";
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

function LatestVersionBadge() {
  const release = useLatestRelease();
  if (!release || !release.version) return null;
  const size = formatBytes(release.assetSize);
  const when = formatRelativeDate(release.publishedAt);
  return (
    <div
      className="inline-flex items-center gap-2 mt-4 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-xs sm:text-sm text-primary"
      data-testid="latest-version-badge"
    >
      <Sparkles size={14} />
      <span className="font-semibold">v{release.version}</span>
      <span className="text-muted-foreground">
        {when && `released ${when}`}
        {size && ` · ${size}`}
      </span>
    </div>
  );
}

function useDownloadUrl(): string {
  const release = useLatestRelease();
  const { data: downloads } = useListDownloads();
  if (release?.assetUrl) return release.assetUrl;
  if (!downloads || downloads.length === 0) return FALLBACK_DOWNLOAD_URL;
  const active = downloads.filter((d) => d.isActive);
  const windows =
    active.find((d) => /windows/i.test(d.platform)) ?? active[0];
  return isValidDownloadUrl(windows?.url) ? windows.url : FALLBACK_DOWNLOAD_URL;
}

const DEFAULT_PRICING_TIERS = [
  {
    id: "free",
    name: "Free",
    price: "Free",
    period: "forever",
    description:
      "Perfect for small churches getting started with smart scripture display.",
    features: [
      "AI Verse Detection (Base Model)",
      "Dual Screen Display",
      "Basic Typography",
      "Up to 2 screens",
      "Email Support",
    ],
    isPopular: false,
  },
  {
    id: "monthly",
    name: "Monthly Plan",
    price: "GHS 200",
    period: "month",
    description: "The full ScriptureLive AI experience, billed monthly.",
    features: [
      "AI Verse Detection (OpenAI Mode)",
      "NDI Output Integration",
      "Unlimited Screens",
      "Full Typography & Styling",
      "Smart Chapter Navigator",
      "Priority Support",
      "All future updates",
    ],
    isPopular: true,
  },
  {
    id: "yearly",
    name: "Yearly Plan",
    price: "GHS 1,800",
    period: "year",
    description: "Save with annual billing. Pays for itself in 9 months.",
    features: [
      "Everything in Monthly Plan",
      "Save GHS 600 vs monthly",
      "Priority WhatsApp support",
      "Setup & onboarding call",
      "Custom branding options",
    ],
    isPopular: false,
  },
];

const ROTATING_VERSES = [
  {
    text: "For God so loved the world that he gave his one and only Son...",
    ref: "John 3:16",
    translation: "NIV",
  },
  {
    text: "I can do all things through Christ who strengthens me.",
    ref: "Philippians 4:13",
    translation: "NKJV",
  },
  {
    text: "The Lord is my shepherd; I shall not want.",
    ref: "Psalm 23:1",
    translation: "KJV",
  },
  {
    text: "Trust in the Lord with all your heart and lean not on your own understanding.",
    ref: "Proverbs 3:5",
    translation: "NIV",
  },
  {
    text: "In the beginning God created the heavens and the earth.",
    ref: "Genesis 1:1",
    translation: "ESV",
  },
  {
    text: "Be still, and know that I am God.",
    ref: "Psalm 46:10",
    translation: "NIV",
  },
];

const TRANSCRIPT_LINES = [
  "...and turning to the gospel of John, chapter three verse sixteen...",
  "...we read in Philippians four thirteen...",
  "...the psalmist declares in Psalm twenty-three...",
  "...as Solomon writes in Proverbs three verse five...",
  "...from the very beginning, Genesis one one says...",
  "...and the Lord tells us in Psalm forty-six ten...",
];

const DEFAULT_FEATURES = [
  {
    id: -1,
    title: "AI Verse Detection",
    description:
      "Detects scripture while preaching, automatically matches and displays the correct Bible verse with high accuracy — in real time.",
    icon: "brain",
  },
  {
    id: -2,
    title: "NDI Output Integration",
    description:
      "Send output directly to OBS Studio, vMix, and Wirecast. One-click broadcasting to your entire production workflow.",
    icon: "video",
  },
  {
    id: -3,
    title: "Dual Screen Display",
    description:
      "Preview and Live Output simultaneously. Lower Third or Full Screen modes — perfect for projectors and LED walls.",
    icon: "monitor",
  },
  {
    id: -4,
    title: "Typography & Custom Styling",
    description:
      "Customize fonts, colors, and layout to match your church brand. Designed for clarity in any sanctuary environment.",
    icon: "palette",
  },
  {
    id: -5,
    title: "Smart Chapter Navigator",
    description:
      "Instantly jump between verses with a single click. Preview or send to Live. Keep your sermon flow smooth and uninterrupted.",
    icon: "book-open",
  },
  {
    id: -6,
    title: "Live Transcription Engine",
    description:
      "Converts speech to text in real-time and feeds the AI detection system — the engine behind every automatic verse match.",
    icon: "mic",
  },
];

const DEFAULT_TESTIMONIALS = [
  {
    id: -1,
    name: "Pastor Daniel Owusu",
    church: "Grace Community Church, Accra",
    quote:
      "ScriptureLive AI has completely transformed our Sunday services. Our media team now focuses on worship instead of scrambling to find verses.",
  },
  {
    id: -2,
    name: "Mrs. Abena Mensah",
    church: "Living Word Chapel, Kumasi",
    quote:
      "The accuracy is unbelievable. It catches verses our pastor quotes off the cuff — even mid-sentence. Worth every cedi.",
  },
  {
    id: -3,
    name: "Bishop Samuel Adjei",
    church: "Victory Cathedral, Tema",
    quote:
      "We tried three other solutions before this. Nothing comes close. The NDI integration into our vMix setup is flawless.",
  },
];

const FAQ_ITEMS = [
  {
    q: "What is ScriptureLive AI?",
    a: "ScriptureLive AI is a Windows desktop app that uses AI to detect Bible verses spoken by the pastor in real time and instantly displays them on screens, NDI outputs, OBS, vMix and live streams — without the media team typing anything.",
  },
  {
    q: "Does it work offline?",
    a: "Yes. The base model runs fully on-device, so verse detection keeps working even if the internet drops mid-service. The OpenAI mode (Pro plans) uses the internet for higher accuracy.",
  },
  {
    q: "Which Bible translations are supported?",
    a: "KJV, NIV, ESV, NLT, NKJV, AMP and more — switchable per service from inside the app.",
  },
  {
    q: "How much does it cost in Ghana cedis?",
    a: "There is a free plan for small churches. The Monthly Plan is GHS 200 per month and the Yearly Plan is GHS 1,800 per year (saves you GHS 600 a year).",
  },
  {
    q: "Does it integrate with OBS, vMix or ProPresenter?",
    a: "Yes — ScriptureLive AI outputs over NDI, which is natively supported by OBS Studio, vMix, Wirecast and most modern broadcast tools. You can drop the verse output as a layer in your stream.",
  },
  {
    q: "What computer do I need to run it?",
    a: "Any Windows 10 or 11 PC with an Intel Core i5 / Ryzen 5 or better and 8 GB of RAM. A dedicated GPU is recommended for large LED walls.",
  },
];

const FEATURE_ICONS: Record<string, React.ReactNode> = {
  brain: <Brain size={22} />,
  video: <Video size={22} />,
  monitor: <Monitor size={22} />,
  palette: <Palette size={22} />,
  "book-open": <BookOpen size={22} />,
  mic: <Mic size={22} />,
  "shield-check": <ShieldCheck size={22} />,
  "refresh-cw": <RefreshCw size={22} />,
  "message-square": <MessageSquare size={22} />,
};

/* -------------------------------- NAVBAR -------------------------------- */

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const { data: media } = useListMediaAssets();
  const logoPath =
    media?.find((m) => m.key === "site_logo")?.url || defaultLogoPath;
  const logoAlt =
    media?.find((m) => m.key === "site_logo")?.alt || "ScriptureLive AI";
  const downloadUrl = useDownloadUrl();

  return (
    <nav
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-border/40 bg-background/80 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        <a href="#" className="flex items-center gap-3">
          <img
            src={logoPath}
            alt={logoAlt}
            className="h-10 w-auto object-contain"
            data-testid="img-nav-logo"
          />
          <span className="hidden sm:inline font-display font-bold text-lg tracking-tight">
            ScriptureLive <span className="text-primary">AI</span>
          </span>
        </a>
        <div className="hidden lg:flex items-center gap-8 text-sm font-medium">
          <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">Features</a>
          <a href="#how-it-works" className="text-muted-foreground hover:text-foreground transition-colors">How It Works</a>
          <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
          <a href="#faq" className="text-muted-foreground hover:text-foreground transition-colors">FAQ</a>
          <a href="#support" className="text-muted-foreground hover:text-foreground transition-colors">Support</a>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <Button asChild className="rounded-full px-3 sm:px-5 font-semibold" size="sm">
            <a href={downloadUrl} download data-testid="nav-download">
              <Download className="sm:mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Get Started</span>
            </a>
          </Button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-md border border-border/40 bg-background/40 text-foreground hover:bg-background/70 transition-colors"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-border/40 bg-background/95 backdrop-blur-xl">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 py-4 flex flex-col gap-1">
            {[
              { href: "#features", label: "Features" },
              { href: "#how-it-works", label: "How It Works" },
              { href: "#pricing", label: "Pricing" },
              { href: "#faq", label: "FAQ" },
              { href: "#support", label: "Support" },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-3 rounded-md text-base font-medium text-muted-foreground hover:text-foreground hover:bg-card/60 transition-colors"
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}

/* --------------------------- HERO EXTRA BUTTONS --------------------------- */

function HeroExtraButtons() {
  const { data: buttons } = useListHeroButtons();
  if (!buttons || buttons.length === 0) return null;
  return (
    <>
      {buttons.map((b) => {
        const Icon = HERO_BUTTON_ICONS[b.icon] || PlayCircle;
        const external = isExternalUrl(b.url);
        const isPrimary = b.variant === "primary";
        return (
          <Button
            key={b.id}
            asChild
            size="lg"
            variant={isPrimary ? "default" : "outline"}
            className={
              isPrimary
                ? "rounded-full px-8 h-14 text-base font-semibold w-full sm:w-auto shadow-xl shadow-primary/30 hover:shadow-primary/50 transition-shadow"
                : "rounded-full px-8 h-14 text-base font-semibold w-full sm:w-auto border-border/60 hover:bg-white/5"
            }
          >
            <a
              href={b.url}
              target={external ? "_blank" : undefined}
              rel={external ? "noreferrer" : undefined}
              data-testid={`btn-hero-${b.id}`}
            >
              <Icon className="mr-2 h-5 w-5" />
              {b.label}
            </a>
          </Button>
        );
      })}
    </>
  );
}

/* --------------------------- APP MOCKUP HERO --------------------------- */

function AppMockup() {
  const [verseIndex, setVerseIndex] = useState(0);
  const [transcript, setTranscript] = useState("");

  useEffect(() => {
    const target = TRANSCRIPT_LINES[verseIndex];
    let i = 0;
    setTranscript("");
    const typer = setInterval(() => {
      i += 2;
      setTranscript(target.slice(0, i));
      if (i >= target.length) clearInterval(typer);
    }, 35);

    const next = setTimeout(() => {
      setVerseIndex((v) => (v + 1) % ROTATING_VERSES.length);
    }, 5000);

    return () => {
      clearInterval(typer);
      clearTimeout(next);
    };
  }, [verseIndex]);

  const verse = ROTATING_VERSES[verseIndex];

  return (
    <div className="relative">
      {/* glow */}
      <div className="absolute -inset-6 bg-gradient-to-tr from-primary/30 via-primary/10 to-transparent blur-3xl rounded-3xl"></div>

      <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-primary/20 bg-[#0a0f1c]">
        {/* Window chrome */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#0d1426] border-b border-white/5">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/70"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/70"></div>
          </div>
          <div className="text-xs font-mono text-muted-foreground tracking-tight">
            ScriptureLive AI — Live Service
          </div>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
            <span className="text-[10px] font-mono uppercase tracking-wider text-red-400">
              REC
            </span>
          </div>
        </div>

        <div className="grid grid-cols-12">
          {/* Sidebar */}
          <div className="hidden sm:flex col-span-3 flex-col gap-1 p-3 border-r border-white/5 bg-[#0a0f1c]">
            {[
              { icon: <Mic size={14} />, label: "Live", active: true },
              { icon: <BookOpen size={14} />, label: "Library" },
              { icon: <MonitorUp size={14} />, label: "Outputs" },
              { icon: <Palette size={14} />, label: "Style" },
            ].map((item, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-md text-xs ${
                  item.active
                    ? "bg-primary/15 text-primary font-semibold"
                    : "text-muted-foreground"
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </div>
            ))}
            <div className="mt-auto pt-4 border-t border-white/5 mt-3">
              <div className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider mb-1">
                Engine
              </div>
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-emerald-400">AI Detecting</span>
              </div>
            </div>
          </div>

          {/* Main */}
          <div className="col-span-12 sm:col-span-9 p-5 sm:p-6 min-h-[340px] flex flex-col gap-4">
            {/* transcript */}
            <div className="rounded-lg bg-white/[0.02] border border-white/5 p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <Mic size={12} className="text-primary" />
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Live Transcript
                </span>
              </div>
              <p className="font-mono text-xs sm:text-[13px] text-muted-foreground leading-relaxed min-h-[3.25rem]">
                {transcript}
                <span className="inline-block w-1.5 h-3.5 bg-primary/80 ml-0.5 align-middle animate-pulse"></span>
              </p>
            </div>

            {/* Verse card */}
            <div
              key={verseIndex}
              className="relative rounded-xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border border-primary/30 p-5 sm:p-6 animate-in fade-in slide-in-from-bottom-2 duration-700"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
                    Detected
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {verse.translation}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">
                  98% match
                </span>
              </div>
              <p className="font-display text-base sm:text-lg md:text-xl text-white leading-snug mb-3">
                "{verse.text}"
              </p>
              <div className="flex items-center justify-between">
                <span className="text-primary font-display font-bold tracking-wide text-sm sm:text-base">
                  {verse.ref}
                </span>
                <div className="flex gap-1.5">
                  <span className="text-[10px] px-2 py-1 rounded bg-white/5 text-muted-foreground">
                    Preview
                  </span>
                  <span className="text-[10px] px-2 py-1 rounded bg-primary text-primary-foreground font-semibold">
                    Send Live ▸
                  </span>
                </div>
              </div>
            </div>

            {/* output strip */}
            <div className="grid grid-cols-3 gap-2 mt-auto">
              {["NDI Out", "OBS", "vMix"].map((o) => (
                <div
                  key={o}
                  className="rounded-md bg-white/[0.02] border border-white/5 p-2 flex items-center gap-2"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                  <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                    {o}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- HERO --------------------------------- */

function Hero() {
  const { data: content, isLoading: contentLoading } = useListPageContent();
  const { data: media } = useListMediaAssets();
  const heroHeadline = content?.find((c) => c.key === "hero_headline")?.value;
  const heroSubtext = content?.find((c) => c.key === "hero_subtext")?.value;
  const heroImage = media?.find((m) => m.key === "hero_image");
  const downloadUrl = useDownloadUrl();
  const HEADLINE_FALLBACK = "Real-Time Scripture Display, Powered by AI";
  const SUBTEXT_FALLBACK =
    "ScriptureLive AI listens to the pastor, detects every Bible verse in real time, and pushes it to your screens, NDI outputs and live stream — automatically. No more typing. No more searching.";
  const showHeadline = contentLoading ? "\u00A0" : heroHeadline || HEADLINE_FALLBACK;
  const showSubtext = contentLoading ? "\u00A0" : heroSubtext || SUBTEXT_FALLBACK;

  return (
    <section className="relative pt-32 pb-16 lg:pt-40 lg:pb-24 overflow-hidden">
      {/* bg orbs */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background"></div>
      <div className="absolute top-1/3 -left-32 w-96 h-96 rounded-full bg-primary/10 blur-[120px] -z-0"></div>
      <div className="absolute bottom-0 -right-32 w-96 h-96 rounded-full bg-blue-500/5 blur-[120px] -z-0"></div>
      {/* dot grid */}
      <div
        className="absolute inset-0 z-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "radial-gradient(circle, white 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      ></div>

      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="flex flex-col lg:flex-row items-center lg:items-start gap-12 lg:gap-16">
          <div className="flex-1 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs sm:text-sm font-medium mb-6">
              <Zap size={14} />
              <span>Trusted by churches across Ghana &amp; beyond</span>
            </div>
            <h1
              className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.05] tracking-tight mb-6"
              data-testid="hero-headline"
            >
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-yellow-200 to-primary">
                {showHeadline}
              </span>
            </h1>
            <p
              className="text-base sm:text-lg md:text-xl text-muted-foreground mb-8 max-w-xl mx-auto lg:mx-0 leading-relaxed whitespace-pre-wrap"
              data-testid="hero-subtext"
            >
              {showSubtext}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 sm:gap-4">
              <Button
                asChild
                size="lg"
                className="rounded-full px-8 h-14 text-base font-semibold w-full sm:w-auto shadow-xl shadow-primary/30 hover:shadow-primary/50 transition-shadow"
              >
                <a href={downloadUrl} download data-testid="btn-download">
                  <Download className="mr-2 h-5 w-5" />
                  DOWNLOAD NOW
                  <ArrowRight className="ml-2 h-5 w-5" />
                </a>
              </Button>
              <HeroExtraButtons />
            </div>
            <div className="flex justify-center lg:justify-start">
              <LatestVersionBadge />
            </div>
            <div className="mt-6 flex items-center justify-center lg:justify-start gap-6 text-xs sm:text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={16} className="text-primary" />
                <span>Free forever plan</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={16} className="text-primary" />
                <span>Windows 10 &amp; 11</span>
              </div>
              <div className="hidden sm:flex items-center gap-1.5">
                <CheckCircle2 size={16} className="text-primary" />
                <span>No credit card</span>
              </div>
            </div>
          </div>

          <div className="flex-1 w-full max-w-2xl lg:mt-10">
            {heroImage?.url ? (
              <div className="relative">
                <div className="absolute -inset-6 bg-gradient-to-tr from-primary/30 via-primary/10 to-transparent blur-3xl rounded-3xl"></div>
                <img
                  src={heroImage.url}
                  alt={heroImage.alt || "ScriptureLive AI app screenshot"}
                  className="relative w-full h-auto rounded-2xl border border-white/10 shadow-2xl shadow-primary/20 object-cover"
                  data-testid="img-hero"
                />
              </div>
            ) : (
              <AppMockup />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- SERVICE STORY ---------------------------- */

function ServiceStory() {
  return (
    <section className="py-24 lg:py-32 bg-card/40 border-y border-border/30 relative overflow-hidden">
      <div className="absolute -top-32 -right-32 w-[28rem] h-[28rem] rounded-full bg-primary/10 blur-[140px]"></div>
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Text */}
          <div className="order-2 lg:order-1">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-primary mb-4">
              The reality in most churches
            </span>
            <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-extrabold leading-[1.1] mb-6">
              Finally watch the service —
              <br className="hidden md:block" />
              <span className="text-primary">
                {" "}
                instead of typing through it.
              </span>
            </h2>
            <div className="space-y-5 text-base lg:text-lg text-muted-foreground leading-relaxed">
              <p>
                Most churches today still rely on one person manually typing the
                reference into PowerPoint while the pastor is already three
                verses ahead.
              </p>
              <p>
                <span className="text-foreground font-semibold">
                  ScriptureLive AI
                </span>{" "}
                removes that lag entirely. The moment the pastor says{" "}
                <span className="text-primary font-semibold">
                  &ldquo;turn with me to John chapter 3, verse 16,&rdquo;
                </span>{" "}
                our transcription engine hears it, finds the verse, and stages
                it — ready for one tap to send live.
              </p>
              <p>
                Pastors can quote Scripture spontaneously without breaking the
                slide rhythm. The operator never has to touch a keyboard.
              </p>
            </div>
          </div>

          {/* Image */}
          <div className="order-1 lg:order-2 relative">
            <div className="absolute -inset-4 bg-gradient-to-tr from-primary/20 via-transparent to-primary/10 blur-3xl rounded-3xl"></div>
            <div className="relative overflow-hidden rounded-3xl border border-border/50 shadow-2xl">
              <img
                src="/images/av-operator.jpg"
                alt="Church AV operator running ScriptureLive AI on a laptop next to a live mixing console"
                className="w-full h-auto block"
                loading="lazy"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/30 via-transparent to-transparent pointer-events-none"></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ TRUST STATS ----------------------------- */

function TrustStats() {
  const stats = [
    { value: "100+", label: "Churches using daily" },
    { value: "10,000+", label: "Verses detected weekly" },
    { value: "50ms", label: "Average detection latency" },
    { value: "99.9%", label: "Service-time uptime" },
  ];
  return (
    <section className="py-12 border-y border-border/30 bg-card/40">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="font-display text-3xl md:text-4xl font-extrabold text-primary mb-1">
                {s.value}
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground tracking-wide uppercase">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------- WHAT IT IS ------------------------------ */

function WhatItIs() {
  const items = [
    {
      icon: <MonitorPlay size={28} />,
      title: "No manual typing",
      desc: "Free your media team from frantically searching and typing verses. Focus on the service, not the software.",
    },
    {
      icon: <Zap size={28} />,
      title: "No searching mid-sermon",
      desc: "When the pastor quotes a verse off-script, ScriptureLive AI has it ready instantly.",
    },
    {
      icon: <CheckCircle2 size={28} />,
      title: "Just speak — and it appears",
      desc: "The AI listens to the sermon, identifies the exact reference, and pushes it to your screens with one click.",
    },
  ];
  return (
    <section className="py-24 lg:py-28">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {items.map((item, i) => (
            <div
              key={i}
              className="group relative bg-card/50 border border-border/40 rounded-2xl p-8 hover:border-primary/40 transition-all duration-300"
            >
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/0 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="relative">
                <div className="h-14 w-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-5">
                  {item.icon}
                </div>
                <h3 className="font-display text-xl font-bold mb-3">
                  {item.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- FEATURES ------------------------------- */

function Features() {
  const { data: features } = useListFeatures();
  const displayFeatures =
    features && features.length > 0 ? features : DEFAULT_FEATURES;

  return (
    <section id="features" className="py-24 lg:py-32 bg-card/40 border-y border-border/30 relative">
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "radial-gradient(circle, white 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      ></div>
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-primary mb-3">
            Features
          </span>
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-extrabold mb-5 leading-tight">
            Everything you need.
            <br />
            <span className="text-primary">Nothing you don&apos;t.</span>
          </h2>
          <p className="text-base md:text-lg text-muted-foreground">
            A focused toolset built specifically to solve the hardest part of
            church media presentations.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayFeatures.map((feature) => {
            const icon =
              FEATURE_ICONS[feature.icon as string] ?? (
                <Sparkles size={22} />
              );
            return (
              <div
                key={feature.id}
                className="group relative bg-background border border-border/50 rounded-2xl p-7 hover:border-primary/40 transition-all duration-300 overflow-hidden"
              >
                <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-primary/10 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="relative">
                  <div className="h-11 w-11 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center text-primary mb-5">
                    {icon}
                  </div>
                  <h3 className="font-display text-lg font-bold mb-2.5">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ HOW IT WORKS ----------------------------- */

function HowItWorks() {
  const steps = [
    {
      icon: <Mic className="h-6 w-6" />,
      title: "Start Live Transcription",
      desc: "Connect your audio feed and hit start.",
    },
    {
      icon: <CheckCircle2 className="h-6 w-6" />,
      title: "Speak naturally",
      desc: "The pastor preaches without thinking about the software.",
    },
    {
      icon: <Cpu className="h-6 w-6" />,
      title: "Scripture detected",
      desc: "Our AI engine matches spoken words to Bible verses in milliseconds.",
    },
    {
      icon: <MonitorUp className="h-6 w-6" />,
      title: "One-click to live",
      desc: "Approve the verse with one click, or set it to auto-display.",
    },
  ];

  return (
    <section id="how-it-works" className="py-24 lg:py-32">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-primary mb-3">
            How it works
          </span>
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-extrabold mb-5">
            From spoken word to screen
            <br />
            <span className="text-primary">in under a second.</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-4 gap-6 relative">
          <div className="hidden md:block absolute top-12 left-[12%] right-[12%] h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent z-0"></div>
          {steps.map((step, idx) => (
            <div
              key={idx}
              className="relative z-10 flex flex-col items-center text-center"
            >
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary/20 via-primary/5 to-transparent border border-primary/30 flex items-center justify-center text-primary shadow-2xl shadow-primary/10 mb-5 relative">
                <div className="absolute inset-2 rounded-full bg-background flex items-center justify-center">
                  {step.icon}
                </div>
                <span className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center font-display">
                  {idx + 1}
                </span>
              </div>
              <h3 className="font-display text-lg font-bold mb-2">
                {step.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-[14rem]">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- WHY CHOOSE US ---------------------------- */

function WhyChooseUs() {
  const { data: content } = useListPageContent();
  const whyCopy =
    content?.find((c) => c.key === "why_description")?.value ||
    content?.find((c) => c.key === "why_section_copy")?.value;

  return (
    <section className="py-24 lg:py-32 bg-card/40 border-y border-border/30 relative overflow-hidden">
      <div className="absolute top-1/2 -left-32 w-96 h-96 rounded-full bg-primary/10 blur-[120px] -translate-y-1/2"></div>
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-primary mb-3">
              Why ScriptureLive AI
            </span>
            <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-extrabold mb-6 leading-tight">
              Built for the
              <br />
              <span className="text-primary">spirit-led service.</span>
            </h2>
            <p
              className="text-lg text-muted-foreground mb-8 whitespace-pre-wrap"
              data-testid="why-section-copy"
            >
              {whyCopy ||
                "Traditional presentation software wasn't built for the dynamic flow of a modern church service. We were."}
            </p>

            <div className="space-y-6">
              {[
                {
                  icon: <Clock size={22} />,
                  title: "Zero Latency",
                  desc: "Sub-second detection so verses appear the moment they're spoken.",
                },
                {
                  icon: <ShieldCheck size={22} />,
                  title: "Rock-Solid Reliability",
                  desc: "Engineered to never crash during a service. Offline fallbacks keep you running.",
                },
                {
                  icon: <Globe2 size={22} />,
                  title: "Broadcast Ready",
                  desc: "Native NDI support for OBS, vMix, Wirecast and more — straight into your stream.",
                },
              ].map((b, i) => (
                <div key={i} className="flex gap-4">
                  <div className="shrink-0 mt-1 h-11 w-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                    {b.icon}
                  </div>
                  <div>
                    <h4 className="font-display text-lg font-bold mb-1">
                      {b.title}
                    </h4>
                    <p className="text-muted-foreground">{b.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-tr from-primary/20 via-transparent to-primary/10 blur-3xl rounded-3xl"></div>
            <div className="relative bg-background/80 backdrop-blur border border-border/50 rounded-3xl p-8 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-display text-xl font-bold">
                  Built for Modern AV Teams
                </h3>
                <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded bg-emerald-500/15 text-emerald-400">
                  v0.7+
                </span>
              </div>
              <ul className="space-y-3.5">
                {[
                  "Native Windows desktop app",
                  "OBS Studio &amp; vMix integration via NDI",
                  "Customizable lower thirds &amp; full-screen modes",
                  "Lightweight on CPU and GPU",
                  "Beautiful dark mode UI",
                  "Keyboard shortcuts for live operators",
                  "Multi-translation support (KJV, NIV, ESV, NLT...)",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Check className="text-primary h-5 w-5 shrink-0 mt-0.5" />
                    <span
                      className="text-sm md:text-base text-foreground/90"
                      dangerouslySetInnerHTML={{ __html: item }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- PRICING -------------------------------- */

function Pricing() {
  const { data: apiTiers } = useListPricing();
  const downloadUrl = useDownloadUrl();
  const tiers =
    apiTiers && apiTiers.length > 0
      ? apiTiers.map((t) => ({
          id: String(t.id),
          name: t.name,
          price: t.price,
          period: t.period,
          description: t.description,
          features: t.features,
          isPopular: t.isPopular,
        }))
      : DEFAULT_PRICING_TIERS;

  return (
    <section
      id="pricing"
      className="py-24 lg:py-32"
      aria-label="Pricing and Download"
    >
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-primary mb-3">
            Pricing
          </span>
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-extrabold mb-5">
            Simple, transparent
            <br />
            <span className="text-primary">cedis pricing.</span>
          </h2>
          <p className="text-base md:text-lg text-muted-foreground">
            Start free — upgrade when you&apos;re ready. No hidden fees, ever.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto">
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className={`relative rounded-3xl p-8 border flex flex-col ${
                tier.isPopular
                  ? "bg-gradient-to-b from-primary/10 to-background border-primary shadow-2xl shadow-primary/20 lg:scale-[1.04] z-10"
                  : "bg-card/50 border-border/50 hover:border-primary/30 transition-colors"
              }`}
            >
              {tier.isPopular && (
                <div className="absolute -top-4 inset-x-0 flex justify-center">
                  <span className="bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest py-1.5 px-4 rounded-full shadow-lg shadow-primary/30">
                    Most Popular
                  </span>
                </div>
              )}
              <div className="mb-7">
                <h3 className="font-display text-2xl font-bold mb-2">
                  {tier.name}
                </h3>
                <p className="text-muted-foreground text-sm h-10">
                  {tier.description}
                </p>
              </div>
              <div className="mb-7 flex items-end gap-1.5">
                <span className="font-display text-4xl lg:text-5xl font-extrabold">
                  {tier.price}
                </span>
                {tier.price !== "Free" && (
                  <span className="text-muted-foreground mb-1.5 text-sm">
                    /{tier.period}
                  </span>
                )}
              </div>
              <ul className="space-y-3.5 mb-8 flex-1">
                {tier.features.map((feat: any, i: number) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="shrink-0 mt-0.5 h-5 w-5 rounded-full bg-primary/15 flex items-center justify-center">
                      <Check className="h-3 w-3 text-primary" />
                    </div>
                    <span className="text-sm text-foreground/90">{feat}</span>
                  </li>
                ))}
              </ul>
              <Button
                asChild
                size="lg"
                className={`w-full rounded-full font-semibold ${
                  tier.isPopular
                    ? "shadow-lg shadow-primary/30"
                    : ""
                }`}
                variant={tier.isPopular ? "default" : "outline"}
              >
                <a
                  href={downloadUrl}
                  download
                  data-testid={`btn-pricing-${tier.id}`}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Get Started
                </a>
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------- SYSTEM REQUIREMENTS -------------------------- */

function SystemRequirements() {
  return (
    <section id="requirements" className="py-20 bg-card/40 border-y border-border/30 relative">
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-primary mb-3">
            System Requirements
          </span>
          <h2 className="font-display text-2xl md:text-3xl lg:text-4xl font-extrabold mb-3">
            Built for Windows PCs.
          </h2>
        </div>

        <div className="bg-background border border-border/50 rounded-2xl overflow-hidden shadow-xl">
          <div className="grid grid-cols-1 md:grid-cols-3 border-b border-border/50 bg-muted/20 p-4 font-bold text-xs uppercase tracking-widest">
            <div>Component</div>
            <div className="text-muted-foreground">Minimum</div>
            <div className="text-primary">Recommended</div>
          </div>
          {[
            { c: "Operating System", min: "Windows 10 (64-bit)", rec: "Windows 11 (64-bit)" },
            { c: "Processor", min: "Intel Core i5 / AMD Ryzen 5", rec: "Intel Core i7 / AMD Ryzen 7" },
            { c: "Memory (RAM)", min: "8 GB", rec: "16 GB or higher" },
            { c: "Graphics", min: "Integrated Graphics", rec: "Dedicated GPU (NVIDIA / AMD)" },
            { c: "Storage", min: "500 MB free", rec: "2 GB SSD recommended" },
          ].map((row, i, arr) => (
            <div
              key={row.c}
              className={`grid grid-cols-1 md:grid-cols-3 p-4 text-sm ${
                i < arr.length - 1 ? "border-b border-border/50" : ""
              }`}
            >
              <div className="font-semibold mb-2 md:mb-0">{row.c}</div>
              <div className="text-muted-foreground">{row.min}</div>
              <div className="text-foreground">{row.rec}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- TESTIMONIALS ----------------------------- */

function Testimonials() {
  const { data: testimonials } = useListTestimonials();
  const display =
    testimonials && testimonials.length > 0
      ? testimonials
      : DEFAULT_TESTIMONIALS;

  return (
    <section className="py-24 lg:py-32">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-primary mb-3">
            Testimonials
          </span>
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-extrabold mb-5">
            Loved by ministries
            <br />
            <span className="text-primary">across the world.</span>
          </h2>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {display.map((test) => (
            <div
              key={test.id}
              className="bg-card/50 border border-border/50 rounded-2xl p-7 hover:border-primary/40 transition-colors"
            >
              <div className="flex text-primary mb-5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-current" />
                ))}
              </div>
              <p className="text-base mb-6 text-foreground/90 leading-relaxed">
                &ldquo;{test.quote}&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center font-display font-bold text-primary text-sm">
                  {test.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("")}
                </div>
                <div>
                  <p className="font-bold text-sm">{test.name}</p>
                  <p className="text-xs text-primary">{test.church}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------- FAQ ---------------------------------- */

function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="py-24 lg:py-32 bg-card/40 border-y border-border/30">
      <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-primary mb-3">
            FAQ
          </span>
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-extrabold mb-5">
            Questions, answered.
          </h2>
          <p className="text-base md:text-lg text-muted-foreground">
            Still wondering? Reach out on WhatsApp anytime.
          </p>
        </div>
        <div className="space-y-3">
          {FAQ_ITEMS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div
                key={i}
                className={`rounded-2xl border bg-background/60 transition-all ${
                  isOpen
                    ? "border-primary/40 shadow-lg shadow-primary/5"
                    : "border-border/50"
                }`}
              >
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="font-display font-bold text-base md:text-lg">
                    {item.q}
                  </span>
                  <span className="shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    {isOpen ? <Minus size={16} /> : <Plus size={16} />}
                  </span>
                </button>
                {isOpen && (
                  <div className="px-6 pb-6 -mt-1 text-muted-foreground leading-relaxed animate-in fade-in slide-in-from-top-1 duration-300">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------- FINAL CTA ------------------------------- */

function FinalCTA() {
  const downloadUrl = useDownloadUrl();
  return (
    <section className="py-24 lg:py-32 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-tr from-primary/15 via-background to-background"></div>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/10 blur-[120px]"></div>
      <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 relative text-center">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/15 border border-primary/30 text-primary mb-6">
          <Sparkles size={28} />
        </div>
        <h2 className="font-display text-3xl md:text-5xl lg:text-6xl font-extrabold mb-6 leading-tight">
          Transform your next service.
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-200">
            Download in 30 seconds.
          </span>
        </h2>
        <p className="text-base md:text-lg text-muted-foreground mb-10 max-w-2xl mx-auto">
          Join 100+ churches already using ScriptureLive AI. The free plan is
          ready — no credit card, no signup, just download and run.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button
            asChild
            size="lg"
            className="rounded-full px-10 h-14 text-base font-semibold shadow-2xl shadow-primary/40 hover:shadow-primary/60 transition-shadow"
          >
            <a href={downloadUrl} download data-testid="btn-cta-download">
              <Download className="mr-2 h-5 w-5" />
              DOWNLOAD NOW
              <ArrowRight className="ml-2 h-5 w-5" />
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- FOOTER -------------------------------- */

function Footer() {
  const { data: content } = useListPageContent();
  const { data: media } = useListMediaAssets();
  const logoPath =
    media?.find((m) => m.key === "site_logo")?.url || defaultLogoPath;
  const logoAlt =
    media?.find((m) => m.key === "site_logo")?.alt || "ScriptureLive AI";
  const supportEmail =
    content?.find((c) => c.key === "support_email")?.value ||
    "support@scriptureliveai.com";
  const supportWhatsApp =
    content?.find((c) => c.key === "support_whatsapp")?.value || "0246798526";
  const downloadUrl = useDownloadUrl();

  return (
    <footer className="bg-card/60 border-t border-border/40 pt-20 pb-10">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-4 gap-12 mb-16">
          <div className="col-span-2">
            <div className="flex items-center gap-3 mb-5">
              <img
                src={logoPath}
                alt={logoAlt}
                className="h-9 w-auto opacity-90"
                data-testid="img-footer-logo"
              />
              <span className="font-display font-bold text-lg tracking-tight">
                ScriptureLive <span className="text-primary">AI</span>
              </span>
            </div>
            <p className="text-muted-foreground max-w-sm leading-relaxed">
              The smartest way to display scripture during live services.
              Powered by real-time voice detection AI. Built in Ghana, used
              worldwide.
            </p>
          </div>
          <div>
            <h4 className="font-display font-bold mb-4 text-sm uppercase tracking-wider">
              Product
            </h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><a href="#features" className="hover:text-primary transition-colors">Features</a></li>
              <li><a href="#how-it-works" className="hover:text-primary transition-colors">How It Works</a></li>
              <li><a href="#pricing" className="hover:text-primary transition-colors">Pricing</a></li>
              <li><a href={downloadUrl} download id="download" className="hover:text-primary transition-colors">Download</a></li>
              <li><a href="#faq" className="hover:text-primary transition-colors">FAQ</a></li>
            </ul>
          </div>
          <div>
            <h4 id="support" className="font-display font-bold mb-4 text-sm uppercase tracking-wider">
              Support
            </h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="text-primary font-bold">WhatsApp:</span>
                <a
                  href={`https://wa.me/${supportWhatsApp}`}
                  className="hover:text-primary transition-colors"
                >
                  {supportWhatsApp}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${supportEmail}`}
                  className="hover:text-primary transition-colors"
                >
                  {supportEmail}
                </a>
              </li>
              <li><a href="#requirements" className="hover:text-primary transition-colors">System Requirements</a></li>
            </ul>
          </div>
        </div>
        <div className="pt-8 border-t border-border/50 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} ScriptureLive AI. Built in Ghana with reverence.</p>
          <div className="flex gap-6">
            <a href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</a>
            <a href="/terms" className="hover:text-foreground transition-colors">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30 font-sans">
      <Navbar />
      <Hero />
      <ServiceStory />
      <TrustStats />
      <WhatItIs />
      <Features />
      <HowItWorks />
      <WhyChooseUs />
      <SystemRequirements />
      <Pricing />
      <Testimonials />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  );
}
