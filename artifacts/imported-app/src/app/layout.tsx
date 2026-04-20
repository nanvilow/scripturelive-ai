import type { Metadata } from "next";
import "./globals.css";
import { PathAwareToaster } from "@/components/ui/path-aware-toaster";
import { googleFontsHref } from "@/lib/fonts";

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
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        {/* Pre-load every web font in the typography registry so any
            font the operator picks renders identically on the editor,
            the operator preview cards, and the secondary screen. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={googleFontsHref} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        {/* Toasts are suppressed on /congregation, /presenter, and the
            NDI fan-out so display/output actions never appear on the
            audience screen. The operator console still sees toasts. */}
        <PathAwareToaster />
      </body>
    </html>
  );
}
