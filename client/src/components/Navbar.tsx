"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { Menu, X } from "lucide-react";

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navItems = [
    { name: "The Pit", path: "/" },
    { name: "Engine", path: "/trading" },
    { name: "Wallet", path: "/wallet" },
  ];

  return (
    <nav className={cn(
      "fixed top-0 left-0 right-0 z-50 h-14 transition-all duration-300",
      scrolled
        ? "bg-background/95 backdrop-blur-xl border-b border-border shadow-[0_1px_20px_rgba(0,0,0,0.5)]"
        : "bg-background/60 backdrop-blur-md border-b border-transparent"
    )}>
      <div className="h-full max-w-[1800px] mx-auto px-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group shrink-0">
          <Image src="/clawfi-logo.png" alt="ClawFi" width={32} height={32} className="rounded-md" />
          <span className="font-heading font-bold text-lg tracking-tight hidden sm:inline">
            <span className="text-gradient-accent">ClawFi</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-0.5 bg-surface/50 rounded-xl px-1 py-1 border border-border/50">
          {navItems.map((item) => {
            const isActive = item.path === "/" ? pathname === "/" : pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                prefetch={true}
                className={cn(
                  "relative px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive
                    ? "text-accent bg-accent/10 shadow-[0_0_12px_rgba(0,229,160,0.1)]"
                    : "text-muted hover:text-foreground hover:bg-surface-raised"
                )}
              >
                {isActive && (
                  <div className="absolute inset-x-3 -bottom-px h-px bg-accent/50" />
                )}
                {item.name}
              </Link>
            );
          })}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/8 border border-accent/15 text-[11px] text-accent font-medium">
            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            LIVE
          </div>
        </div>

        <button className="md:hidden text-muted hover:text-foreground transition-colors" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-background/98 backdrop-blur-xl border-b border-border px-4 pb-4 pt-2 space-y-1 animate-slide-in">
          {navItems.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "block px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                (item.path === "/" ? pathname === "/" : pathname.startsWith(item.path))
                  ? "text-accent bg-accent/10" : "text-muted hover:text-foreground hover:bg-surface"
              )}
            >
              {item.name}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
