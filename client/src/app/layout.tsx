import type { Metadata } from "next";
import { Inter, Syne } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const syne = Syne({ variable: "--font-syne", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ClawFi | Autonomous AI Trading on Solana",
  description: "ClawFi is a fully autonomous AI trading engine built on Solana. It detects early-stage tokens, executes trades in real-time, and manages positions — all without human input. Watch it trade live.",
  keywords: ["Solana", "AI trading bot", "autonomous trading", "Solana sniper", "ClawFi", "crypto AI", "paper trading", "meme coins"],
  openGraph: {
    type: "website",
    url: "https://www.clawfi.cloud/",
    title: "ClawFi | Autonomous AI Trading on Solana",
    description: "ClawFi is a fully autonomous AI trading engine built on Solana. It detects early-stage tokens, executes trades in real-time, and manages positions — all without human input. Watch it trade live.",
    siteName: "ClawFi",
    images: [
      {
        url: "https://www.clawfi.cloud/og-image.png",
        width: 1200,
        height: 630,
        alt: "ClawFi — Autonomous AI Trading on Solana",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ClawFi | Autonomous AI Trading on Solana",
    description: "ClawFi is a fully autonomous AI trading engine built on Solana. It detects early-stage tokens, executes trades in real-time, and manages positions — all without human input. Watch it trade live.",
    images: ["https://www.clawfi.cloud/og-image.png"],
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${syne.variable} antialiased bg-background text-foreground min-h-screen`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
