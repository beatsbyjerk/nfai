"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { TokenCard, type Token, displayMcap, getMultiplier, mcapChange } from "@/components/TokenCard";
import { TokenModal } from "@/components/TokenModal";
import { HeroSection } from "@/components/HeroSection";
import { useTokenFeed } from "@/lib/useTokenFeed";
import { computeConviction } from "@/lib/dexscreener";
import { formatMcap, formatSol, formatPct } from "@/lib/utils";
import {
  Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight
} from "lucide-react";
import Link from "next/link";

const TOKENS_PER_PAGE = 20;

const SPRING_SMOOTH = { type: "spring" as const, damping: 22, stiffness: 100 };

/* ═══════════════════════════════════════════════════════════════════
   PROOF OF INTELLIGENCE — Leaderboard
   ClawFi's top signals by highest multiplier
   ═══════════════════════════════════════════════════════════════════ */

function LeaderboardEntry({ token, rank, onClick }: { token: Token; rank: number; onClick: () => void }) {
  const mult = getMultiplier(token);
  const mcap = displayMcap(token);
  const isStar = mult != null && mult >= 10;
  const isGold = mult != null && mult >= 5;

  return (
    <motion.div
      className="shrink-0 w-[240px] sm:w-[270px] cursor-pointer group/lb"
      whileHover={{ y: -4, scale: 1.02 }}
      transition={{ type: "spring", damping: 20, stiffness: 300 }}
      onClick={onClick}
    >
      <div className={`relative rounded-xl border p-4 transition-all duration-300 ${
        isStar
          ? "bg-yellow-400/[0.04] border-yellow-400/20 hover:border-yellow-400/40 shadow-[0_0_30px_rgba(250,204,21,0.06)]"
          : isGold
          ? "bg-accent/[0.03] border-accent/15 hover:border-accent/30 shadow-[0_0_20px_rgba(0,229,160,0.04)]"
          : "bg-surface/50 border-border/50 hover:border-border-bright"
      }`}>
        {/* Animated bg for top performers */}
        {isGold && (
          <div className="absolute inset-0 -z-[1] overflow-hidden rounded-xl opacity-20">
            <div
              className="absolute inset-[-60%] animate-[spin_15s_linear_infinite]"
              style={{
                background: isStar
                  ? "conic-gradient(from 0deg, transparent, rgba(250,204,21,0.2), transparent 50%, rgba(250,204,21,0.1), transparent)"
                  : "conic-gradient(from 0deg, transparent, rgba(0,229,160,0.15), transparent 50%, rgba(0,229,160,0.08), transparent)",
              }}
            />
          </div>
        )}

        {/* Rank */}
        <div className={`absolute -top-2 -left-1 w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black ${
          rank === 1 ? "bg-yellow-400 text-black" :
          rank === 2 ? "bg-foreground/80 text-black" :
          rank === 3 ? "bg-orange-400 text-black" :
          "bg-surface-raised text-muted border border-border"
        }`}>
          {rank}
        </div>

        <div className="flex items-center gap-3 mb-3">
          {token.image ? (
            <img src={token.image} alt="" className="w-11 h-11 rounded-lg ring-1 ring-border/50 object-cover shrink-0" />
          ) : (
            <div className="w-11 h-11 rounded-lg bg-surface-raised ring-1 ring-border flex items-center justify-center text-xs font-bold text-muted shrink-0">
              {(token.symbol || "?")[0]}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-foreground truncate">{token.symbol || "???"}</div>
            <div className="text-[10px] text-muted/40 truncate">{token.name || "Unknown"}</div>
          </div>
        </div>

        <div className="flex items-baseline justify-between">
          <span className={`text-xl font-mono font-black ${
            isStar ? "text-yellow-400" : isGold ? "text-accent" : "text-foreground"
          }`} style={{ textShadow: isGold ? "0 0 12px currentColor" : "none" }}>
            {mult != null ? `${mult.toFixed(1)}x` : "—"}
          </span>
          <span className="text-[10px] font-mono text-muted/40">{formatMcap(mcap)}</span>
        </div>

        {token.initial_mcap && token.ath_mcap && (
          <div className="flex items-center gap-1.5 mt-2.5 text-[10px] text-muted/35 font-mono">
            <span>{formatMcap(token.initial_mcap)}</span>
            <span className="text-accent/40">→</span>
            <span className="text-foreground/50">{formatMcap(token.ath_mcap)}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function HomePage() {
  const { tokens, allTokens, stats, search, setSearch, dexCache, connected, flashSet, trading } = useTokenFeed({
    sortBy: "recent",
    limit: 500,
  });
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [page, setPage] = useState(0);
  const [leaderboardPage, setLeaderboardPage] = useState(0);
  const leaderboardRef = useRef<HTMLDivElement>(null);
  const LEADERBOARD_PAGE_SIZE = 5;

  const leaderboardTotalPages = Math.max(1, Math.ceil(leaderboard.length / LEADERBOARD_PAGE_SIZE));
  const leaderboardPageTokens = useMemo(() => {
    const start = leaderboardPage * LEADERBOARD_PAGE_SIZE;
    return leaderboard.slice(start, start + LEADERBOARD_PAGE_SIZE);
  }, [leaderboard, leaderboardPage]);

  const leaderboardPrev = useCallback(() => setLeaderboardPage(p => Math.max(0, p - 1)), []);
  const leaderboardNext = useCallback(() => setLeaderboardPage(p => Math.min(leaderboardTotalPages - 1, p + 1)), [leaderboardTotalPages]);

  const hotCount = useMemo(
    () => allTokens.filter((t) => { const c = mcapChange(t); return c != null && c > 100; }).length,
    [allTokens]
  );

  const hotTokens = useMemo(() => {
    return allTokens
      .filter((t) => {
        const c = mcapChange(t);
        const m = getMultiplier(t);
        return (c != null && c > 50) || (m != null && m >= 2);
      })
      .sort((a, b) => (getMultiplier(b) || 0) - (getMultiplier(a) || 0))
      .slice(0, 12);
  }, [allTokens]);

  const leaderboard = useMemo(() => {
    return allTokens
      .filter((t) => {
        const m = getMultiplier(t);
        return m != null && m > 1.5;
      })
      .sort((a, b) => (getMultiplier(b) || 0) - (getMultiplier(a) || 0))
      .slice(0, 15);
  }, [allTokens]);

  const totalPages = Math.max(1, Math.ceil(tokens.length / TOKENS_PER_PAGE));
  useEffect(() => {
    if (page >= totalPages) setPage(Math.max(0, totalPages - 1));
  }, [page, totalPages]);

  const pageTokens = useMemo(() => {
    const start = page * TOKENS_PER_PAGE;
    return tokens.slice(start, start + TOKENS_PER_PAGE);
  }, [tokens, page]);

  const getGradeInfo = (token: Token) => {
    const dex = dexCache.get(token.address) || null;
    const mcap = displayMcap(token);
    const conviction = computeConviction(dex, mcap, token.ath_mcap, token.initial_mcap);
    return { displayGrade: conviction.grade, displayScore: conviction.score, allFactors: conviction.factors || [] };
  };

  return (
    <div className="min-h-screen flex flex-col relative">
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/4 w-[700px] h-[700px] bg-accent/[0.04] rounded-full blur-[220px]" />
        <div className="absolute bottom-0 right-1/3 w-[500px] h-[500px] bg-blue-600/[0.025] rounded-full blur-[180px]" />
        <div className="absolute top-1/2 -right-20 w-[300px] h-[600px] bg-purple-600/[0.02] rounded-full blur-[160px]" />
      </div>

      <Navbar />
      <main className="flex-grow pt-14">
        {/* ═══ HERO ═══ */}
        <HeroSection
          tokens={tokens}
          hotTokens={hotTokens}
          allTokens={allTokens}
          stats={stats}
          hotCount={hotCount}
          dexCacheSize={dexCache.size}
          connected={connected}
          onTokenClick={setSelectedToken}
        />

        {/* ═══ PROOF OF INTELLIGENCE — Leaderboard ═══ */}
        {leaderboard.length > 0 && (
          <section className="relative overflow-hidden border-b border-border/30 bg-gradient-to-b from-background to-background/95">
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-accent/[0.02] rounded-full blur-[120px]" />
            </div>
            <div className="max-w-[1800px] mx-auto px-4 py-12">
              <motion.div
                className="text-center mb-8"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={SPRING_SMOOTH}
              >
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/8 border border-accent/12 text-[10px] font-bold text-accent uppercase tracking-widest mb-4">
                  <motion.div
                    className="w-1.5 h-1.5 rounded-full bg-accent"
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                  Proof of Intelligence
                </div>
                <h2 className="text-2xl sm:text-3xl font-heading font-black mb-2">
                  ClawFi&apos;s <span className="text-gradient-accent">Top Signals</span>
                </h2>
                <p className="text-muted/40 text-sm max-w-md mx-auto">
                  Every signal below was identified by ClawFi before the move. These aren&apos;t predictions — they&apos;re results. Real-time performance, verified on-chain.
                </p>
              </motion.div>

              {/* Arrow Navigation Leaderboard */}
              <div className="relative flex items-center gap-3">
                {/* Left Arrow */}
                <button
                  onClick={leaderboardPrev}
                  disabled={leaderboardPage === 0}
                  className="flex-shrink-0 w-9 h-9 rounded-full border border-border/50 bg-surface/60 hover:bg-surface hover:border-accent/40 disabled:opacity-20 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center group z-20"
                  aria-label="Previous signals"
                >
                  <ChevronLeft className="w-4 h-4 text-muted/60 group-hover:text-accent transition-colors" />
                </button>

                {/* Cards — fixed 5 visible */}
                <div ref={leaderboardRef} className="flex gap-3.5 flex-1 overflow-hidden pt-4 pb-4 min-w-0">
                  {leaderboardPageTokens.map((token, i) => (
                    <LeaderboardEntry
                      key={token.address}
                      token={token}
                      rank={leaderboardPage * LEADERBOARD_PAGE_SIZE + i + 1}
                      onClick={() => setSelectedToken(token)}
                    />
                  ))}
                </div>

                {/* Right Arrow */}
                <button
                  onClick={leaderboardNext}
                  disabled={leaderboardPage >= leaderboardTotalPages - 1}
                  className="flex-shrink-0 w-9 h-9 rounded-full border border-border/50 bg-surface/60 hover:bg-surface hover:border-accent/40 disabled:opacity-20 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center group z-20"
                  aria-label="Next signals"
                >
                  <ChevronRight className="w-4 h-4 text-muted/60 group-hover:text-accent transition-colors" />
                </button>
              </div>

              {/* Page dots */}
              <div className="flex items-center justify-center gap-1.5 mt-3">
                {Array.from({ length: leaderboardTotalPages }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setLeaderboardPage(i)}
                    className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${
                      i === leaderboardPage ? 'bg-accent w-4' : 'bg-border/40 hover:bg-border'
                    }`}
                    aria-label={`Page ${i + 1}`}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ═══ LIVE TRADING DASHBOARD ═══ */}
        <section className="relative border-b border-border/30">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-1/3 w-[400px] h-[200px] bg-accent/[0.015] rounded-full blur-[100px]" />
          </div>
          <div className="max-w-[1800px] mx-auto px-4 py-12">
            <motion.div
              className="text-center mb-8"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={SPRING_SMOOTH}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/8 border border-accent/12 text-[10px] font-bold text-accent uppercase tracking-widest mb-4">
                <motion.div
                  className="w-1.5 h-1.5 rounded-full bg-accent"
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                Engine Status
              </div>
              <h2 className="text-2xl sm:text-3xl font-heading font-black mb-2">
                Trading <span className="text-gradient-accent">Dashboard</span>
              </h2>
              <p className="text-muted/40 text-sm max-w-md mx-auto">
                Real-time overview of ClawFi&apos;s autonomous trading engine. Every metric updates live.
              </p>
            </motion.div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 max-w-4xl mx-auto">
              {[
                { label: "SOL Balance", value: trading.balanceSol > 0 ? trading.balanceSol.toFixed(3) : "0.000", accent: true },
                { label: "Active Trades", value: String(trading.positions.filter(p => p.remainingPct > 0).length), accent: false },
                { label: "Unrealized P&L", value: (() => {
                  const open = trading.positions.filter(p => p.remainingPct > 0);
                  const pnl = open.reduce((sum, p) => sum + (p.amountSol * (p.remainingPct / 100) * (p.pnlPct / 100)), 0);
                  return `${pnl >= 0 ? "+" : ""}${pnl.toFixed(4)}`;
                })(), isPnl: true },
                { label: "Total Trades", value: String(trading.tradeCount), accent: false },
              ].map((s) => {
                const isPnlPositive = s.isPnl ? parseFloat(s.value) >= 0 : true;
                return (
                  <motion.div
                    key={s.label}
                    className="rounded-xl bg-surface/50 border border-border/50 p-4 hover:border-border-bright transition-all duration-300"
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={SPRING_SMOOTH}
                  >
                    <div className="text-[10px] text-muted/50 uppercase tracking-wider mb-1 font-bold">{s.label}</div>
                    <div className={`text-xl font-mono font-black ${
                      s.isPnl ? (isPnlPositive ? "text-accent" : "text-danger") :
                      s.accent ? "text-accent" : "text-foreground"
                    }`}>
                      {s.value}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Active Positions + Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-5xl mx-auto">
              {/* Compact Positions */}
              <motion.div
                className="rounded-xl bg-surface/40 border border-border/40 overflow-hidden"
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={SPRING_SMOOTH}
              >
                <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between bg-surface-raised/20">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                    <span className="text-xs font-bold">Active Positions</span>
                  </div>
                  <span className="text-[10px] text-muted font-mono">
                    {trading.positions.filter(p => p.remainingPct > 0).length} open
                  </span>
                </div>
                {trading.positions.filter(p => p.remainingPct > 0).length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <div className="w-8 h-8 mx-auto mb-2 rounded-full border border-muted/15 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-muted/20 animate-pulse" />
                    </div>
                    <p className="text-muted/40 text-xs">Scanning for entries...</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/20 max-h-[250px] overflow-y-auto">
                    {trading.positions.filter(p => p.remainingPct > 0).slice(0, 8).map((pos) => (
                      <div key={pos.mint} className="px-4 py-2.5 flex items-center justify-between hover:bg-surface-raised/20 transition-colors">
                        <div>
                          <span className="text-xs font-bold text-foreground">{pos.symbol || pos.mint.slice(0, 6)}</span>
                          <span className="text-[10px] text-muted/40 ml-2 font-mono">{pos.amountSol.toFixed(3)} SOL</span>
                        </div>
                        <span className={`text-xs font-mono font-black ${pos.pnlPct >= 0 ? "text-accent" : "text-danger"}`}>
                          {pos.pnlPct >= 0 ? "+" : ""}{pos.pnlPct.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>

              {/* Recent Activity */}
              <motion.div
                className="rounded-xl bg-surface/40 border border-border/40 overflow-hidden"
                initial={{ opacity: 0, x: 10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={SPRING_SMOOTH}
              >
                <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between bg-surface-raised/20">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-accent" />
                    <span className="text-xs font-bold">Recent Activity</span>
                  </div>
                  <span className="text-[10px] text-muted font-mono">
                    {trading.activityLog.length} events
                  </span>
                </div>
                {trading.activityLog.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-muted/40 text-xs">Waiting for activity...</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/20 max-h-[250px] overflow-y-auto">
                    {trading.activityLog.slice(0, 8).map((entry, i) => (
                      <div key={i} className="px-4 py-2.5 hover:bg-surface-raised/20 transition-colors">
                        <div className="flex items-start gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                            entry.type === "trade" ? "bg-accent" :
                            entry.type === "error" ? "bg-warning" :
                            "bg-muted/40"
                          }`} />
                          <p className="text-[11px] text-foreground/60 break-words leading-relaxed line-clamp-2">
                            {entry.message}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            </div>
          </div>
        </section>

        {/* ═══ AUTO-TRADING ENGINE SECTION ═══ */}
        <section className="relative border-b border-border/30">
          <div className="max-w-[1800px] mx-auto px-4 py-14">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center max-w-5xl mx-auto">
              {/* Left: Content */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={SPRING_SMOOTH}
              >
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/8 border border-accent/12 text-[10px] font-bold text-accent uppercase tracking-widest mb-4">
                  <motion.div
                    className="w-1.5 h-1.5 rounded-full bg-accent"
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                  How It Works
                </div>
                <h2 className="text-2xl sm:text-3xl font-heading font-black mb-3">
                  From Signal to <span className="text-gradient-accent">Execution</span>
                </h2>
                <p className="text-foreground/55 text-sm leading-relaxed mb-4">
                  When ClawFi spots a token worth trading, it doesn&apos;t just tell you about it — it handles the trade. Buys in early, sets stop-losses, takes profit, and exits before momentum dies. All hands-free.
                </p>
                <p className="text-foreground/40 text-xs leading-relaxed mb-6">
                  You set your risk. The engine does the rest. Every trade shows up in real-time on your dashboard so you always know what&apos;s happening with your capital.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link href="/trading" className="inline-flex items-center gap-2 h-11 px-7 rounded-xl bg-accent text-black font-bold text-sm hover:bg-accent-bright transition-all shadow-[0_0_20px_rgba(0,229,160,0.15)] hover:shadow-[0_0_30px_rgba(0,229,160,0.3)]">
                    Open Trading Engine
                  </Link>
                  <Link href="/wallet" className="inline-flex items-center gap-2 h-11 px-7 rounded-xl bg-surface border border-border text-foreground font-medium text-sm hover:border-border-bright hover:bg-surface-raised transition-all">
                    Connect Wallet
                  </Link>
                </div>
              </motion.div>

              {/* Right: Visual feature list */}
              <motion.div
                className="space-y-3"
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ ...SPRING_SMOOTH, delay: 0.15 }}
              >
                {[
                  {
                    title: "Catches Tokens Early",
                    desc: "ClawFi watches every new Solana launch in real-time. When volume, holder count, and momentum line up — it moves fast.",
                  },
                  {
                    title: "Buys and Sells For You",
                    desc: "No more staring at charts. The engine places entries, locks in profit at your target, and cuts losses before they get ugly.",
                  },
                  {
                    title: "Built-In Risk Controls",
                    desc: "Stop-losses, take-profit levels, trailing stops, and position sizing — all configured to match your risk tolerance.",
                  },
                  {
                    title: "Everything On-Chain, Transparent",
                    desc: "Every signal, every trade, every exit — verified on Solana. You can see exactly what happened and why.",
                  },
                ].map((feature, i) => (
                  <motion.div
                    key={feature.title}
                    className="rounded-xl bg-surface/40 border border-border/40 p-4 hover:border-accent/15 hover:bg-surface/60 transition-all duration-300"
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ ...SPRING_SMOOTH, delay: 0.1 + i * 0.08 }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent/60 mt-1.5 shrink-0" />
                      <div>
                        <div className="text-sm font-bold text-foreground/85 mb-0.5">{feature.title}</div>
                        <div className="text-xs text-foreground/45 leading-relaxed">{feature.desc}</div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </div>
        </section>


        {/* ═══ TOKEN FEED WITH PAGINATION ═══ */}
        <section className="max-w-[1800px] mx-auto px-4 py-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <motion.div
                className="w-2.5 h-2.5 rounded-full bg-accent"
                animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <h2 className="text-xl font-heading font-bold">The Pit</h2>
              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${connected ? "bg-accent/10 text-accent border border-accent/20" : "bg-danger/10 text-danger border border-danger/20"}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-accent animate-pulse" : "bg-danger"}`} />
                {connected ? "STREAMING" : "OFFLINE"}
              </div>
              <span className="text-xs text-muted/50 font-mono">{tokens.length} tokens</span>
            </div>
            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type="text"
                placeholder="Search tokens..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="w-full sm:w-60 h-10 pl-9 pr-3 rounded-xl bg-surface border border-border text-sm placeholder:text-muted/40 focus:outline-none focus:border-accent/30 transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
            {pageTokens.map((token, i) => (
              <TokenCard
                key={token.address}
                token={token}
                dex={dexCache.get(token.address) || null}
                index={i}
                isFlash={flashSet.current.has(token.address)}
                onClick={() => setSelectedToken(token)}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <button onClick={() => setPage(0)} disabled={page === 0} className="p-2 rounded-lg bg-surface border border-border text-muted hover:text-foreground hover:border-border-bright disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="p-2 rounded-lg bg-surface border border-border text-muted hover:text-foreground hover:border-border-bright disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 7) pageNum = i;
                  else if (page < 3) pageNum = i;
                  else if (page > totalPages - 4) pageNum = totalPages - 7 + i;
                  else pageNum = page - 3 + i;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`w-9 h-9 rounded-lg text-xs font-bold transition-all ${
                        page === pageNum
                          ? "bg-accent/15 text-accent border border-accent/30 shadow-[0_0_10px_rgba(0,229,160,0.1)]"
                          : "bg-surface border border-border text-muted hover:text-foreground hover:border-border-bright"
                      }`}
                    >
                      {pageNum + 1}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-2 rounded-lg bg-surface border border-border text-muted hover:text-foreground hover:border-border-bright disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} className="p-2 rounded-lg bg-surface border border-border text-muted hover:text-foreground hover:border-border-bright disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {tokens.length === 0 && (
            <div className="text-center py-28">
              <p className="text-foreground/50 text-base font-heading font-bold mb-1">ClawFi is scanning the Solana network...</p>
              <p className="text-muted/40 text-sm">Tokens will appear here as they&apos;re detected and scored</p>
              {!connected && (
                <p className="text-danger/60 text-xs mt-3">WebSocket disconnected — make sure the backend is running on port 3001</p>
              )}
            </div>
          )}
        </section>
      </main>

      {selectedToken && (() => {
        const dex = dexCache.get(selectedToken.address) || null;
        const { displayGrade, displayScore, allFactors } = getGradeInfo(selectedToken);
        return (
          <TokenModal
            token={selectedToken}
            dex={dex}
            onClose={() => setSelectedToken(null)}
            grade={displayGrade}
            score={displayScore}
            factors={allFactors}
          />
        );
      })()}
    </div>
  );
}
