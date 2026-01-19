import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { StalkFunAPI } from './stalkfun-api.js';
import { TokenStore } from './token-store.js';
import { TradingEngine } from './trading-engine.js';
import { PumpPortalWebSocket } from './pump-portal-ws.js';

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

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// Serve static files from client build
const clientDist = join(__dirname, '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

// Initialize API and store
const api = new StalkFunAPI();
let printScanAuthWarningAt = 0;
const tokenStore = new TokenStore();
const backfilled = tokenStore.backfillMissingMetrics();
if (backfilled > 0) {
  console.log(`Backfilled metrics for ${backfilled} tokens`);
}

const VISIBLE_REFRESH_LIMIT = Number.parseInt(process.env.VISIBLE_REFRESH_LIMIT || '15', 10);
const REALTIME_MCAP_BROADCAST_INTERVAL_MS = Number.parseInt(process.env.REALTIME_MCAP_BROADCAST_INTERVAL_MS || '4000', 10);
const REALTIME_MCAP_BROADCAST_LIMIT = Number.parseInt(process.env.REALTIME_MCAP_BROADCAST_LIMIT || '60', 10);
const REALTIME_MCAP_BROADCAST_CONCURRENCY = Number.parseInt(process.env.REALTIME_MCAP_BROADCAST_CONCURRENCY || '4', 10);
const REALTIME_MCAP_BROADCAST_MIN_PCT_CHANGE = Number.parseFloat(process.env.REALTIME_MCAP_BROADCAST_MIN_PCT_CHANGE || '0.1'); // %

const pumpPortalWs = new PumpPortalWebSocket({
  url: process.env.PUMP_PORTAL_WS_URL || 'wss://pumpportal.fun/api/data',
  tokenKeys: [],
});

const tradingEngine = new TradingEngine({ tokenStore, pumpPortalWs });
tradingEngine.start();

// Update PumpPortal accountKeys after tradingEngine is initialized
pumpPortalWs.accountKeys = (tradingEngine.walletAddress || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

pumpPortalWs.on('migration', ({ mint, state }) => {
  tradingEngine.setMigrationState(mint, state, 'pumpportal');
});

pumpPortalWs.on('error', (err) => {
  console.error('PumpPortal WS error:', err?.message || err);
});

pumpPortalWs.start();

const syncWatchedTokens = () => {
  if (tradingEngine.realtimeMcapEnabled) return;
  pumpPortalWs.setTokenKeys(tradingEngine.getOpenPositionMints());
};

tradingEngine.on('positions', (positions) => {
  syncWatchedTokens();
  broadcast({ type: 'positions', data: positions });
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
});

tradingEngine.on('balance', (balanceSol) => {
  broadcast({ type: 'balance', data: { balanceSol } });
});

tradingEngine.on('holders', (holders) => {
  broadcast({ type: 'holders', data: { holders } });
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

// Refresh visible tokens before sending snapshots; live events remain unchanged.
const refreshVisibleTokens = async () => {
  if (!api.isAuthenticated()) return;
  const limit = Number.isFinite(VISIBLE_REFRESH_LIMIT) && VISIBLE_REFRESH_LIMIT > 0
    ? VISIBLE_REFRESH_LIMIT
    : 15;
  try {
    const [memeRadar, printScan] = await Promise.all([
      api.fetchMemeRadar('recency', limit),
      api.fetchLeaderboard(limit, 0, true)
    ]);

    const memeTokens = extractMemeRadarTokens(memeRadar);
    if (Array.isArray(memeTokens)) {
      for (const token of memeTokens) {
        tokenStore.upsertToken(token, 'meme_radar');
      }
    }

    const printTokens = extractPrintScanTokens(printScan);
    if (Array.isArray(printTokens)) {
      for (const token of printTokens) {
        tokenStore.upsertToken(token, 'print_scan');
      }
    }
  } catch (error) {
    console.warn('Refresh-visible fetch failed:', error?.message || error);
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

const attachRealtimeMcapField = async (tokens, { limit = 30 } = {}) => {
  const list = Array.isArray(tokens) ? tokens : [];
  const capped = list.slice(0, Math.max(0, limit));
  const withMcap = await mapWithConcurrency(
    capped,
    REALTIME_MCAP_BROADCAST_CONCURRENCY,
    async (token) => {
      const mint = token?.address || token?.mint || token?.token_address;
      if (!mint || !tradingEngine?.getRealtimeMcap) return token;
      try {
        const realtimeMcap = await tradingEngine.getRealtimeMcap(mint);
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

wss.on('connection', async (ws) => {
  clients.add(ws);
  console.log(`Client connected. Total: ${clients.size}`);
  
  // Send current state on connect (always)
  await refreshVisibleTokens();
  // Never compute realtime mcap for the entire DB on connect (rate limits + inconsistent mixes).
  // We can still send the full snapshot; realtime mcap will only be attached for top-N and then streamed.
  const refreshTokens = tokenStore.getAllTokens();
  const tokensWithRealtimeMcap = await attachRealtimeMcapField(refreshTokens, { limit: REALTIME_MCAP_BROADCAST_LIMIT });
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

// API Routes
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


// Polling function to fetch new data
let initialized = false;
let pollInFlight = false;

async function pollStalkFun() {
  if (pollInFlight) return;
  pollInFlight = true;
  const newTokens = [];
  const newMemeTokens = [];
  const newPrintTokens = [];
  const updatedTokens = [];

  const parseFirstSeen = (value) => {
    if (!value) return null;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value < 1e12 ? value * 1000 : value;
    }
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  };

  const isFreshFirstCall = (token, record) => {
    const candidates = [
      record?.first_seen_print_scan,
      record?.first_seen_local,
      record?.first_seen,
      token?.first_seen,
      token?.created_at,
      token?.first_called,
      token?.timestamp,
    ];
    const firstSeenMs = candidates
      .map(parseFirstSeen)
      .find((value) => Number.isFinite(value));
    if (!firstSeenMs) return false;
    const ageMs = Date.now() - firstSeenMs;
    return ageMs >= 0 && ageMs <= 120000;
  };

  try {
    // AUTH-REQUIRED ENDPOINTS (priority: meme radar, then first seen)
    if (api.isAuthenticated()) {
      // Meme Radar (priority)
      try {
        const memeRadar = await api.fetchMemeRadar();
        const memeData = memeRadar?.data;
        const memeList =
          (Array.isArray(memeData) ? memeData : null) ||
          (Array.isArray(memeData?.data) ? memeData.data : null) ||
          memeRadar?.tokens ||
          memeRadar?.results ||
          memeRadar?.items ||
          [];
        if ((memeRadar?.success ?? true) && Array.isArray(memeList)) {
          for (const token of memeList) {
            if (!token || typeof token !== 'object') continue;
            const mint = token.mint || token.token_address || token.address;
            if (!mint) continue;
            const isNew = tokenStore.upsertToken(token, 'meme_radar');
            const record = tokenStore.getToken(mint);
            if (isNew) {
              const flagged = { ...record, isNew: true };
              newTokens.push(flagged);
              newMemeTokens.push(flagged);
            } else {
              updatedTokens.push(record);
            }
          }
        } else if (process.env.DEBUG_MEME_RADAR === 'true') {
          console.log('Meme radar response keys:', Object.keys(memeRadar || {}));
          if (memeRadar?.data) {
            console.log('Meme radar data type:', Array.isArray(memeRadar.data) ? 'array' : typeof memeRadar.data);
            console.log('Meme radar data keys:', Object.keys(memeRadar.data || {}));
          }
        }
      } catch (e) {
        console.error('Meme radar fetch error:', e.message);
      }

      // First Seen (print scan)
      try {
        if (!api.isAuthenticated()) {
          const now = Date.now();
          if (now - printScanAuthWarningAt > 60000) {
            if (api.tokenExpiry && now > api.tokenExpiry - 60000) {
              console.warn('Print-scan skipped: privy token expired. Refresh PRIVY_COOKIES.');
            } else {
              console.warn('Print-scan skipped: unauthorized. Refresh PRIVY_COOKIES/PRIVY_BEARER.');
            }
            printScanAuthWarningAt = now;
          }
          return;
        }
        const printSource = (process.env.PRINT_SCAN_SOURCE || 'leaderboard').toLowerCase();
        const printScan = printSource === 'leaderboard'
          ? await api.fetchLeaderboard(200, 0, true)
          : await api.fetchPrintScan();
        const printTokens = printScan?.tokens || printScan?.data || printScan?.items;
        if ((printScan?.success ?? true) && Array.isArray(printTokens)) {
          const newPrintSignals = [];
          const printAddresses = [];
          const seenPrintAddresses = new Set();
          for (const token of printTokens) {
            const tokenAddress = token?.token_address || token?.mint || token?.mintAddress;
            if (!tokenAddress || seenPrintAddresses.has(tokenAddress)) continue;
            seenPrintAddresses.add(tokenAddress);
            printAddresses.push(tokenAddress);
            const existing = tokenStore.getToken(tokenAddress);
            const existingSources = (existing?.sources || existing?.source || '')
              .split(',')
              .map(s => s.trim())
              .filter(Boolean);
            const hadPrintScan = existingSources.includes('print_scan');
            const isNew = tokenStore.upsertToken(token, 'print_scan');
            const record = tokenStore.getToken(tokenAddress);
            if (isNew) {
              const flagged = { ...record, isNew: true };
              newTokens.push(flagged);
              newPrintTokens.push(flagged);
            } else {
              updatedTokens.push(record);
            }
            if (!hadPrintScan && isFreshFirstCall(token, record)) {
              newPrintSignals.push(record);
            }
          }
          tokenStore.syncSourceSnapshot('print_scan', printAddresses);
          if (newPrintSignals.length > 0) {
            const uniqueSignals = [];
            const seenSignals = new Set();
            for (const signal of newPrintSignals.filter(Boolean)) {
              const addr = signal?.address;
              if (!addr || seenSignals.has(addr)) continue;
              seenSignals.add(addr);
              uniqueSignals.push(signal);
            }
            if (uniqueSignals.length > 0) {
              await tradingEngine.handleSignals(uniqueSignals, 'First Seen');
            }
          }
        }
      } catch (e) {
        console.error('Print-scan fetch error:', e.message);
      }
    }

    // On first run, push a full refresh without highlighting
    if (!initialized) {
      await refreshVisibleTokens();
      const refreshTokens = tokenStore.getAllTokens();
      const tokensWithRealtimeMcap = await attachRealtimeMcapField(refreshTokens, { limit: REALTIME_MCAP_BROADCAST_LIMIT });
      broadcast({
        type: 'refresh',
        data: {
          tokens: tokensWithRealtimeMcap,
          stats: tokenStore.getStats(),
          trading: tradingEngine.getState()
        }
      });
      initialized = true;
      return;
    }

    // Update positions with fresh data
    if (updatedTokens.length > 0) {
      await tradingEngine.updatePositions(updatedTokens, 'poll');
    }

    // Broadcast updates for existing tokens so UIs stay live
    // Attach realtime_mcap from DexScreener cache (longer TTL than trading engine cache)
    if (updatedTokens.length > 0) {
      for (const token of updatedTokens.filter(Boolean)) {
        const mint = token?.address || token?.mint;
        if (mint && tradingEngine?.helius?.dexScreenerCache) {
          const cached = tradingEngine.helius.dexScreenerCache.get(mint);
          if (cached?.mcap && Date.now() - cached.ts < 15000) {
            token.realtime_mcap = cached.mcap;
            token.realtime_mcap_ts = cached.ts;
          }
        }
        broadcast({ type: 'token_update', data: token });
      }
    }

    // Broadcast only when new tokens appear
    if (newTokens.length > 0) {
      broadcast({
        type: 'new_tokens',
        data: newTokens.filter(Boolean)
      });
      // Trading signals should only be triggered from ClaudeCash (print_scan).
      // Print-scan signals are handled with freshness checks above
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
    const mcap = await tradingEngine.getRealtimeMcap(mint);
    if (!Number.isFinite(mcap) || mcap <= 0) return null;

    const prev = lastRealtimeBroadcast.get(mint);
    if (Number.isFinite(prev) && prev > 0) {
      const pct = Math.abs((mcap - prev) / prev) * 100;
      if (pct < REALTIME_MCAP_BROADCAST_MIN_PCT_CHANGE) return null;
    }
    lastRealtimeBroadcast.set(mint, mcap);
    return { address: mint, realtime_mcap: mcap, realtime_mcap_ts: now };
  });

  updates.filter(Boolean).forEach((data) => {
    broadcast({ type: 'token_update', data });
  });
}

// Start polling
const POLL_INTERVAL = 5000; // 5 seconds
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
    res.sendFile(join(clientDist, 'index.html'));
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
║  Polling:   Every ${POLL_INTERVAL/1000}s                                      ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
