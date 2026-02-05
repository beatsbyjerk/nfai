import EventEmitter from 'events';
import WebSocket from 'ws';

export class PumpPortalWebSocket extends EventEmitter {
  constructor({ url, accountKeys = [], tokenKeys = [] } = {}) {
    super();
    this.url = url || 'wss://pumpportal.fun/api/data';
    this.accountKeys = accountKeys.filter(Boolean);
    this.tokenKeys = tokenKeys.filter(Boolean);
    this.subscribedTokenKeys = new Set(this.tokenKeys);
    this.debug = process.env.DEBUG_PUMP_PORTAL_MONITOR === 'true';
    this.ws = null;
    this.reconnectDelayMs = 5000;
    this.shouldReconnect = true;
    // mint -> { mcapUsd?: number|null, mcapSol?: number|null, ts: number }
    this.mcapCache = new Map();
    this.mcapCacheTtl = 2000; // 2 seconds - unified with tradingEngine cache
  }

  start() {
    if (!this.url) return;
    this.connect();
  }

  stop() {
    this.shouldReconnect = false;
    this.ws?.close();
  }

  connect() {
    this.ws = new WebSocket(this.url);
    this.ws.on('open', () => this.handleOpen());
    this.ws.on('message', (data) => this.handleMessage(data));
    this.ws.on('error', (err) => this.emit('error', err));
    this.ws.on('close', () => {
      if (this.shouldReconnect) {
        setTimeout(() => this.connect(), this.reconnectDelayMs);
      }
    });
  }

  handleOpen() {
    this.send({ method: 'subscribeNewToken' });
    this.send({ method: 'subscribeMigration' });
    if (this.accountKeys.length > 0) {
      this.send({ method: 'subscribeAccountTrade', keys: this.accountKeys });
    }
    this.subscribeTokenTrades();
  }

  send(payload) {
    try {
      this.ws?.send(JSON.stringify(payload));
    } catch (e) {
      this.emit('error', e);
    }
  }

  setTokenKeys(keys = []) {
    const unique = Array.from(new Set(keys.filter(Boolean)));
    this.tokenKeys = unique;
    const next = new Set(unique);
    const toUnsubscribe = Array.from(this.subscribedTokenKeys).filter((key) => !next.has(key));
    if (toUnsubscribe.length > 0) {
      this.send({ method: 'unsubscribeTokenTrade', keys: toUnsubscribe });
    }
    this.subscribedTokenKeys = next;
    if (this.debug) {
      console.log(`PumpPortal monitor watching ${this.subscribedTokenKeys.size} token(s).`);
    }
    this.subscribeTokenTrades();
  }

  subscribeTokenTrades() {
    if (this.tokenKeys.length > 0) {
      this.send({ method: 'subscribeTokenTrade', keys: this.tokenKeys });
    }
  }

  handleMessage(data) {
    let message = null;
    try {
      const raw = typeof data === 'string' ? data : data.toString();
      message = JSON.parse(raw);
    } catch (e) {
      this.emit('error', e);
      return;
    }

    const mint = this.extractMint(message);
    const migrationState = this.extractMigrationState(message);
    const mcapUsd = this.extractMarketCapUsd(message);
    const mcapSol = this.extractMarketCapSol(message);

    // Cache market cap from trade messages
    if (mint) {
      const nextUsd = Number.isFinite(mcapUsd) && mcapUsd > 0 ? mcapUsd : null;
      const nextSol = Number.isFinite(mcapSol) && mcapSol > 0 ? mcapSol : null;
      if (nextUsd || nextSol) {
        const prev = this.mcapCache.get(mint) || { mcapUsd: null, mcapSol: null, ts: 0 };
        this.mcapCache.set(mint, {
          mcapUsd: nextUsd ?? prev.mcapUsd ?? null,
          mcapSol: nextSol ?? prev.mcapSol ?? null,
          ts: Date.now(),
        });
      }
    }

    if (migrationState !== null && mint) {
      this.emit('migration', { mint, state: migrationState, payload: message });
    }

    if (message?.method?.toLowerCase?.().includes('trade') || message?.type?.toLowerCase?.().includes('trade')) {
      if (this.debug && mint && this.subscribedTokenKeys.has(mint)) {
        console.log(`PumpPortal trade update received for ${mint.slice(0, 6)}…`);
      }
      this.emit('trade', { mint, payload: message });
    }
  }

  extractMint(message) {
    return (
      message?.mint ||
      message?.token ||
      message?.tokenMint ||
      message?.token_address ||
      message?.ca ||
      message?.data?.mint ||
      message?.data?.token ||
      message?.data?.tokenMint ||
      message?.data?.token_address ||
      message?.data?.ca ||
      null
    );
  }

  extractMigrationState(message) {
    const status =
      message?.status ||
      message?.migration_status ||
      message?.migrationStatus ||
      message?.data?.status ||
      message?.data?.migration_status ||
      message?.data?.migrationStatus ||
      null;
    const migrated =
      message?.migrated ??
      message?.is_migrated ??
      message?.migration_complete ??
      message?.data?.migrated ??
      message?.data?.is_migrated ??
      message?.data?.migration_complete ??
      null;
    const inProgress =
      message?.is_migrating ??
      message?.migrating ??
      message?.migration_in_progress ??
      message?.data?.is_migrating ??
      message?.data?.migrating ??
      message?.data?.migration_in_progress ??
      null;
    const progress =
      message?.migration_progress ??
      message?.data?.migration_progress ??
      null;

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

  extractMarketCapUsd(message) {
    // We treat "mcap" throughout the app as USD market cap (see UI `$` formatting + stop-loss logic).
    return (
      message?.usd_market_cap ??
      message?.usdMarketCap ??
      message?.data?.usd_market_cap ??
      message?.data?.usdMarketCap ??
      null
    );
  }

  extractMarketCapSol(message) {
    // SOL-denominated market cap (convert to USD using SOL/USD).
    return (
      message?.marketCapSol ??
      message?.market_cap_sol ??
      message?.data?.marketCapSol ??
      message?.data?.market_cap_sol ??
      null
    );
  }

  getMarketCapUsd(mint) {
    if (!mint) return null;
    const cached = this.mcapCache.get(mint);
    if (!cached) return null;
    if (Date.now() - cached.ts > this.mcapCacheTtl) {
      this.mcapCache.delete(mint);
      return null;
    }
    return cached.mcapUsd ?? null;
  }

  getMarketCapSol(mint) {
    if (!mint) return null;
    const cached = this.mcapCache.get(mint);
    if (!cached) return null;
    if (Date.now() - cached.ts > this.mcapCacheTtl) {
      this.mcapCache.delete(mint);
      return null;
    }
    return cached.mcapSol ?? null;
  }

  // Back-compat: keep method name used elsewhere.
  getMarketCap(mint) {
    if (!mint) return null;
    return this.getMarketCapUsd(mint);
  }
}
