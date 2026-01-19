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
    this.dexScreenerTtlMs = 10000; // 10 seconds
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
    if (this.solPriceCache.value && now - this.solPriceCache.ts < 30000) {
      return this.solPriceCache.value;
    }
    // Use CoinGecko for reliable SOL/USD price
    try {
      const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      if (res.ok) {
        const json = await res.json();
        const price = json?.solana?.usd;
        if (Number.isFinite(price)) {
          this.solPriceCache = { value: price, ts: now };
          return price;
        }
      }
    } catch {
      // Fall through to Helius fallback
    }
    // Fallback to Helius getAsset
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
    if (!Number.isFinite(directUsd)) return null;
    this.solPriceCache = { value: directUsd, ts: now };
    return directUsd;
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
    
    // Return fresh cache
    if (cached && now - cached.ts < this.dexScreenerTtlMs) {
      return cached.mcap;
    }
    
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`);
      if (!res.ok) {
        // On error, return stale cache if available (up to 60s old)
        if (cached && now - cached.ts < 60000) return cached.mcap;
        return null;
      }
      const json = await res.json();
      const pairs = json?.pairs;
      if (!Array.isArray(pairs) || pairs.length === 0) {
        // No pairs found, return stale cache if available
        if (cached && now - cached.ts < 60000) return cached.mcap;
        return null;
      }
      // Use the pair with highest liquidity
      const sorted = pairs
        .filter(p => p.chainId === 'solana' && Number.isFinite(p.marketCap))
        .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
      const best = sorted[0];
      if (!best) {
        if (cached && now - cached.ts < 60000) return cached.mcap;
        return null;
      }
      const mcap = best.marketCap || best.fdv;
      if (!Number.isFinite(mcap) || mcap <= 0) {
        if (cached && now - cached.ts < 60000) return cached.mcap;
        return null;
      }
      this.dexScreenerCache.set(mintAddress, { mcap, price: parseFloat(best.priceUsd), ts: now });
      return mcap;
    } catch {
      // On error, return stale cache if available (up to 60s old)
      if (cached && now - cached.ts < 60000) return cached.mcap;
      return null;
    }
  }
}
