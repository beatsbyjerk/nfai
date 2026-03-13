"use client";

import React, { useState, useCallback } from "react";
import { formatMcap, timeAgo } from "@/lib/utils";
import type { DexPairData } from "@/lib/dexscreener";
import {
  X, ExternalLink, TrendingUp, TrendingDown, Copy, Check
} from "lucide-react";

interface Token {
  address: string;
  symbol?: string;
  name?: string;
  image?: string;
  initial_mcap?: number;
  latest_mcap?: number;
  ath_mcap?: number;
  realtime_mcap?: number;
  highest_multiplier?: number;
  latest_multiplier?: number;
  volume_24h?: number;
  transactions_24h?: number;
  price_change_1m?: number;
  price_change_5m?: number;
  price_change_1h?: number;
  sources?: string;
  first_seen_local?: string;
}

interface Props {
  token: Token;
  dex: DexPairData | null;
  onClose: () => void;
  grade: string;
  score: number;
  factors: string[];
}

export function TokenModal({ token, dex, onClose, grade, score, factors }: Props) {
  const [copied, setCopied] = useState(false);
  const mcap = token.realtime_mcap || token.latest_mcap || token.initial_mcap;
  const entry = token.initial_mcap;
  const ath = token.ath_mcap;
  const multiplier = token.highest_multiplier || (mcap && entry && entry > 0 ? mcap / entry : null);
  const athMultiplier = ath && entry && entry > 0 ? ath / entry : null;
  const change = mcap && entry && entry > 0 ? ((mcap - entry) / entry) * 100 : null;

  const copyAddress = useCallback(() => {
    navigator.clipboard.writeText(token.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [token.address]);

  const gradeColor =
    grade === "S" ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/30" :
    grade === "A" ? "text-accent bg-accent/10 border-accent/30" :
    grade === "B" ? "text-blue-400 bg-blue-400/10 border-blue-400/30" :
    grade === "C" ? "text-muted/80 bg-surface border-border" :
    grade === "D" ? "text-orange-400 bg-orange-400/10 border-orange-400/30" :
    "text-danger bg-danger/10 border-danger/30";

  const m1 = token.price_change_1m ?? null;
  const m5 = token.price_change_5m ?? dex?.priceChange5m ?? null;
  const m1h = token.price_change_1h ?? dex?.priceChange1h ?? null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-gradient-to-br from-surface-raised to-background border border-border rounded-2xl shadow-2xl shadow-black/50 animate-slide-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-accent/50 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <div className="flex items-center gap-3 min-w-0">
            {token.image ? (
              <img src={token.image} alt="" className="w-12 h-12 rounded-xl ring-1 ring-border object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-surface flex items-center justify-center text-lg font-black text-muted/50 ring-1 ring-border">
                {(token.symbol || "?")[0]}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-lg font-heading font-black">{token.symbol || "???"}</span>
                {grade !== "—" && grade !== "F" && (
                  <span className={`px-2 py-0.5 rounded-md border text-xs font-black ${gradeColor}`}>{grade}</span>
                )}
              </div>
              <div className="text-xs text-foreground/50 truncate">{token.name || token.address}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Contract Address — copyable */}
          <div className="flex items-center gap-2 rounded-xl bg-background/80 border border-border/40 px-3 py-2.5">
            <span className="text-[10px] text-foreground/40 uppercase tracking-wider font-bold shrink-0">CA</span>
            <span className="text-xs font-mono text-foreground/70 truncate flex-1">{token.address}</span>
            <button
              onClick={copyAddress}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent text-[11px] font-bold transition-all shrink-0 border border-accent/15"
            >
              {copied ? (
                <><Check className="w-3.5 h-3.5" /> Copied!</>
              ) : (
                <><Copy className="w-3.5 h-3.5" /> Copy</>
              )}
            </button>
          </div>

          {/* Price / Multiplier row */}
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[10px] text-foreground/45 uppercase tracking-wider mb-0.5">Market Cap</div>
              <span className="text-2xl font-mono font-black">{formatMcap(mcap)}</span>
            </div>
            <div className="text-right">
              {multiplier != null && multiplier > 1 && (
                <div className={`text-xl font-mono font-black ${multiplier >= 2 ? "text-accent" : "text-accent/70"}`}>
                  {multiplier.toFixed(1)}x
                </div>
              )}
              {change != null && (
                <div className={`text-xs font-mono flex items-center justify-end gap-0.5 ${change >= 0 ? "text-accent" : "text-danger"}`}>
                  {change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {change >= 0 ? "+" : ""}{change.toFixed(1)}%
                </div>
              )}
            </div>
          </div>

          {/* Key metrics grid */}
          <div className="grid grid-cols-3 gap-2">
            {([
              { label: "Entry", value: formatMcap(entry) },
              { label: "ATH", value: formatMcap(ath) },
              { label: "ATH Multi", value: athMultiplier ? `${athMultiplier.toFixed(1)}x` : "—" },
            ]).map(({ label, value }) => (
              <div key={label} className="rounded-xl bg-background/80 border border-border/40 p-3 text-center">
                <div className="text-[9px] text-foreground/45 uppercase tracking-wider">{label}</div>
                <div className="text-sm font-mono font-bold mt-0.5">{value}</div>
              </div>
            ))}
          </div>

          {/* Momentum */}
          {(m1 != null || m5 != null || m1h != null || dex?.priceChange6h != null || dex?.priceChange24h != null) && (
            <div className="grid grid-cols-5 gap-1.5">
              {([
                { label: "1m", val: m1 },
                { label: "5m", val: m5 },
                { label: "1h", val: m1h },
                { label: "6h", val: dex?.priceChange6h ?? null },
                { label: "24h", val: dex?.priceChange24h ?? null },
              ]).map(({ label, val }) => (
                <div key={label} className="rounded-lg bg-background/60 border border-border/30 px-2 py-1.5 text-center">
                  <div className="text-[9px] text-foreground/45 uppercase">{label}</div>
                  <div className={`text-xs font-mono font-bold ${val != null ? (val >= 0 ? "text-accent" : "text-danger") : "text-foreground/30"}`}>
                    {val != null ? `${val >= 0 ? "+" : ""}${val.toFixed(1)}%` : "—"}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Volume & activity */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-foreground/50">Volume 24h</span>
              <span className="font-mono font-bold text-foreground/90">{token.volume_24h != null ? formatMcap(token.volume_24h) : (dex?.volume24h != null ? formatMcap(dex.volume24h) : "—")}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-foreground/50">Liquidity</span>
              <span className="font-mono font-bold text-foreground/90">{dex?.liquidity != null ? formatMcap(dex.liquidity) : "—"}</span>
            </div>
            {token.transactions_24h != null && (
              <div className="flex justify-between items-center col-span-2">
                <span className="text-foreground/50">Transactions 24h</span>
                <span className="font-mono font-bold text-foreground/90">{token.transactions_24h.toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Factors */}
          {factors.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {factors.map((f) => (
                <span key={f} className="px-2 py-1 rounded-lg text-[10px] font-bold bg-accent/6 text-accent/70 border border-accent/10 uppercase tracking-wider">
                  {f}
                </span>
              ))}
            </div>
          )}

          {/* Metadata */}
          <div className="flex items-center justify-between text-[11px] text-foreground/45 pt-2 border-t border-border/30">
            <span>Detected {timeAgo(token.first_seen_local)}</span>
            {token.sources && <span className="font-mono text-foreground/35">{token.sources}</span>}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <a
              href={`https://pump.fun/${token.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-accent text-black font-bold text-sm hover:bg-accent-bright transition-all"
            >
              <ExternalLink className="w-4 h-4" /> Pump.fun
            </a>
            <a
              href={`https://dexscreener.com/solana/${token.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-surface border border-border text-foreground font-medium text-sm hover:border-border-bright transition-all"
            >
              DexScreener
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
