"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { auth as authApi } from "@/lib/api";
import { Button } from "@/components/Button";
import { Crosshair, Zap, ArrowRight, Eye, ShieldCheck } from "lucide-react";

/**
 * Auth / Payment Gate page.
 * Currently deactivated — preserved here for when pay-gate is re-enabled.
 * Route: /auth
 */
export default function AuthPage() {
  const router = useRouter();
  const { authenticated, loading, login, activateWithPayment, confirmPayment, activateTokenGate } = useAuth();
  const [wallet, setWallet] = useState("");
  const [plan, setPlan] = useState<"week" | "month">("week");
  const [step, setStep] = useState<"enter" | "paying" | "confirming">("enter");
  const [payInfo, setPayInfo] = useState<{ address: string; amount: number } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tokenGateInfo, setTokenGateInfo] = useState<{ enabled: boolean; mint?: string; minAmount?: number } | null>(null);

  useEffect(() => {
    if (authenticated && !loading) router.replace("/");
  }, [authenticated, loading, router]);

  useEffect(() => {
    authApi.tokenGateInfo().then(setTokenGateInfo).catch(() => {});
  }, []);

  const handleActivate = async () => {
    setError("");
    if (!wallet.trim()) return setError("Enter your Solana wallet address");
    setBusy(true);
    const res = await login(wallet.trim(), plan);
    if (res.ok) {
      router.replace("/");
    } else if (res.error?.includes("payment") || res.error?.includes("No active license")) {
      const payRes = await activateWithPayment(wallet.trim(), plan);
      if (payRes.ok && payRes.paymentAddress) {
        setPayInfo({ address: payRes.paymentAddress, amount: payRes.amountSol || 0 });
        setStep("paying");
      } else {
        setError(payRes.error || "Failed to start payment flow");
      }
    } else {
      setError(res.error || "Activation failed");
    }
    setBusy(false);
  };

  const handleConfirmPayment = async () => {
    setError("");
    setBusy(true);
    setStep("confirming");
    const res = await confirmPayment(wallet.trim(), plan);
    if (res.ok) {
      router.replace("/");
    } else {
      setError(res.error || "Payment not detected. Try again.");
      setStep("paying");
    }
    setBusy(false);
  };

  const handleTokenGate = async () => {
    setError("");
    if (!wallet.trim()) return setError("Enter your Solana wallet address");
    setBusy(true);
    const res = await activateTokenGate(wallet.trim());
    if (res.ok) {
      router.replace("/");
    } else {
      setError(res.error || "Token gate verification failed");
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-[20%] left-[15%] w-[500px] h-[500px] bg-accent/8 rounded-full blur-[180px]" />
        <div className="absolute bottom-[10%] right-[10%] w-[400px] h-[400px] bg-accent/5 rounded-full blur-[150px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,var(--background)_100%)]" />
      </div>

      <div className="flex-grow flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-3 mb-4">
              <Crosshair className="w-10 h-10 text-accent" />
              <h1 className="text-4xl font-heading font-bold tracking-tight">ClawFi</h1>
            </div>
            <p className="text-muted text-sm">AI-powered Solana trading terminal</p>
          </div>

          <div className="rounded-2xl border border-border bg-surface/50 backdrop-blur-xl p-6">
            {step === "enter" && (
              <>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-muted mb-1.5 uppercase tracking-wider">Wallet Address</label>
                    <input
                      type="text"
                      value={wallet}
                      onChange={(e) => setWallet(e.target.value)}
                      placeholder="Your Solana wallet address"
                      className="w-full h-11 px-4 rounded-lg bg-background border border-border text-sm font-mono placeholder:text-muted/50 focus:outline-none focus:border-accent/40"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-muted mb-1.5 uppercase tracking-wider">Plan</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setPlan("week")}
                        className={`h-16 rounded-lg border text-left px-4 transition-all ${plan === "week" ? "border-accent bg-accent-dim" : "border-border bg-background hover:border-border-bright"}`}
                      >
                        <div className="text-sm font-medium">Weekly</div>
                        <div className="text-xs text-muted">2 SOL / 7 days</div>
                      </button>
                      <button
                        onClick={() => setPlan("month")}
                        className={`h-16 rounded-lg border text-left px-4 transition-all ${plan === "month" ? "border-accent bg-accent-dim" : "border-border bg-background hover:border-border-bright"}`}
                      >
                        <div className="text-sm font-medium">Monthly</div>
                        <div className="text-xs text-muted">4 SOL / 30 days</div>
                      </button>
                    </div>
                  </div>
                </div>

                {error && <p className="mt-3 text-xs text-danger">{error}</p>}

                <Button variant="primary" className="w-full mt-5" loading={busy} onClick={handleActivate}>
                  <Zap className="w-4 h-4" /> Activate License
                </Button>

                {tokenGateInfo?.enabled && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <Button variant="secondary" className="w-full" loading={busy} onClick={handleTokenGate}>
                      <ShieldCheck className="w-4 h-4" /> Holder Access (Token Gate)
                    </Button>
                    <p className="text-[11px] text-muted mt-2 text-center">
                      Hold {tokenGateInfo.minAmount || 1} token{(tokenGateInfo.minAmount || 1) > 1 ? "s" : ""} to access for free
                    </p>
                  </div>
                )}
              </>
            )}

            {step === "paying" && payInfo && (
              <div className="text-center space-y-4">
                <Eye className="w-10 h-10 text-accent mx-auto" />
                <div>
                  <h3 className="font-heading font-bold text-lg mb-1">Send Payment</h3>
                  <p className="text-sm text-muted">Send exactly <span className="text-accent font-mono font-bold">{payInfo.amount} SOL</span> to:</p>
                </div>
                <div className="bg-background rounded-lg p-3 border border-border">
                  <code className="text-xs font-mono text-foreground break-all">{payInfo.address}</code>
                </div>
                <p className="text-xs text-muted">Waiting for on-chain confirmation...</p>
                {error && <p className="text-xs text-danger">{error}</p>}
                <Button variant="primary" className="w-full" loading={busy} onClick={handleConfirmPayment}>
                  I've Sent the Payment <ArrowRight className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setStep("enter")}>Back</Button>
              </div>
            )}

            {step === "confirming" && (
              <div className="text-center space-y-4 py-6">
                <span className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin inline-block" />
                <p className="text-sm text-muted">Verifying on-chain payment...</p>
                <p className="text-xs text-muted/60">This may take up to 2 minutes</p>
              </div>
            )}
          </div>

          <div className="mt-10 grid grid-cols-3 gap-4 text-center">
            {[
              { icon: <Zap className="w-5 h-5" />, label: "AI Signals" },
              { icon: <Crosshair className="w-5 h-5" />, label: "Auto Trade" },
              { icon: <ShieldCheck className="w-5 h-5" />, label: "Secure" },
            ].map((f, i) => (
              <div key={i} className="text-muted">
                <div className="flex justify-center mb-1">{f.icon}</div>
                <span className="text-xs">{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
