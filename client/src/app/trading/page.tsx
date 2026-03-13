"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useWebSocket, type WSMessage } from "@/lib/ws";
import { Navbar } from "@/components/Navbar";
import { Card, CardHeader, CardBody } from "@/components/Card";
import { formatMcap, formatSol, formatPct, timeAgo } from "@/lib/utils";
import {
  TrendingUp, TrendingDown
} from "lucide-react";

interface Position {
  mint: string;
  symbol?: string;
  entryMcap: number;
  currentMcap?: number;
  maxMcap?: number;
  amountSol: number;
  remainingPct: number;
  pnlPct: number;
  tokenAmount?: number;
  isMigrating?: boolean;
  buyInProgress?: boolean;
  sellInProgress?: boolean;
}

interface ActivityEntry {
  type: string;
  message: string;
  timestamp: string;
}

export default function TradingPage() {
  const { connected, on } = useWebSocket(false);
  const [positions, setPositions] = useState<Position[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [balanceSol, setBalanceSol] = useState<number | null>(null);
  const [holders, setHolders] = useState<any[]>([]);
  const [engineState, setEngineState] = useState<any>(null);

  const handleRefresh = useCallback((msg: WSMessage) => {
    const t = msg.data?.trading;
    if (t) {
      setEngineState(t);
      setPositions(t.positions || []);
      if (t.balanceSol != null) setBalanceSol(t.balanceSol);
      if (t.activityLog) setActivityLog(t.activityLog);
    }
  }, []);

  const handlePositions = useCallback((msg: WSMessage) => setPositions(msg.data || []), []);
  const handleActivity = useCallback((msg: WSMessage) => {
    const entry = msg.data;
    if (entry) setActivityLog((prev) => [entry, ...prev].slice(0, 200));
  }, []);
  const handleBalance = useCallback((msg: WSMessage) => {
    if (msg.data?.balanceSol != null) setBalanceSol(msg.data.balanceSol);
  }, []);
  const handleHolders = useCallback((msg: WSMessage) => {
    if (msg.data?.holders) setHolders(msg.data.holders);
  }, []);

  useEffect(() => {
    const unsubs = [
      on("refresh", handleRefresh),
      on("init", handleRefresh),
      on("positions", handlePositions),
      on("activity", handleActivity),
      on("balance", handleBalance),
      on("holders", handleHolders),
    ];
    return () => unsubs.forEach((u) => u());
  }, [on, handleRefresh, handlePositions, handleActivity, handleBalance, handleHolders]);

  const openPositions = positions.filter((p) => p.remainingPct > 0);
  const totalInvested = openPositions.reduce((sum, p) => sum + (p.amountSol * (p.remainingPct / 100)), 0);
  const totalPnl = openPositions.reduce((sum, p) => sum + (p.amountSol * (p.remainingPct / 100) * (p.pnlPct / 100)), 0);

  return (
    <div className="min-h-screen flex flex-col relative">
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-accent/[0.03] rounded-full blur-[180px]" />
        <div className="absolute bottom-1/4 left-0 w-[400px] h-[400px] bg-blue-600/[0.025] rounded-full blur-[150px]" />
      </div>

      <Navbar />
      <main className="flex-grow pt-14">
        <div className="max-w-[1800px] mx-auto px-4 py-6">
          {/* Header */}
          <div className="relative mb-8">
            <div className="absolute -top-6 left-0 w-32 h-32 bg-accent/8 rounded-full blur-[60px] pointer-events-none" />
            <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="relative w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-accent animate-pulse" />
                  <div className="absolute inset-0 bg-accent/20 rounded-full blur-lg" />
                </div>
                <div>
                  <h1 className="text-2xl font-heading font-bold tracking-tight">ClawFi Engine</h1>
                  <p className="text-muted/60 text-xs">Autonomous execution — auto-buys, take-profits, stop-losses</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${connected ? "bg-accent/10 text-accent border border-accent/20" : "bg-danger/10 text-danger border border-danger/20"}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-accent animate-pulse" : "bg-danger"}`} />
                  {connected ? "CONNECTED" : "OFFLINE"}
                </div>
              </div>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {[
              { icon: <span className="text-sm font-black">SOL</span>, label: "Balance", value: formatSol(balanceSol, 3), color: "accent" },
              { icon: <span className="text-sm font-black">{openPositions.length}</span>, label: "Open Positions", value: String(openPositions.length), color: "accent" },
              { icon: <span className="text-sm font-black">$</span>, label: "Invested", value: formatSol(totalInvested, 3), color: "accent" },
              { icon: totalPnl >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />, label: "Unrealized P&L", value: formatSol(totalPnl, 4), color: totalPnl >= 0 ? "accent" : "danger" },
            ].map(({ icon, label, value, color }) => (
              <Card key={label} className="group hover:-translate-y-0.5">
                <CardBody className="p-4 flex items-center gap-3.5">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${color === "danger" ? "bg-danger/10 text-danger" : "bg-accent/10 text-accent"} transition-all group-hover:scale-105`}>
                    {icon}
                  </div>
                  <div>
                    <div className="text-[11px] text-muted/50 uppercase tracking-wider">{label}</div>
                    <div className={`font-mono font-black text-lg ${color === "danger" ? "text-danger" : ""}`}>{value}</div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Positions Panel */}
            <Card className="lg:col-span-2">
              <CardHeader className="bg-surface-raised/30">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-accent animate-pulse" /> Active Positions
                </h2>
                <span className="text-[10px] text-muted font-mono">{openPositions.length} open</span>
              </CardHeader>
              {openPositions.length === 0 ? (
                <CardBody className="text-center py-16">
                  <div className="relative inline-block mb-4">
                    <div className="w-12 h-12 rounded-full border-2 border-muted/15 flex items-center justify-center">
                      <div className="w-3 h-3 rounded-full bg-muted/15 animate-pulse" />
                    </div>
                  </div>
                  <p className="text-foreground/40 text-sm font-medium">No open positions</p>
                  <p className="text-muted/30 text-xs mt-1">Engine is scanning for entry signals...</p>
                </CardBody>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted/50 uppercase tracking-wider text-[10px]">
                        <th className="text-left p-3 font-bold">Token</th>
                        <th className="text-right p-3 font-bold">Entry</th>
                        <th className="text-right p-3 font-bold">Current</th>
                        <th className="text-right p-3 font-bold">Size</th>
                        <th className="text-right p-3 font-bold">Left</th>
                        <th className="text-right p-3 font-bold">P&L</th>
                        <th className="text-right p-3 font-bold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openPositions.map((pos) => (
                        <tr key={pos.mint} className="border-b border-border/30 hover:bg-surface-raised/30 transition-all duration-150">
                          <td className="p-3">
                            <div className="font-bold text-foreground">{pos.symbol || pos.mint.slice(0, 8)}</div>
                            <div className="text-muted/40 font-mono text-[10px]">{pos.mint.slice(0, 6)}...{pos.mint.slice(-4)}</div>
                          </td>
                          <td className="p-3 text-right font-mono">{formatMcap(pos.entryMcap)}</td>
                          <td className="p-3 text-right font-mono">{formatMcap(pos.currentMcap || pos.maxMcap)}</td>
                          <td className="p-3 text-right font-mono">{pos.amountSol.toFixed(3)}</td>
                          <td className="p-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <div className="w-10 h-1 rounded-full bg-border overflow-hidden">
                                <div className="h-full rounded-full bg-accent" style={{ width: `${pos.remainingPct}%` }} />
                              </div>
                              <span className="font-mono text-muted">{pos.remainingPct.toFixed(0)}%</span>
                            </div>
                          </td>
                          <td className={`p-3 text-right font-mono font-black ${pos.pnlPct >= 0 ? "text-accent" : "text-danger"}`}>
                            {formatPct(pos.pnlPct)}
                          </td>
                          <td className="p-3 text-right">
                            {pos.buyInProgress && <span className="px-2 py-0.5 rounded-full text-[10px] bg-warning/10 text-warning border border-warning/20 font-bold">BUYING</span>}
                            {pos.sellInProgress && <span className="px-2 py-0.5 rounded-full text-[10px] bg-danger/10 text-danger border border-danger/20 font-bold">SELLING</span>}
                            {pos.isMigrating && <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface text-muted border border-border font-bold">MIGRATING</span>}
                            {!pos.buyInProgress && !pos.sellInProgress && !pos.isMigrating && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-accent/10 text-accent border border-accent/20 font-bold">ACTIVE</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Activity Feed */}
            <Card className="max-h-[650px] flex flex-col">
              <CardHeader className="bg-surface-raised/30">
                <h2 className="text-sm font-bold flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-accent" /> Activity Feed</h2>
                <span className="text-[10px] text-muted font-mono">{activityLog.length} events</span>
              </CardHeader>
              <div className="flex-grow overflow-y-auto">
                {activityLog.length === 0 ? (
                  <CardBody className="text-center py-16">
                    <div className="w-10 h-10 mx-auto mb-3 rounded-full border-2 border-muted/15 flex items-center justify-center"><span className="text-muted/30 text-xs font-mono">...</span></div>
                    <p className="text-muted/40 text-xs">Waiting for activity...</p>
                  </CardBody>
                ) : (
                  <div className="divide-y divide-border/30">
                    {activityLog.slice(0, 100).map((entry, i) => (
                      <div key={i} className="px-4 py-3 text-xs hover:bg-surface-raised/20 transition-colors">
                        <div className="flex items-start gap-2.5">
                          <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ring-2 ${entry.type === "buy" ? "bg-accent ring-accent/20" :
                              entry.type === "sell" ? "bg-danger ring-danger/20" :
                                entry.type === "error" ? "bg-warning ring-warning/20" :
                                  "bg-muted/50 ring-muted/10"
                            }`} />
                          <div className="min-w-0">
                            <p className="text-foreground/80 break-words leading-relaxed">{entry.message}</p>
                            <p className="text-muted/40 mt-0.5 font-mono text-[10px]">{timeAgo(entry.timestamp)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>

          {holders.length > 0 && (
            <Card className="mt-5">
              <CardHeader className="bg-surface-raised/30">
                <h2 className="text-sm font-bold flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-accent" /> Top Holders</h2>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted/50 uppercase tracking-wider text-[10px]">
                      <th className="text-left p-3 font-bold">#</th>
                      <th className="text-left p-3 font-bold">Address</th>
                      <th className="text-right p-3 font-bold">Balance</th>
                      <th className="text-right p-3 font-bold">% Supply</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holders.slice(0, 20).map((h: any, i: number) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-surface-raised/20 transition-colors">
                        <td className="p-3 text-muted/50 font-mono">{i + 1}</td>
                        <td className="p-3 font-mono text-foreground/70">{h.address ? `${h.address.slice(0, 6)}...${h.address.slice(-4)}` : "—"}</td>
                        <td className="p-3 text-right font-mono">{h.uiAmount?.toFixed(2) ?? h.amount ?? "—"}</td>
                        <td className="p-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <div className="w-8 h-1 rounded-full bg-border overflow-hidden">
                              <div className="h-full rounded-full bg-accent/50" style={{ width: `${Math.min(100, h.pct || 0)}%` }} />
                            </div>
                            <span className="font-mono">{h.pct != null ? `${h.pct.toFixed(2)}%` : "—"}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
