"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { auth as authApi } from "./api";

function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("deviceId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("deviceId", id);
  }
  return id;
}

interface AuthState {
  loading: boolean;
  authenticated: boolean;
  wallet: string | null;
  plan: string | null;
  expiresAt: string | null;
  sessionToken: string | null;
}

interface AuthContextValue extends AuthState {
  deviceId: string;
  login: (wallet: string, plan: string) => Promise<{ ok: boolean; error?: string }>;
  activateWithPayment: (wallet: string, plan: string) => Promise<{ ok: boolean; paymentAddress?: string; amountSol?: number; error?: string }>;
  confirmPayment: (wallet: string, plan: string) => Promise<{ ok: boolean; error?: string }>;
  activateTokenGate: (wallet: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  validateSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    loading: true,
    authenticated: false,
    wallet: null,
    plan: null,
    expiresAt: null,
    sessionToken: null,
  });

  const deviceId = typeof window !== "undefined" ? getDeviceId() : "";

  const setSession = useCallback((token: string, wallet: string, plan: string, expiresAt?: string) => {
    localStorage.setItem("sessionToken", token);
    localStorage.setItem("authWallet", wallet);
    setState({
      loading: false,
      authenticated: true,
      wallet,
      plan,
      expiresAt: expiresAt || null,
      sessionToken: token,
    });
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem("sessionToken");
    localStorage.removeItem("authWallet");
    setState({
      loading: false,
      authenticated: false,
      wallet: null,
      plan: null,
      expiresAt: null,
      sessionToken: null,
    });
  }, []);

  const validateSession = useCallback(async (): Promise<boolean> => {
    const token = localStorage.getItem("sessionToken");
    if (!token) {
      setState((s) => ({ ...s, loading: false }));
      return false;
    }
    try {
      const res = await authApi.validate(deviceId);
      if (res.ok && res.wallet) {
        setSession(token, res.wallet, res.plan || "unknown", res.expiresAt);
        return true;
      }
      clearSession();
      return false;
    } catch {
      clearSession();
      return false;
    }
  }, [deviceId, setSession, clearSession]);

  useEffect(() => {
    validateSession();
  }, [validateSession]);

  const login = useCallback(async (wallet: string, plan: string) => {
    try {
      const res = await authApi.activate(wallet, plan, deviceId);
      if (res.ok && res.sessionToken) {
        setSession(res.sessionToken, wallet, res.plan || plan, res.expiresAt);
        return { ok: true };
      }
      return { ok: false, error: "Activation failed" };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }, [deviceId, setSession]);

  const activateWithPayment = useCallback(async (wallet: string, plan: string) => {
    try {
      const res = await authApi.startPayment(wallet, plan);
      if (res.ok) {
        return { ok: true, paymentAddress: res.paymentAddress, amountSol: res.amountSol };
      }
      return { ok: false, error: "Failed to start payment" };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }, []);

  const confirmPayment = useCallback(async (wallet: string, plan: string) => {
    try {
      const res = await authApi.confirmPayment(wallet, plan, deviceId);
      if (res.ok && res.sessionToken) {
        setSession(res.sessionToken, wallet, plan);
        return { ok: true };
      }
      return { ok: false, error: "Payment confirmation failed" };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }, [deviceId, setSession]);

  const activateTokenGate = useCallback(async (wallet: string) => {
    try {
      const res = await authApi.tokenGateVerify(wallet, deviceId);
      if (res.ok && res.sessionToken) {
        setSession(res.sessionToken, wallet, "holder");
        return { ok: true };
      }
      return { ok: false, error: "Token gate verification failed" };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }, [deviceId, setSession]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout(deviceId);
    } catch {
      // still clear locally
    }
    clearSession();
  }, [deviceId, clearSession]);

  return (
    <AuthContext.Provider
      value={{ ...state, deviceId, login, activateWithPayment, confirmPayment, activateTokenGate, logout, validateSession }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
