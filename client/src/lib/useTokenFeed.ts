"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useWebSocket, type WSMessage } from "@/lib/ws";
import { fetchDexData, type DexPairData } from "@/lib/dexscreener";
import type { Token } from "@/components/TokenCard";

export interface TradingPosition {
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

export interface TradingState {
  tradingMode: string;
  balanceSol: number;
  positions: TradingPosition[];
  tradeCount: number;
  realizedProfitSol: number;
  walletAddress: string | null;
  activityLog: { type: string; message: string; timestamp: string }[];
}

interface UseTokenFeedOptions {
  sourceFilter?: string[];
  sortBy?: "recent" | "multiplier" | "mcap";
  limit?: number;
}

export function useTokenFeed(options: UseTokenFeedOptions = {}) {
  const { sourceFilter, sortBy = "recent", limit = 80 } = options;
  const { connected, on } = useWebSocket(false);
  const [allTokens, setAllTokens] = useState<Token[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [dexCache, setDexCache] = useState<Map<string, DexPairData>>(new Map());
  const flashSet = useRef<Set<string>>(new Set());
  const enrichingRef = useRef(false);
  const [trading, setTrading] = useState<TradingState>({
    tradingMode: 'paper',
    balanceSol: 0,
    positions: [],
    tradeCount: 0,
    realizedProfitSol: 0,
    walletAddress: null,
    activityLog: [],
  });

  const handleRefresh = useCallback((msg: WSMessage) => {
    if (msg.data.tokens) setAllTokens(msg.data.tokens);
    if (msg.data.stats) setStats(msg.data.stats);
    if (msg.data.trading) {
      const t = msg.data.trading;
      setTrading({
        tradingMode: t.tradingMode ?? 'paper',
        balanceSol: t.balanceSol ?? 0,
        positions: t.positions ?? [],
        tradeCount: t.tradeCount ?? 0,
        realizedProfitSol: t.realizedProfitSol ?? 0,
        walletAddress: t.walletAddress ?? null,
        activityLog: t.activityLog ?? [],
      });
    }
  }, []);

  const handleNewTokens = useCallback((msg: WSMessage) => {
    const incoming: Token[] = msg.data || [];
    setAllTokens((prev) => {
      const map = new Map(prev.map((t) => [t.address, t]));
      for (const t of incoming) {
        map.set(t.address, { ...t, isNew: true });
        flashSet.current.add(t.address);
        setTimeout(() => flashSet.current.delete(t.address), 6000);
      }
      return Array.from(map.values());
    });
  }, []);

  const handleTokenUpdate = useCallback((msg: WSMessage) => {
    const upd = msg.data;
    if (!upd?.address) return;
    setAllTokens((prev) =>
      prev.map((t) =>
        t.address === upd.address
          ? { ...t, realtime_mcap: upd.realtime_mcap ?? t.realtime_mcap, latest_mcap: upd.latest_mcap ?? t.latest_mcap }
          : t
      )
    );
  }, []);

  const handlePositions = useCallback((msg: WSMessage) => {
    if (Array.isArray(msg.data)) {
      setTrading((prev) => ({ ...prev, positions: msg.data }));
    }
  }, []);

  const handleBalance = useCallback((msg: WSMessage) => {
    if (msg.data?.balanceSol != null) {
      setTrading((prev) => ({ ...prev, balanceSol: msg.data.balanceSol }));
    }
  }, []);

  const handleActivity = useCallback((msg: WSMessage) => {
    if (msg.data) {
      setTrading((prev) => ({
        ...prev,
        activityLog: [msg.data, ...prev.activityLog].slice(0, 50),
      }));
    }
  }, []);

  useEffect(() => {
    const unsubs = [
      on("refresh", handleRefresh),
      on("init", handleRefresh),
      on("new_tokens", handleNewTokens),
      on("token_update", handleTokenUpdate),
      on("positions", handlePositions),
      on("balance", handleBalance),
      on("activity", handleActivity),
    ];
    return () => unsubs.forEach((u) => u());
  }, [on, handleRefresh, handleNewTokens, handleTokenUpdate, handlePositions, handleBalance, handleActivity]);

  const filtered = useMemo(() => {
    let list = sourceFilter
      ? allTokens.filter((t) => t.sources && sourceFilter.some((s) => t.sources!.includes(s)))
      : allTokens;

    if (search) {
      const q = search.toLowerCase();
      list = list.filter((t) =>
        (t.symbol?.toLowerCase().includes(q)) || (t.name?.toLowerCase().includes(q)) || t.address.toLowerCase().includes(q)
      );
    }

    const sorted = [...list].sort((a, b) => {
      if (sortBy === "multiplier") return (b.highest_multiplier || 0) - (a.highest_multiplier || 0);
      if (sortBy === "mcap") return (b.realtime_mcap || b.latest_mcap || b.initial_mcap || 0) - (a.realtime_mcap || a.latest_mcap || a.initial_mcap || 0);
      return new Date(b.first_seen_local || 0).getTime() - new Date(a.first_seen_local || 0).getTime();
    });

    return sorted.slice(0, limit);
  }, [allTokens, sourceFilter, search, sortBy, limit]);

  const sourceFiltered = useMemo(() => {
    return sourceFilter
      ? allTokens.filter((t) => t.sources && sourceFilter.some((s) => t.sources!.includes(s)))
      : allTokens;
  }, [allTokens, sourceFilter]);

  const addressKey = useMemo(() => filtered.slice(0, 40).map((t) => t.address).join(","), [filtered]);

  useEffect(() => {
    const enrich = async () => {
      if (enrichingRef.current) return;
      enrichingRef.current = true;
      try {
        const addresses = addressKey.split(",").filter(Boolean);
        const batch = addresses.filter((a) => !dexCache.has(a)).slice(0, 5);
        for (const addr of batch) {
          const data = await fetchDexData(addr);
          if (data) setDexCache((prev) => new Map(prev).set(addr, data));
        }
      } finally {
        enrichingRef.current = false;
      }
    };
    const timer = setInterval(enrich, 5000);
    const first = setTimeout(enrich, 1500);
    return () => { clearInterval(timer); clearTimeout(first); };
  }, [addressKey]);

  return {
    tokens: filtered,
    allTokens: sourceFiltered,
    stats,
    search,
    setSearch,
    dexCache,
    connected,
    flashSet,
    trading,
  };
}
