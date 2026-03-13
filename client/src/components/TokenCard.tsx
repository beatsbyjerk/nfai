"use client";

import React, { useState, useCallback } from "react";
import { Card, CardBody } from "@/components/Card";
import { formatMcap, timeAgo } from "@/lib/utils";
import { computeConviction, type DexPairData } from "@/lib/dexscreener";
import { TrendingUp, TrendingDown, ExternalLink, Copy, Check } from "lucide-react";

export interface Token {
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
  isNew?: boolean;
  recommendation_rank?: number;
  volatility_score?: number;
  dex_status?: string;
}

export function displayMcap(t: Token) {
  return t.realtime_mcap || t.latest_mcap || t.initial_mcap;
}

export function mcapChange(t: Token) {
  const current = displayMcap(t);
  const initial = t.initial_mcap;
  if (!current || !initial || initial === 0) return null;
  return ((current - initial) / initial) * 100;
}

export function getMultiplier(t: Token) {
  if (t.highest_multiplier && t.highest_multiplier > 0) return t.highest_multiplier;
  const current = displayMcap(t);
  const initial = t.initial_mcap;
  if (!current || !initial || initial === 0) return null;
  return current / initial;
}

interface TokenCardProps {
  token: Token;
  dex: DexPairData | null;
  index?: number;
  isFlash?: boolean;
  onClick?: () => void;
  variant?: "default" | "trending" | "apex" | "promoted";
}

export function TokenCard({ token, dex, index = 0, isFlash = false, onClick, variant = "default" }: TokenCardProps) {
  const [copied, setCopied] = useState(false);
  const mcap = displayMcap(token);
  const change = mcapChange(token);
  const multiplier = getMultiplier(token);
  const isHot = (change != null && change > 100) || (multiplier != null && multiplier >= 3);
  const isDead = change != null && change < -50;
  const conviction = computeConviction(dex, mcap, token.ath_mcap, token.initial_mcap);
  const displayGrade = conviction.grade;
  const displayScore = conviction.score;
  const allFactors = conviction.factors || [];

  const copyAddress = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(token.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }, [token.address]);
  const gradeColor =
    displayGrade === "S" ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/30 shadow-[0_0_8px_rgba(250,204,21,0.15)]" :
    displayGrade === "A" ? "text-accent bg-accent/10 border-accent/30 shadow-[0_0_8px_rgba(0,229,160,0.15)]" :
    displayGrade === "B" ? "text-blue-400 bg-blue-400/10 border-blue-400/30" :
    displayGrade === "C" ? "text-muted/80 bg-surface border-border" :
    displayGrade === "D" ? "text-orange-400 bg-orange-400/10 border-orange-400/30" :
    displayGrade === "F" ? "text-danger bg-danger/10 border-danger/30" :
    "text-muted bg-surface border-border";

  const hasPerformance = multiplier != null && multiplier >= 2;
  const isStar = multiplier != null && multiplier >= 5;

  const m1 = token.price_change_1m ?? null;
  const m5 = token.price_change_5m ?? dex?.priceChange5m ?? null;
  const m1h = token.price_change_1h ?? dex?.priceChange1h ?? null;

  return (
    <Card
      className={`group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 cursor-pointer ${
        isFlash ? "border-accent/50 glow-accent animate-border-pulse" : ""
      } ${isHot && !isFlash ? "border-accent/25" : ""} ${isDead ? "border-danger/20 opacity-60" : ""}`}
      style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
      onClick={onClick}
    >
      {/* Animated conic gradient for high performers */}
      {hasPerformance && (
        <div className="absolute inset-0 -z-[1] overflow-hidden rounded-2xl opacity-25 group-hover:opacity-35 transition-opacity duration-500">
          <div
            className="absolute inset-[-60%] animate-[spin_12s_linear_infinite]"
            style={{
              background: isStar
                ? "conic-gradient(from 0deg, transparent, rgba(250,204,21,0.18), transparent 40%, rgba(250,204,21,0.12), transparent 70%, rgba(0,229,160,0.1), transparent)"
                : "conic-gradient(from 0deg, transparent, rgba(0,229,160,0.14), transparent 40%, rgba(0,160,255,0.1), transparent 70%, rgba(0,229,160,0.08), transparent)",
            }}
          />
        </div>
      )}

      <div className={`absolute top-0 left-0 right-0 h-[2px] ${
        displayGrade === "S" ? "bg-gradient-to-r from-transparent via-yellow-400 to-transparent" :
        displayGrade === "A" ? "bg-gradient-to-r from-transparent via-accent/80 to-transparent" :
        isHot ? "bg-gradient-to-r from-transparent via-accent/50 to-transparent" :
        isFlash ? "bg-accent/30" : "bg-transparent"
      }`} />

      <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
        {isHot && !isDead && (
          <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-accent/15 text-accent text-[10px] font-black tracking-wider border border-accent/20">
            HOT
          </div>
        )}
        {isDead && (
          <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-danger/15 text-danger text-[10px] font-black tracking-wider border border-danger/20">
            RIP
          </div>
        )}
      </div>

      <CardBody className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {token.image ? (
              <img src={token.image} alt="" className="w-10 h-10 rounded-xl bg-surface object-cover shrink-0 ring-1 ring-border" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-surface-raised to-surface flex items-center justify-center text-sm font-black text-muted/60 shrink-0 ring-1 ring-border">
                {(token.symbol || "?")[0]}
              </div>
            )}
            <div className="min-w-0">
              <div className="font-bold text-sm truncate flex items-center gap-1.5 text-foreground">
                {token.symbol || "???"}
                <a href={`https://pump.fun/${token.address}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted/40 hover:text-accent transition-colors opacity-0 group-hover:opacity-100">
                  <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  onClick={copyAddress}
                  className="text-muted/40 hover:text-accent transition-colors opacity-0 group-hover:opacity-100"
                  title="Copy contract address"
                >
                  {copied ? <Check className="w-3 h-3 text-accent" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              <div className="text-[11px] text-foreground/50 truncate max-w-[130px]">{token.name || token.address.slice(0, 16)}</div>
            </div>
          </div>
          {displayGrade !== "—" && displayGrade !== "F" && (
            <div className={`flex flex-col items-center px-2.5 py-1.5 rounded-lg border text-center ${gradeColor}`}>
              <span className="text-lg font-heading font-black leading-none">{displayGrade}</span>
              <span className="text-[8px] font-mono opacity-60 mt-0.5">{displayScore}</span>
            </div>
          )}
        </div>

        <div className="mb-3">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-xl font-mono font-black tracking-tight text-foreground" style={{ textShadow: "0 0 20px rgba(255,255,255,0.1)" }}>{formatMcap(mcap)}</span>
            <div className="flex items-center gap-2">
              {multiplier != null && multiplier > 1 && (
                <span className={`text-sm font-mono font-black px-1.5 py-0.5 rounded-md ${
                  multiplier >= 5 ? "text-yellow-400 bg-yellow-400/10" :
                  multiplier >= 2 ? "text-accent bg-accent/10" :
                  "text-accent/70 bg-accent/5"
                }`} style={{ textShadow: multiplier >= 2 ? "0 0 10px currentColor" : "none" }}>
                  {multiplier.toFixed(1)}x
                </span>
              )}
              {change != null && (
                <span className={`text-xs font-mono font-bold flex items-center gap-0.5 ${change >= 0 ? "text-success" : "text-danger"}`}>
                  {change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {change >= 0 ? "+" : ""}{change.toFixed(0)}%
                </span>
              )}
            </div>
          </div>
          {token.ath_mcap && mcap && token.ath_mcap > 0 && (
            <div className="w-full h-1.5 rounded-full bg-border/80 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${change != null && change >= 0 ? "bg-gradient-to-r from-accent/80 to-accent" : "bg-gradient-to-r from-danger/80 to-danger"}`}
                style={{ width: `${Math.min(100, (mcap / token.ath_mcap) * 100)}%` }}
              />
            </div>
          )}
        </div>

        {(m1 != null || m5 != null || m1h != null) && (
          <div className="flex gap-1 mb-3">
            {([
              { label: "1m", val: m1 },
              { label: "5m", val: m5 },
              { label: "1h", val: m1h },
            ] as const).map(({ label, val }) => (
              <div key={label} className="flex-1 rounded-lg bg-background/80 border border-border/40 px-1.5 py-1.5 text-center">
                <div className="text-[9px] text-foreground/50 uppercase tracking-wider">{label}</div>
                <div className={`text-xs font-mono font-bold ${val != null ? (val >= 0 ? "text-accent" : "text-danger") : "text-foreground/25"}`}>
                  {val != null ? `${val >= 0 ? "+" : ""}${val.toFixed(1)}%` : "—"}
                </div>
              </div>
            ))}
          </div>
        )}

        {(token.volume_24h || token.transactions_24h) && (
          <div className="flex gap-1 mb-3">
            {token.volume_24h != null && (
              <div className="flex-1 rounded-lg bg-background/80 border border-border/40 px-1 py-1 text-center">
                <div className="text-[9px] text-foreground/50 uppercase tracking-wider">Vol 24h</div>
                <div className="text-xs font-mono font-bold text-foreground/90">{formatMcap(token.volume_24h)}</div>
              </div>
            )}
            {token.transactions_24h != null && (
              <div className="flex-1 rounded-lg bg-background/80 border border-border/40 px-1 py-1 text-center">
                <div className="text-[9px] text-foreground/50 uppercase tracking-wider">Txns 24h</div>
                <div className="text-xs font-mono font-bold text-foreground/90">{token.transactions_24h.toLocaleString()}</div>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-foreground/50">ATH</span>
            <span className="font-mono font-medium text-foreground/90">{formatMcap(token.ath_mcap)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-foreground/50">Entry</span>
            <span className="font-mono font-medium text-foreground/90">{formatMcap(token.initial_mcap)}</span>
          </div>
          {dex && (
            <>
              <div className="flex justify-between">
                <span className="text-foreground/50">Vol</span>
                <span className="font-mono font-medium text-foreground/90">{dex.volume24h != null ? formatMcap(dex.volume24h) : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground/50">Liq</span>
                <span className="font-mono font-medium text-foreground/90">{dex.liquidity != null ? formatMcap(dex.liquidity) : "—"}</span>
              </div>
            </>
          )}
          <div className="col-span-2 flex justify-between mt-0.5">
            <span className="text-foreground/50">Detected</span>
            <span className="font-mono text-foreground/70">{timeAgo(token.first_seen_local)}</span>
          </div>
        </div>

        {allFactors.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2.5 pt-2.5 border-t border-border/30">
            {allFactors.slice(0, 4).map((f) => (
              <span key={f} className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-accent/6 text-accent/70 border border-accent/10 uppercase tracking-wider">
                {f}
              </span>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
