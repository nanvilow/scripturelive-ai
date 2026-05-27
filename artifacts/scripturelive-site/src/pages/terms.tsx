import { Link } from "wouter";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <header className="border-b border-border/50">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
          <Link href="/" className="text-lg font-semibold hover:text-primary transition-colors">
            ← ScriptureLive AI
          </Link>
          <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: May 27, 2026</p>

        <div className="prose prose-invert max-w-none space-y-8 text-foreground/90 leading-relaxed">
          <section>
            <h2 className="text-2xl font-semibold mb-3">1. Acceptance</h2>
            <p>
              By downloading, installing, or using ScriptureLive AI ("the Software"), you agree to
              these Terms of Service. If you do not agree, please do not install or use the Software.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">2. License</h2>
            <p>
              ScriptureLive AI grants you a personal, non-exclusive, non-transferable licence to
              install and use the Software on Windows computers owned or operated by your church or
              ministry. You may not redistribute the installer, reverse engineer the binaries, or
              resell access to the Software.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">3. Free plan and paid plans</h2>
            <p>
              The free plan is offered as-is with no expiry. Paid plans unlock additional features
              and capacity as listed on the Pricing section of our home page. Paid licences are
              billed once per plan period and are non-refundable except where required by law.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">4. Acceptable use</h2>
            <p>You agree not to use ScriptureLive AI to:</p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>Display content that is unlawful, harassing, or violates the rights of others.</li>
              <li>Circumvent licence validation or share licence keys across unauthorised installs.</li>
              <li>Stress-test or attack our license/telemetry servers.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">5. Bible translations and copyright</h2>
            <p>
              Bible translations bundled with the Software are used under their respective public-domain
              status or licence terms. Users are responsible for ensuring their chosen translation is
              appropriate for public display in their jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">6. Speech recognition accuracy</h2>
            <p>
              ScriptureLive AI uses third-party AI models (OpenAI, Deepgram) for verse detection.
              Accuracy is high but not perfect — operators should always have a human pressing
              "Send Live" before scripture appears on the congregation screen.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">7. Disclaimer of warranties</h2>
            <p>
              The Software is provided "AS IS" without warranty of any kind, express or implied.
              We do not warrant that the Software will be uninterrupted, error-free, or compatible
              with every Windows configuration or third-party tool (OBS, vMix, NDI tools, etc.).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">8. Limitation of liability</h2>
            <p>
              To the maximum extent permitted by law, ScriptureLive AI's total liability arising
              from your use of the Software is limited to the amount you paid for your licence in
              the twelve months preceding the claim. We are not liable for indirect, incidental, or
              consequential damages.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">9. Termination</h2>
            <p>
              We may suspend or terminate access for users who breach these terms. You may stop
              using the Software at any time by uninstalling it.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">10. Governing law</h2>
            <p>These terms are governed by the laws of Ghana.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">11. Contact</h2>
            <p>
              Questions about these terms? Reach us through the Support section on our{" "}
              <Link href="/" className="text-primary hover:underline">home page</Link>.
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
