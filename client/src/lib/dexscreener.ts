const DEX_API = "https://api.dexscreener.com/latest/dex/tokens";

export interface DexPairData {
  priceUsd: number | null;
  volume24h: number | null;
  volume1h: number | null;
  volume5m: number | null;
  liquidity: number | null;
  priceChange5m: number | null;
  priceChange1h: number | null;
  priceChange6h: number | null;
  priceChange24h: number | null;
  txns24hBuys: number | null;
  txns24hSells: number | null;
  pairAddress: string | null;
  dexId: string | null;
  fdv: number | null;
}

const cache = new Map<string, { data: DexPairData; ts: number }>();
const CACHE_TTL = 8000;
const inflightRequests = new Map<string, Promise<DexPairData | null>>();

export async function fetchDexData(mint: string): Promise<DexPairData | null> {
  if (!mint) return null;

  const cached = cache.get(mint);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const inflight = inflightRequests.get(mint);
  if (inflight) return inflight;

  const request = (async () => {
    try {
      const res = await fetch(`${DEX_API}/${mint}`);
      if (!res.ok) return null;
      const json = await res.json();
      const pairs = json?.pairs;
      if (!Array.isArray(pairs) || pairs.length === 0) return null;

      const solPairs = pairs
        .filter((p: any) => p.chainId === "solana")
        .sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
      const best = solPairs[0];
      if (!best) return null;

      const data: DexPairData = {
        priceUsd: best.priceUsd ? parseFloat(best.priceUsd) : null,
        volume24h: best.volume?.h24 ?? null,
        volume1h: best.volume?.h1 ?? null,
        volume5m: best.volume?.m5 ?? null,
        liquidity: best.liquidity?.usd ?? null,
        priceChange5m: best.priceChange?.m5 ?? null,
        priceChange1h: best.priceChange?.h1 ?? null,
        priceChange6h: best.priceChange?.h6 ?? null,
        priceChange24h: best.priceChange?.h24 ?? null,
        txns24hBuys: best.txns?.h24?.buys ?? null,
        txns24hSells: best.txns?.h24?.sells ?? null,
        pairAddress: best.pairAddress ?? null,
        dexId: best.dexId ?? null,
        fdv: best.fdv ?? null,
      };

      cache.set(mint, { data, ts: Date.now() });
      return data;
    } catch {
      return null;
    } finally {
      inflightRequests.delete(mint);
    }
  })();

  inflightRequests.set(mint, request);
  return request;
}

/**
 * ClawFi Conviction Grade — proprietary signal scoring.
 * Returns { grade: "S"|"A"|"B"|"C"|"D"|"F", score: 0-100 }
 */
export function computeConviction(
  dex: DexPairData | null,
  mcap: number | null | undefined,
  athMcap: number | null | undefined,
  initialMcap: number | null | undefined
): { grade: string; score: number; factors: string[] } {
  if (!dex || !mcap) return { grade: "—", score: 0, factors: [] };

  let score = 0;
  const factors: string[] = [];

  const m5 = dex.priceChange5m ?? 0;
  const h1 = dex.priceChange1h ?? 0;
  const h6 = dex.priceChange6h ?? 0;
  if (m5 > 5) { score += Math.min(15, m5 * 0.8); factors.push("momentum"); }
  else if (m5 < -10) { score -= 5; }
  if (h1 > 10) { score += Math.min(10, h1 * 0.3); factors.push("trending"); }
  if (h6 > 0 && h1 > 0 && m5 > 0) { score += 5; factors.push("sustained"); }

  const liq = dex.liquidity ?? 0;
  if (liq > 50000) { score += 20; factors.push("strong depth"); }
  else if (liq > 20000) { score += 14; }
  else if (liq > 5000) { score += 8; }
  else if (liq > 1000) { score += 3; }

  const vol24 = dex.volume24h ?? 0;
  const vmRatio = mcap > 0 ? vol24 / mcap : 0;
  if (vmRatio > 2) { score += 20; factors.push("heavy flow"); }
  else if (vmRatio > 0.8) { score += 15; factors.push("active"); }
  else if (vmRatio > 0.3) { score += 8; }
  else if (vmRatio > 0.1) { score += 3; }

  const buys = dex.txns24hBuys ?? 0;
  const sells = dex.txns24hSells ?? 0;
  const totalTxns = buys + sells;
  if (totalTxns > 0) {
    const buyRatio = buys / totalTxns;
    if (buyRatio > 0.65) { score += 15; factors.push("accumulating"); }
    else if (buyRatio > 0.55) { score += 10; }
    else if (buyRatio > 0.5) { score += 5; }
    else if (buyRatio < 0.35) { score -= 5; factors.push("distributing"); }
  }

  if (athMcap && athMcap > 0 && mcap > 0) {
    const athRatio = mcap / athMcap;
    if (athRatio > 0.9) { score += 15; factors.push("breakout"); }
    else if (athRatio > 0.7) { score += 10; }
    else if (athRatio > 0.5) { score += 5; }
    else if (athRatio < 0.2) { score -= 3; }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let grade: string;
  if (score >= 85) grade = "S";
  else if (score >= 70) grade = "A";
  else if (score >= 55) grade = "B";
  else if (score >= 40) grade = "C";
  else if (score >= 25) grade = "D";
  else grade = "F";

  return { grade, score, factors };
}
