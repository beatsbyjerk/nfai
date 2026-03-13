"use client";

import React, { useState, useEffect, useCallback } from "react";
import { user as userApi } from "@/lib/api";
import { Navbar } from "@/components/Navbar";
import { Card, CardHeader, CardBody } from "@/components/Card";
import { Button } from "@/components/Button";
import { formatSol, formatPct, formatMcap } from "@/lib/utils";
import {
  Wallet, Key, PlusCircle, Import, Settings2, ArrowDownToLine,
  Copy, Eye, EyeOff, Check, AlertTriangle, TrendingUp, TrendingDown,
  ToggleLeft, ToggleRight, Shield, Sparkles
} from "lucide-react";

interface UserConfig {
  trade_amount_sol?: number;
  stop_loss_pct?: number;
  take_profit_pct?: number;
  take_profit_sell_pct?: number;
  trailing_stop_pct?: number;
  auto_trading_enabled?: boolean;
  buy_on_first_dump_enabled?: boolean;
  first_dump_pct?: number;
}

interface UserPosition {
  mint: string;
  symbol?: string;
  entry_mcap?: number;
  current_mcap?: number;
  amount_sol?: number;
  remaining_pct?: number;
  pnl_pct?: number;
  is_open?: boolean;
}

interface UserStats {
  total_trades?: number;
  total_pnl_sol?: number;
  winning_trades?: number;
  losing_trades?: number;
}

type View = "setup" | "dashboard";

export default function WalletPage() {
  const [view, setView] = useState<View>("setup");
  const [walletAddr, setWalletAddr] = useState("");
  const [privateKeyInput, setPrivateKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [config, setConfig] = useState<UserConfig>({});
  const [positions, setPositions] = useState<UserPosition[]>([]);
  const [stats, setStats] = useState<UserStats>({});
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copied, setCopied] = useState(false);
  const [withdrawAddr, setWithdrawAddr] = useState("");
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [editConfig, setEditConfig] = useState<UserConfig>({});
  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("userWalletAddress");
    if (saved) { setWalletAddr(saved); setView("dashboard"); }
  }, []);

  const loadUserData = useCallback(async (addr: string) => {
    try {
      const [stateRes, balRes] = await Promise.all([
        userApi.state(addr),
        userApi.balance(addr).catch(() => ({ ok: false, balance: null })),
      ]);
      if (stateRes.config) { setConfig(stateRes.config); setEditConfig(stateRes.config); }
      if (stateRes.positions) setPositions(stateRes.positions);
      if (stateRes.stats) setStats(stateRes.stats);
      if (balRes.ok && balRes.balance != null) setBalance(balRes.balance);
    } catch {}
  }, []);

  useEffect(() => {
    if (walletAddr && view === "dashboard") loadUserData(walletAddr);
  }, [walletAddr, view, loadUserData]);

  const handleImport = async () => {
    setError(""); setSuccess("");
    if (!privateKeyInput.trim()) return setError("Enter your private key");
    setBusy(true);
    try {
      const res = await userApi.register(privateKeyInput.trim());
      if (res.ok && res.walletAddress) {
        setWalletAddr(res.walletAddress);
        localStorage.setItem("userWalletAddress", res.walletAddress);
        setPrivateKeyInput("");
        setView("dashboard");
        setSuccess(res.isNew ? "Wallet registered!" : "Wallet connected!");
        loadUserData(res.walletAddress);
      } else { setError("Failed to register wallet"); }
    } catch (e: any) { setError(e.message); }
    setBusy(false);
  };

  const handleGenerate = async () => {
    setError(""); setSuccess("");
    setBusy(true);
    try {
      const res = await userApi.generate();
      if (res.ok && res.walletAddress) {
        setWalletAddr(res.walletAddress);
        localStorage.setItem("userWalletAddress", res.walletAddress);
        if (res.privateKey) setGeneratedKey(res.privateKey);
        setView("dashboard");
        setSuccess("New wallet generated! SAVE YOUR PRIVATE KEY — it is shown only once.");
        loadUserData(res.walletAddress);
      } else { setError("Failed to generate wallet"); }
    } catch (e: any) { setError(e.message); }
    setBusy(false);
  };

  const handleSaveConfig = async () => {
    setError(""); setSuccess("");
    setSavingConfig(true);
    try {
      const res = await userApi.updateConfig(walletAddr, editConfig);
      if (res.ok) { setConfig(res.config || editConfig); setSuccess("Config saved"); setTimeout(() => setSuccess(""), 2000); }
    } catch (e: any) { setError(e.message); }
    setSavingConfig(false);
  };

  const handleWithdraw = async () => {
    setError(""); setSuccess("");
    if (!withdrawAddr.trim()) return setError("Enter destination address");
    const amt = parseFloat(withdrawAmt);
    if (!amt || amt <= 0) return setError("Enter a valid amount");
    setWithdrawing(true);
    try {
      const res = await userApi.withdraw(walletAddr, withdrawAddr.trim(), amt);
      if (res.ok) { setSuccess(`Withdrawn ${res.amount} SOL. TX: ${res.signature?.slice(0, 12)}...`); setWithdrawAddr(""); setWithdrawAmt(""); loadUserData(walletAddr); }
    } catch (e: any) { setError(e.message); }
    setWithdrawing(false);
  };

  const handleDisconnect = async () => {
    try { await userApi.logout(walletAddr); } catch {}
    localStorage.removeItem("userWalletAddress");
    setWalletAddr(""); setView("setup"); setGeneratedKey(null);
    setConfig({}); setPositions([]); setStats({}); setBalance(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openPositions = positions.filter((p) => p.is_open);
  const winRate = stats.total_trades ? ((stats.winning_trades || 0) / stats.total_trades * 100) : 0;

  return (
    <div className="min-h-screen flex flex-col relative">
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-accent/[0.03] rounded-full blur-[180px]" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-purple-600/[0.02] rounded-full blur-[160px]" />
      </div>

      <Navbar />
      <main className="flex-grow pt-14">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="relative mb-8">
            <div className="absolute -top-6 left-0 w-32 h-32 bg-accent/8 rounded-full blur-[60px] pointer-events-none" />
            <div className="relative flex items-center gap-3">
              <div className="relative">
                <Wallet className="w-7 h-7 text-accent" />
                <div className="absolute inset-0 bg-accent/20 rounded-full blur-lg" />
              </div>
              <div>
                <h1 className="text-2xl font-heading font-bold tracking-tight">Wallet & Settings</h1>
                <p className="text-muted/60 text-xs">Manage your trading wallet, configure strategies, and track performance</p>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-danger/8 border border-danger/20 text-danger text-sm flex items-center gap-2.5 animate-slide-in">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}
          {success && (
            <div className="mb-5 p-3.5 rounded-xl bg-accent/8 border border-accent/20 text-accent text-sm flex items-center gap-2.5 animate-slide-in">
              <Check className="w-4 h-4 shrink-0" /> {success}
            </div>
          )}

          {/* SETUP VIEW */}
          {view === "setup" && (
            <div className="grid gap-5 max-w-lg mx-auto animate-fade-in">
              <div className="text-center mb-4">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/8 border border-accent/15 text-accent text-xs font-medium mb-4">
                  <Shield className="w-3.5 h-3.5" /> SECURE WALLET SETUP
                </div>
                <p className="text-muted/60 text-sm">Connect or create a Solana wallet to start automated trading</p>
              </div>

              <Card className="hover:-translate-y-0.5 transition-transform">
                <CardHeader className="bg-surface-raised/30">
                  <h2 className="text-sm font-bold flex items-center gap-2"><Import className="w-4 h-4 text-accent" /> Import Existing Wallet</h2>
                </CardHeader>
                <CardBody className="space-y-3">
                  <p className="text-xs text-muted/60">Import your Solana wallet to mirror AI trades with your own funds.</p>
                  <div className="relative">
                    <input
                      type={showKey ? "text" : "password"}
                      value={privateKeyInput}
                      onChange={(e) => setPrivateKeyInput(e.target.value)}
                      placeholder="Paste your base58 private key"
                      className="w-full h-11 px-3 pr-10 rounded-xl bg-background border border-border text-sm font-mono placeholder:text-muted/30 focus:outline-none focus:border-accent/30 transition-colors"
                    />
                    <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted/40 hover:text-foreground transition-colors">
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <Button variant="primary" className="w-full rounded-xl" loading={busy} onClick={handleImport}>
                    <Key className="w-4 h-4" /> Import Wallet
                  </Button>
                </CardBody>
              </Card>

              <div className="flex items-center gap-3 text-xs text-muted/40">
                <div className="flex-grow h-px bg-border" />
                or
                <div className="flex-grow h-px bg-border" />
              </div>

              <Card className="hover:-translate-y-0.5 transition-transform">
                <CardHeader className="bg-surface-raised/30">
                  <h2 className="text-sm font-bold flex items-center gap-2"><PlusCircle className="w-4 h-4 text-accent" /> Generate New Wallet</h2>
                </CardHeader>
                <CardBody className="space-y-3">
                  <p className="text-xs text-muted/60">Create a fresh Solana wallet. You must fund it with SOL to start trading.</p>
                  <Button variant="secondary" className="w-full rounded-xl" loading={busy} onClick={handleGenerate}>
                    <Sparkles className="w-4 h-4" /> Generate Wallet
                  </Button>
                </CardBody>
              </Card>
            </div>
          )}

          {/* DASHBOARD VIEW */}
          {view === "dashboard" && (
            <div className="space-y-5 animate-fade-in">
              {generatedKey && (
                <Card className="border-warning/30 glow-danger">
                  <CardBody className="space-y-3">
                    <div className="flex items-center gap-2 text-warning text-sm font-black">
                      <AlertTriangle className="w-5 h-5" /> Save Your Private Key Now!
                    </div>
                    <p className="text-xs text-muted/60">This is shown only once. Copy it and store it safely.</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-grow p-2.5 rounded-lg bg-background border border-border text-xs font-mono break-all">{generatedKey}</code>
                      <Button variant="secondary" size="sm" onClick={() => copyToClipboard(generatedKey)}>
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setGeneratedKey(null)}>I&apos;ve saved it</Button>
                  </CardBody>
                </Card>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: "Wallet", value: `${walletAddr.slice(0, 6)}...${walletAddr.slice(-4)}`, icon: <Wallet className="w-5 h-5" />, sub: <button onClick={() => copyToClipboard(walletAddr)} className="text-muted/40 hover:text-accent transition-colors"><Copy className="w-3 h-3" /></button> },
                  { label: "Balance", value: formatSol(balance, 4), icon: <Key className="w-5 h-5" /> },
                  { label: "Total P&L", value: formatSol(stats.total_pnl_sol, 4), icon: (stats.total_pnl_sol || 0) >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />, color: (stats.total_pnl_sol || 0) >= 0 ? "accent" : "danger" },
                  { label: "Win Rate", value: stats.total_trades ? `${winRate.toFixed(0)}%` : "—", icon: <Shield className="w-5 h-5" />, sub: <span className="text-muted/40 text-[10px] font-mono">{stats.total_trades || 0} trades</span> },
                ].map(({ label, value, icon, sub, color }) => (
                  <Card key={label} className="group hover:-translate-y-0.5">
                    <CardBody className="p-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2.5 ${color === "danger" ? "bg-danger/10 text-danger" : "bg-accent/10 text-accent"} transition-transform group-hover:scale-105`}>
                        {icon}
                      </div>
                      <div className="text-[10px] text-muted/50 uppercase tracking-wider mb-0.5">{label}</div>
                      <div className={`font-mono font-black text-lg ${color === "danger" ? "text-danger" : ""}`}>
                        {value}
                        {sub && <span className="ml-1.5">{sub}</span>}
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>

              {/* Trading Config */}
              <Card>
                <CardHeader className="bg-surface-raised/30">
                  <h2 className="text-sm font-bold flex items-center gap-2"><Settings2 className="w-4 h-4 text-accent" /> Trade Configuration</h2>
                  <Button variant="secondary" size="sm" loading={savingConfig} onClick={handleSaveConfig}>Save</Button>
                </CardHeader>
                <CardBody>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    <ConfigField label="Trade Amount (SOL)" value={editConfig.trade_amount_sol} onChange={(v) => setEditConfig({ ...editConfig, trade_amount_sol: v })} />
                    <ConfigField label="Stop Loss %" value={editConfig.stop_loss_pct} onChange={(v) => setEditConfig({ ...editConfig, stop_loss_pct: v })} />
                    <ConfigField label="Take Profit %" value={editConfig.take_profit_pct} onChange={(v) => setEditConfig({ ...editConfig, take_profit_pct: v })} />
                    <ConfigField label="TP Sell %" value={editConfig.take_profit_sell_pct} onChange={(v) => setEditConfig({ ...editConfig, take_profit_sell_pct: v })} />
                    <ConfigField label="Trailing Stop %" value={editConfig.trailing_stop_pct} onChange={(v) => setEditConfig({ ...editConfig, trailing_stop_pct: v })} />
                    <ConfigField label="First Dump %" value={editConfig.first_dump_pct} onChange={(v) => setEditConfig({ ...editConfig, first_dump_pct: v })} />
                    <div>
                      <label className="block text-[10px] text-muted/50 uppercase tracking-wider mb-1.5">Auto Trading</label>
                      <button
                        onClick={() => setEditConfig({ ...editConfig, auto_trading_enabled: !editConfig.auto_trading_enabled })}
                        className={`flex items-center gap-2 h-11 px-3 rounded-xl border text-sm font-medium w-full transition-all ${editConfig.auto_trading_enabled ? "border-accent/30 bg-accent/8 text-accent" : "border-border bg-background text-muted/50"}`}
                      >
                        {editConfig.auto_trading_enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                        {editConfig.auto_trading_enabled ? "Enabled" : "Disabled"}
                      </button>
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted/50 uppercase tracking-wider mb-1.5">Buy on Dump</label>
                      <button
                        onClick={() => setEditConfig({ ...editConfig, buy_on_first_dump_enabled: !editConfig.buy_on_first_dump_enabled })}
                        className={`flex items-center gap-2 h-11 px-3 rounded-xl border text-sm font-medium w-full transition-all ${editConfig.buy_on_first_dump_enabled ? "border-accent/30 bg-accent/8 text-accent" : "border-border bg-background text-muted/50"}`}
                      >
                        {editConfig.buy_on_first_dump_enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                        {editConfig.buy_on_first_dump_enabled ? "Enabled" : "Disabled"}
                      </button>
                    </div>
                  </div>
                </CardBody>
              </Card>

              {openPositions.length > 0 && (
                <Card>
                  <CardHeader className="bg-surface-raised/30">
                    <h2 className="text-sm font-bold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-accent" /> Open Positions</h2>
                  </CardHeader>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-muted/50 uppercase tracking-wider text-[10px]">
                          <th className="text-left p-3 font-bold">Token</th>
                          <th className="text-right p-3 font-bold">Entry</th>
                          <th className="text-right p-3 font-bold">Size</th>
                          <th className="text-right p-3 font-bold">Left</th>
                          <th className="text-right p-3 font-bold">P&L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {openPositions.map((p) => (
                          <tr key={p.mint} className="border-b border-border/30 hover:bg-surface-raised/20 transition-colors">
                            <td className="p-3 font-bold">{p.symbol || p.mint.slice(0, 8)}</td>
                            <td className="p-3 text-right font-mono">{formatMcap(p.entry_mcap)}</td>
                            <td className="p-3 text-right font-mono">{formatSol(p.amount_sol, 3)}</td>
                            <td className="p-3 text-right font-mono">{p.remaining_pct?.toFixed(0)}%</td>
                            <td className={`p-3 text-right font-mono font-black ${(p.pnl_pct || 0) >= 0 ? "text-accent" : "text-danger"}`}>
                              {formatPct(p.pnl_pct)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {/* Withdraw */}
              <Card>
                <CardHeader className="bg-surface-raised/30">
                  <h2 className="text-sm font-bold flex items-center gap-2"><ArrowDownToLine className="w-4 h-4 text-accent" /> Withdraw SOL</h2>
                </CardHeader>
                <CardBody className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={withdrawAddr}
                      onChange={(e) => setWithdrawAddr(e.target.value)}
                      placeholder="Destination wallet address"
                      className="h-11 px-3 rounded-xl bg-background border border-border text-sm font-mono placeholder:text-muted/30 focus:outline-none focus:border-accent/30 transition-colors"
                    />
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.001"
                        value={withdrawAmt}
                        onChange={(e) => setWithdrawAmt(e.target.value)}
                        placeholder="Amount SOL"
                        className="flex-grow h-11 px-3 rounded-xl bg-background border border-border text-sm font-mono placeholder:text-muted/30 focus:outline-none focus:border-accent/30 transition-colors"
                      />
                      <Button variant="primary" className="rounded-xl" loading={withdrawing} onClick={handleWithdraw}>Withdraw</Button>
                    </div>
                  </div>
                </CardBody>
              </Card>

              <div className="flex justify-end">
                <Button variant="danger" size="sm" className="rounded-xl" onClick={handleDisconnect}>Disconnect Wallet</Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function ConfigField({ label, value, onChange }: { label: string; value?: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-[10px] text-muted/50 uppercase tracking-wider mb-1.5">{label}</label>
      <input
        type="number"
        step="any"
        value={value ?? ""}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-11 px-3 rounded-xl bg-background border border-border text-sm font-mono placeholder:text-muted/30 focus:outline-none focus:border-accent/30 transition-colors"
      />
    </div>
  );
}
