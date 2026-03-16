import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, statSync, createReadStream } from 'fs';
import { randomBytes } from 'crypto';
import { StalkFunAPI } from './stalkfun-api.js';
import { TokenStore } from './token-store.js';
import { TradingEngine } from './trading-engine.js';
import { PumpPortalWebSocket } from './pump-portal-ws.js';
import { AuthService } from './auth-service.js';
import { UserTradingEngine } from './user-trading-engine.js';
import { StalkFunWebSocket } from './stalkfun-ws.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env from parent directory (.env first, then env.example as fallback)
const envFiles = ['.env', 'env.example'];
for (const file of envFiles) {
  const envPath = join(__dirname, '..', file);
  if (existsSync(envPath)) {
    console.log(`Loading config from ${file}`);
    const envContent = readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const match = trimmed.match(/([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!match) return;
      const key = match[1];
      let value = match[2].trim();
      value = value.replace(/\s+#.*$/, '').trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1).trim();
      }
      if (!value) return;
      if (!process.env[key]) {
        process.env[key] = value;
      }
    });
    break;
  }
}

// ── Global Console Logger ──
// Intercept ALL console output and persist to daily JSONL log files
// This captures everything: WS events, API polls, auth, errors — full system debug
import { appendFile } from 'fs';
const _origLog = console.log.bind(console);
const _origError = console.error.bind(console);
const _origWarn = console.warn.bind(console);

function persistLog(level, args) {
  try {
    const date = new Date().toISOString().slice(0, 10);
    const logDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'logs');
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
    const line = JSON.stringify({
      type: `system:${level}`,
      message: args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '),
      timestamp: new Date().toISOString(),
    }) + '\n';
    appendFile(join(logDir, `trading-log-${date}.jsonl`), line, () => { });
  } catch { /* never crash for logging */ }
}

console.log = (...args) => { _origLog(...args); persistLog('log', args); };
console.error = (...args) => { _origError(...args); persistLog('error', args); };
console.warn = (...args) => { _origWarn(...args); persistLog('warn', args); };

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

const authService = new AuthService();

const extractSession = (req) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  return token || req.body?.sessionToken || req.query?.sessionToken || null;
};

app.post('/api/auth/activate', async (req, res) => {
  const { wallet, plan, deviceId } = req.body || {};
  const result = await authService.activateLicense({ wallet, plan, deviceId });
  if (!result.ok) {
    return res.status(401).json({ error: result.error });
  }
  return res.json(result);
});

app.post('/api/auth/payment/start', async (req, res) => {
  const { wallet, plan } = req.body || {};
  const result = await authService.startPayment({ wallet, plan });
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

app.post('/api/auth/payment/confirm', async (req, res) => {
  const { wallet, plan, deviceId } = req.body || {};
  const timeoutMs = Number.parseInt(req.body?.timeoutMs || '60000', 10);
  const result = await authService.confirmPaymentAndActivateRealtime({ wallet, plan, deviceId, timeoutMs });
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

app.post('/api/auth/token-gate/verify', async (req, res) => {
  const { wallet, deviceId } = req.body || {};
  const timeoutMs = Number.parseInt(req.body?.timeoutMs || '60000', 10);
  const result = await authService.verifyTokenGatePaymentRealtime({ wallet, deviceId, timeoutMs });
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

app.post('/api/admin/revoke', async (req, res) => {
  const sessionToken = extractSession(req);
  const deviceId = req.body?.deviceId || req.query?.deviceId || null;
  const authResult = await authService.validateSession({ sessionToken, deviceId });
  if (!authResult.ok || authResult.plan !== 'admin') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { wallet, action } = req.body || {};
  if (!wallet) return res.status(400).json({ error: 'Missing wallet' });

  try {
    if (action === 'logout') {
      await authService.client
        .from('licenses')
        .update({ session_token: null, device_id: null })
        .eq('wallet', wallet);
    } else {
      // revoke = expire now + clear session
      await authService.client
        .from('licenses')
        .update({ session_token: null, device_id: null, expires_at: new Date().toISOString() })
        .eq('wallet', wallet);
    }
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

// ── Admin: Reset Paper Trading State ──────────────────────────────────────────
// Call this then restart the server to get a clean paper trading slate.
// Old state is backed up as paper-state.json.bak automatically.
app.post('/api/admin/reset-paper-state', async (req, res) => {
  const sessionToken = extractSession(req);
  const deviceId = req.body?.deviceId || req.query?.deviceId || null;
  const authResult = await authService.validateSession({ sessionToken, deviceId });
  if (!authResult.ok || authResult.plan !== 'admin') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Clear in-memory state immediately
    tradingEngine.positions.clear();
    tradingEngine.tradeCount = 0;
    tradingEngine.realizedProfitSol = 0;
    tradingEngine.distributionPoolSol = 0;
    const startingBalance = parseFloat(process.env.PAPER_STARTING_BALANCE);
    tradingEngine.balanceSol = Number.isFinite(startingBalance) ? startingBalance : 10;
    tradingEngine.emit('balance', tradingEngine.balanceSol);
    tradingEngine.emitPositions();
    tradingEngine.log('info', 'Paper trading state has been manually reset by admin.');
    return res.json({ ok: true, message: 'Paper state reset. Engine running fresh.', balanceSol: tradingEngine.balanceSol });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Reset failed' });
  }
});

app.post('/api/auth/validate', async (req, res) => {
  const sessionToken = extractSession(req);
  const deviceId = req.body?.deviceId || req.query?.deviceId || null;
  const result = await authService.validateSession({ sessionToken, deviceId });
  if (!result.ok) {
    return res.status(401).json({ error: result.error });
  }
  return res.json(result);
});

app.post('/api/auth/logout', async (req, res) => {
  const sessionToken = extractSession(req);
  const deviceId = req.body?.deviceId || req.query?.deviceId || null;
  const result = await authService.logout({ sessionToken, deviceId });
  if (!result.ok) {
    return res.status(401).json({ error: result.error });
  }
  return res.json({ ok: true });
});

app.get('/api/auth/token-gate', (req, res) => {
  res.json(authService.getTokenGateInfo());
});

// Serve static files from client build
const clientDist = join(__dirname, '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

// Initialize API and store
const api = new StalkFunAPI();
let printScanAuthWarningAt = 0;
let memeRadarShapeWarningAt = 0;
let memeRadarFailureWarningAt = 0;
let lastGoodMemeRadarPayload = null;
let lastGoodMemeRadarAt = 0;
let vipRateLimitedUntil = 0;
let lastVipFetchAt = 0;
let vipBackoffWarningAt = 0;
const tokenStore = new TokenStore();
const backfilled = tokenStore.backfillMissingMetrics(5000);
if (backfilled > 0) {
  console.log(`Backfilled metrics for ${backfilled} tokens`);
}
const tsFixed = tokenStore.backfillTimestamps();
if (tsFixed > 0) {
  console.log(`Fixed timestamps for ${tsFixed} tokens`);
}

const VISIBLE_REFRESH_LIMIT = Number.parseInt(process.env.VISIBLE_REFRESH_LIMIT || '15', 10);
const REALTIME_MCAP_BROADCAST_INTERVAL_MS = Number.parseInt(process.env.REALTIME_MCAP_BROADCAST_INTERVAL_MS || '3000', 10); // 3s for real-time updates
const REALTIME_MCAP_BROADCAST_LIMIT = Number.parseInt(process.env.REALTIME_MCAP_BROADCAST_LIMIT || '60', 10);
const REALTIME_MCAP_BROADCAST_CONCURRENCY = Number.parseInt(process.env.REALTIME_MCAP_BROADCAST_CONCURRENCY || '5', 10); // Higher concurrency
const REALTIME_MCAP_BROADCAST_MIN_PCT_CHANGE = Number.parseFloat(process.env.REALTIME_MCAP_BROADCAST_MIN_PCT_CHANGE || '0'); // 0% - always update for real-time accuracy
const REALTIME_MCAP_UPDATE_LOOKUPS_PER_CYCLE = Number.parseInt(process.env.REALTIME_MCAP_UPDATE_LOOKUPS_PER_CYCLE || '20', 10);

const pumpPortalWs = new PumpPortalWebSocket({
  url: process.env.PUMP_PORTAL_WS_URL || 'wss://pumpportal.fun/api/data',
  tokenKeys: [],
});

const tradingEngine = new TradingEngine({ tokenStore, pumpPortalWs });
tradingEngine.start();

// Initialize User Trading Engine (handles user wallets with 1s delay after AI trades)
const userTradingEngine = new UserTradingEngine({ tradingEngine });
userTradingEngine.initialize().catch(err => {
  console.error('UserTradingEngine initialization error:', err?.message || err);
});

// Update PumpPortal accountKeys after tradingEngine is initialized
pumpPortalWs.accountKeys = (tradingEngine.walletAddress || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

pumpPortalWs.on('migration', ({ mint, state }) => {
  tradingEngine.setMigrationState(mint, state, 'pumpportal');

  // If this is a migration complete event (state=false) and we have an active position,
  // immediately refresh the market cap from DexScreener for accurate pricing
  if (state === false && mint && tradingEngine.positions.has(mint)) {
    const position = tradingEngine.positions.get(mint);
    console.log(`Migration complete for active position ${position?.symbol || mint.slice(0, 6)} - switching to DexScreener mcap`);

    // Force refresh mcap from DexScreener (since migration is now cached, getRealtimeMcap will use DexScreener)
    tradingEngine.getRealtimeMcap(mint, true).then(mcap => {
      if (Number.isFinite(mcap) && mcap > 0) {
        tradingEngine.updatePositions([{ mint, latest_mcap: mcap }], 'realtime').then(() => {
          tradingEngine.emitPositions();
        });
      }
    }).catch(err => {
      console.error(`Error refreshing mcap after migration for ${mint?.slice(0, 8)}:`, err?.message || err);
    });
  }
});

// Connect PumpPortal WS trade events to trigger immediate position updates
// This provides near-instant market cap updates when trades occur (vs 3s polling)
// Also detects manual sells from TRADING_WALLET_ADDRESS as fallback
pumpPortalWs.on('trade', ({ mint, payload }) => {
  if (mint && tradingEngine.positions.has(mint)) {
    // Check if this is a sell from our trading wallet (fallback detection)
    const txType = payload?.txType || payload?.data?.txType;
    const traderPublicKey = payload?.traderPublicKey || payload?.data?.traderPublicKey;
    if (txType === 'sell' && traderPublicKey && tradingEngine.walletAddress &&
      traderPublicKey === tradingEngine.walletAddress) {
      // Manual sell detected via PumpPortal WS - immediately check balance via Helius
      tradingEngine.checkWalletSells().catch(err => {
        console.error(`Error checking wallet sell via PumpPortal WS for ${mint?.slice(0, 8)}:`, err?.message || err);
      });
    }

    // Trigger immediate position update with real-time market cap from WebSocket
    // This ensures 0-delay trigger evaluation instead of waiting for 3s polling cycle
    tradingEngine.handleRealtimeTrade({ mint, payload }).then(() => {
      // Immediately emit updated positions to all connected clients
      tradingEngine.emitPositions();
    }).catch(err => {
      console.error(`Error handling PumpPortal trade update for ${mint?.slice(0, 8)}:`, err?.message || err);
    });
  }
});

pumpPortalWs.on('error', (err) => {
  console.error('PumpPortal WS error:', err?.message || err);
});

pumpPortalWs.start();

// Signal tracking is handled purely through stalk.fun APIs (no PumpPortal signals)

const syncWatchedTokens = () => {
  pumpPortalWs.setTokenKeys(tradingEngine.getOpenPositionMints());
};

tradingEngine.on('positions', (positions) => {
  syncWatchedTokens();
  broadcast({ type: 'positions', data: positions });
  broadcastToPublic({ type: 'positions', data: positions });
});

syncWatchedTokens();

const redactMessage = (message = '') => {
  return message
    .replace(/[1-9A-HJ-NP-Za-km-z]{32,}/g, '…')
    .replace(/txid:\s*[A-Za-z0-9]+/gi, 'txid: …');
};

const sanitizeActivity = (entry) => ({
  type: entry?.type || 'info',
  message: redactMessage(entry?.message || ''),
  timestamp: entry?.timestamp || new Date().toISOString(),
});

tradingEngine.on('activity', (entry) => {
  broadcast({ type: 'activity', data: sanitizeActivity(entry) });
  broadcastToPublic({ type: 'activity', data: sanitizeActivity(entry) });
});

tradingEngine.on('balance', (balanceSol) => {
  broadcast({ type: 'balance', data: { balanceSol } });
  broadcastToPublic({ type: 'balance', data: { balanceSol } });
});

tradingEngine.on('realizedProfit', (realizedProfitSol) => {
  broadcast({ type: 'realizedProfit', data: { realizedProfitSol } });
  broadcastToPublic({ type: 'realizedProfit', data: { realizedProfitSol } });
});

tradingEngine.on('holders', (holders) => {
  broadcast({ type: 'holders', data: { holders } });
  // Auto token gate: monitor holder licenses using existing holder data
  if (authService.autoTokenGateEnabled) {
    authService.monitorHolderLicensesFromList(holders).catch(err => {
      console.error('Auto token gate monitor error:', err?.message || err);
    });
  }
});

const extractMemeRadarTokens = (memeRadar) => {
  const memeData = memeRadar?.data;
  return (
    (Array.isArray(memeData) ? memeData : null) ||
    (Array.isArray(memeData?.data) ? memeData.data : null) ||
    memeRadar?.tokens ||
    memeRadar?.results ||
    memeRadar?.items ||
    []
  );
};

const extractPrintScanTokens = (printScan) => {
  return printScan?.tokens || printScan?.data || printScan?.items || [];
};

const tryParseJson = (value) => {
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const tryDecodeBase64Json = (value) => {
  if (typeof value !== 'string' || value.length < 16) return null;
  // Fast gate: skip obvious non-base64 strings
  if (!/^[A-Za-z0-9+/=]+$/.test(value)) return null;
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    const parsed = tryParseJson(decoded);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const normalizeApiPayload = (data) => {
  if (!data) return data;

  // Entire response encoded as JSON string/base64 string
  if (typeof data === 'string') {
    return tryParseJson(data) || tryDecodeBase64Json(data) || data;
  }

  // Common stalk.fun VIP shape: { data: "<base64-json>", userTier, userId }
  if (data && typeof data === 'object' && typeof data.data === 'string') {
    const parsedData = tryParseJson(data.data) || tryDecodeBase64Json(data.data);
    if (parsedData && typeof parsedData === 'object') {
      return { ...data, data: parsedData.data ?? parsedData.tokens ?? parsedData.items ?? parsedData.results ?? parsedData };
    }
  }

  return data;
};

const extractTokenArray = (data) => {
  const normalized = normalizeApiPayload(data);
  if (!normalized) return [];
  if (Array.isArray(normalized)) return normalized;

  const list =
    (Array.isArray(normalized?.data) ? normalized.data : null) ||
    (Array.isArray(normalized?.data?.data) ? normalized.data.data : null) ||
    (Array.isArray(normalized?.data?.tokens) ? normalized.data.tokens : null) ||
    (Array.isArray(normalized?.data?.items) ? normalized.data.items : null) ||
    (Array.isArray(normalized?.tokens) ? normalized.tokens : null) ||
    (Array.isArray(normalized?.items) ? normalized.items : null) ||
    (Array.isArray(normalized?.results) ? normalized.results : null) ||
    (Array.isArray(normalized?.payload?.data) ? normalized.payload.data : null) ||
    [];

  return Array.isArray(list) ? list : [];
};

const resolveMemeRadarPayload = ({ payload, fetchError = null }) => {
  const extracted = extractTokenArray(payload);
  if (extracted.length > 0) {
    lastGoodMemeRadarPayload = payload;
    lastGoodMemeRadarAt = Date.now();
    return { payload, count: extracted.length, fallbackUsed: false };
  }

  const now = Date.now();
  const hasCached = !!lastGoodMemeRadarPayload;
  if (hasCached) {
    const ageSec = Math.floor((now - lastGoodMemeRadarAt) / 1000);
    if (now - memeRadarFailureWarningAt > 15000) {
      memeRadarFailureWarningAt = now;
      const reason = fetchError?.message || 'empty payload';
      console.warn(`[MemeRadar] Using last-good snapshot (${ageSec}s old) due to: ${reason}`);
    }
    return {
      payload: lastGoodMemeRadarPayload,
      count: extractTokenArray(lastGoodMemeRadarPayload).length,
      fallbackUsed: true,
    };
  }

  return { payload, count: 0, fallbackUsed: false };
};

const isRateLimitError = (error) => {
  const msg = (error?.message || '').toLowerCase();
  return msg.includes('429') || msg.includes('too many requests');
};

const withVipRateLimitGuard = async (fetchFn, endpointLabel) => {
  try {
    return { data: await fetchFn(), error: null };
  } catch (error) {
    if (isRateLimitError(error)) {
      const backoffMs = Number.parseInt(process.env.STALKFUN_VIP_RATE_LIMIT_BACKOFF_MS || '20000', 10);
      vipRateLimitedUntil = Date.now() + Math.max(5000, backoffMs);
      if (Date.now() - vipBackoffWarningAt > 5000) {
        vipBackoffWarningAt = Date.now();
        console.warn(`[Layer2] VIP rate-limited on ${endpointLabel}. Backing off all VIP fetches for ${Math.round((vipRateLimitedUntil - Date.now()) / 1000)}s.`);
      }
    }
    return { data: null, error };
  }
};

// Ingest helper — extract tokens from any stalk.fun API response shape
const ingestApiTokens = (data, source) => {
  if (!data) return 0;
  let count = 0;
  // Handle trending's nested structure: { data: { swaps_1m: [], swaps_5m: [] } }
  if (source === 'trending' && data?.data) {
    const swaps1m = data.data.swaps_1m || [];
    const swaps5m = data.data.swaps_5m || [];
    for (const token of [...swaps5m, ...swaps1m]) {
      if (!token || typeof token !== 'object') continue;
      const mint = token.mint || token.token_address || token.address;
      if (!mint) continue;
      // Only ingest pump.fun tokens — matches trading engine filter
      if (!mint.endsWith('pump')) continue;
      // Enrich with momentum data from trending response
      token._momentum = {
        price_change_1m: token.price_change_percent1m,
        price_change_5m: token.price_change_percent5m ?? token.price_change_percent,
        price_change_1h: token.price_change_percent1h,
        volume_24h: token.volume_24h,
        transactions_24h: token.transactions_24h,
      };
      const isNew = tokenStore.upsertToken(token, source);
      const cooldownOk = Date.now() - SERVER_STARTED_AT > STARTUP_COOLDOWN_MS && Date.now() - lastAuthReloadAt > STARTUP_COOLDOWN_MS;
      if (isNew && tradingEngine && baselinePopulated && (source === 'print_scan' || source === 'meme_radar') && cooldownOk) {
        tradingEngine.handleNewSignal(token, source).catch(e => console.error(e));
      }
      count++;
    }
    return count;
  }
  // Handle koth: { data: [...] }
  const list = data?.data || data?.tokens || data?.items || (Array.isArray(data) ? data : []);
  if (!Array.isArray(list)) return 0;
  for (const token of list) {
    if (!token || typeof token !== 'object') continue;
    const mint = token.mint || token.token_address || token.address;
    if (!mint) continue;
    // Only ingest pump.fun tokens (mint ends with "pump") — matches trading engine filter
    if (!mint.endsWith('pump')) continue;
    const isNew = tokenStore.upsertToken(token, source);
    const cooldownOk2 = Date.now() - SERVER_STARTED_AT > STARTUP_COOLDOWN_MS && Date.now() - lastAuthReloadAt > STARTUP_COOLDOWN_MS;
    if (isNew && tradingEngine && baselinePopulated && (source === 'print_scan' || source === 'meme_radar') && cooldownOk2) {
      tradingEngine.handleNewSignal(token, source).catch(e => console.error(e));
    }
    count++;
  }
  return count;
};

// Refresh visible tokens before sending snapshots; live events remain unchanged.
const refreshVisibleTokens = async () => {
  // PUBLIC ENDPOINTS (always available)
  try {
    const [movers, trending, koth, dexPaid, liveScan] = await Promise.all([
      api.fetchMovers().catch(() => null),
      api.fetchTrending().catch(() => null),
      api.fetchKoth().catch(() => null),
      api.fetchDexPaid().catch(() => null),
      api.fetchLiveScan(100, '1h').catch(() => null),
    ]);
    if (movers) ingestApiTokens(movers, 'movers');
    if (trending) ingestApiTokens(trending, 'trending');
    if (koth) ingestApiTokens(koth, 'koth');
    if (dexPaid) ingestApiTokens(dexPaid, 'dex_paid');
    if (liveScan) ingestApiTokens(liveScan, 'live_scan');
  } catch (e) {
    // non-fatal
  }

  // AUTH-REQUIRED ENDPOINTS (VIP)
  if (api.isAuthenticated()) {
    try {
      const now = Date.now();
      if (vipRateLimitedUntil > now) {
        return;
      }
      const [memeRadarResult, printScanResult, smartPumpResult, tokenTrackerResult] = await Promise.all([
        withVipRateLimitGuard(() => api.fetchMemeRadar('recency', 50), 'meme-radar'),
        withVipRateLimitGuard(() => api.fetchLeaderboard(200, 0, true), 'print-scan'),
        withVipRateLimitGuard(() => api.fetchSmartPump(500), 'smart-pump'),
        withVipRateLimitGuard(() => api.fetchTokenTracker('combined', 50), 'token-tracker'),
      ]);
      const printScan = printScanResult.data;
      const smartPump = smartPumpResult.data;
      const tokenTracker = tokenTrackerResult.data;
      const resolvedMR = resolveMemeRadarPayload({ payload: memeRadarResult.data, fetchError: memeRadarResult.error });
      if (resolvedMR.payload && resolvedMR.count > 0) ingestApiTokens(resolvedMR.payload, 'meme_radar');
      if (printScan) ingestApiTokens(printScan, 'print_scan');
      if (smartPump) ingestApiTokens(smartPump, 'smart_pump');
      if (tokenTracker) ingestApiTokens(tokenTracker, 'token_tracker');
    } catch (error) {
      console.warn('Refresh-visible auth fetch failed:', error?.message || error);
    }
  }
};

const mapWithConcurrency = async (items, concurrency, fn) => {
  const list = Array.isArray(items) ? items : [];
  const limit = Math.max(1, Number.parseInt(concurrency, 10) || 1);
  const results = new Array(list.length);
  let idx = 0;
  const worker = async () => {
    while (true) {
      const i = idx++;
      if (i >= list.length) return;
      results[i] = await fn(list[i], i);
    }
  };
  const workers = Array.from({ length: Math.min(limit, list.length) }, worker);
  await Promise.all(workers);
  return results;
};

const attachRealtimeMcapField = async (tokens, { limit = 30, forceRefresh = false } = {}) => {
  const list = Array.isArray(tokens) ? tokens : [];
  const capped = list.slice(0, Math.max(0, limit));
  const withMcap = await mapWithConcurrency(
    capped,
    REALTIME_MCAP_BROADCAST_CONCURRENCY,
    async (token) => {
      const mint = token?.address || token?.mint || token?.token_address;
      if (!mint || !tradingEngine?.getRealtimeMcap) return token;
      try {
        // PRIORITY: Always check PumpPortal WS cache first (even on forceRefresh)
        // This prevents stale data on refresh - use real-time WS data if available
        let realtimeMcap = null;
        if (pumpPortalWs) {
          const wsMcapUsd = pumpPortalWs.getMarketCapUsd(mint);
          if (Number.isFinite(wsMcapUsd) && wsMcapUsd > 0) {
            realtimeMcap = wsMcapUsd;
          } else {
            // Try SOL market cap and convert to USD
            const wsMcapSol = pumpPortalWs.getMarketCapSol(mint);
            if (Number.isFinite(wsMcapSol) && wsMcapSol > 0) {
              try {
                const solUsd = await tradingEngine.helius.getSolUsdPrice();
                if (Number.isFinite(solUsd) && solUsd > 0) {
                  realtimeMcap = wsMcapSol * solUsd;
                }
              } catch {
                // Fall through to getRealtimeMcap
              }
            }
          }
        }

        // Fallback to getRealtimeMcap if PumpPortal WS doesn't have data
        // On forceRefresh, this will bypass cache and fetch fresh from API
        if (!Number.isFinite(realtimeMcap) || realtimeMcap <= 0) {
          realtimeMcap = await tradingEngine.getRealtimeMcap(mint, forceRefresh);
        }

        if (!Number.isFinite(realtimeMcap) || realtimeMcap <= 0) return token;
        // Important: keep stored/latest mcap intact; publish helius mcap separately.
        return { ...token, realtime_mcap: realtimeMcap, realtime_mcap_ts: Date.now() };
      } catch {
        return token;
      }
    }
  );
  // Preserve original order; only first `limit` tokens get realtime fields.
  return [...withMcap, ...list.slice(capped.length)];
};

// Track connected WebSocket clients
const clients = new Set();
const publicClients = new Set();

// No artificial delays — all data is broadcast instantly to all clients

wss.on('connection', async (ws, req) => {
  try {
    const requestUrl = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);

    // Check if this is a public connection (no authentication required)
    if (requestUrl.pathname === '/public' || requestUrl.searchParams.get('public') === 'true') {
      publicClients.add(ws);
      console.log(`Public client connected. Total: ${publicClients.size}`);

      const recentPublic = getRecentPublicTokens(200);
      ws.send(JSON.stringify({
        type: 'init',
        data: {
          tokens: recentPublic,
          stats: tokenStore.getStats(),
          trading: {
            ...tradingEngine.getState(),
            activityLog: tradingEngine.activityLog.map(sanitizeActivity),
          }
        }
      }));

      ws.on('close', () => {
        publicClients.delete(ws);
        console.log(`Public client disconnected. Total: ${publicClients.size}`);
      });
      return;
    }

    // Authenticated connection flow
    const sessionToken = requestUrl.searchParams.get('token');
    const deviceId = requestUrl.searchParams.get('deviceId');
    const authResult = await authService.validateSession({ sessionToken, deviceId });
    if (!authResult.ok) {
      ws.close(1008, 'unauthorized');
      return;
    }
    ws.auth = authResult;

    clients.add(ws);
    console.log(`Client connected. Total: ${clients.size}`);

    // Send current state on connect - fetch fresh data BEFORE sending
    await refreshVisibleTokens();
    const refreshTokens = tokenStore.getAllTokens();

    // CRITICAL: Force fresh mcap fetch (bypass cache) before sending snapshot
    // This ensures client always receives accurate data on refresh, never stale cache
    const tokensWithRealtimeMcap = await attachRealtimeMcapField(refreshTokens, {
      limit: REALTIME_MCAP_BROADCAST_LIMIT,
      forceRefresh: true
    });

    const snapshot = {
      type: 'refresh',
      data: {
        tokens: tokensWithRealtimeMcap,
        stats: tokenStore.getStats(),
        trading: {
          ...tradingEngine.getState(),
          activityLog: tradingEngine.activityLog.map(sanitizeActivity),
        }
      }
    };
    ws.send(JSON.stringify(snapshot));
  } catch (error) {
    console.error('Error sending initial snapshot:', error);
    ws.close(1011, 'server_error');
    return;
  }

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`Client disconnected. Total: ${clients.size}`);
  });
});

function broadcast(message) {
  const data = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(data);
    }
  });
}

function broadcastToPublic(message) {
  const data = JSON.stringify(message);
  publicClients.forEach(client => {
    if (client.readyState === 1) {
      client.send(data);
    }
  });
}

function getRecentPublicTokens(limit = 200) {
  return tokenStore.getAllTokens()
    .sort((a, b) => {
      const aTime = new Date(a.first_seen_local || 0).getTime();
      const bTime = new Date(b.first_seen_local || 0).getTime();
      return bTime - aTime;
    })
    .slice(0, limit);
}

// API Routes
app.get('/api/signals', (req, res) => {
  const allTokens = tokenStore.getAllTokens()
    .sort((a, b) => new Date(b.first_seen_local || 0).getTime() - new Date(a.first_seen_local || 0).getTime())
    .slice(0, 200);
  res.json({ ok: true, signals: allTokens, total: tokenStore.getStats().totalTokens });
});

app.get('/api/status', (req, res) => {
  res.json({
    authenticated: api.authMode === 'privy' && api.isAuthenticated(),
    authMode: api.authMode,
    tokenExpiry: api.tokenExpiry ? new Date(api.tokenExpiry).toISOString() : null,
    timeUntilExpiry: api.tokenExpiry ? Math.max(0, api.tokenExpiry - Date.now()) : null,
    tokenCount: tokenStore.getStats().totalTokens,
    lastUpdate: tokenStore.getStats().lastUpdate
  });
});

app.get('/api/trading/state', (req, res) => {
  res.json(tradingEngine.getState());
});

app.get('/api/trading/balance', async (req, res) => {
  res.json({ balanceSol: tradingEngine.balanceSol });
});

app.get('/api/trading/holders', (req, res) => {
  res.json({ holders: tradingEngine.holders });
});

app.get('/api/trading/activity', (req, res) => {
  res.json({ activity: tradingEngine.activityLog.map(sanitizeActivity) });
});

// ── Persistent Log Download ──
app.get('/api/logs/download', (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const logPath = join(process.cwd(), 'logs', `trading-log-${date}.jsonl`);
  if (!existsSync(logPath)) {
    return res.status(404).json({ error: `No log file for ${date}` });
  }
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Content-Disposition', `attachment; filename="trading-log-${date}.jsonl"`);
  createReadStream(logPath).pipe(res);
});

app.get('/api/logs/list', (req, res) => {
  const logDir = join(process.cwd(), 'logs');
  if (!existsSync(logDir)) return res.json({ files: [] });
  const files = readdirSync(logDir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({ name: f, size: statSync(join(logDir, f)).size }))
    .sort((a, b) => b.name.localeCompare(a.name));
  res.json({ files });
});

app.get('/api/tokens', (req, res) => {
  const { sort = 'first_seen', order = 'desc', limit = 100 } = req.query;
  res.json(tokenStore.getTokens({ sort, order, limit: parseInt(limit) }));
});

app.get('/api/tokens/:address', (req, res) => {
  const token = tokenStore.getToken(req.params.address);
  if (token) {
    res.json(token);
  } else {
    res.status(404).json({ error: 'Token not found' });
  }
});

app.get('/api/stats', (req, res) => {
  res.json(tokenStore.getStats());
});

app.post('/api/refresh', async (req, res) => {
  try {
    await api.refreshAuth();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== HOT AUTH RELOAD (no restart) ==========
const AUTH_RELOAD_KEY_FILE = join(__dirname, '..', '.auth-reload-key');
let authReloadKey = process.env.AUTH_RELOAD_KEY || '';
if (!authReloadKey) {
  if (existsSync(AUTH_RELOAD_KEY_FILE)) {
    authReloadKey = readFileSync(AUTH_RELOAD_KEY_FILE, 'utf-8').trim();
  } else {
    authReloadKey = randomBytes(24).toString('hex');
    writeFileSync(AUTH_RELOAD_KEY_FILE, authReloadKey, 'utf-8');
    console.log(`[Auth Reload] Generated API key → .auth-reload-key (use in extension)`);
  }
}

app.post('/api/admin/auth-reload', (req, res) => {
  const key = req.headers['x-auth-reload-key'] || req.body?.key;
  if (key !== authReloadKey) {
    return res.status(403).json({ ok: false, error: 'Invalid reload key' });
  }

  const { cookies } = req.body || {};
  if (!cookies || typeof cookies !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing cookies string' });
  }

  const result = api.hotSwapAuth(cookies);
  if (!result.ok) {
    return res.status(400).json(result);
  }

  // Hot-swap the WS connection with fresh auth — always reconnect
  stalkFunWs.cookies = api.cookies;
  stalkFunWs.bearer = api.bearer;

  // CRITICAL: Reset baseline + enforce 30s cooldown (same as server restart).
  baselinePopulated = false;
  lastAuthReloadAt = Date.now();
  _prevSnapshot.print_scan.clear();
  _prevSnapshot.meme_radar.clear();
  console.log(`[Auth Reload] Hot-swapped auth. Mode: ${api.authMode}, expires: ${result.expiresAt}`);
  console.log(`[Auth Reload] Reset baseline + 30s cooldown — no signals until ${new Date(lastAuthReloadAt + STARTUP_COOLDOWN_MS).toLocaleTimeString()}.`);
  console.log(`[Auth Reload] Reconnecting WS with fresh tokens (was ${stalkFunWs.connected ? 'connected' : 'OFFLINE'})...`);
  stalkFunWs.start();
  return res.json({ ok: true, authMode: api.authMode, expiresAt: result.expiresAt });
});

// ========== USER WALLET API ENDPOINTS ==========

// Register/import user wallet WITH PRIVATE KEY
app.post('/api/user/register', async (req, res) => {
  const { privateKey } = req.body || {};
  if (!privateKey) {
    return res.status(400).json({ error: 'Missing private key' });
  }

  const result = await userTradingEngine.registerWithPrivateKey(privateKey.trim());
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }

  // Return user state (never return private key back)
  const userState = userTradingEngine.getUserState(result.walletAddress);
  return res.json({ ok: true, ...userState, isNew: result.isNew, walletAddress: result.walletAddress });
});

// Generate new wallet - RETURNS PRIVATE KEY ONCE!
app.post('/api/user/generate', async (req, res) => {
  const result = await userTradingEngine.generateWallet();
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }

  // Return user state WITH private key (show only once!)
  const userState = userTradingEngine.getUserState(result.walletAddress);
  return res.json({
    ok: true,
    ...userState,
    isNew: true,
    walletAddress: result.walletAddress,
    privateKey: result.privateKey,
    warning: result.warning,
  });
});

// Get user configuration
app.get('/api/user/config/:wallet', async (req, res) => {
  const { wallet } = req.params;
  if (!wallet) {
    return res.status(400).json({ error: 'Missing wallet address' });
  }

  const result = await userTradingEngine.getUserConfig(wallet);
  if (!result.ok) {
    return res.status(404).json({ error: result.error });
  }
  return res.json(result.config);
});

// Update user configuration
app.put('/api/user/config/:wallet', async (req, res) => {
  const { wallet } = req.params;
  const updates = req.body || {};

  if (!wallet) {
    return res.status(400).json({ error: 'Missing wallet address' });
  }

  const result = await userTradingEngine.updateUserConfig(wallet, updates);
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  return res.json({ ok: true, config: result.config });
});

// Get user positions
app.get('/api/user/positions/:wallet', (req, res) => {
  const { wallet } = req.params;
  if (!wallet) {
    return res.status(400).json({ error: 'Missing wallet address' });
  }

  const positions = userTradingEngine.getUserPositions(wallet);
  return res.json({ positions });
});

// Withdraw SOL from user wallet
app.post('/api/user/withdraw/:wallet', async (req, res) => {
  const { wallet } = req.params;
  const { destinationAddress, amount } = req.body || {};

  if (!wallet) {
    return res.status(400).json({ error: 'Missing wallet address' });
  }
  if (!destinationAddress) {
    return res.status(400).json({ error: 'Missing destination address' });
  }
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid withdrawal amount' });
  }

  const result = await userTradingEngine.withdrawSol(wallet, destinationAddress, amount);
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  return res.json({ ok: true, signature: result.signature, amount: result.amountSol });
});

// Get user balance
app.get('/api/user/balance/:wallet', async (req, res) => {
  const { wallet } = req.params;
  if (!wallet) {
    return res.status(400).json({ error: 'Missing wallet address' });
  }

  const result = await userTradingEngine.getBalance(wallet);
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  return res.json({ ok: true, balance: result.balance });
});

// Get user statistics
app.get('/api/user/stats/:wallet', async (req, res) => {
  const { wallet } = req.params;
  if (!wallet) {
    return res.status(400).json({ error: 'Missing wallet address' });
  }

  const result = await userTradingEngine.getUserStats(wallet);
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result.stats || {});
});

// Get full user state
app.get('/api/user/state/:wallet', (req, res) => {
  const { wallet } = req.params;
  if (!wallet) {
    return res.status(400).json({ error: 'Missing wallet address' });
  }

  const userState = userTradingEngine.getUserState(wallet);
  return res.json(userState);
});

// User logout
app.post('/api/user/logout', async (req, res) => {
  const { wallet } = req.body || {};
  if (!wallet) {
    return res.status(400).json({ error: 'Missing wallet address' });
  }

  const result = await userTradingEngine.logoutUser(wallet);
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  return res.json({ ok: true });
});

// Polling function to fetch new data
let initialized = false;
let pollInFlight = false;
let baselinePopulated = false; // true after first full poll cycle completes (baseline loaded)
const SERVER_STARTED_AT = Date.now();
const STARTUP_COOLDOWN_MS = 30000; // 30s — suppress trade signals while initial API dump loads
let lastAuthReloadAt = 0; // reset on auth reload — enforces same 30s cooldown as startup

// ── Layer 3: Differential Snapshot Comparison ────────────────────────────────
// Track previous poll mint sets so we can detect genuinely new emits even if
// token store already has the token from another source (e.g. movers).
const _prevSnapshot = { print_scan: new Set(), meme_radar: new Set() };

async function pollStalkFun() {
  if (pollInFlight) return;
  pollInFlight = true;
  const newTokens = [];
  const updatedTokens = [];

  // Sources that are allowed to generate auto-trading signals.
  // EXCLUSIVE: Only Print Scan and Meme Radar from stalk.fun VIP APIs.
  // These are the only proven high-signal feeds (80% and 66% success rates).
  const SIGNAL_SOURCES = new Set(['print_scan', 'meme_radar', 'printscan', 'memeradar', 'meme-radar', 'print-scan']);

  // Generic ingestion — returns { new: Token[], updated: Token[], tradeSignals: Token[] }
  const ingestTokenList = (data, source) => {
    const result = { new: [], updated: [], tradeSignals: [] };
    const normalizedData = normalizeApiPayload(data);
    if (!normalizedData) return result;

    // Handle trending's nested structure
    if (source === 'trending' && normalizedData?.data) {
      const swaps1m = normalizedData.data.swaps_1m || [];
      const swaps5m = normalizedData.data.swaps_5m || [];
      const VIP_SOURCES = new Set(['print_scan', 'meme_radar', 'smart_pump', 'token_tracker']);
      for (const token of [...swaps5m, ...swaps1m]) {
        if (!token || typeof token !== 'object') continue;
        const mint = token.mint || token.token_address || token.address;
        if (!mint) continue;
        // Only pump.fun tokens for public feeds; VIP sources are exempt
        if (!VIP_SOURCES.has(source) && !mint.endsWith('pump')) continue;
        token._momentum = {
          price_change_1m: token.price_change_percent1m,
          price_change_5m: token.price_change_percent5m ?? token.price_change_percent,
          price_change_1h: token.price_change_percent1h,
          volume_24h: token.volume_24h,
          transactions_24h: token.transactions_24h,
        };
        const isNew = tokenStore.upsertToken(token, source);
        const record = tokenStore.getToken(mint);
        if (isNew && record) result.new.push({ ...record, isNew: true });
        else if (record) result.updated.push(record);

        const now_ = Date.now();
        if (SIGNAL_SOURCES.has(source) && isNew && record && baselinePopulated && now_ - SERVER_STARTED_AT > STARTUP_COOLDOWN_MS && now_ - lastAuthReloadAt > STARTUP_COOLDOWN_MS) {
          result.tradeSignals.push(record);
        }
      }
      return result;
    }

    // Standard shape: { data: [...] } or { tokens: [...] } or array
    const list = extractTokenArray(normalizedData);

    if (!Array.isArray(list)) return result;
    const seenAddresses = new Set();

    const VIP_SOURCES_STD = new Set(['print_scan', 'meme_radar', 'smart_pump', 'token_tracker']);
    for (const token of list) {
      if (!token || typeof token !== 'object') continue;
      const mint = token.mint || token.token_address || token.address || token.mintAddress;
      if (!mint || seenAddresses.has(mint)) continue;
      // Only pump.fun tokens for public feeds; VIP sources are exempt
      if (!VIP_SOURCES_STD.has(source) && !mint.endsWith('pump')) continue;
      seenAddresses.add(mint);

      const existing = tokenStore.getToken(mint);
      const existingSources = (existing?.sources || existing?.source || '').split(',').map(s => s.trim()).filter(Boolean);
      const hadSource = existingSources.includes(source);

      const isNew = tokenStore.upsertToken(token, source);
      const record = tokenStore.getToken(mint);
      if (isNew && record) {
        result.new.push({ ...record, isNew: true });
      } else if (record) {
        result.updated.push(record);
      }

      const now__ = Date.now();
      if (SIGNAL_SOURCES.has(source) && !hadSource && record && baselinePopulated && now__ - SERVER_STARTED_AT > STARTUP_COOLDOWN_MS && now__ - lastAuthReloadAt > STARTUP_COOLDOWN_MS) {
        result.tradeSignals.push(record);
      }
    }

    if (source === 'print_scan') {
      tokenStore.syncSourceSnapshot('print_scan', Array.from(seenAddresses));
    }
    return result;
  };

  try {
    // ── PUBLIC ENDPOINTS (always available, no auth) ──
    const [movers, trending, koth, dexPaid, liveScan] = await Promise.all([
      api.fetchMovers().catch(() => null),
      api.fetchTrending().catch(() => null),
      api.fetchKoth().catch(() => null),
      api.fetchDexPaid().catch(() => null),
      api.fetchLiveScan(100, '1h').catch(() => null),
    ]);

    const allTradeSignals = [];

    for (const [data, source] of [
      [movers, 'movers'], [trending, 'trending'], [koth, 'koth'],
      [dexPaid, 'dex_paid'], [liveScan, 'live_scan'],
    ]) {
      const r = ingestTokenList(data, source);
      newTokens.push(...r.new);
      updatedTokens.push(...r.updated);
      allTradeSignals.push(...r.tradeSignals);
    }

    // ── AUTH-REQUIRED ENDPOINTS (VIP) ──
    const VIP_FETCH_INTERVAL_MS = Number.parseInt(process.env.VIP_FETCH_INTERVAL_MS || '4000', 10);
    const now = Date.now();
    const vipBackoffActive = vipRateLimitedUntil > now;
    const vipIntervalReady = now - lastVipFetchAt >= Math.max(2000, VIP_FETCH_INTERVAL_MS);
    if (api.isAuthenticated() && !vipBackoffActive && vipIntervalReady) {
      lastVipFetchAt = now;
      const [memeRadarResult, printScanResult, smartPumpResult, tokenTrackerResult] = await Promise.all([
        withVipRateLimitGuard(() => api.fetchMemeRadar('recency', 50), 'meme-radar'),
        withVipRateLimitGuard(() => api.fetchLeaderboard(200, 0, true), 'print-scan'),
        withVipRateLimitGuard(() => api.fetchSmartPump(500), 'smart-pump'),
        withVipRateLimitGuard(() => api.fetchTokenTracker('combined', 50), 'token-tracker'),
      ]);
      const printScan = printScanResult.data;
      const smartPump = smartPumpResult.data;
      const tokenTracker = tokenTrackerResult.data;

      const resolvedMR = resolveMemeRadarPayload({ payload: memeRadarResult.data, fetchError: memeRadarResult.error });
      const memeRadar = resolvedMR.payload;
      const memeRadarCount = resolvedMR.count;
      if (memeRadarResult.data && memeRadarCount === 0 && Date.now() - memeRadarShapeWarningAt > 30000) {
        memeRadarShapeWarningAt = Date.now();
        const topKeys = Object.keys(memeRadarResult.data || {}).slice(0, 12).join(', ') || 'none';
        const nestedKeys = Object.keys(memeRadarResult.data?.data || {}).slice(0, 12).join(', ') || 'none';
        console.warn(`[Layer2] Meme Radar returned 0 extractable tokens. keys={${topKeys}} data.keys={${nestedKeys}}`);
      }
      if (memeRadarResult.error && Date.now() - memeRadarFailureWarningAt > 15000) {
        memeRadarFailureWarningAt = Date.now();
        console.warn(`[Layer2] Meme Radar fetch failed: ${memeRadarResult.error?.message || memeRadarResult.error}`);
      }
      if (resolvedMR.fallbackUsed && Date.now() - memeRadarFailureWarningAt > 15000) {
        memeRadarFailureWarningAt = Date.now();
        const ageSec = Math.floor((Date.now() - lastGoodMemeRadarAt) / 1000);
        console.warn(`[Layer2] Meme Radar fallback active: serving last-good snapshot (${ageSec}s old).`);
      }

      for (const [data, source] of [
        [memeRadar, 'meme_radar'], [printScan, 'print_scan'],
        [smartPump, 'smart_pump'], [tokenTracker, 'token_tracker'],
      ]) {
        const r = ingestTokenList(data, source);
        newTokens.push(...r.new);
        updatedTokens.push(...r.updated);
        allTradeSignals.push(...r.tradeSignals);
      }

      // ── Layer 3: Differential Snapshot Comparison ──────────────────────────
      // Compare current poll mints to previous poll mints. Tokens that appear
      // in this response but NOT the previous one are genuinely new emits —
      // even if the token store already had them from movers/trending.
      if (Date.now() - SERVER_STARTED_AT > STARTUP_COOLDOWN_MS && Date.now() - lastAuthReloadAt > STARTUP_COOLDOWN_MS) {
        const extractMints = (data) => {
          if (!data) return new Set();
          const arr = extractTokenArray(data);
          return new Set(arr.map(t => t?.token_address || t?.mint || t?.address).filter(Boolean));
        };

        const currentPS = extractMints(printScan);
        const currentMR = extractMints(memeRadar);
        let layer3Hits = 0;

        for (const [currentSet, prevSet, source] of [
          [currentPS, _prevSnapshot.print_scan, 'print_scan'],
          [currentMR, _prevSnapshot.meme_radar, 'meme_radar'],
        ]) {
          if (prevSet.size > 0) {
            const newMints = [...currentSet].filter(m => !prevSet.has(m));
            const removedMints = [...prevSet].filter(m => !currentSet.has(m));
            if (newMints.length > 0 || removedMints.length > 0) {
              console.log(`[Layer3-Diff] ${source}: ${newMints.length} new, ${removedMints.length} removed (prev: ${prevSet.size}, curr: ${currentSet.size})`);
            }
            for (const mint of newMints) {
              const alreadySignaled = allTradeSignals.some(s => (s.address || s.mint || s.token_address) === mint);
              if (!alreadySignaled) {
                const record = tokenStore.getToken(mint);
                if (record && !tradingEngine.positions.has(mint)) {
                  layer3Hits++;
                  console.log(`[Layer3-Diff] CATCH: ${record.symbol || mint.slice(0, 8)} (${source}) — missed by Layer 1+2, caught by diff!`);
                  allTradeSignals.push({ ...record, _signal_source: source });
                } else if (record && tradingEngine.positions.has(mint)) {
                  console.log(`[Layer3-Diff] ${record.symbol || mint.slice(0, 8)} (${source}) — new in diff but already in position.`);
                }
              }
            }
          } else if (currentSet.size > 0) {
            console.log(`[Layer3-Diff] ${source}: initial snapshot loaded (${currentSet.size} mints)`);
          }
        }

        if (layer3Hits > 0) {
          console.log(`[Layer3-Diff] Caught ${layer3Hits} signal(s) that Layer 1+2 missed!`);
        }

        _prevSnapshot.print_scan = currentPS;
        _prevSnapshot.meme_radar = currentMR;
      }

      // Cross-reference Smart Pump KOL data with active trading positions
      if (smartPump) {
        const spList = smartPump?.data?.tokens || smartPump?.tokens || smartPump?.data || (Array.isArray(smartPump) ? smartPump : []);
        if (Array.isArray(spList) && spList.length > 0) {
          tradingEngine.updatePositionsFromSmartPump(spList);
        }
      }
    } else if (api.isAuthenticated() && vipBackoffActive && Date.now() - vipBackoffWarningAt > 5000) {
      vipBackoffWarningAt = Date.now();
      console.warn(`[Layer2] VIP fetches paused due to rate limit. Resuming in ${Math.max(1, Math.ceil((vipRateLimitedUntil - Date.now()) / 1000))}s.`);
    }

    // Fire trade signals from all quality sources (Layer 2 polling + Layer 3 diff)
    if (allTradeSignals.length > 0) {
      const unique = [];
      const seen = new Set();
      for (const s of allTradeSignals) {
        const signalKey = s?.address || s?.mint || s?.token_address;
        if (signalKey && !seen.has(signalKey)) {
          seen.add(signalKey);
          unique.push(s);
        }
      }
      if (unique.length > 0) {
        console.log(`[Layer2+3] Firing ${unique.length} trade signal(s) from poll cycle: ${unique.map(s => s.symbol || (s.address || s.mint || s.token_address || '').slice(0, 8)).join(', ')}`);
        await tradingEngine.handleSignals(unique, 'Signal Detected');
      }
    }

    // ── FIRST RUN: full refresh ──
    if (!initialized) {
      await refreshVisibleTokens();
      const refreshTokens = tokenStore.getAllTokens();
      const tokensWithRealtimeMcap = await attachRealtimeMcapField(refreshTokens, { limit: REALTIME_MCAP_BROADCAST_LIMIT });
      const initPayload = {
        type: 'refresh',
        data: {
          tokens: tokensWithRealtimeMcap,
          stats: tokenStore.getStats(),
          trading: {
            ...tradingEngine.getState(),
            activityLog: tradingEngine.activityLog.map(sanitizeActivity),
          }
        }
      };
      broadcast(initPayload);
      broadcastToPublic(initPayload);
      initialized = true;
      if (!baselinePopulated) {
        baselinePopulated = true;
        console.log(`[Startup] Baseline populated: PS=${_prevSnapshot.print_scan.size} MR=${_prevSnapshot.meme_radar.size} tokens=${tokenStore.getStats().total}. Signals now armed.`);
      }
      return;
    }

    // ── INSTANT UPDATES ──
    if (updatedTokens.length > 0) {
      await tradingEngine.updatePositions(updatedTokens, 'poll');
      let realtimeLookupBudgetUsed = 0;
      for (const token of updatedTokens.filter(Boolean)) {
        const mint = token?.address || token?.mint;
        const sourcesText = String(token?.sources || token?.source || '').toLowerCase();
        const isSignalSource = sourcesText.includes('print_scan') || sourcesText.includes('meme_radar');
        const isOpenPosition = mint ? tradingEngine?.positions?.has(mint) : false;
        const canLookupRealtime =
          mint &&
          tradingEngine?.getRealtimeMcap &&
          realtimeLookupBudgetUsed < Math.max(0, REALTIME_MCAP_UPDATE_LOOKUPS_PER_CYCLE) &&
          (isOpenPosition || isSignalSource);
        if (canLookupRealtime) {
          realtimeLookupBudgetUsed++;
          try {
            const mcap = await tradingEngine.getRealtimeMcap(mint);
            if (Number.isFinite(mcap) && mcap > 0) {
              token.realtime_mcap = mcap;
              token.realtime_mcap_ts = Date.now();
            }
          } catch { /* ignore */ }
        }
        const updateMsg = { type: 'token_update', data: { ...token, address: token.address || token.mint || mint } };
        broadcast(updateMsg);
        broadcastToPublic(updateMsg);
      }
    }

    // ── NEW TOKENS: instant broadcast to ALL clients (zero delay) ──
    if (newTokens.length > 0) {
      const payload = { type: 'new_tokens', data: newTokens.filter(Boolean) };
      broadcast(payload);
      broadcastToPublic(payload);
      console.log(`Found ${newTokens.length} new tokens`);
    }
  } catch (error) {
    console.error('Poll error:', error.message);
  } finally {
    pollInFlight = false;
  }
}

// Stream realtime market caps periodically (Helius) without forcing full feed resets.
const lastRealtimeBroadcast = new Map(); // mint -> last mcap
async function broadcastRealtimeMcaps() {
  if (!tradingEngine?.getRealtimeMcap) return;
  if (clients.size === 0) return;
  const limit = Number.isFinite(REALTIME_MCAP_BROADCAST_LIMIT) && REALTIME_MCAP_BROADCAST_LIMIT > 0
    ? REALTIME_MCAP_BROADCAST_LIMIT
    : 60;

  // Get tokens from both sources to ensure both tabs get realtime updates
  const allTokens = tokenStore.getAllTokens();
  const memeRadarTokens = allTokens
    .filter(t => (t.sources || t.source || '').includes('meme_radar'))
    .sort((a, b) => new Date(b.first_seen_local || 0) - new Date(a.first_seen_local || 0))
    .slice(0, limit);
  const printScanTokens = allTokens
    .filter(t => (t.sources || t.source || '').includes('print_scan'))
    .sort((a, b) => new Date(b.first_seen_local || 0) - new Date(a.first_seen_local || 0))
    .slice(0, limit);

  // Dedupe by address
  const seen = new Set();
  const tokens = [];
  for (const t of [...printScanTokens, ...memeRadarTokens]) {
    if (!seen.has(t.address)) {
      seen.add(t.address);
      tokens.push(t);
    }
  }

  const now = Date.now();

  const updates = await mapWithConcurrency(tokens, REALTIME_MCAP_BROADCAST_CONCURRENCY, async (token) => {
    const mint = token?.address || token?.mint || token?.token_address;
    if (!mint) return null;

    // PRIORITY: Check PumpPortal WS cache first (fastest, real-time from trade events)
    let mcap = null;
    if (pumpPortalWs) {
      const wsMcapUsd = pumpPortalWs.getMarketCapUsd(mint);
      if (Number.isFinite(wsMcapUsd) && wsMcapUsd > 0) {
        mcap = wsMcapUsd;
      } else {
        // Try SOL market cap and convert to USD
        const wsMcapSol = pumpPortalWs.getMarketCapSol(mint);
        if (Number.isFinite(wsMcapSol) && wsMcapSol > 0) {
          try {
            const solUsd = await tradingEngine.helius.getSolUsdPrice();
            if (Number.isFinite(solUsd) && solUsd > 0) {
              mcap = wsMcapSol * solUsd;
            }
          } catch {
            // Fall through to getRealtimeMcap
          }
        }
      }
    }

    // Fallback to getRealtimeMcap if PumpPortal WS doesn't have data
    if (!Number.isFinite(mcap) || mcap <= 0) {
      mcap = await tradingEngine.getRealtimeMcap(mint);
    }

    if (!Number.isFinite(mcap) || mcap <= 0) return null;

    // Only filter by percentage change if configured (default 0% = always update)
    const prev = lastRealtimeBroadcast.get(mint);
    if (REALTIME_MCAP_BROADCAST_MIN_PCT_CHANGE > 0 && Number.isFinite(prev) && prev > 0) {
      const pct = Math.abs((mcap - prev) / prev) * 100;
      if (pct < REALTIME_MCAP_BROADCAST_MIN_PCT_CHANGE) return null;
    }
    lastRealtimeBroadcast.set(mint, mcap);
    return { address: mint, realtime_mcap: mcap, realtime_mcap_ts: now };
  });

  updates.filter(Boolean).forEach((data) => {
    // Update ATH in database if realtime mcap is higher
    if (data.address && data.realtime_mcap) {
      tokenStore.updateAthIfHigher(data.address, data.realtime_mcap);
    }

    broadcast({ type: 'token_update', data });
    broadcastToPublic({ type: 'token_update', data });
  });
}

// Start polling
const POLL_INTERVAL = 2000; // 2 seconds for instant token detection

console.log(`[Startup] Cooldown active: suppressing trade signals for ${STARTUP_COOLDOWN_MS / 1000}s while baseline populates...`);
setTimeout(() => {
  console.log(`[Startup] Cooldown expired. Trade signals from print_scan/meme_radar are now LIVE.`);
}, STARTUP_COOLDOWN_MS);

// ── Layer 1: StalkFun Socket.IO WebSocket (real-time push, ~0ms latency) ─────
// Connects to stalk.fun's own real-time system — same one their frontend uses.
// Tokens arrive the instant stalk.fun's backend detects them, not on next poll.
const SIGNAL_SOURCES_WS = new Set(['print_scan', 'meme_radar', 'printscan', 'memeradar', 'meme-radar', 'print-scan']);

const stalkFunWs = new StalkFunWebSocket({
  cookies: api.cookies,
  bearer: api.bearer,
  onToken: ({ token, source, eventName, mint }) => {
    if (!mint) return;

    // Suppress signals until baseline is populated + cooldown expired (startup or auth reload)
    if (!baselinePopulated || Date.now() - SERVER_STARTED_AT <= STARTUP_COOLDOWN_MS || Date.now() - lastAuthReloadAt <= STARTUP_COOLDOWN_MS) {
      if (source === 'print_scan' || source === 'meme_radar') {
        console.log(`[Layer1-WS] Cooldown active, suppressing: ${token.token_symbol || token.symbol || mint.slice(0, 8)} (${source})`);
      }
      return;
    }

    // Ingest into token store (deduplicates automatically)
    const isNew = tokenStore.upsertToken(token, source);
    const record = tokenStore.getToken(mint);
    if (!record) return;

    const symbol = record.symbol || token.token_symbol || token.symbol || mint.slice(0, 8);

    // Broadcast to connected clients
    if (isNew) {
      console.log(`[Layer1-WS] New token ingested: ${symbol} (${source}) via "${eventName}"`);
      const payload = { type: 'new_tokens', data: [{ ...record, isNew: true }] };
      broadcast(payload);
      broadcastToPublic(payload);
    } else {
      const updateMsg = { type: 'token_update', data: { ...record, address: record.address || mint } };
      broadcast(updateMsg);
      broadcastToPublic(updateMsg);
    }

    // Fire trade signal if this is a signal source and token is fresh to this source
    if (SIGNAL_SOURCES_WS.has(source)) {
      const existing = tokenStore.getToken(mint);
      const existingSources = (existing?.sources || existing?.source || '').split(',').map(s => s.trim()).filter(Boolean);
      const hadSourceBefore = existingSources.filter(s => s === source).length > 1;

      if (isNew || !hadSourceBefore) {
        if (tradingEngine.positions.has(mint)) {
          console.log(`[Layer1-WS] Signal source ${source} confirmed ${symbol} — already in position, skipping buy.`);
        } else {
          console.log(`[Layer1-WS] TRADE SIGNAL: ${symbol} (${source} via "${eventName}") — triggering handleNewSignal`);
          tradingEngine.handleNewSignal(record, 'Signal Detected').catch(e => {
            console.error(`[Layer1-WS] Signal execution error for ${symbol}: ${e.message}`);
          });
        }
      } else {
        console.log(`[Layer1-WS] ${symbol} already had ${source} source — no new signal.`);
      }
    }
  },
});

// Start WebSocket after a short delay to let auth initialize
setTimeout(() => {
  if (api.isAuthenticated() && api.authMode === 'privy') {
    console.log('[Layer1-WS] Starting stalk.fun Socket.IO connection (Layer 1 — real-time push)...');
    console.log(`[Layer1-WS] Auth mode: ${api.authMode}, Cookie length: ${(api.cookies || '').length}, Bearer: ${api.bearer ? 'present' : 'none'}`);
    stalkFunWs.start();
  } else {
    console.log(`[Layer1-WS] Skipped — auth mode is "${api.authMode}", no privy cookies. Using Layer 2 (polling) + Layer 3 (diff) only.`);
  }
}, 2000);

// Log detection layer health every 5 minutes
setInterval(() => {
  const wsStats = stalkFunWs.getStats();
  const uptime = ((Date.now() - SERVER_STARTED_AT) / 60000).toFixed(1);
  console.log(`[Detection] Uptime: ${uptime}min | Layer1-WS: ${wsStats.connected ? 'CONNECTED' : 'OFFLINE'} (msgs: ${wsStats.messagesReceived}, signals: ${wsStats.signalSourceTokens}, events: ${wsStats.discoveredEvents.length}) | Layer2-Poll: active | Layer3-Diff: PS=${_prevSnapshot.print_scan.size} MR=${_prevSnapshot.meme_radar.size}`);
}, 5 * 60 * 1000);

// Expose detection layer stats
app.get('/api/detection/stats', (req, res) => {
  res.json({
    layer1_ws: stalkFunWs.getStats(),
    layer2_polling: { interval: POLL_INTERVAL, initialized },
    layer3_diff: {
      print_scan_snapshot_size: _prevSnapshot.print_scan.size,
      meme_radar_snapshot_size: _prevSnapshot.meme_radar.size,
    },
    startup: {
      cooldownMs: STARTUP_COOLDOWN_MS,
      cooldownExpired: Date.now() - SERVER_STARTED_AT > STARTUP_COOLDOWN_MS,
      uptimeMs: Date.now() - SERVER_STARTED_AT,
    },
  });
});

setInterval(pollStalkFun, POLL_INTERVAL);
setInterval(broadcastRealtimeMcaps, REALTIME_MCAP_BROADCAST_INTERVAL_MS);

// Initial poll
setTimeout(pollStalkFun, 1000);

// Check auth expiry (console only - not broadcast to public)
setInterval(() => {
  if (api.authMode === 'privy' && api.tokenExpiry) {
    const timeLeft = api.tokenExpiry - Date.now();

    // Warn in console 10 minutes before expiry
    if (timeLeft > 0 && timeLeft < 600000) {
      console.log(`⚠️  Auth expires in ${Math.floor(timeLeft / 60000)} minutes! Refresh token soon.`);
    }

    // Switch to public mode when expired
    if (timeLeft <= 0) {
      console.log('❌ Auth tokens expired, falling back to public mode');
      api.authMode = 'public';
    }
  }
}, 60000); // Check every minute

// Fallback route for SPA
app.get('*', (req, res) => {
  if (existsSync(clientDist)) {
    // If user requests /trading or /trading/, check for trading.html
    const path = req.path === '/' ? '/index' : req.path.replace(/\/$/, '');
    const htmlPath = join(clientDist, `${path}.html`);

    if (existsSync(htmlPath)) {
      res.sendFile(htmlPath);
    } else {
      res.sendFile(join(clientDist, 'index.html'));
    }
  } else {
    res.json({ message: 'API server running. Build client with: cd client && npm run build' });
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║           STALK.FUN REAL-TIME MONITOR                     ║
╠═══════════════════════════════════════════════════════════╣
║  Server:    http://localhost:${PORT}                         ║
║  WebSocket: ws://localhost:${PORT}                           ║
║  Detection:                                               ║
║    Layer 1: Socket.IO push  (~0ms)                        ║
║    Layer 2: REST polling    (${POLL_INTERVAL / 1000}s interval)                  ║
║    Layer 3: Diff snapshots  (backup)                      ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
