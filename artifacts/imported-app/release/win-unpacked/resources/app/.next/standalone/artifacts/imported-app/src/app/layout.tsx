import type { Metadata } from "next";
import "./globals.css";
import { PathAwareToaster } from "@/components/ui/path-aware-toaster";
import { GoogleFontsLink } from "@/components/google-fonts-link";
import { UpdateBanner } from "@/components/update-banner";
import { ThemeProvider } from "@/components/providers/theme-provider";

// NOTE: We intentionally do NOT use next/font/google here. The Electron
// desktop build runs `next build` on the operator's machine which often
// has flaky or no internet access to fonts.googleapis.com, causing the
// build to fail. System UI fonts render fine for the console; user-
// selected display fonts are loaded at runtime via `googleFontsHref`
// (which only fetches when an internet connection is available).
const geistSans = { variable: "font-sans" };
const geistMono = { variable: "font-mono" };

export const metadata: Metadata = {
  title: "ScriptureLive AI — AI-Powered Bible & Worship Platform",
  description:
    "Real-time scripture detection, AI-powered slide generation, worship lyrics management, and live presentation mode for churches and ministries.",
  keywords: [
    "Bible",
    "worship",
    "church",
    "presentation",
    "AI",
    "scripture detection",
    "sermon",
    "lyrics",
  ],
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
    shortcut: "/favicon-32.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // v0.6.0 — `dark` class is no longer hard-coded. The ThemeProvider
    // (next-themes) injects it on the <html> element after hydration
    // based on the operator's saved preference (default: dark, so
    // long-time users see no change on first install).
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Preconnect hints are static so they're safe in SSR head.
            The actual Google Fonts <link> is added client-side by
            <GoogleFontsLink /> below to avoid a hydration mismatch
            with the dev-tools script Replit injects into <head>. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider>
          <GoogleFontsLink />
          {children}
          <UpdateBanner />
          {/* Toasts are suppressed on /congregation, /presenter, and the
              NDI fan-out so display/output actions never appear on the
              audience screen. The operator console still sees toasts. */}
          <PathAwareToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
