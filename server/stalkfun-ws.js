import EventEmitter from 'events';
import { io } from 'socket.io-client';

const STALK_FUN_URL = 'https://stalk.fun';

// Known stalk.fun Socket.IO events (from HAR/bundle analysis)
const KNOWN_EVENTS = [
  'stream-token-update',
  'live_scan:new_detection',
  'live_scan:update',
  'printscan:new',
  'printscan:update',
  'memeradar:new',
  'memeradar:update',
  'meme_radar:new',
  'meme_radar:update',
  'print_scan:new',
  'print_scan:update',
  'koth:update',
  'smartpump:update',
  'new_token',
  'token_update',
  'notification',
];

export class StalkFunWebSocket extends EventEmitter {
  constructor({ cookies, bearer, onToken } = {}) {
    super();
    this.cookies = cookies || process.env.PRIVY_COOKIES || '';
    this.bearer = bearer || process.env.PRIVY_BEARER || process.env.PRIVY_ACCESS_TOKEN || '';
    this.onToken = onToken || null;
    this.socket = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 50;
    this.discoveredEvents = new Set();
    this._stats = {
      messagesReceived: 0,
      tokensDetected: 0,
      signalSourceTokens: 0,
      connectAt: null,
      lastMessageAt: null,
      lastTokenSymbol: null,
      lastTokenSource: null,
      disconnects: 0,
      errors: 0,
    };
    this._healthLogInterval = null;
  }

  start() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
    }

    const extraHeaders = {};
    if (this.cookies) extraHeaders.Cookie = this.cookies;

    const tokenMatch = (this.cookies || '').match(/privy-token=([^;]+)/);
    const privyToken = tokenMatch ? tokenMatch[1] : null;
    if (this.bearer) {
      extraHeaders.Authorization = `Bearer ${this.bearer}`;
    } else if (privyToken) {
      extraHeaders.Authorization = `Bearer ${privyToken}`;
    }

    // Add Cloudflare clearance if available
    if (process.env.CF_CLEARANCE && extraHeaders.Cookie) {
      extraHeaders.Cookie += `; cf_clearance=${process.env.CF_CLEARANCE}`;
    }

    console.log(`[StalkFunWS] Connecting to ${STALK_FUN_URL} (Socket.IO v4)...`);

    this.socket = io(STALK_FUN_URL, {
      transports: ['websocket'],
      extraHeaders,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
      timeout: 15000,
      auth: privyToken ? { token: privyToken } : undefined,
    });

    this.socket.on('connect', () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this._stats.connectAt = Date.now();
      console.log(`[StalkFunWS] Connected (id: ${this.socket.id}). Listening for ${KNOWN_EVENTS.length} known events + catch-all...`);
      console.log(`[StalkFunWS] Auth: ${extraHeaders.Authorization ? 'Bearer token present' : 'NO bearer'}, Cookie: ${extraHeaders.Cookie ? `${extraHeaders.Cookie.length} chars` : 'NONE'}`);
      this.emit('connected');

      // Periodic health log every 60s while connected
      if (this._healthLogInterval) clearInterval(this._healthLogInterval);
      this._healthLogInterval = setInterval(() => {
        if (!this.connected) return;
        const age = Date.now() - this._stats.connectAt;
        const lastMsg = this._stats.lastMessageAt ? `${((Date.now() - this._stats.lastMessageAt) / 1000).toFixed(0)}s ago` : 'never';
        console.log(`[StalkFunWS] Health: connected ${(age / 60000).toFixed(1)}min | msgs: ${this._stats.messagesReceived} | tokens: ${this._stats.tokensDetected} | signals: ${this._stats.signalSourceTokens} | last msg: ${lastMsg} | events discovered: ${this.discoveredEvents.size}`);
      }, 60000);
    });

    this.socket.on('disconnect', (reason) => {
      this.connected = false;
      this._stats.disconnects++;
      console.warn(`[StalkFunWS] Disconnected (reason: ${reason}). Total disconnects: ${this._stats.disconnects}. Will auto-reconnect...`);
      if (this._healthLogInterval) { clearInterval(this._healthLogInterval); this._healthLogInterval = null; }
      this.emit('disconnected', reason);
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`[StalkFunWS] Reconnected after ${attemptNumber} attempt(s).`);
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      if (attemptNumber <= 3 || attemptNumber % 10 === 0) {
        console.log(`[StalkFunWS] Reconnect attempt #${attemptNumber}...`);
      }
    });

    this.socket.on('reconnect_failed', () => {
      console.error(`[StalkFunWS] Reconnection failed after ${this.maxReconnectAttempts} attempts. Layer 1 offline — relying on Layer 2 (polling) + Layer 3 (diff).`);
    });

    this.socket.on('connect_error', (err) => {
      this.reconnectAttempts++;
      this._stats.errors++;
      if (this.reconnectAttempts <= 3 || this.reconnectAttempts % 10 === 0) {
        console.error(`[StalkFunWS] Connection error (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}): ${err.message}`);
      }
      this.emit('error', err);
    });

    // Subscribe to all known events
    for (const eventName of KNOWN_EVENTS) {
      this.socket.on(eventName, (data) => {
        this._handleEvent(eventName, data);
      });
    }

    // Catch-all: Socket.IO v4 supports onAny for discovering unknown events
    this.socket.onAny((eventName, ...args) => {
      if (!this.discoveredEvents.has(eventName)) {
        this.discoveredEvents.add(eventName);
        // Skip engine.io internal events
        if (!['ping', 'pong', 'connect', 'disconnect', 'connect_error'].includes(eventName)) {
          console.log(`[StalkFunWS] Discovered event: "${eventName}" (payload keys: ${args[0] ? Object.keys(args[0]).join(', ') : 'none'})`);
        }
      }
      // Process all events through the handler (even ones we didn't explicitly name)
      if (!KNOWN_EVENTS.includes(eventName)) {
        this._handleEvent(eventName, args[0]);
      }
    });
  }

  _handleEvent(eventName, data) {
    this._stats.messagesReceived++;
    this._stats.lastMessageAt = Date.now();

    if (!data || typeof data !== 'object') return;

    // Log raw event shape on first occurrence (helps debug new event types)
    if (!this._loggedEventShapes) this._loggedEventShapes = new Set();
    if (!this._loggedEventShapes.has(eventName)) {
      this._loggedEventShapes.add(eventName);
      const shape = Array.isArray(data)
        ? `Array[${data.length}]`
        : `Object{${Object.keys(data).slice(0, 10).join(', ')}}`;
      console.log(`[StalkFunWS] First "${eventName}" payload shape: ${shape}`);
      // For analysis events, log the type field and nested data keys
      if (eventName === 'analysis' && data.type) {
        const nestedShape = data.data && typeof data.data === 'object'
          ? `{${Object.keys(data.data).slice(0, 15).join(', ')}}`
          : typeof data.data;
        console.log(`[StalkFunWS] Analysis envelope: type="${data.type}", data shape: ${nestedShape}`);
      }
    }

    // Log unique analysis types as they're discovered
    if (eventName === 'analysis' && data.type) {
      if (!this._discoveredAnalysisTypes) this._discoveredAnalysisTypes = new Set();
      if (!this._discoveredAnalysisTypes.has(data.type)) {
        this._discoveredAnalysisTypes.add(data.type);
        const nestedKeys = data.data && typeof data.data === 'object'
          ? Object.keys(data.data).slice(0, 20).join(', ')
          : 'N/A';
        console.log(`[StalkFunWS] New analysis type discovered: "${data.type}" (data keys: ${nestedKeys})`);
      }
    }

    // Extract the envelope-level source hint (e.g. analysis event's "type" field)
    const envelopeType = data.type || data.source || data.category || null;

    const tokens = this._extractTokens(data);
    if (tokens.length === 0) return;

    for (const token of tokens) {
      const mint = token.token_address || token.mint || token.address || token.mintAddress;
      if (!mint) continue;

      const source = this._inferSource(eventName, token, envelopeType);
      const symbol = token.token_symbol || token.symbol || token.name || mint.slice(0, 8);
      this._stats.tokensDetected++;
      this._stats.lastTokenSymbol = symbol;
      this._stats.lastTokenSource = source;

      // Log signal-source tokens (print_scan/meme_radar) individually
      if (source === 'print_scan' || source === 'meme_radar') {
        this._stats.signalSourceTokens++;
        console.log(`[StalkFunWS] SIGNAL TOKEN: ${symbol} (${source}) via "${eventName}:${envelopeType || '?'}" | mint: ${mint.slice(0, 12)}...`);
      }

      this.emit('token', { token, source, eventName, mint });

      if (this.onToken) {
        try {
          this.onToken({ token, source, eventName, mint });
        } catch (e) {
          console.error(`[StalkFunWS] onToken callback error for ${symbol}: ${e.message}`);
        }
      }
    }
  }

  _extractTokens(data) {
    // Single token object
    if (data.token_address || data.mint || data.address) return [data];
    // Array of tokens
    if (Array.isArray(data)) return data.filter(t => t && typeof t === 'object');
    // Nested: { data: [...] } or { tokens: [...] }
    if (Array.isArray(data.data)) return data.data.filter(t => t && typeof t === 'object');
    if (Array.isArray(data.tokens)) return data.tokens.filter(t => t && typeof t === 'object');
    // Nested deeper: { data: { data: [...] } }
    if (data.data && Array.isArray(data.data.data)) return data.data.data.filter(t => t && typeof t === 'object');
    // Single token wrapped: { data: { token_address: ... } }
    if (data.data && (data.data.token_address || data.data.mint)) return [data.data];
    // Common wrappers used by some analysis payloads
    if (data.token && (data.token.token_address || data.token.mint || data.token.address)) return [data.token];
    if (data.payload && (data.payload.token_address || data.payload.mint || data.payload.address)) return [data.payload];
    if (data.data?.token && (data.data.token.token_address || data.data.token.mint || data.data.token.address)) return [data.data.token];
    if (Array.isArray(data.data?.tokens)) return data.data.tokens.filter(t => t && typeof t === 'object');
    if (Array.isArray(data.payload?.tokens)) return data.payload.tokens.filter(t => t && typeof t === 'object');
    return [];
  }

  _normalizeSource(raw) {
    if (!raw) return null;
    const value = String(raw).trim().toLowerCase();
    if (!value) return null;

    if (value.includes('printscan') || value.includes('print_scan') || value.includes('print-scan') || value === 'ps') {
      return 'print_scan';
    }
    if (value.includes('memeradar') || value.includes('meme_radar') || value.includes('meme-radar') || value === 'mr') {
      return 'meme_radar';
    }
    if (value.includes('smartpump') || value.includes('smart_pump') || value.includes('smart-pump')) return 'smart_pump';
    if (value.includes('live_scan') || value.includes('livescan') || value.includes('live-scan')) return 'live_scan';
    if (value.includes('tokenupdate') || value.includes('token_update') || value.includes('token-update')) return 'token_update';
    if (value.includes('dexpaid') || value.includes('dex_paid') || value.includes('dex-paid')) return 'dex_paid';
    return value.replace(/-/g, '_');
  }

  _inferSource(eventName, token, envelopeType = null) {
    // Priority 1: Envelope type (from analysis event's "type" field)
    // stalk.fun wraps data in {data, signature, timestamp, type} — "type" is the source
    if (envelopeType) {
      const t = this._normalizeSource(envelopeType);
      if (!t) return 'stream';
      if (t.includes('printscan') || t.includes('print_scan') || t.includes('print-scan') || t === 'ps') return 'print_scan';
      if (t.includes('memeradar') || t.includes('meme_radar') || t.includes('meme-radar') || t === 'mr') return 'meme_radar';
      if (t.includes('koth') || t === 'king_of_the_hill') return 'koth';
      if (t.includes('smartpump') || t.includes('smart_pump') || t.includes('smart-pump')) return 'smart_pump';
      if (t.includes('live_scan') || t.includes('livescan') || t.includes('live-scan')) return 'live_scan';
      if (t.includes('trending')) return 'trending';
      if (t.includes('dex') || t.includes('dexpaid')) return 'dex_paid';
      if (t.includes('movers')) return 'movers';
    }

    // Priority 2: Explicit source field in token payload
    if (token.source) return this._normalizeSource(token.source);
    if (token.message_type) return this._normalizeSource(token.message_type);
    if (token.detection_source) return this._normalizeSource(token.detection_source);
    if (token.type) {
      const tt = this._normalizeSource(token.type);
      if (!tt) return 'stream';
      if (tt.includes('printscan') || tt.includes('print_scan') || tt.includes('print-scan')) return 'print_scan';
      if (tt.includes('memeradar') || tt.includes('meme_radar') || tt.includes('meme-radar')) return 'meme_radar';
    }

    // Priority 3: Infer from event name
    const lower = eventName.toLowerCase();
    if (lower.includes('printscan') || lower.includes('print_scan')) return 'print_scan';
    if (lower.includes('memeradar') || lower.includes('meme_radar')) return 'meme_radar';
    if (lower.includes('koth')) return 'koth';
    if (lower.includes('smartpump') || lower.includes('smart_pump')) return 'smart_pump';
    if (lower.includes('live_scan')) return 'live_scan';
    if (lower.includes('trending')) return 'trending';

    // Priority 4: Infer from token data shape
    if (token.initial_mcap && token.latest_mcap && token.highest_multiplier) return 'print_scan';
    if (token.initial_mc && token.current_mc) return 'meme_radar';

    // Fallback: use envelope type verbatim if present (for unknown types we want to log)
    if (envelopeType) return this._normalizeSource(envelopeType);

    return 'stream';
  }

  getStats() {
    return {
      ...this._stats,
      connected: this.connected,
      uptimeMs: this._stats.connectAt ? Date.now() - this._stats.connectAt : 0,
      discoveredEvents: Array.from(this.discoveredEvents),
      discoveredAnalysisTypes: this._discoveredAnalysisTypes ? Array.from(this._discoveredAnalysisTypes) : [],
      loggedEventShapes: this._loggedEventShapes ? Array.from(this._loggedEventShapes) : [],
      reconnectAttempts: this.reconnectAttempts,
      socketId: this.socket?.id || null,
    };
  }

  stop() {
    if (this._healthLogInterval) { clearInterval(this._healthLogInterval); this._healthLogInterval = null; }
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected = false;
    console.log('[StalkFunWS] Stopped.');
  }
}
