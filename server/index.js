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
import { AuthService } from './auth-service.js';
import { UserTradingEngine } from './user-trading-engine.js';
// PumpSignalTracker removed — using stalk.fun APIs only for signals

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
      // Enrich with momentum data from trending response
      token._momentum = {
        price_change_1m: token.price_change_percent1m,
        price_change_5m: token.price_change_percent5m ?? token.price_change_percent,
        price_change_1h: token.price_change_percent1h,
        volume_24h: token.volume_24h,
        transactions_24h: token.transactions_24h,
      };
      tokenStore.upsertToken(token, source);
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
    tokenStore.upsertToken(token, source);
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
      const [memeRadar, printScan, smartPump, tokenTracker] = await Promise.all([
        api.fetchMemeRadar('recency', 200).catch(() => null),
        api.fetchLeaderboard(200, 0, true).catch(() => null),
        api.fetchSmartPump(500).catch(() => null),
        api.fetchTokenTracker('combined', 50).catch(() => null),
      ]);
      if (memeRadar) ingestApiTokens(memeRadar, 'meme_radar');
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
          stats: tokenStore.getStats()
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

async function pollStalkFun() {
  if (pollInFlight) return;
  pollInFlight = true;
  const newTokens = [];
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

  const SIGNAL_SOURCES = new Set(['print_scan', 'smart_pump', 'meme_radar', 'movers', 'koth']);

  // Generic ingestion — returns { new: Token[], updated: Token[], tradeSignals: Token[] }
  const ingestTokenList = (data, source) => {
    const result = { new: [], updated: [], tradeSignals: [] };
    if (!data) return result;

    // Handle trending's nested structure
    if (source === 'trending' && data?.data) {
      const swaps1m = data.data.swaps_1m || [];
      const swaps5m = data.data.swaps_5m || [];
      for (const token of [...swaps5m, ...swaps1m]) {
        if (!token || typeof token !== 'object') continue;
        const mint = token.mint || token.token_address || token.address;
        if (!mint) continue;
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
      }
      return result;
    }

    // Standard shape: { data: [...] } or { tokens: [...] } or array
    const memeData = data?.data;
    const list =
      (Array.isArray(memeData) ? memeData : null) ||
      (Array.isArray(memeData?.data) ? memeData.data : null) ||
      data?.tokens || data?.items || data?.results ||
      (Array.isArray(data) ? data : []);

    if (!Array.isArray(list)) return result;
    const seenAddresses = new Set();

    for (const token of list) {
      if (!token || typeof token !== 'object') continue;
      const mint = token.mint || token.token_address || token.address || token.mintAddress;
      if (!mint || seenAddresses.has(mint)) continue;
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

      if (SIGNAL_SOURCES.has(source) && !hadSource && record && isFreshFirstCall(token, record)) {
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
    if (api.isAuthenticated()) {
      const [memeRadar, printScan, smartPump, tokenTracker] = await Promise.all([
        api.fetchMemeRadar('recency', 200).catch(() => null),
        api.fetchLeaderboard(200, 0, true).catch(() => null),
        api.fetchSmartPump(500).catch(() => null),
        api.fetchTokenTracker('combined', 50).catch(() => null),
      ]);

      for (const [data, source] of [
        [memeRadar, 'meme_radar'], [printScan, 'print_scan'],
        [smartPump, 'smart_pump'], [tokenTracker, 'token_tracker'],
      ]) {
        const r = ingestTokenList(data, source);
        newTokens.push(...r.new);
        updatedTokens.push(...r.updated);
        allTradeSignals.push(...r.tradeSignals);
      }
    }

    // Fire trade signals from all quality sources
    if (allTradeSignals.length > 0) {
      const unique = [];
      const seen = new Set();
      for (const s of allTradeSignals) {
        if (s?.address && !seen.has(s.address)) { seen.add(s.address); unique.push(s); }
      }
      if (unique.length > 0) {
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
          trading: tradingEngine.getState()
        }
      };
      broadcast(initPayload);
      broadcastToPublic(initPayload);
      initialized = true;
      return;
    }

    // ── INSTANT UPDATES ──
    if (updatedTokens.length > 0) {
      await tradingEngine.updatePositions(updatedTokens, 'poll');
      for (const token of updatedTokens.filter(Boolean)) {
        const mint = token?.address || token?.mint;
        if (mint && tradingEngine?.getRealtimeMcap) {
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
║  Polling:   Every ${POLL_INTERVAL / 1000}s                                      ║
╚═══════════════════════════════════════════════════════════╝
  `);
  // Deployment trigger
});
