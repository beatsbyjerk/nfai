import EventEmitter from 'events';
import bs58 from 'bs58';
import axios from 'axios';
import fetch from 'node-fetch';
import { Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { HeliusService } from './helius-service.js';

export class TradingEngine extends EventEmitter {
  constructor({ tokenStore, pumpPortalWs = null }) {
    super();
    this.tokenStore = tokenStore;
    this.helius = new HeliusService(process.env.HELIUS_API);
    this.pumpPortalWs = pumpPortalWs;

    this.tradeAmountSol = parseFloat(process.env.TRADE_AMOUNT_SOL || '0.2');
    this.stopLossPct = parseFloat(process.env.STOP_LOSS_PCT || '-30');
    this.takeProfitPct = parseFloat(process.env.TAKE_PROFIT_PCT || '100');
    this.takeProfitSellPct = parseFloat(process.env.TAKE_PROFIT_SELL_PCT || '75');
    this.trailingStopPct = parseFloat(process.env.TRAILING_STOP_PCT || '25');
    this.realtimeMcapEnabled = process.env.REALTIME_MCAP !== 'false';
    this.realtimeMcapTtlMs = parseInt(process.env.REALTIME_MCAP_TTL_MS || '1000', 10); // 1s cache
    this.realtimeMcapIntervalMs = parseInt(process.env.REALTIME_MCAP_INTERVAL_MS || '1000', 10); // 1s interval for accurate stop-loss
    this.pumpPortalUrl = process.env.PUMP_PORTAL_URL || 'https://pumpportal.fun/api/trade-local';
    this.pumpPortalPool = process.env.PUMP_PORTAL_POOL || 'auto';
    this.pumpPortalPriorityFeeSol = parseFloat(process.env.PUMP_PORTAL_PRIORITY_FEE_SOL || '0.00001');
    this.migrationStateTtlMs = parseInt(process.env.MIGRATION_STATE_TTL_MS || '300000', 10);

    this.holdersMint = process.env.HOLDERS_MINT || null;
    this.distributionInterval = parseInt(process.env.DISTRIBUTION_INTERVAL_TRADES || '5', 10);
    this.distributionTopN = parseInt(process.env.DISTRIBUTION_TOP_HOLDERS || '50', 10);
    this.distributionEnabled = process.env.DISTRIBUTION_ENABLED === 'true';

    this.tradingMode = process.env.TRADING_MODE || 'paper'; // paper | live
    this.walletAddress = process.env.TRADING_WALLET_ADDRESS || null;
    this.privateKey = process.env.TRADING_PRIVATE_KEY || null;
    // Jupiter endpoints changed; prefer the current public base by default.
    // Can be overridden via JUPITER_API_BASE if needed.
    this.jupiterBase = process.env.JUPITER_API_BASE || 'https://lite-api.jup.ag/swap/v1';
    this.slippageBps = parseInt(process.env.JUPITER_SLIPPAGE_BPS || '500', 10);

    this.positions = new Map(); // mint -> position
    this.mcapCache = new Map(); // mint -> { value, ts }
    this.mcapInFlight = new Map(); // mint -> Promise<number|null>
    this.migrationStateCache = new Map(); // mint -> { state, ts }
    this.tradeCount = 0;
    this.activityLog = [];
    this.balanceSol = 0;
    this.holders = [];
    this.realizedProfitSol = 0;
    this.distributionPoolSol = 0;
    this.realtimeErrorCooldownMs = parseInt(process.env.REALTIME_MCAP_ERROR_COOLDOWN_MS || '60000', 10);
    this.realtimePausedUntil = 0;
    this.lastRealtimeErrorAt = 0;

    if (this.privateKey && this.tradingMode === 'live') {
      try {
        const keyBytes = bs58.decode(this.privateKey);
        const keypair = Keypair.fromSecretKey(keyBytes);
        this.walletAddress = keypair.publicKey.toBase58();
        this.keypair = keypair;
      } catch (e) {
        this.log('error', `Invalid TRADING_PRIVATE_KEY: ${e.message}`);
        this.privateKey = null;
      }
    }
  }

  async start() {
    await this.refreshBalance();
    await this.refreshHolders();

    setInterval(() => this.refreshBalance(), 10000);
    setInterval(() => this.refreshHolders(), 30000);
    this.startRealtimeMonitor();
  }

  log(type, message, payload = {}) {
    const entry = {
      type,
      message,
      payload,
      timestamp: new Date().toISOString(),
    };
    this.activityLog.unshift(entry);
    this.activityLog = this.activityLog.slice(0, 200);
    this.emit('activity', entry);
  }

  emitPositions() {
    this.emit('positions', Array.from(this.positions.values()));
  }

  getOpenPositionMints() {
    return Array.from(this.positions.keys());
  }

  async refreshBalance() {
    try {
      if (!this.walletAddress || !this.isValidPublicKey(this.walletAddress)) return;
      this.balanceSol = await this.helius.getSolBalance(this.walletAddress);
      this.emit('balance', this.balanceSol);
    } catch (e) {
      this.log('error', `Balance update failed: ${e.message}`);
    }
  }

  async refreshHolders() {
    try {
      if (!this.holdersMint || !this.isValidPublicKey(this.holdersMint)) return;
      this.holders = await this.helius.getTopHolders(this.holdersMint, this.distributionTopN);
      this.emit('holders', this.holders);
    } catch (e) {
      this.log('error', `Holders update failed: ${e.message}`);
    }
  }

  isValidPublicKey(value) {
    if (!value || typeof value !== 'string') return false;
    try {
      new PublicKey(value);
      return true;
    } catch {
      return false;
    }
  }

  startRealtimeMonitor() {
    if (!this.realtimeMcapEnabled) return;
    this.log('info', `Realtime monitoring enabled (Helius). Interval: ${this.realtimeMcapIntervalMs}ms, Cache TTL: ${this.realtimeMcapTtlMs}ms`);
    
    let cycleCount = 0;
    setInterval(async () => {
      if (this.realtimePausedUntil && Date.now() < this.realtimePausedUntil) return;
      
      cycleCount++;
      const posCount = this.positions.size;
      
      try {
        await this.updatePositionsRealtime();
      } catch (e) {
        const now = Date.now();
        const message = e?.message || 'Unknown error';
        if (message.includes('ENOTFOUND')) {
          this.realtimePausedUntil = now + 5 * 60 * 1000;
          if (now - this.lastRealtimeErrorAt > this.realtimeErrorCooldownMs) {
            this.lastRealtimeErrorAt = now;
            this.log('warn', `Realtime monitor paused (DNS error): ${message}`);
          }
          return;
        }
        if (now - this.lastRealtimeErrorAt > this.realtimeErrorCooldownMs) {
          this.lastRealtimeErrorAt = now;
          this.log('error', `Realtime monitor failed: ${message}`);
        }
      }
    }, this.realtimeMcapIntervalMs);
  }

  getTokenRecord(mint) {
    if (!mint || !this.tokenStore?.getToken) return null;
    try {
      return this.tokenStore.getToken(mint);
    } catch {
      return null;
    }
  }

  getCachedMigrationState(mint) {
    if (!mint) return null;
    const cached = this.migrationStateCache.get(mint);
    if (!cached) return null;
    if (Date.now() - cached.ts > this.migrationStateTtlMs) {
      this.migrationStateCache.delete(mint);
      return null;
    }
    return cached.state;
  }

  async inferMigrationFromMcap(mint) {
    // Fallback: if mcap > 58K, token has migrated (pump.fun bonding curve completes at ~58K)
    if (!mint) return null;
    try {
      const mcap = await this.getRealtimeMcap(mint);
      if (Number.isFinite(mcap) && mcap > 58000) {
        return false; // migrated (false = migration complete)
      }
      if (Number.isFinite(mcap) && mcap > 0 && mcap <= 58000) {
        return true; // still bonding (true = migration in progress)
      }
    } catch {
      // ignore
    }
    return null;
  }

  setMigrationState(mint, state, source = 'pumpportal') {
    if (!mint || typeof state !== 'boolean') return;
    const prev = this.migrationStateCache.get(mint);
    if (prev?.state === state) return;
    this.migrationStateCache.set(mint, { state, ts: Date.now(), source });
    const label = state ? 'migration in progress' : 'migration complete';
    this.log('info', `Migration update: ${label} for ${mint.slice(0, 6)} (${source}).`, {
      mint,
      state,
      source,
    });
  }

  parseRawTokenData(tokenRecord) {
    if (!tokenRecord?.raw_data) return tokenRecord;
    try {
      const parsed = JSON.parse(tokenRecord.raw_data);
      return { ...tokenRecord, raw: parsed };
    } catch {
      return tokenRecord;
    }
  }

  isTokenMigrating(tokenRecord) {
    if (!tokenRecord) return null;
    const withRaw = this.parseRawTokenData(tokenRecord);
    const raw = withRaw.raw || withRaw;
    const status = raw?.migration_status || raw?.migration?.status || raw?.migrationStatus || null;
    const migrated = raw?.migrated ?? raw?.is_migrated ?? raw?.migration_complete ?? null;
    const inProgress = raw?.is_migrating ?? raw?.migrating ?? raw?.migration_in_progress ?? null;
    const progress = raw?.migration_progress ?? raw?.migration?.progress ?? null;

    if (typeof migrated === 'boolean') return !migrated;
    if (typeof inProgress === 'boolean') return inProgress;
    if (typeof status === 'string') {
      const lowered = status.toLowerCase();
      if (lowered.includes('complete') || lowered.includes('migrated')) return false;
      if (lowered.includes('progress') || lowered.includes('migrat')) return true;
    }
    if (typeof progress === 'number') return progress < 1;
    return null;
  }

  async getRealtimeMcap(mint, forceRefresh = false) {
    if (!mint) return null;
    
    // Skip cache if force refresh requested
    if (!forceRefresh) {
      const cached = this.mcapCache.get(mint);
      if (cached && Date.now() - cached.ts < this.realtimeMcapTtlMs) {
        return cached.value;
      }
    }

    const inflight = this.mcapInFlight.get(mint);
    if (inflight && !forceRefresh) {
      return inflight;
    }

    const computePromise = (async () => {
      // ACCURATE PATH: Jupiter quote (always use for accurate baseline)
      // This ensures entry mcap and monitoring mcap are consistent
      try {
        const supply = await this.helius.getTokenSupply(mint);
        if (supply?.uiAmount && supply.uiAmount > 0) {
          const solUsd = await this.helius.getSolUsdPrice();
          if (Number.isFinite(solUsd) && solUsd > 0) {
            const quoteRes = await fetch(`${this.jupiterBase}/quote?inputMint=${mint}&outputMint=So11111111111111111111111111111111111111112&amount=${Math.pow(10, supply.decimals || 6)}&slippageBps=50`);
            if (quoteRes.ok) {
              const quoteData = await quoteRes.json();
              const outAmountLamports = Number(quoteData?.outAmount || 0);
              if (outAmountLamports > 0) {
                const tokenPriceSol = outAmountLamports / 1e9;
                const tokenPriceUsd = tokenPriceSol * solUsd;
                const mcap = tokenPriceUsd * supply.uiAmount;
                if (Number.isFinite(mcap) && mcap > 0) {
                  this.mcapCache.set(mint, { value: mcap, ts: Date.now() });
                  return mcap;
                }
              }
            }
          }
        }
      } catch {
        // Fall through to DexScreener
      }
      
      // FALLBACK: DexScreener
      const dexMcap = await this.helius.getDexScreenerMcap(mint);
      if (Number.isFinite(dexMcap) && dexMcap > 0) {
        this.mcapCache.set(mint, { value: dexMcap, ts: Date.now() });
        return dexMcap;
      }
      
      return null;
    })();

    this.mcapInFlight.set(mint, computePromise);
    try {
      return await computePromise;
    } finally {
      this.mcapInFlight.delete(mint);
    }
  }

  async updatePositionsRealtime() {
    if (this.positions.size === 0) return;
    
    // Fetch all mcaps in parallel for faster updates
    const entries = Array.from(this.positions.entries());
    const mcapResults = await Promise.all(
      entries.map(async ([mint, position]) => {
        try {
          const mcap = await this.getRealtimeMcap(mint);
          return { mint, position, mcap, error: null };
        } catch (e) {
          return { mint, position, mcap: null, error: e };
        }
      })
    );
    
    const realtimeTokens = [];
    const now = Date.now();
    
    for (const { mint, position, mcap, error } of mcapResults) {
      if (error) {
        this.log('error', `Mcap fetch failed for ${position.symbol || mint.slice(0, 6)}: ${error.message}`);
        continue;
      }
      
      if (!mcap) {
        if (now - (position.lastMcapWarnAt || 0) > 60000) {
          position.lastMcapWarnAt = now;
          this.log('warn', `No realtime mcap for ${position.symbol || mint.slice(0, 6)} - retrying`);
        }
        continue;
      }
      
      realtimeTokens.push({ mint, latest_mcap: mcap });
      
      // Log position P&L every 30s
      if (now - (position.lastMonitorLogAt || 0) > 30000) {
        position.lastMonitorLogAt = now;
        const pnlPct = ((mcap - position.entryMcap) / position.entryMcap) * 100;
        this.log('info', `Monitoring ${position.symbol || mint.slice(0, 6)}: $${mcap.toFixed(0)} mcap, ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}% P&L`);
      }
    }
    
    if (realtimeTokens.length > 0) {
      await this.updatePositions(realtimeTokens, 'realtime');
    }
  }

  async handleRealtimeTrade({ mint, payload } = {}) {
    if (!mint || !this.positions.has(mint)) return;
    const mcap = await this.getRealtimeMcap(mint);
    if (!Number.isFinite(mcap) || mcap <= 0) return;
    await this.updatePositions([{ mint, latest_mcap: mcap }], 'realtime');
  }

  async handleSignals(tokens, sourceLabel) {
    for (const token of tokens) {
      await this.handleNewSignal(token, sourceLabel);
    }
  }

  async handleNewSignal(token, sourceLabel) {
    const mint = token.mint || token.token_address || token.address;
    if (!mint) return;

    this.log('signal', `Scanning ${sourceLabel}... anomaly detected: ${token.symbol || mint.slice(0, 6)}`, {
      mint,
      symbol: token.symbol,
      name: token.name,
    });

    if (this.positions.has(mint)) return; // already in position

    await this.executeBuy(token, sourceLabel);
  }

  async executeBuy(token, sourceLabel) {
    let entryMcap = parseFloat(token.latest_mcap || token.initial_mcap || 0);
    const mint = token.mint || token.token_address || token.address;
    
    // Double-check position doesn't exist (race condition protection)
    if (this.positions.has(mint)) return;
    
    const tokenRecord = this.getTokenRecord(mint);
    const migrationState =
      this.getCachedMigrationState(mint) ??
      this.isTokenMigrating({ raw: token }) ??
      this.isTokenMigrating(tokenRecord) ??
      await this.inferMigrationFromMcap(mint);

    if (this.realtimeMcapEnabled && mint) {
      // Force fresh fetch at entry (bypass cache) to ensure accurate baseline
      const realtimeMcap = await this.getRealtimeMcap(mint, true);
      if (Number.isFinite(realtimeMcap) && realtimeMcap > 0) {
        entryMcap = realtimeMcap;
      }
    }

    if (entryMcap <= 0) {
      this.log('warn', `Analysis incomplete: Market cap data missing for ${token.symbol || mint.slice(0, 6)}. Skipping acquisition.`);
      return;
    }

    if (this.tradingMode !== 'live' || !this.keypair) {
      // Double-check again before adding position (paper mode)
      if (this.positions.has(mint)) return;
      
      this.positions.set(mint, {
        mint,
        symbol: token.symbol,
        entryMcap,
        maxMcap: entryMcap,
        amountSol: this.tradeAmountSol,
        openAt: Date.now(),
        remainingPct: 100,
        pnlPct: 0,
        isMigrating: migrationState,
      });
      this.tradeCount += 1;
      this.log('trade', `Simulating entry for ${token.symbol || mint.slice(0, 6)} at $${entryMcap.toFixed(0)} market cap.`, {
        mint,
        entryMcap,
        amountSol: this.tradeAmountSol,
        source: sourceLabel,
      });
      this.emitPositions();
      await this.maybeDistribute();
      return;
    }

    // Live trading: add protection against concurrent execution
    // Check if there's a pending buy for this mint
    const existingPosition = this.positions.get(mint);
    if (existingPosition?.buyInProgress) return;
    if (existingPosition?.nextBuyAttemptAt && Date.now() < existingPosition.nextBuyAttemptAt) return;

    try {
      // Mark as in progress immediately to prevent race conditions
      // Create a temporary position entry to block concurrent buys
      this.positions.set(mint, {
        mint,
        symbol: token.symbol,
        entryMcap,
        maxMcap: entryMcap,
        amountSol: this.tradeAmountSol,
        openAt: Date.now(),
        remainingPct: 100,
        pnlPct: 0,
        isMigrating: migrationState,
        buyInProgress: true,
        tokenAmount: 0, // Will be updated after confirmation
        tokenDecimals: null,
      });

      const buyResult = await this.swapForMint({
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: mint,
        amount: Math.round(this.tradeAmountSol * 1e9),
        isInputSol: true,
        migrationState,
      });

      // Wait for transaction confirmation before fetching balance
      if (buyResult?.txid) {
        await this.waitForConfirmation(buyResult.txid);
      }

      const tokenBalance = await this.getTokenBalance(mint);
      if (tokenBalance.amount <= 0) {
        // Remove the temporary position if buy failed
        this.positions.delete(mint);
        this.log('error', `Buy tx confirmed but token balance is 0 for ${token.symbol || mint.slice(0, 6)}. Position not opened.`);
        return;
      }

      // Update position with actual token balance and remove buyInProgress flag
      this.positions.set(mint, {
        mint,
        symbol: token.symbol,
        entryMcap,
        maxMcap: entryMcap,
        amountSol: this.tradeAmountSol,
        openAt: Date.now(),
        remainingPct: 100,
        tokenAmount: tokenBalance.amount,
        tokenDecimals: tokenBalance.decimals,
        pnlPct: 0,
        isMigrating: migrationState,
      });

      this.tradeCount += 1;
      this.log('trade', `Acquisition executed for ${token.symbol || mint.slice(0, 6)}. Awaiting market response.`, {
        mint,
        txid: buyResult?.txid,
        amountSol: this.tradeAmountSol,
        tokenAmount: tokenBalance.amount,
      });
      this.emitPositions();
      await this.maybeDistribute();
    } catch (e) {
      // Remove the temporary position on error
      this.positions.delete(mint);
      // Set cooldown to prevent spamming buy attempts
      const tempPosition = { nextBuyAttemptAt: Date.now() + 30000 }; // 30s backoff
      // Don't store temp position, just log the error
      this.log('error', `Live BUY failed: ${e.message}`);
    }
  }

  async updatePositions(tokens, source = 'poll') {
    for (const token of tokens) {
      const mint = token.mint || token.token_address || token.address;
      if (!mint || !this.positions.has(mint)) continue;

      // When realtime monitoring is enabled, only use realtime updates
      // to avoid poll-based pre-exits with stale or partial metrics.
      if (this.realtimeMcapEnabled && source !== 'realtime') {
        continue;
      }

      const position = this.positions.get(mint);
      const currentMcap = parseFloat(token.latest_mcap || token.initial_mcap || 0);
      if (!currentMcap) continue;

      // Update max
      if (currentMcap > position.maxMcap) position.maxMcap = currentMcap;

      const pnlPct = ((currentMcap - position.entryMcap) / position.entryMcap) * 100;
      position.pnlPct = pnlPct;

      // Stop loss
      if (pnlPct <= this.stopLossPct && position.remainingPct > 0) {
        await this.executeSell(position, 100, `Stop loss triggered (${pnlPct.toFixed(1)}%). Protect capital.`);
        continue;
      }

      // Take profit
      if (pnlPct >= this.takeProfitPct && position.remainingPct === 100) {
        await this.executeSell(position, this.takeProfitSellPct, `Take profit target reached (${pnlPct.toFixed(1)}%). Securing gains.`);
      }

      // Trailing stop
      if (position.remainingPct > 0) {
        const trailingFloor = position.maxMcap * (1 - this.trailingStopPct / 100);
        if (currentMcap < trailingFloor) {
          await this.executeSell(position, position.remainingPct, 'Momentum reversal detected. Exiting position.');
        }
      }
    }
  }

  async executeSell(position, pctToSell, reason) {
    const mint = position.mint;

    if (this.tradingMode !== 'live' || !this.keypair) {
      this.log('trade', `Simulating exit: ${pctToSell}% of ${position.symbol || mint.slice(0, 6)}. Reason: ${reason}`, {
        mint,
        pctToSell,
      });
      if (pctToSell >= position.remainingPct) {
        this.positions.delete(mint);
      } else {
        position.remainingPct -= pctToSell;
      }
      this.recordPaperProfit(position, pctToSell, reason);
      this.emitPositions();
      return;
    }

    try {
      const now = Date.now();
      if (position.sellInProgress) return;
      if (position.nextSellAttemptAt && now < position.nextSellAttemptAt) return;
      position.sellInProgress = true;

      const tokenRecord = this.getTokenRecord(mint);
      const migrationState =
        this.getCachedMigrationState(mint) ??
        (tokenRecord ? this.isTokenMigrating(tokenRecord) : null) ??
        position.isMigrating ??
        await this.inferMigrationFromMcap(mint);

      // Use stored tokenAmount from position, fallback to fresh fetch
      let tokenAmount = position.tokenAmount;
      let tokenDecimals = position.tokenDecimals;
      if (!tokenAmount || tokenAmount <= 0) {
        const balance = await this.getTokenBalance(mint);
        tokenAmount = balance.amount;
        tokenDecimals = balance.decimals;
        // Update position with fetched balance for future sells
        position.tokenAmount = tokenAmount;
        position.tokenDecimals = tokenDecimals;
      }

      const sellAmount = Math.floor(tokenAmount * (pctToSell / 100));

      if (sellAmount <= 0) {
        this.log('error', `No token balance to sell for ${position.symbol || mint.slice(0, 6)}. Closing position.`);
        this.positions.delete(mint);
        this.emitPositions();
        return;
      }

      const sellResult = await this.swapForMint({
        inputMint: mint,
        outputMint: 'So11111111111111111111111111111111111111112',
        amount: sellAmount,
        isInputSol: false,
        migrationState,
        tokenDecimals,
      });

      // Only proceed if swap succeeded and returned a txid
      if (!sellResult?.txid) {
        throw new Error('Swap failed: no transaction ID returned');
      }

      // Wait for sell confirmation
      const confirmed = await this.waitForConfirmation(sellResult.txid);
      if (!confirmed) {
        throw new Error('Transaction confirmation timeout');
      }

      // Track realized profit for live trades (only after confirmed)
      await this.recordLiveProfit(position, pctToSell, reason);

      this.log('trade', `Exit executed: ${pctToSell}% of ${position.symbol || mint.slice(0, 6)}. Reason: ${reason}`, {
        mint,
        txid: sellResult.txid,
        soldAmount: sellAmount,
      });

      if (pctToSell >= position.remainingPct) {
        this.positions.delete(mint);
      } else {
        position.remainingPct -= pctToSell;
        // Update remaining token amount after partial sell
        position.tokenAmount = Math.floor(tokenAmount * (1 - pctToSell / 100));
      }
      this.emitPositions();
    } catch (e) {
      // Avoid spamming sell attempts if routing/quotes are temporarily failing.
      position.nextSellAttemptAt = Date.now() + 30000; // 30s backoff
      this.log('error', `Live SELL failed for ${position.symbol || mint.slice(0, 6)}: ${e.message}`);
    } finally {
      position.sellInProgress = false;
    }
  }

  async waitForConfirmation(txid, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const status = await this.helius.connection.getSignatureStatus(txid);
        const confirmation = status?.value?.confirmationStatus;
        if (confirmation === 'confirmed' || confirmation === 'finalized') {
          return true;
        }
        if (status?.value?.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
        }
      } catch (e) {
        if (e.message.includes('Transaction failed')) throw e;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    this.log('warn', `Transaction ${txid.slice(0, 8)}... confirmation timeout, proceeding anyway`);
    return false;
  }

  async recordLiveProfit(position, pctToSell, reason) {
    if (this.tradingMode !== 'live') return;
    
    // Measure actual SOL balance change (before/after sell)
    const balanceBefore = this.balanceSol;
    await this.refreshBalance();
    const balanceAfter = this.balanceSol;
    const solReceived = balanceAfter - balanceBefore;
    
    // Calculate profit: SOL received - SOL originally invested in this portion
    const pct = pctToSell / 100;
    const solInvested = position.amountSol * pct;
    const profit = solReceived - solInvested;
    
    this.realizedProfitSol += profit;
    
    // Distribution pool (only if enabled)
    if (this.distributionEnabled && profit > 0) {
      const retained = profit * 0.25;
      const distributed = profit * 0.75;
      this.distributionPoolSol += distributed;
      
      this.log('info', `P&L Recorded: ${profit >= 0 ? '+' : ''}${profit.toFixed(3)} SOL. Allocating resources...`, {
        retained: retained.toFixed(3),
        distributed: distributed.toFixed(3),
      });
    } else {
      this.log('info', `P&L Recorded: ${profit >= 0 ? '+' : ''}${profit.toFixed(3)} SOL (retained).`);
    }
  }

  recordPaperProfit(position, pctToSell, reason) {
    if (this.tradingMode === 'live') return;
    const pct = pctToSell / 100;
    const entryValue = position.amountSol * pct;
    const exitValue = entryValue * (1 + (position.pnlPct || 0) / 100);
    const profit = exitValue - entryValue;
    this.realizedProfitSol += profit;
    const retained = profit * 0.25;
    const distributed = profit * 0.75;
    this.distributionPoolSol += distributed;

    this.log('info', `P&L Recorded: +${profit.toFixed(3)} SOL. Allocating resources...`, {
      retained: retained.toFixed(3),
      distributed: distributed.toFixed(3),
    });
  }

  async getTokenBalance(mint) {
    const owner = new PublicKey(this.walletAddress);
    const mintKey = new PublicKey(mint);
    const accounts = await this.helius.connection.getParsedTokenAccountsByOwner(owner, {
      mint: mintKey,
    });
    const info = accounts.value?.[0]?.account?.data?.parsed?.info;
    if (!info) return { amount: 0, decimals: 0 };
    return {
      amount: parseInt(info.tokenAmount.amount, 10),
      decimals: info.tokenAmount.decimals,
    };
  }

  async swapForMint({ inputMint, outputMint, amount, isInputSol, migrationState, tokenDecimals = null }) {
    if (migrationState !== false) {
      try {
        return await this.swapPumpPortalLocal({ inputMint, outputMint, amount, isInputSol, tokenDecimals });
      } catch (e) {
        this.log('warn', `Pump Portal trade-local failed, falling back to Jupiter: ${e.message}`);
      }
    }
    return this.swapJupiter({ inputMint, outputMint, amount, isInputSol });
  }

  async swapPumpPortalLocal({ inputMint, outputMint, amount, isInputSol, tokenDecimals = null }) {
    if (!this.pumpPortalUrl) {
      throw new Error('Pump Portal URL not configured');
    }
    if (!this.walletAddress || !this.keypair) {
      throw new Error('Trading wallet not configured for Pump Portal');
    }

    const mint = isInputSol ? outputMint : inputMint;
    const action = isInputSol ? 'buy' : 'sell';
    // PumpPortal expects:
    // - buy: SOL amount (UI units)
    // - sell: token amount in UI units (not base units)
    const amountValue = isInputSol
      ? amount / 1e9
      : (Number.isFinite(tokenDecimals) && tokenDecimals >= 0
        ? amount / Math.pow(10, tokenDecimals)
        : amount);
    const slippagePct = this.slippageBps / 100;

    const response = await fetch(this.pumpPortalUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        publicKey: this.walletAddress,
        action,
        mint,
        denominatedInSol: isInputSol ? 'true' : 'false',
        amount: amountValue,
        slippage: slippagePct,
        priorityFee: this.pumpPortalPriorityFeeSol,
        pool: this.pumpPortalPool,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Pump Portal trade-local error: ${response.status} ${text}`);
    }

    const raw = await response.arrayBuffer();
    const tx = VersionedTransaction.deserialize(new Uint8Array(raw));
    tx.sign([this.keypair]);
    const signature = await this.helius.connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    this.log('info', `Pump Portal swap submitted: ${signature}`);
    return { txid: signature };
  }

  async swapJupiter({ inputMint, outputMint, amount, isInputSol }) {
    const quoteRes = await axios.get(`${this.jupiterBase}/quote`, {
      params: {
        inputMint,
        outputMint,
        amount,
        slippageBps: this.slippageBps,
      },
    });

    if (!quoteRes.data) {
      throw new Error('Jupiter quote failed');
    }

    const swapRes = await axios.post(`${this.jupiterBase}/swap`, {
      quoteResponse: quoteRes.data,
      userPublicKey: this.walletAddress,
      wrapAndUnwrapSol: isInputSol,
      dynamicComputeUnitLimit: true,
    });

    if (!swapRes.data?.swapTransaction) {
      throw new Error('Jupiter swap transaction missing');
    }

    const tx = VersionedTransaction.deserialize(
      Buffer.from(swapRes.data.swapTransaction, 'base64')
    );
    tx.sign([this.keypair]);

    const signature = await this.helius.connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    this.log('info', `Swap submitted: ${signature}`);
    return { txid: signature };
  }

  async maybeDistribute() {
    if (this.tradeCount % this.distributionInterval !== 0) return;
    if (!this.holdersMint || this.holders.length === 0) {
      this.log('info', 'Distribution skipped (no holders data)');
      return;
    }
    if (!this.distributionEnabled) {
      this.log('info', 'Distribution skipped (disabled)');
      return;
    }

    if (this.tradingMode !== 'live' || !this.keypair) {
      this.log('distribution', `Simulating profit distribution to top ${this.distributionTopN} holders. Community first.`, {
        holders: this.holders.slice(0, 5),
        pool: this.distributionPoolSol.toFixed(3),
      });
      return;
    }

    await this.executeDistribution();
  }

  async executeDistribution() {
    if (this.distributionPoolSol <= 0) {
      this.log('info', 'Distribution pool empty');
      return;
    }

    const holders = await this.resolveHolderOwners(this.holders.slice(0, this.distributionTopN));
    const uniqueOwners = Array.from(new Set(holders.map(h => h.owner))).filter(Boolean);
    if (uniqueOwners.length === 0) {
      this.log('info', 'No holder owners resolved');
      return;
    }

    const perHolder = this.distributionPoolSol / uniqueOwners.length;
    const maxSpend = this.balanceSol * 0.9;
    const total = Math.min(this.distributionPoolSol, maxSpend);
    const per = total / uniqueOwners.length;

    if (per <= 0) {
      this.log('info', 'Distribution amount too small');
      return;
    }

    this.log('distribution', `Distributing ${total.toFixed(3)} SOL to ${uniqueOwners.length} holders. Rewarding loyalty.`, {
      perHolder: per.toFixed(6),
    });

    await this.sendSolToRecipients(uniqueOwners, per);
    this.distributionPoolSol = Math.max(0, this.distributionPoolSol - total);
  }

  async resolveHolderOwners(holderAccounts) {
    const owners = [];
    for (const holder of holderAccounts) {
      try {
        const info = await this.helius.connection.getParsedAccountInfo(new PublicKey(holder.address));
        const owner = info?.value?.data?.parsed?.info?.owner;
        owners.push({ ...holder, owner });
      } catch (e) {
        owners.push({ ...holder, owner: null });
      }
    }
    return owners;
  }

  async sendSolToRecipients(recipients, amountSol) {
    const { Transaction, SystemProgram } = await import('@solana/web3.js');
    const instructions = [];
    const chunkSize = 8;

    for (const recipient of recipients) {
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(this.walletAddress),
          toPubkey: new PublicKey(recipient),
          lamports: Math.floor(amountSol * 1e9),
        })
      );
    }

    for (let i = 0; i < instructions.length; i += chunkSize) {
      const chunk = instructions.slice(i, i + chunkSize);
      const tx = new Transaction().add(...chunk);
      tx.feePayer = new PublicKey(this.walletAddress);
      tx.recentBlockhash = (await this.helius.connection.getLatestBlockhash()).blockhash;
      tx.sign(this.keypair);
      const sig = await this.helius.connection.sendRawTransaction(tx.serialize());
      this.log('info', `Distribution batch sent: ${sig}`);
    }
  }

  getState() {
    return {
      tradingMode: this.tradingMode,
      walletAddress: this.walletAddress,
      balanceSol: this.balanceSol,
      tradeCount: this.tradeCount,
      positions: Array.from(this.positions.values()),
      holders: this.holders,
      activityLog: this.activityLog,
      realizedProfitSol: this.realizedProfitSol,
      distributionPoolSol: this.distributionPoolSol,
    };
  }
}
