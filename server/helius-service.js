import { Connection, PublicKey } from '@solana/web3.js';
import fetch from 'node-fetch';

const SOL_MINT = 'So11111111111111111111111111111111111111112';

export class HeliusService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.connection = apiKey
      ? new Connection(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, 'confirmed')
      : new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    this.rpcUrl = apiKey ? `https://mainnet.helius-rpc.com/?api-key=${apiKey}` : null;
    this.solPriceCache = { value: null, ts: 0 };
    this.dexScreenerCache = new Map(); // mint -> { mcap, price, ts }
    this.dexScreenerTtlMs = 1500; // 1.5s — tighter polling for migrated token accuracy
    this.dexScreenerStaleFallbackMs = Number.parseInt(process.env.DEX_SCREENER_STALE_FALLBACK_MS || '10000', 10);
  }

  async getSolBalance(address) {
    if (!address) return 0;
    const pubkey = new PublicKey(address);
    const lamports = await this.connection.getBalance(pubkey);
    return lamports / 1e9;
  }

  async getTopHolders(mintAddress, limit = 50) {
    if (!mintAddress) return [];
    const mint = new PublicKey(mintAddress);
    const largest = await this.connection.getTokenLargestAccounts(mint);
    return largest.value.slice(0, limit).map((acc, idx) => ({
      rank: idx + 1,
      address: acc.address.toBase58(),
      amount: acc.amount,
      uiAmount: acc.uiAmount,
      decimals: acc.decimals,
    }));
  }

  async getWalletTokenBalance(walletAddress, mintAddress) {
    if (!walletAddress || !mintAddress) return 0;
    try {
      const wallet = new PublicKey(walletAddress);
      const mint = new PublicKey(mintAddress);
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(wallet, { mint });
      const accounts = tokenAccounts?.value || [];
      let total = 0;
      for (const acc of accounts) {
        const uiAmount = acc.account?.data?.parsed?.info?.tokenAmount?.uiAmount;
        if (Number.isFinite(uiAmount)) total += uiAmount;
      }
      return total;
    } catch {
      return 0;
    }
  }

  async getTokenSupply(mintAddress) {
    if (!mintAddress) return null;
    const mint = new PublicKey(mintAddress);
    const supply = await this.connection.getTokenSupply(mint);
    const uiAmount = supply?.value?.uiAmount ?? null;
    const decimals = supply?.value?.decimals ?? null;
    if (uiAmount === null) return null;
    return { uiAmount, decimals };
  }

  async getAsset(mintAddress) {
    if (!this.rpcUrl || !mintAddress) return null;
    const payload = {
      jsonrpc: '2.0',
      id: 'getAsset',
      method: 'getAsset',
      params: {
        id: mintAddress,
      },
    };
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Helius getAsset failed: ${response.status} ${response.statusText}`);
    }
    const json = await response.json();
    return json?.result ?? null;
  }

  pickFirstFinite(values) {
    return values.find((value) => Number.isFinite(value)) ?? null;
  }

  async getSolUsdPrice() {
    const now = Date.now();
    if (this.solPriceCache.value && now - this.solPriceCache.ts < 10000) {
      return this.solPriceCache.value;
    }

    // PRIORITY 1: Binance — fastest, most reliable real-time SOL/USD
    try {
      const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT', {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const json = await res.json();
        const price = parseFloat(json?.price);
        if (Number.isFinite(price) && price > 0) {
          this.solPriceCache = { value: price, ts: now };
          return price;
        }
      }
    } catch { /* fall through */ }

    // PRIORITY 2: CoinGecko — reliable, slightly slower
    try {
      const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const json = await res.json();
        const price = json?.solana?.usd;
        if (Number.isFinite(price) && price > 0) {
          this.solPriceCache = { value: price, ts: now };
          return price;
        }
      }
    } catch { /* fall through */ }

    // PRIORITY 3: Helius getAsset — last resort
    try {
      const asset = await this.getAsset(SOL_MINT);
      const priceInfo = asset?.token_info?.price_info;
      const directUsd = this.pickFirstFinite([
        priceInfo?.price_per_token,
        priceInfo?.pricePerToken,
        priceInfo?.price,
        priceInfo?.usd_price,
        priceInfo?.usdPrice,
        priceInfo?.price_usd,
        priceInfo?.pricePerTokenUsd,
      ]);
      if (Number.isFinite(directUsd) && directUsd > 0) {
        this.solPriceCache = { value: directUsd, ts: now };
        return directUsd;
      }
    } catch { /* all sources failed */ }

    // If all fail, return stale cache (up to 60s) rather than null
    if (this.solPriceCache.value && now - this.solPriceCache.ts < 60000) {
      return this.solPriceCache.value;
    }
    return null;
  }

  async getTokenPrice(mintAddress) {
    try {
      const asset = await this.getAsset(mintAddress);
      const priceInfo = asset?.token_info?.price_info;
      const usdPrice = this.pickFirstFinite([
        priceInfo?.usd_price,
        priceInfo?.usdPrice,
        priceInfo?.price_usd,
        priceInfo?.pricePerTokenUsd,
      ]);
      if (Number.isFinite(usdPrice)) return usdPrice;

      const solPrice = this.pickFirstFinite([
        priceInfo?.price_in_sol,
        priceInfo?.priceInSol,
        priceInfo?.price_per_token_in_sol,
        priceInfo?.pricePerTokenInSol,
      ]);

      const genericPrice = this.pickFirstFinite([
        priceInfo?.price_per_token,
        priceInfo?.pricePerToken,
        priceInfo?.price,
      ]);

      const rawPrice = Number.isFinite(solPrice) ? solPrice : genericPrice;
      if (!Number.isFinite(rawPrice)) return null;
      const currency = String(
        priceInfo?.currency ||
          priceInfo?.vs_currency ||
          priceInfo?.denomination ||
          ''
      ).toLowerCase();
      if (currency === 'sol' || Number.isFinite(solPrice)) {
        const solUsd = await this.getSolUsdPrice();
        return Number.isFinite(solUsd) ? rawPrice * solUsd : null;
      }
      return rawPrice;
    } catch {
      return null;
    }
  }

  async getDexScreenerMcap(mintAddress) {
    if (!mintAddress) return null;
    const now = Date.now();
    const cached = this.dexScreenerCache.get(mintAddress);

    if (cached && now - cached.ts < this.dexScreenerTtlMs) {
      return cached.mcap;
    }

    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        if (cached && now - cached.ts < this.dexScreenerStaleFallbackMs) return cached.mcap;
        return null;
      }
      const json = await res.json();
      const pairs = json?.pairs;
      if (!Array.isArray(pairs) || pairs.length === 0) {
        if (cached && now - cached.ts < this.dexScreenerStaleFallbackMs) return cached.mcap;
        return null;
      }

      const mintLower = mintAddress.toLowerCase();
      const scored = pairs
        .filter(p => {
          if (p.chainId !== 'solana') return false;
          // Must have our token as the base token (not quote) to get correct mcap
          const baseAddr = (p.baseToken?.address || '').toLowerCase();
          if (baseAddr !== mintLower) return false;
          const mc = p.marketCap ?? p.fdv;
          if (!Number.isFinite(mc) || mc <= 0) return false;
          return true;
        })
        .map(p => {
          const liq = p.liquidity?.usd || 0;
          const vol24h = p.volume?.h24 || 0;
          const txns24h = (p.txns?.h24?.buys || 0) + (p.txns?.h24?.sells || 0);
          // Prefer pairs with real activity: liquidity + volume + txns
          const score = liq + vol24h * 0.5 + txns24h * 10;
          return { pair: p, score, liq };
        })
        .sort((a, b) => b.score - a.score);

      if (scored.length === 0) {
        // No valid base-token pair — try any Solana pair as loose fallback
        const looseFallback = pairs.find(p =>
          p.chainId === 'solana' && Number.isFinite(p.marketCap) && p.marketCap > 0
        );
        if (looseFallback) {
          const mc = looseFallback.marketCap || looseFallback.fdv;
          if (Number.isFinite(mc) && mc > 0) {
            this.dexScreenerCache.set(mintAddress, { mcap: mc, price: parseFloat(looseFallback.priceUsd) || 0, ts: now });
            return mc;
          }
        }
        if (cached && now - cached.ts < this.dexScreenerStaleFallbackMs) return cached.mcap;
        return null;
      }

      const best = scored[0].pair;
      const mcap = best.marketCap || best.fdv;

      // Sanity: reject mcap values that look impossibly high for a meme token with no liquidity
      const bestLiq = scored[0].liq;
      if (bestLiq > 0 && mcap > bestLiq * 200) {
        // mcap-to-liquidity ratio > 200x is almost certainly wrong data
        if (cached && now - cached.ts < this.dexScreenerStaleFallbackMs) return cached.mcap;
        return null;
      }

      this.dexScreenerCache.set(mintAddress, { mcap, price: parseFloat(best.priceUsd) || 0, ts: now });
      return mcap;
    } catch {
      if (cached && now - cached.ts < this.dexScreenerStaleFallbackMs) return cached.mcap;
      return null;
    }
  }
}
