import fetch from 'node-fetch';

const STALK_FUN_BASE = 'https://stalk.fun';

export class StalkFunAPI {
  constructor() {
    this.cookies = process.env.PRIVY_COOKIES || null;
    this.bearer = process.env.PRIVY_BEARER || process.env.PRIVY_ACCESS_TOKEN || null;
    this.tokenExpiry = null;
    this.authMode = 'public'; // 'public' = no auth, 'privy' = with auth

    // Check if we have cookies with privy-token
    if (this.cookies && this.cookies.includes('privy-token=')) {
      try {
        // Extract token from cookies to check expiry
        const tokenMatch = this.cookies.match(/privy-token=([^;]+)/);
        if (tokenMatch) {
          const token = tokenMatch[1];
          const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
          this.tokenExpiry = payload.exp * 1000;
          if (Date.now() < this.tokenExpiry) {
            this.authMode = 'privy';
            console.log(`Using cookies. Token expires: ${new Date(this.tokenExpiry).toISOString()}`);
          } else {
            console.log('Cookie token expired, will use public endpoints');
            this.cookies = null;
          }
        }
      } catch (e) {
        console.log('Error parsing cookie token:', e.message);
      }
    }
  }

  isAuthenticated() {
    if (this.authMode === 'public') return true; // Public mode always "works"
    if (!this.cookies) return false;
    if (this.tokenExpiry && Date.now() > this.tokenExpiry - 60000) return false;
    return true;
  }

  getReferer(endpoint) {
    if (endpoint.includes('meme-radar')) return 'https://stalk.fun/meme-radar';
    if (endpoint.includes('print-scan')) return 'https://stalk.fun/print-scan';
    return 'https://stalk.fun/';
  }

  getAuthHeaders() {
    const cookieParts = [];
    if (this.cookies) cookieParts.push(this.cookies);
    if (process.env.CF_CLEARANCE) cookieParts.push(`cf_clearance=${process.env.CF_CLEARANCE}`);
    if (process.env.NEXT_AUTH_CSRF) cookieParts.push(`next-auth.csrf-token=${process.env.NEXT_AUTH_CSRF}`);
    if (process.env.NEXT_AUTH_CALLBACK_URL) cookieParts.push(`next-auth.callback-url=${encodeURIComponent(process.env.NEXT_AUTH_CALLBACK_URL)}`);
    const cookieHeader = cookieParts.filter(Boolean).join('; ');

    const tokenMatch = cookieHeader.match(/privy-token=([^;]+)/);
    const privyToken = tokenMatch ? tokenMatch[1] : null;
    return {
      ...(this.bearer ? { Authorization: `Bearer ${this.bearer}` } : {}),
      ...(privyToken && !this.bearer ? { Authorization: `Bearer ${privyToken}` } : {}),
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    };
  }

  async fetchAPI(endpoint, options = {}, requiresAuth = false) {
    const url = `${STALK_FUN_BASE}${endpoint}`;

    const headers = {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': this.getReferer(endpoint),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
      ...options.headers
    };

    // Add cookies if we have them and endpoint requires auth
    if (requiresAuth && this.cookies && this.authMode === 'privy') {
      Object.assign(headers, this.getAuthHeaders());
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // PUBLIC ENDPOINTS (no auth required)
  async fetchMovers() {
    return this.fetchAPI('/api/movers');
  }

  async fetchTrending() {
    return this.fetchAPI('/api/trending');
  }

  async fetchJackpotStatus() {
    return this.fetchAPI('/api/jackpot/status');
  }

  // AUTH-REQUIRED ENDPOINTS
  async fetchPrintScan() {
    return this.fetchAPI('/api/print-scan', {}, true);
  }

  async fetchLeaderboard(limit = 200, offset = 0, refresh = true) {
    const refreshParam = refresh ? '&refresh=true' : '';
    return this.fetchAPI(`/api/print-scan-leaderboard?limit=${limit}&offset=${offset}${refreshParam}`, {}, true);
  }

  async fetchMemeRadar(sortBy = 'recency', limit = 200) {
    return this.fetchAPI(`/api/meme-radar?sortBy=${sortBy}&limit=${limit}&refresh=true`, {}, true);
  }

  async fetchLiveScan(limit = 100, timeWindow = '1h') {
    return this.fetchAPI(`/api/live-scan?limit=${limit}&timeWindow=${timeWindow}`, {}, true);
  }

  async fetchDexPaid() {
    return this.fetchAPI('/api/dexpaid', {}, true);
  }

  async fetchTokenTracker(listType = 'combined', limit = 20) {
    return this.fetchAPI(`/api/token-tracker?listType=${listType}&limit=${limit}&fresh=true`, {}, true);
  }

  async fetchNotificationMonitor() {
    return this.fetchAPI('/api/notification-monitor', {}, true);
  }

  async batchCheckVamped(mintAddresses) {
    return this.fetchAPI('/api/vamped/batch-check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ mintAddresses })
    }, true);
  }
}
