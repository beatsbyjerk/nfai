import EventEmitter from 'events';

const TRACK_WINDOW_MS = 10 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const SCORE_INTERVAL_MS = 5000;
const MAX_TRACKED = 200;
const SUBSCRIBE_BATCH_SIZE = 50;
const SIGNAL_THRESHOLD = 25;
const MIN_INITIAL_BUY_SOL = 0.3;
const PROMOTION_TRADES = 2;

export class PumpSignalTracker extends EventEmitter {
  constructor({ pumpPortalWs, tokenStore } = {}) {
    super();
    this.ppws = pumpPortalWs;
    this.tokenStore = tokenStore;
    this.tracked = new Map();        // mint -> TrackingEntry (promoted tokens being scored)
    this.candidates = new Map();     // mint -> { trades, firstSeen, payload } (raw new tokens not yet promoted)
    this.pendingSubscribe = new Set();
    this.subscribeTimer = null;
    this.cleanupTimer = null;
    this.scoreTimer = null;
  }

  start() {
    if (!this.ppws) return;
    this.ppws.on('newToken', ({ mint, payload }) => this.handleNewToken(mint, payload));
    this.ppws.on('trade', ({ mint, payload }) => this.handleTrade(mint, payload));
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    this.scoreTimer = setInterval(() => this.scoreAll(), SCORE_INTERVAL_MS);
    this.subscribeTimer = setInterval(() => this.flushSubscriptions(), 2000);
    console.log('[PumpSignalTracker] Started — smart tracking with promotion threshold:', PROMOTION_TRADES, 'trades or', MIN_INITIAL_BUY_SOL, 'SOL');
  }

  stop() {
    clearInterval(this.cleanupTimer);
    clearInterval(this.scoreTimer);
    clearInterval(this.subscribeTimer);
  }

  handleNewToken(mint, payload) {
    if (!mint || this.tracked.has(mint) || this.candidates.has(mint)) return;

    const mcapSol = payload?.marketCapSol;
    const initialBuy = parseFloat(payload?.solAmount) || 0;

    // If initial buy is large enough, promote immediately
    if (initialBuy >= MIN_INITIAL_BUY_SOL) {
      this.promote(mint, payload);
      return;
    }

    // Otherwise, park as candidate — will be promoted if it gets enough trades
    this.candidates.set(mint, {
      trades: 0,
      volumeSol: 0,
      firstSeen: Date.now(),
      payload,
      mcapSol: mcapSol || null,
    });

    // Subscribe to trades so we can evaluate
    this.pendingSubscribe.add(mint);
  }

  handleTrade(mint, payload) {
    if (!mint) return;

    // Check if this is a candidate awaiting promotion
    const candidate = this.candidates.get(mint);
    if (candidate) {
      candidate.trades++;
      candidate.volumeSol += parseFloat(payload?.solAmount) || 0;
      const mcapSol = payload?.marketCapSol;
      if (mcapSol != null) candidate.mcapSol = mcapSol;

      if (candidate.trades >= PROMOTION_TRADES || candidate.volumeSol >= MIN_INITIAL_BUY_SOL) {
        this.candidates.delete(mint);
        this.promote(mint, candidate.payload, candidate);
      }
      return;
    }

    // Update tracked entry
    const entry = this.tracked.get(mint);
    if (!entry) return;

    const now = Date.now();
    const txType = payload?.txType;
    const solAmount = parseFloat(payload?.solAmount) || 0;
    const trader = payload?.traderPublicKey || null;
    const mcapSol = payload?.marketCapSol;

    entry.txCount++;
    entry.tradeTimestamps.push(now);

    if (txType === 'buy') {
      entry.buyCount++;
      entry.buyVolumeSol += solAmount;
    } else if (txType === 'sell') {
      entry.sellCount++;
      entry.sellVolumeSol += solAmount;
    }

    entry.volumeSol += solAmount;
    if (trader) entry.uniqueTraders.add(trader);

    if (mcapSol != null && Number.isFinite(mcapSol)) {
      entry.latestMcapSol = mcapSol;
      if (mcapSol > (entry.peakMcapSol || 0)) entry.peakMcapSol = mcapSol;
    }
  }

  promote(mint, payload, candidateData) {
    if (this.tracked.has(mint)) return;
    if (this.tracked.size >= MAX_TRACKED) this.evictOldest();

    const now = Date.now();
    const entry = {
      mint,
      symbol: payload?.symbol || payload?.result?.symbol || null,
      name: payload?.name || payload?.result?.name || null,
      image: payload?.uri || payload?.result?.uri || null,
      creator: payload?.traderPublicKey || payload?.creator_wallet?.address || payload?.result?.creator_wallet?.address || null,
      createdAt: candidateData?.firstSeen || now,
      initialMcapSol: payload?.marketCapSol || candidateData?.mcapSol || null,
      initialBuySol: parseFloat(payload?.solAmount) || parseFloat(payload?.initialBuy) || 0,
      txCount: candidateData?.trades || 0,
      buyCount: 0,
      sellCount: 0,
      volumeSol: candidateData?.volumeSol || 0,
      uniqueTraders: new Set(),
      buyVolumeSol: 0,
      sellVolumeSol: 0,
      latestMcapSol: candidateData?.mcapSol || payload?.marketCapSol || null,
      peakMcapSol: candidateData?.mcapSol || payload?.marketCapSol || null,
      tradeTimestamps: [],
      score: 0,
      grade: '—',
      factors: [],
      signaled: false,
    };

    this.tracked.set(mint, entry);

    if (this.tokenStore) {
      const tokenData = {
        token_address: mint,
        symbol: entry.symbol,
        name: entry.name,
        image: entry.image,
        initial_mcap: entry.initialMcapSol,
        created_at: new Date(entry.createdAt).toISOString(),
        platform: 'pump.fun',
      };
      const isNew = this.tokenStore.upsertToken(tokenData, 'pumpportal');
      if (isNew) {
        this.emit('newSignalToken', {
          ...this.tokenStore.getToken(mint),
          pp_metrics: this.getMetrics(mint),
        });
      }
    }
  }

  getMetrics(mint) {
    const entry = this.tracked.get(mint);
    if (!entry) return null;

    const now = Date.now();
    const ageMs = now - entry.createdAt;
    const ageSec = ageMs / 1000;
    const ageMin = ageSec / 60;

    const recentWindow = 60000;
    const recentTrades = entry.tradeTimestamps.filter(t => now - t < recentWindow).length;
    const tradesPerMin = ageMin > 0 ? entry.txCount / ageMin : 0;

    const totalTrades = entry.buyCount + entry.sellCount;
    const buyRatio = totalTrades > 0 ? entry.buyCount / totalTrades : 0.5;

    const volPerMin = ageMin > 0 ? entry.volumeSol / ageMin : 0;
    const holderCount = entry.uniqueTraders.size;

    const mcapGrowth = (entry.initialMcapSol && entry.latestMcapSol && entry.initialMcapSol > 0)
      ? ((entry.latestMcapSol - entry.initialMcapSol) / entry.initialMcapSol) * 100
      : 0;

    return {
      txCount: entry.txCount,
      buyCount: entry.buyCount,
      sellCount: entry.sellCount,
      volumeSol: entry.volumeSol,
      buyVolumeSol: entry.buyVolumeSol,
      sellVolumeSol: entry.sellVolumeSol,
      holderCount,
      buyRatio,
      tradesPerMin: Math.round(tradesPerMin * 10) / 10,
      recentTradesPerMin: recentTrades,
      volPerMin: Math.round(volPerMin * 100) / 100,
      latestMcapSol: entry.latestMcapSol,
      peakMcapSol: entry.peakMcapSol,
      initialMcapSol: entry.initialMcapSol,
      mcapGrowth: Math.round(mcapGrowth * 10) / 10,
      ageSeconds: Math.round(ageSec),
      score: entry.score,
      grade: entry.grade,
      factors: entry.factors,
    };
  }

  scoreAll() {
    const updates = [];
    for (const [mint, entry] of this.tracked) {
      const prev = entry.score;
      this.computeScore(entry);
      const metrics = this.getMetrics(mint);

      if (!entry.signaled && entry.score >= SIGNAL_THRESHOLD) {
        entry.signaled = true;
        this.emit('signal', { mint, metrics, entry });
      }

      if (entry.score !== prev || entry.txCount > 0) {
        updates.push({ mint, metrics });
      }
    }

    if (updates.length > 0) {
      this.emit('metricsUpdate', updates);
    }
  }

  computeScore(entry) {
    let score = 0;
    const factors = [];
    const now = Date.now();
    const ageMin = (now - entry.createdAt) / 60000;
    const totalTrades = entry.buyCount + entry.sellCount;
    const buyRatio = totalTrades > 0 ? entry.buyCount / totalTrades : 0.5;
    const holderCount = entry.uniqueTraders.size;
    const recentWindow = 60000;
    const recentTrades = entry.tradeTimestamps.filter(t => now - t < recentWindow).length;

    // Transaction velocity (0-25 pts)
    if (entry.txCount >= 50) { score += 25; factors.push('High Activity'); }
    else if (entry.txCount >= 25) { score += 18; factors.push('Active'); }
    else if (entry.txCount >= 10) { score += 10; factors.push('Gaining Traction'); }
    else if (entry.txCount >= 5) { score += 5; }

    // Momentum (0-20 pts)
    const avgRate = ageMin > 0 ? entry.txCount / ageMin : 0;
    if (recentTrades > 0 && avgRate > 0) {
      const momentumRatio = recentTrades / Math.max(avgRate, 1);
      if (momentumRatio > 3) { score += 20; factors.push('Surging'); }
      else if (momentumRatio > 2) { score += 15; factors.push('Accelerating'); }
      else if (momentumRatio > 1.2) { score += 8; factors.push('Steady Pace'); }
    }

    // Buy pressure (0-20 pts)
    if (buyRatio >= 0.85 && totalTrades >= 5) { score += 20; factors.push('Heavy Buyers'); }
    else if (buyRatio >= 0.7 && totalTrades >= 5) { score += 14; factors.push('Buy Dominant'); }
    else if (buyRatio >= 0.55 && totalTrades >= 3) { score += 7; }

    // Holder diversity (0-15 pts)
    if (holderCount >= 30) { score += 15; factors.push('Wide Distribution'); }
    else if (holderCount >= 15) { score += 10; factors.push('Growing Holders'); }
    else if (holderCount >= 5) { score += 5; }

    // Volume intensity (0-10 pts)
    if (entry.volumeSol >= 5) { score += 10; factors.push('High Volume'); }
    else if (entry.volumeSol >= 2) { score += 7; }
    else if (entry.volumeSol >= 0.5) { score += 3; }

    // Mcap growth (0-10 pts)
    const mcapGrowth = (entry.initialMcapSol && entry.latestMcapSol && entry.initialMcapSol > 0)
      ? ((entry.latestMcapSol - entry.initialMcapSol) / entry.initialMcapSol) * 100
      : 0;
    if (mcapGrowth > 200) { score += 10; factors.push('Explosive Growth'); }
    else if (mcapGrowth > 50) { score += 7; factors.push('Strong Growth'); }
    else if (mcapGrowth > 10) { score += 4; }

    // Penalties
    if (buyRatio < 0.3 && totalTrades >= 5) { score -= 15; factors.push('Sell Pressure'); }
    if (ageMin > 5 && entry.txCount < 5) { score -= 10; }

    let grade;
    if (score >= 80) grade = 'S';
    else if (score >= 65) grade = 'A';
    else if (score >= 50) grade = 'B';
    else if (score >= 35) grade = 'C';
    else if (score >= 20) grade = 'D';
    else grade = 'F';

    entry.score = Math.max(0, Math.min(100, score));
    entry.grade = grade;
    entry.factors = factors.slice(0, 4);
  }

  flushSubscriptions() {
    if (this.pendingSubscribe.size === 0) return;
    const batch = Array.from(this.pendingSubscribe).slice(0, SUBSCRIBE_BATCH_SIZE);
    this.pendingSubscribe = new Set(
      Array.from(this.pendingSubscribe).slice(SUBSCRIBE_BATCH_SIZE)
    );
    if (batch.length > 0 && this.ppws) {
      this.ppws.send({ method: 'subscribeTokenTrade', keys: batch });
    }
  }

  cleanup() {
    const now = Date.now();
    const toRemoveTracked = [];
    const toRemoveCandidates = [];

    for (const [mint, entry] of this.tracked) {
      if (now - entry.createdAt > TRACK_WINDOW_MS) toRemoveTracked.push(mint);
    }

    // Candidates that didn't promote within 2 minutes — drop them
    for (const [mint, c] of this.candidates) {
      if (now - c.firstSeen > 120000) toRemoveCandidates.push(mint);
    }

    const allRemove = [...toRemoveTracked, ...toRemoveCandidates];
    if (allRemove.length > 0) {
      this.ppws?.send({ method: 'unsubscribeTokenTrade', keys: allRemove });
    }
    for (const mint of toRemoveTracked) this.tracked.delete(mint);
    for (const mint of toRemoveCandidates) this.candidates.delete(mint);
  }

  evictOldest() {
    let oldest = null;
    let oldestTime = Infinity;
    for (const [mint, entry] of this.tracked) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldest = mint;
      }
    }
    if (oldest) {
      this.ppws?.send({ method: 'unsubscribeTokenTrade', keys: [oldest] });
      this.tracked.delete(oldest);
    }
  }

  getAllMetrics() {
    const result = {};
    for (const [mint] of this.tracked) {
      result[mint] = this.getMetrics(mint);
    }
    return result;
  }

  getTrackedCount() {
    return this.tracked.size;
  }
}
