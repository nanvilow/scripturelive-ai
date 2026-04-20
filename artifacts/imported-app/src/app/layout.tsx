import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PathAwareToaster } from "@/components/ui/path-aware-toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
