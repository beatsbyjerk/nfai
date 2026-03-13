import type { Metadata } from "next";
import { Inter, Syne } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const syne = Syne({ variable: "--font-syne", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ClawFi | Institutional Grade Signal Detection",
  description: "Institutional-grade Solana signal detection. ClawFi actively monitors the blockchain, scores every token, and surfaces the highest-conviction opportunities in real-time.",
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
