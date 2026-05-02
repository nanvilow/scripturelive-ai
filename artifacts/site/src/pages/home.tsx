import { SEO } from "@/components/seo";
import { ArrowRight, Download, Monitor, Mic, RefreshCw, Zap, CheckCircle2, ShieldCheck, Cpu, HardDrive, Wifi, Volume2, Globe, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DownloadButton } from "@/components/download-button";
import { getMarketingPlans, type PlanCode } from "@workspace/pricing";

// Import assets from attached_assets using the alias defined in vite.config.ts
import logoSvg from "@assets/scripturelive/logo.svg";

// Marketing-only blurb per plan tier. Pricing lives in @workspace/pricing
// so it can never drift from the desktop app; the prose below is purely
// presentational copy specific to this landing page.
const PLAN_BLURBS: Record<PlanCode, string> = {
  "1M": "Perfect for special events or testing the waters with your team.",
  "2M": "Two-month commitment for short campaigns and revival series.",
  "3M": "Quarterly commitment for growing media teams.",
  "4M": "Four months of coverage for an extended sermon series.",
  "5M": "Five months of stability for a longer ministry season.",
  "6M": "Half-year stability for your broadcast and projection.",
  "1Y": "Set it and forget it. A full year of worry-free automated projection.",
};

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary selection:text-primary-foreground font-sans">
      <SEO />
      
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-background/90 backdrop-blur-lg border-b border-border/50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoSvg} alt="ScriptureLive AI Logo" className="w-10 h-10 object-contain" />
            <span className="font-semibold text-lg tracking-tight">ScriptureLive AI</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#problem" className="hover:text-foreground transition-colors">The Problem</a>
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href="#requirements" className="hover:text-foreground transition-colors">Requirements</a>
          </div>
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" className="hidden sm:inline-flex text-muted-foreground hover:text-foreground">
              <a href="https://wa.me/233246798526" target="_blank" rel="noopener noreferrer">Contact Support</a>
            </Button>
            <DownloadButton
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-[0_0_20px_-5px_oklch(var(--primary))]"
              label="Download Trial"
            />
          </div>
        </div>
      </nav>

      <main className="pt-20">
        {/* Hero Section */}
        <section className="relative px-6 pt-32 pb-24 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(var(--primary)/0.1),transparent_60%)]" />
          <div className="max-w-4xl mx-auto text-center relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8 border border-primary/20 backdrop-blur-sm">
              <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
              Live Transcription for Ghanaian Churches
            </div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-8 leading-[1.1]">
              The audio engineer's <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-[#ffcf54]">dream tool</span> for service projection.
            </h1>
            <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
              ScriptureLive AI is the Sunday-morning operator console built for Ghanaian churches who livestream — it hears the preacher, finds the verse, and puts it on the screen before the congregation even thinks to look it up.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
              <DownloadButton
                size="lg"
                showIcon
                className="h-14 px-8 text-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_30px_-5px_oklch(var(--primary))] w-full sm:w-auto"
                label="Download for Windows"
              />
              <div className="flex flex-col items-center sm:items-start text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Free 7-day trial</span>
                <span>~570 MB • v0.7.32 • Code-signed</span>
              </div>
            </div>
          </div>
          
          <div className="mt-24 max-w-6xl mx-auto rounded-xl border border-border bg-card shadow-2xl overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10" />
            <img src={`${import.meta.env.BASE_URL}images/audio-booth.png`} alt="Church Audio Booth" className="w-full h-auto object-cover opacity-80 mix-blend-luminosity hover:mix-blend-normal transition-all duration-1000" />
          </div>
        </section>

        {/* The Problem */}
        <section id="problem" className="py-24 px-6 relative">
          <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6 leading-tight">Finally watch the service instead of typing through it.</h2>
              <div className="space-y-6 text-lg text-muted-foreground">
                <p>
                  Most Ghanaian churches projecting verses today rely on one person manually typing the reference into PowerPoint while the pastor is already three verses ahead.
                </p>
                <p>
                  ScriptureLive removes that lag entirely. The moment the pastor says <strong className="text-foreground font-medium">"turn with me to John chapter 3 verse 16,"</strong> our transcription engine hears it, finds the verse, and stages it.
                </p>
                <p>
                  Pastors can quote a verse spontaneously without breaking the slide rhythm. The operator doesn't touch a keyboard.
                </p>
              </div>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-primary/5 blur-3xl rounded-full" />
              <img src={`${import.meta.env.BASE_URL}images/operator.png`} alt="Media Operator" className="rounded-xl border border-border shadow-2xl relative z-10" />
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="py-24 px-6 bg-muted/30 border-y border-border">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-4">Built for the realities of Sunday morning.</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                We know what happens in the back of the sanctuary. The internet drops, the pastor speaks fast, the translation needs to change right now. We planned for it.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                {
                  icon: Mic,
                  title: "Live Speech to Screen",
                  desc: "Powered by Deepgram's live transcription. As long as the laptop has internet, it hears the preacher perfectly."
                },
                {
                  icon: Globe,
                  title: "Offline Bibles Included",
                  desc: "KJV, NIV, and ESV translations are built directly into the app. They load instantly into memory. No downloading required."
                },
                {
                  icon: MessagesSquare,
                  title: "Voice Commands",
                  desc: "Say 'next verse', 'go back', 'show John 3:16', or 'clear screen'. The app listens and executes immediately."
                },
                {
                  icon: ShieldCheck,
                  title: "Speaker-Follow Mode",
                  desc: "Locks onto the preacher's microphone and intelligently ignores congregation noise, singing, and background chatter."
                },
                {
                  icon: RefreshCw,
                  title: "Live Translation Sync",
                  desc: "Switch from KJV to MSG instantly. The verse on screen updates immediately without having to take it off air."
                },
                {
                  icon: Monitor,
                  title: "NDI Native Output",
                  desc: "Feeds straight into OBS, vMix, ATEM Mini, and other livestream switchers. Works perfectly with the projector you already own."
                }
              ].map((feature, i) => (
                <div key={i} className="p-8 rounded-2xl bg-card border border-border hover:border-primary/50 transition-colors group">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <feature.icon className="h-6 w-6 text-primary group-hover:text-primary-foreground" />
                  </div>
                  <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {feature.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="py-24 px-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,oklch(var(--primary)/0.05),transparent_70%)]" />
          <div className="max-w-7xl mx-auto relative z-10">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Built in Ghana. Priced in Cedis.</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                No foreign cards required. Pay securely via MTN Mobile Money or Vodafone Cash. 
                The activation code is delivered via SMS within minutes.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
              {getMarketingPlans().map((plan) => {
                const isFeatured = Boolean(plan.discountLabel);
                if (isFeatured) {
                  return (
                    <div key={plan.code} className="p-6 rounded-2xl bg-primary/10 border-2 border-primary flex flex-col relative shadow-[0_0_30px_-10px_oklch(var(--primary))] scale-105 z-10">
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-primary-foreground text-xs font-bold rounded-full whitespace-nowrap shadow-lg">
                        BEST VALUE - {plan.discountLabel?.toUpperCase()}
                      </div>
                      <div className="mb-4 pt-2">
                        <h3 className="text-lg font-medium text-primary mb-2">{plan.label}</h3>
                        <div className="text-4xl font-bold">GHS {plan.amountGhs}</div>
                      </div>
                      <p className="text-sm text-muted-foreground mt-auto">{PLAN_BLURBS[plan.code]}</p>
                    </div>
                  );
                }
                return (
                  <div key={plan.code} className="p-6 rounded-2xl bg-card border border-border flex flex-col hover:border-primary/50 transition-colors">
                    <div className="mb-4">
                      <h3 className="text-lg font-medium text-muted-foreground mb-2">{plan.label}</h3>
                      <div className="text-3xl font-bold">GHS {plan.amountGhs}</div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-auto">{PLAN_BLURBS[plan.code]}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
        
        {/* Requirements */}
        <section id="requirements" className="py-24 px-6 bg-muted/30 border-t border-border">
           <div className="max-w-4xl mx-auto">
             <div className="text-center mb-12">
               <h2 className="text-3xl font-bold mb-4">System Requirements</h2>
               <p className="text-muted-foreground">Everything you need to run ScriptureLive smoothly on a Sunday morning.</p>
             </div>
             
             <div className="bg-card border border-border rounded-2xl p-8 shadow-lg">
               <div className="grid md:grid-cols-2 gap-8">
                 <div className="space-y-6">
                   <div className="flex items-start gap-4">
                     <div className="mt-1 p-2 rounded-md bg-primary/10 text-primary"><HardDrive className="h-5 w-5" /></div>
                     <div>
                       <h4 className="font-medium text-foreground">Operating System</h4>
                       <p className="text-sm text-muted-foreground mt-1">Windows 10 (1909+) or Windows 11, 64-bit. <br/><span className="inline-block mt-2 px-2 py-1 rounded-md bg-muted text-xs">macOS support coming soon</span></p>
                     </div>
                   </div>
                   
                   <div className="flex items-start gap-4">
                     <div className="mt-1 p-2 rounded-md bg-primary/10 text-primary"><Cpu className="h-5 w-5" /></div>
                     <div>
                       <h4 className="font-medium text-foreground">Processing Power</h4>
                       <p className="text-sm text-muted-foreground mt-1">Intel Core i5 or AMD Ryzen 5 (8th gen / 2000-series or newer). 8 GB RAM minimum, 16 GB recommended.</p>
                     </div>
                   </div>

                   <div className="flex items-start gap-4">
                     <div className="mt-1 p-2 rounded-md bg-primary/10 text-primary"><Volume2 className="h-5 w-5" /></div>
                     <div>
                       <h4 className="font-medium text-foreground">Audio Input</h4>
                       <p className="text-sm text-muted-foreground mt-1">A working microphone. The same audio mixer USB out feeding your livestream works perfectly.</p>
                     </div>
                   </div>
                 </div>

                 <div className="space-y-6">
                   <div className="flex items-start gap-4">
                     <div className="mt-1 p-2 rounded-md bg-primary/10 text-primary"><HardDrive className="h-5 w-5" /></div>
                     <div>
                       <h4 className="font-medium text-foreground">Storage</h4>
                       <p className="text-sm text-muted-foreground mt-1">2 GB free disk space for installation. SSD strongly recommended for fast Bible loading.</p>
                     </div>
                   </div>

                   <div className="flex items-start gap-4">
                     <div className="mt-1 p-2 rounded-md bg-primary/10 text-primary"><Wifi className="h-5 w-5" /></div>
                     <div>
                       <h4 className="font-medium text-foreground">Internet</h4>
                       <p className="text-sm text-muted-foreground mt-1">Stable connection required. Minimum 5 Mbps upload for Deepgram live audio streaming.</p>
                     </div>
                   </div>

                   <div className="flex items-start gap-4">
                     <div className="mt-1 p-2 rounded-md bg-primary/10 text-primary"><Monitor className="h-5 w-5" /></div>
                     <div>
                       <h4 className="font-medium text-foreground">Display Output (Optional)</h4>
                       <p className="text-sm text-muted-foreground mt-1">A second monitor, projector, or any NDI-compatible switcher (OBS, vMix) for the verse output.</p>
                     </div>
                   </div>
                 </div>
               </div>
             </div>
           </div>
        </section>

        {/* Final CTA */}
        <section className="py-24 px-6 text-center">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-4xl font-bold mb-6">Ready for your next Sunday service?</h2>
            <p className="text-xl text-muted-foreground mb-10">
              Download the free 7-day trial. No credit card required. Install it, run it, and see the difference it makes for your media team.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
              <DownloadButton
                size="lg"
                showIcon
                className="h-14 px-8 text-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_30px_-5px_oklch(var(--primary))] w-full sm:w-auto"
                label="Download Free Trial"
              />
              <Button asChild size="lg" variant="outline" className="h-14 px-8 text-lg w-full sm:w-auto border-border hover:bg-muted">
                <a href="https://wa.me/233246798526" target="_blank" rel="noopener noreferrer">
                  WhatsApp Support
                </a>
              </Button>
            </div>
            <div className="mt-8 text-sm text-muted-foreground">
              SHA-256 checksum published with each release for IT verification.
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-card border-t border-border py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
             <img src={logoSvg} alt="ScriptureLive AI Logo" className="w-8 h-8 object-contain opacity-80" />
             <span className="font-semibold text-muted-foreground">ScriptureLive AI</span>
          </div>
          <div className="text-sm text-muted-foreground text-center md:text-left">
            Built in Ghana. Honest support. Reachable at <a href="tel:0246798526" className="hover:text-foreground">0246798526</a> (Richard Kwesi Attieku).
          </div>
          <div className="flex gap-6">
            <a href="https://github.com/nanvilow/scripturelive-ai" className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors">GitHub Releases</a>
            <a href="https://wa.me/233246798526" className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors">WhatsApp</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
