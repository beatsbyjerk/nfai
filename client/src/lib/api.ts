const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const sessionToken = typeof window !== "undefined" ? localStorage.getItem("sessionToken") : null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    ...((opts?.headers as Record<string, string>) || {}),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

// ── Auth ──
export const auth = {
  activate: (wallet: string, plan: string, deviceId: string) =>
    request<{ ok: boolean; sessionToken?: string; plan?: string; expiresAt?: string }>("/api/auth/activate", {
      method: "POST",
      body: JSON.stringify({ wallet, plan, deviceId }),
    }),
  startPayment: (wallet: string, plan: string) =>
    request<{ ok: boolean; paymentAddress?: string; amountSol?: number }>("/api/auth/payment/start", {
      method: "POST",
      body: JSON.stringify({ wallet, plan }),
    }),
  confirmPayment: (wallet: string, plan: string, deviceId: string) =>
    request<{ ok: boolean; sessionToken?: string }>("/api/auth/payment/confirm", {
      method: "POST",
      body: JSON.stringify({ wallet, plan, deviceId, timeoutMs: 120000 }),
    }),
  tokenGateVerify: (wallet: string, deviceId: string) =>
    request<{ ok: boolean; sessionToken?: string }>("/api/auth/token-gate/verify", {
      method: "POST",
      body: JSON.stringify({ wallet, deviceId, timeoutMs: 120000 }),
    }),
  tokenGateInfo: () => request<{ enabled: boolean; mint?: string; minAmount?: number }>("/api/auth/token-gate"),
  validate: (deviceId: string) =>
    request<{ ok: boolean; wallet?: string; plan?: string; expiresAt?: string }>("/api/auth/validate", {
      method: "POST",
      body: JSON.stringify({ deviceId }),
    }),
  logout: (deviceId: string) =>
    request<{ ok: boolean }>("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify({ deviceId }),
    }),
};

// ── Admin ──
export const admin = {
  revoke: (wallet: string, action: "revoke" | "logout" = "revoke") =>
    request<{ ok: boolean }>("/api/admin/revoke", {
      method: "POST",
      body: JSON.stringify({ wallet, action }),
    }),
};

// ── Status ──
export const status = {
  get: () =>
    request<{
      authenticated: boolean;
      authMode: string;
      tokenExpiry: string | null;
      timeUntilExpiry: number | null;
      tokenCount: number;
      lastUpdate: string | null;
    }>("/api/status"),
};

// ── Trading (AI Engine) ──
export const trading = {
  state: () => request<any>("/api/trading/state"),
  balance: () => request<{ balanceSol: number }>("/api/trading/balance"),
  holders: () => request<{ holders: any[] }>("/api/trading/holders"),
  activity: () => request<{ activity: any[] }>("/api/trading/activity"),
};

// ── Tokens ──
export const tokens = {
  list: (sort = "first_seen", order = "desc", limit = 100) =>
    request<any[]>(`/api/tokens?sort=${sort}&order=${order}&limit=${limit}`),
  get: (address: string) => request<any>(`/api/tokens/${address}`),
  stats: () => request<any>("/api/stats"),
};

// ── User Wallet ──
export const user = {
  register: (privateKey: string) =>
    request<any>("/api/user/register", {
      method: "POST",
      body: JSON.stringify({ privateKey }),
    }),
  generate: () =>
    request<any>("/api/user/generate", { method: "POST" }),
  config: (wallet: string) => request<any>(`/api/user/config/${wallet}`),
  updateConfig: (wallet: string, updates: Record<string, any>) =>
    request<any>(`/api/user/config/${wallet}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    }),
  positions: (wallet: string) => request<{ positions: any[] }>(`/api/user/positions/${wallet}`),
  withdraw: (wallet: string, destinationAddress: string, amount: number) =>
    request<any>(`/api/user/withdraw/${wallet}`, {
      method: "POST",
      body: JSON.stringify({ destinationAddress, amount }),
    }),
  balance: (wallet: string) => request<{ ok: boolean; balance: number }>(`/api/user/balance/${wallet}`),
  stats: (wallet: string) => request<any>(`/api/user/stats/${wallet}`),
  state: (wallet: string) => request<any>(`/api/user/state/${wallet}`),
  logout: (wallet: string) =>
    request<{ ok: boolean }>("/api/user/logout", {
      method: "POST",
      body: JSON.stringify({ wallet }),
    }),
};
