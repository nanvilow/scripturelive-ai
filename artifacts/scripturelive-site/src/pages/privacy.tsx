import { Link } from "wouter";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <header className="border-b border-border/50">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
          <Link href="/" className="text-lg font-semibold hover:text-primary transition-colors">
            ← ScriptureLive AI
          </Link>
          <Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Terms of Service
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: May 27, 2026</p>

        <div className="max-w-none space-y-8 text-foreground/90 leading-relaxed">
          <section>
            <h2 className="text-2xl font-semibold mb-3">1. Who we are</h2>
            <p>
              ScriptureLive AI is a desktop application built in Ghana that detects Bible references
              from live preaching audio and displays the corresponding scripture on output screens
              (NDI, OBS, vMix, Wirecast). This policy explains what data the app and this website
              collect, how it is used, and your rights.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">2. What we collect on this website</h2>
            <p>
              This marketing website is a static site. We do not run cookies, analytics scripts,
              advertising trackers, or third-party fingerprinting. The only data your browser sends
              is what is required to deliver the page (IP address, browser type, referrer) — these
              are processed by our hosting provider and are not retained by us.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">3. What the desktop app collects</h2>
            <p>The installed Windows application processes the following data locally on your computer:</p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li><span className="font-semibold">Microphone audio</span> — captured in real time and sent to our speech-recognition providers for transcription. Audio is processed in transit only and is not stored on our servers.</li>
              <li><span className="font-semibold">Bible translations and slide media</span> — stored locally in your installation folder. Nothing is uploaded.</li>
              <li><span className="font-semibold">License key</span> — sent to our license server only to validate activation. We store the key, your activation date, and the machine identifier.</li>
              <li><span className="font-semibold">Anonymous telemetry</span> — version number, crash reports, and feature usage counts. No audio, no transcripts, no church names. You can disable telemetry in Settings.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">4. Third-party services</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><span className="font-semibold">OpenAI</span> — speech-to-text transcription. Subject to OpenAI's API data policy (audio not used for training).</li>
              <li><span className="font-semibold">Deepgram</span> — alternative speech-to-text engine. Subject to Deepgram's data processing terms.</li>
              <li><span className="font-semibold">Cloudflare Pages</span> — hosts this website.</li>
              <li><span className="font-semibold">Hetzner Cloud (Germany)</span> — hosts our license and telemetry server.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">5. Your rights</h2>
            <p>
              You can request deletion of your license record and telemetry data by emailing the
              address on our Support page. We respond within 7 days.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">6. Changes to this policy</h2>
            <p>
              We may update this policy as the product evolves. Material changes will be announced
              in the app and on this page with an updated date at the top.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">7. Contact</h2>
            <p>
              Questions about privacy? Reach us through the Support section on our home page.
            </p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t border-border/50 text-center">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}
