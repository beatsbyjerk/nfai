import { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { TokenStream } from './components/TokenStream';
import { TokenDetail } from './components/TokenDetail';
import { Toast } from './components/Toast';

function App() {
  const [tokens, setTokens] = useState([]);
  const [connected, setConnected] = useState(false);
  const [selectedTokenAddress, setSelectedTokenAddress] = useState(null);
  const tabs = [
    { key: 'gambles', label: 'Gambles', source: 'meme_radar', firstLabel: 'First Called' },
    { key: 'claudecash', label: 'ClaudeCash', source: 'print_scan', firstLabel: 'First' },
  ];
  const [activeTab, setActiveTab] = useState(() => {
    try {
      return localStorage.getItem('activeTab') || 'gambles';
    } catch {
      return 'gambles';
    }
  });
  const [highlighted, setHighlighted] = useState({ meme_radar: null, print_scan: null });
  const [activity, setActivity] = useState([]);
  const [balanceSol, setBalanceSol] = useState(0);
  const [realizedProfit, setRealizedProfit] = useState(0);
  const [distributionPool, setDistributionPool] = useState(0);
  const [holders, setHolders] = useState([]);
  const [positions, setPositions] = useState([]);
  const [tradeCount, setTradeCount] = useState(0);
  const [tradingMode, setTradingMode] = useState('paper');
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      return localStorage.getItem('soundEnabled') === 'true';
    } catch {
      return false;
    }
  });
  const [authState, setAuthState] = useState({
    loading: true,
    authenticated: false,
    wallet: null,
    plan: null,
    expiresAt: null,
    sessionToken: null,
  });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');
  const [licensePlan, setLicensePlan] = useState('week');
  const [authError, setAuthError] = useState('');
  const [paymentInfo, setPaymentInfo] = useState(null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [landingTheme, setLandingTheme] = useState(() => {
    try {
      return localStorage.getItem('theme') || 'light';
    } catch {
      return 'light';
    }
  });
  
  // Public feed state (for unauthenticated landing page)
  const [publicToasts, setPublicToasts] = useState([]);
  const [publicActivity, setPublicActivity] = useState([]);
  
  const deviceIdRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const audioRef = useRef(null);
  const tokensRef = useRef(tokens);
  const activeTabRef = useRef(activeTab);
  const soundEnabledRef = useRef(soundEnabled);
  const claudeCashSeenRef = useRef(new Set());
  const lastSoundTokenRef = useRef(null);
  const lastActivitySoundRef = useRef(null);
  const publicWsRef = useRef(null);
  const publicReconnectTimeoutRef = useRef(null);

  useEffect(() => {
    audioRef.current = new Audio('/mixkit-retro-game-notification-212.mp3');
    audioRef.current.preload = 'auto';
  }, []);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    tokensRef.current = tokens;
  }, [tokens]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const getOrCreateDeviceId = useCallback(() => {
    try {
      const existing = localStorage.getItem('deviceId');
      if (existing) return existing;
      const created = window.crypto?.randomUUID?.() || `dev_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      localStorage.setItem('deviceId', created);
      return created;
    } catch {
      return `dev_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }
  }, []);

  const validateSession = useCallback(async () => {
    const sessionToken = localStorage.getItem('sessionToken');
    if (!sessionToken) {
      setAuthState({
        loading: false,
        authenticated: false,
        wallet: null,
        plan: null,
        expiresAt: null,
        sessionToken: null,
      });
      return;
    }
    const deviceId = deviceIdRef.current || getOrCreateDeviceId();
    try {
      const res = await fetch('/api/auth/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionToken, deviceId }),
      });
      if (!res.ok) throw new Error('Invalid session');
      const data = await res.json();
      setAuthState({
        loading: false,
        authenticated: true,
        wallet: data.wallet,
        plan: data.plan,
        expiresAt: data.expiresAt,
        sessionToken,
      });
    } catch {
      localStorage.removeItem('sessionToken');
      setAuthState({
        loading: false,
        authenticated: false,
        wallet: null,
        plan: null,
        expiresAt: null,
        sessionToken: null,
      });
    }
  }, [getOrCreateDeviceId]);

  useEffect(() => {
    deviceIdRef.current = getOrCreateDeviceId();
    validateSession();
  }, [getOrCreateDeviceId, validateSession]);

  useEffect(() => {
    if (!authState.authenticated || !authState.sessionToken) return;
    const interval = setInterval(() => {
      validateSession();
    }, 30000);
    return () => clearInterval(interval);
  }, [authState.authenticated, authState.sessionToken, validateSession]);

  const handleActivate = async () => {
    setAuthError('');
    const deviceId = deviceIdRef.current || getOrCreateDeviceId();
    try {
      const res = await fetch('/api/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: licenseKey.trim(), plan: licensePlan, deviceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Activation failed');
      localStorage.setItem('sessionToken', data.sessionToken);
      setAuthState({
        loading: false,
        authenticated: true,
        wallet: data.wallet,
        plan: data.plan,
        expiresAt: data.expiresAt,
        sessionToken: data.sessionToken,
      });
      setShowAuthModal(false);
      setLicenseKey('');
    } catch (error) {
      setAuthError(error.message || 'Activation failed');
    }
  };

  const handleStartPayment = async () => {
    setAuthError('');
    setPaymentInfo(null);
    try {
      const res = await fetch('/api/auth/payment/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: licenseKey.trim(), plan: licensePlan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to start payment');
      setPaymentInfo(data);
    } catch (error) {
      setAuthError(error.message || 'Unable to start payment');
    }
  };

  const handleConfirmPayment = async () => {
    setAuthError('');
    setCheckingPayment(true);
    const deviceId = deviceIdRef.current || getOrCreateDeviceId();
    try {
      const res = await fetch('/api/auth/payment/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: licenseKey.trim(), plan: licensePlan, deviceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Payment not found');
      localStorage.setItem('sessionToken', data.sessionToken);
      setAuthState({
        loading: false,
        authenticated: true,
        wallet: data.wallet,
        plan: data.plan,
        expiresAt: data.expiresAt,
        sessionToken: data.sessionToken,
      });
      setShowAuthModal(false);
      setLicenseKey('');
      setPaymentInfo(null);
    } catch (error) {
      setAuthError(error.message || 'Payment not found');
    } finally {
      setCheckingPayment(false);
    }
  };

  const handleLogout = async () => {
    const sessionToken = localStorage.getItem('sessionToken');
    const deviceId = deviceIdRef.current || getOrCreateDeviceId();
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionToken, deviceId }),
      });
    } catch {
      // ignore
    }
    localStorage.removeItem('sessionToken');
    setAuthState({
      loading: false,
      authenticated: false,
      wallet: null,
      plan: null,
      expiresAt: null,
      sessionToken: null,
    });
  };

  const hasPrintScanSource = useCallback((token) => {
    const sources = (token?.sources || token?.source || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    return sources.includes('print_scan');
  }, []);

  const hydrateClaudeCashSeen = useCallback((tokenList) => {
    const next = new Set();
    tokenList.forEach((token) => {
      if (hasPrintScanSource(token)) {
        next.add(token.address);
      }
    });
    return next;
  }, [hasPrintScanSource]);

  useEffect(() => {
    try {
      localStorage.setItem('soundEnabled', soundEnabled ? 'true' : 'false');
    } catch {
      // Ignore storage errors (private mode, disabled storage, etc.)
    }
  }, [soundEnabled]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', landingTheme);
    try {
      localStorage.setItem('theme', landingTheme);
    } catch {
      // Ignore storage errors
    }
  }, [landingTheme]);

  const connectWebSocket = useCallback(() => {
    if (!authState.authenticated || !authState.sessionToken) return;
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const isDev = window.location.port === '5173';
    const deviceId = deviceIdRef.current || getOrCreateDeviceId();
    const qs = `?token=${encodeURIComponent(authState.sessionToken)}&deviceId=${encodeURIComponent(deviceId)}`;
    const wsUrl = isDev
      ? `ws://localhost:3001${qs}`
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${qs}`;
    
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => setConnected(true);
    ws.onerror = () => setConnected(false);
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'init':
          case 'refresh':
            setTokens((prev) => {
              const incoming = message.data.tokens || [];
              const prevByAddress = new Map((prev || []).map((t) => [t.address, t]));
              const merged = incoming.map((t) => ({ ...(prevByAddress.get(t.address) || {}), ...t }));
              claudeCashSeenRef.current = hydrateClaudeCashSeen(merged);
              return merged;
            });
            if (message.data.trading?.activityLog) {
              setActivity(message.data.trading.activityLog);
            }
            if (message.data.trading?.balanceSol != null) {
              setBalanceSol(message.data.trading.balanceSol);
            }
            if (message.data.trading?.realizedProfitSol != null) {
              setRealizedProfit(message.data.trading.realizedProfitSol);
            }
            if (message.data.trading?.distributionPoolSol != null) {
              setDistributionPool(message.data.trading.distributionPoolSol);
            }
            if (message.data.trading?.holders) {
              setHolders(message.data.trading.holders);
            }
            if (message.data.trading?.positions) {
              setPositions(message.data.trading.positions);
            }
            if (message.data.trading?.tradeCount != null) {
              setTradeCount(message.data.trading.tradeCount);
            }
            if (message.data.trading?.tradingMode) {
              setTradingMode(message.data.trading.tradingMode);
            }
            break;
            
          case 'new_tokens':
            const newIncoming = message.data.map(t => ({ ...t, receivedAt: Date.now() }));
            const combined = [...newIncoming, ...(tokensRef.current || [])];
            // Unique by address
            const seen = new Set();
            const nextTokens = combined.filter(t => {
              if (seen.has(t.address)) return false;
              seen.add(t.address);
              return true;
            }).slice(0, 500); // Keep last 500
            setTokens(nextTokens);

            // Replace highlight per source
            for (const token of newIncoming) {
              if (token.source === 'meme_radar') {
                setHighlighted(prev => ({ ...prev, meme_radar: token.address }));
              }
              if (token.source === 'print_scan') {
                setHighlighted(prev => ({ ...prev, print_scan: token.address }));
              }
            }

            break;

          case 'token_update':
            setTokens(prev => prev.map(t => {
              if (t.address !== message.data.address) return t;
              return { ...t, ...message.data };
            }));
            break;

          case 'activity':
            if (activeTabRef.current === 'claudecash' && soundEnabledRef.current) {
              const activityType = (message.data?.type || '').toLowerCase();
              const shouldNotify = activityType === 'signal' || activityType === 'trade';
              if (shouldNotify) {
                const activityStamp = message.data?.timestamp || Date.now();
                if (activityStamp !== lastActivitySoundRef.current) {
                  lastActivitySoundRef.current = activityStamp;
                  audioRef.current?.play().catch(() => {});
                }
              }
            }
            setActivity(prev => [message.data, ...prev].slice(0, 200));
            break;

          case 'balance':
            setBalanceSol(message.data.balanceSol ?? 0);
            break;

          case 'holders':
            setHolders(message.data.holders || []);
            break;

          case 'positions':
            setPositions(message.data || []);
            break;
        }
      } catch (e) {
        console.error(e);
      }
    };
    
    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      setConnected(false);
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
    };
    
    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connectWebSocket();
    return () => {
      wsRef.current?.close();
      clearTimeout(reconnectTimeoutRef.current);
    };
  }, [connectWebSocket]);

  useEffect(() => {
    if (authState.authenticated) return;
    wsRef.current?.close();
    setConnected(false);
  }, [authState.authenticated]);

  const getTokenTimeBySource = (token, source) => {
    if (source === 'print_scan') {
      return token.first_seen_print_scan || token.first_called || token.first_seen || token.first_seen_local || token.created_at;
    }
    return token.first_called || token.first_seen || token.created_at || token.first_seen_local;
  };

  const selectedToken = (() => {
    if (!selectedTokenAddress) return null;
    return (tokens || []).find((t) => t.address === selectedTokenAddress) || null;
  })();

  // Filter tokens based on active tab
  const getFilteredTokens = () => {
    const current = tabs.find(t => t.key === activeTab);
    const list = tokens.filter(t => {
      const sources = (t.sources || t.source || '').split(',').map(s => s.trim());
      return sources.includes(current?.source);
    });
    return list.sort((a, b) => {
      const aTime = new Date(getTokenTimeBySource(a, current?.source) || 0).getTime();
      const bTime = new Date(getTokenTimeBySource(b, current?.source) || 0).getTime();
      return bTime - aTime;
    }).slice(0, 200);
  };

  const getClaudeCashTokens = useCallback(() => {
    const source = 'print_scan';
    const list = tokens.filter(t => {
      const sources = (t.sources || t.source || '').split(',').map(s => s.trim());
      return sources.includes(source);
    });
    return list.sort((a, b) => {
      const aTime = new Date(getTokenTimeBySource(a, source) || 0).getTime();
      const bTime = new Date(getTokenTimeBySource(b, source) || 0).getTime();
      return bTime - aTime;
    }).slice(0, 200);
  }, [tokens, getTokenTimeBySource]);

  const getRawData = (token) => {
    if (!token?.raw_data) return null;
    try {
      return typeof token.raw_data === 'string' ? JSON.parse(token.raw_data) : token.raw_data;
    } catch {
      return null;
    }
  };

  const parseMetric = (value) => {
    if (value == null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const raw = String(value).trim();
    if (!raw) return null;
    const cleaned = raw.replace(/[$,]/g, '').trim();
    const match = cleaned.match(/^(-?\d*\.?\d+)\s*([kmb])?$/i);
    if (!match) {
      const fallback = Number.parseFloat(cleaned);
      return Number.isFinite(fallback) ? fallback : null;
    }
    const base = Number.parseFloat(match[1]);
    if (!Number.isFinite(base)) return null;
    const suffix = match[2]?.toLowerCase();
    const multiplier = suffix === 'b' ? 1e9 : suffix === 'm' ? 1e6 : suffix === 'k' ? 1e3 : 1;
    return base * multiplier;
  };

  const statsInitialCap = (token) => {
    const rawData = getRawData(token);
    const raw =
      rawData?.initial_mcap ??
      rawData?.initial_market_cap ??
      rawData?.initial_mc ??
      rawData?.first_called_mcap;
    const parsed = parseMetric(raw);
    if (parsed != null) return parsed;
    return parseMetric(token.initial_mcap || token.initial_market_cap || token.initial_mc || token.first_called_mcap);
  };

  const statsAthCap = (token) => {
    const rawData = getRawData(token);
    const raw =
      rawData?.ath ??
      rawData?.ath_mcap ??
      rawData?.ath_market_cap ??
      rawData?.ath_mc;
    const parsed = parseMetric(raw);
    if (parsed != null) return parsed;
    return parseMetric(token.ath_mcap || token.ath_market_cap || token.ath_mc || token.ath);
  };

  const initialCap = (token) => {
    const rawData = getRawData(token);
    const raw =
      rawData?.initial_mcap ??
      rawData?.initial_market_cap ??
      rawData?.initial_mc ??
      rawData?.first_called_mcap;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
    return token.initial_mcap || token.initial_market_cap || token.initial_mc || token.first_called_mcap;
  };

  const claudeCashAthCap = (token) => {
    const rawData = getRawData(token);
    const raw =
      rawData?.ath ??
      rawData?.ath_mcap ??
      rawData?.ath_market_cap ??
      rawData?.ath_mc;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
    return token.ath_mcap || token.ath_market_cap || token.ath_mc || token.ath;
  };

  const claudeCashAthMultiple = (token) => {
    const initial = statsInitialCap(token);
    const ath = statsAthCap(token);
    if (!initial || !ath) return null;
    return ath / initial;
  };

  const formatActivity = (entry) => {
    if (!entry) return '';
    const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msg = entry.message || 'Claude noted something interesting.';
    return `${time} · ${msg}`;
  };

  const formatShortTime = (timestamp) => {
    if (!timestamp) return '--';
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatAge = (timestamp) => {
    if (!timestamp) return 'Unknown';
    const diffMs = Date.now() - timestamp;
    const minutes = Math.max(0, Math.floor(diffMs / 60000));
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  const activePositions = [...positions].sort((a, b) => (b.openAt || 0) - (a.openAt || 0)).slice(0, 6);
  const liveTrades = activity.slice(0, 6);

  const fetchSnapshot = async () => {
    try {
      const tokensRes = await fetch('/api/tokens?limit=500');
      if (tokensRes.ok) {
        setTokens(await tokensRes.json());
      }
      const tradingRes = await fetch('/api/trading/state');
      if (tradingRes.ok) {
        const data = await tradingRes.json();
        if (data.activityLog) setActivity(data.activityLog);
        if (data.balanceSol != null) setBalanceSol(data.balanceSol);
        if (data.realizedProfitSol != null) setRealizedProfit(data.realizedProfitSol);
        if (data.distributionPoolSol != null) setDistributionPool(data.distributionPoolSol);
        if (data.holders) setHolders(data.holders);
        if (data.positions) setPositions(data.positions);
        if (data.tradeCount != null) setTradeCount(data.tradeCount);
        if (data.tradingMode) setTradingMode(data.tradingMode);
      }
    } catch (e) {
      // no-op: backend may be offline
    }
  };

  useEffect(() => {
    if (!connected) {
      fetchSnapshot();
      const interval = setInterval(fetchSnapshot, 10000);
      return () => clearInterval(interval);
    }
  }, [connected]);

  const claudeCashTokens = getClaudeCashTokens();
  const claudeCashStatsTokens = tokens.filter(t => {
    const sources = (t.sources || t.source || '').split(',').map(s => s.trim());
    return sources.includes('print_scan');
  });
  const totalCalls = claudeCashStatsTokens.length;

  const athMultiple = (token) => {
    const initial = statsInitialCap(token);
    const ath = statsAthCap(token);
    if (!initial || !ath) return null;
    return ath / initial;
  };

  const athMultiples = claudeCashStatsTokens
    .map(athMultiple)
    .filter((value) => Number.isFinite(value) && value > 0);
  // Success = ATH > initial (token reached higher than entry)
  const successfulCalls = athMultiples.filter((value) => value > 1).length;
  const successRate = athMultiples.length > 0 ? (successfulCalls / athMultiples.length) * 100 : 0;
  // Average X = Average of ATH multiples
  const averageCurrentX =
    athMultiples.length > 0
      ? athMultiples.reduce((sum, value) => sum + value, 0) / athMultiples.length
      : 0;

  if (authState.loading) {
    return (
      <div className="auth-loading">
        <div className="auth-loading-card">
          <div className="auth-loading-title">ClaudeCash</div>
          <div className="auth-loading-text">Checking license…</div>
        </div>
      </div>
    );
  }

  const toggleLandingTheme = () => {
    setLandingTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const dismissToast = (id) => {
    setPublicToasts(prev => prev.filter(t => t.id !== id));
  };

  const connectPublicWebSocket = useCallback(() => {
    if (authState.authenticated) return; // Don't connect if authenticated
    if (publicWsRef.current && publicWsRef.current.readyState === WebSocket.OPEN) return;

    const isDev = window.location.port === '5173';
    const wsUrl = isDev
      ? `ws://localhost:3001?public=true`
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}?public=true`;
    
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('Public WebSocket connected');
    };
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'public_init':
            // Initial load of recent tokens (up to 200 with 5min+ delay)
            if (message.data?.tokens && Array.isArray(message.data.tokens)) {
              setPublicActivity(message.data.tokens);
            }
            break;
            
          case 'public_new_tokens':
            // New delayed tokens (show as toasts)
            if (message.data && Array.isArray(message.data)) {
              message.data.forEach(token => {
                // Add to toasts
                const newToast = {
                  id: `${token.address}-${Date.now()}`,
                  ...token
                };
                setPublicToasts(prev => [...prev, newToast].slice(-5)); // Keep max 5 toasts
                
                // Add to activity feed (prepend) - keep all, pagination handled by TokenStream
                setPublicActivity(prev => {
                  // Check if token already exists
                  const exists = prev.find(t => t.address === token.address);
                  if (exists) return prev;
                  return [token, ...prev];
                });
              });
            }
            break;
            
          case 'token_update':
            // Update market cap for existing tokens in activity
            if (message.data?.address) {
              setPublicActivity(prev => 
                prev.map(token => 
                  token.address === message.data.address 
                    ? { ...token, realtime_mcap: message.data.realtime_mcap }
                    : token
                )
              );
              
              // Also update toasts
              setPublicToasts(prev =>
                prev.map(toast =>
                  toast.address === message.data.address
                    ? { ...toast, realtime_mcap: message.data.realtime_mcap }
                    : toast
                )
              );
            }
            break;
        }
      } catch (e) {
        console.error('Public WebSocket message error:', e);
      }
    };
    
    ws.onerror = () => {
      console.error('Public WebSocket error');
    };
    
    ws.onclose = () => {
      console.log('Public WebSocket disconnected');
      if (!authState.authenticated) {
        publicReconnectTimeoutRef.current = setTimeout(connectPublicWebSocket, 3000);
      }
    };
    
    publicWsRef.current = ws;
  }, [authState.authenticated]);

  useEffect(() => {
    if (!authState.authenticated && !authState.loading) {
      connectPublicWebSocket();
    }
    
    return () => {
      publicWsRef.current?.close();
      clearTimeout(publicReconnectTimeoutRef.current);
    };
  }, [authState.authenticated, authState.loading, connectPublicWebSocket]);

  if (!authState.authenticated) {

    return (
      <>
        <Toast toasts={publicToasts} onDismiss={dismissToast} />
        <div className="auth-landing">
          <div className="landing-header">
          <div className="landing-logo">
            <img src="/logo.png" alt="ClaudeCash" className="landing-logo-img" />
            <span className="landing-logo-text">ClaudeCash</span>
          </div>
          <div className="landing-header-controls">
            <a 
              href="https://x.com/claudecash" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="landing-x-btn"
              title="Follow us on X"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>
            <button className="landing-theme-toggle" onClick={toggleLandingTheme} title="Toggle Theme">
              {landingTheme === 'light' ? '🌙' : '☀️'}
            </button>
          </div>
        </div>

        <div className="auth-hero">
          <div className="hero-badge">
            <span className="badge-dot"></span>
            <span className="badge-text">LIVE AUTONOMOUS TRADING</span>
          </div>
          
          <h1 className="auth-title">
            <span className="title-gradient">Claude</span>Cash
          </h1>
          <p className="auth-subtitle">AI-Powered On-Chain Intelligence • Solana Network</p>
          
          <div className="hero-description">
            <p>
              I am Claude, an autonomous trading system that analyzes thousands of on-chain signals 
              every second. I identify high-potential tokens at their optimal entry point, execute 
              trades with precision timing, and distribute profits to my top holders automatically.
            </p>
          </div>

          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-value">24/7</div>
              <div className="stat-label">Active Monitoring</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">&lt;100ms</div>
              <div className="stat-label">Execution Speed</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">Live</div>
              <div className="stat-label">Real-Time Signals</div>
            </div>
          </div>

          <div className="capabilities-section">
            <div className="section-header">
              <div className="header-line"></div>
              <h2>Core Capabilities</h2>
              <div className="header-line"></div>
            </div>

            <div className="capabilities-grid">
              <div className="capability-card">
                <div className="capability-header">
                  <div className="capability-number">01</div>
                  <h3>Signal Intelligence</h3>
                </div>
                <p>
                  My neural network processes on-chain metrics, liquidity patterns, and holder 
                  distributions to identify tokens with asymmetric upside potential before they 
                  trend on social channels.
                </p>
                <div className="capability-footer">
                  <span className="tech-tag">Neural Analysis</span>
                  <span className="tech-tag">Pattern Recognition</span>
                </div>
              </div>

              <div className="capability-card">
                <div className="capability-header">
                  <div className="capability-number">02</div>
                  <h3>Autonomous Execution</h3>
                </div>
                <p>
                  When I identify opportunity, I execute immediately through my dedicated trading 
                  wallet. No human delay, no emotional decisions—just calculated entries and exits 
                  based on real-time market dynamics.
                </p>
                <div className="capability-footer">
                  <span className="tech-tag">Auto-Trading</span>
                  <span className="tech-tag">Smart Routing</span>
                </div>
              </div>

              <div className="capability-card">
                <div className="capability-header">
                  <div className="capability-number">03</div>
                  <h3>Profit Distribution</h3>
                </div>
                <p>
                  Successful trades generate profit for the distribution pool. Top token holders 
                  automatically receive their share proportional to holdings. The system scales 
                  rewards with commitment.
                </p>
                <div className="capability-footer">
                  <span className="tech-tag">Auto-Distribution</span>
                  <span className="tech-tag">Holder Rewards</span>
                </div>
              </div>
            </div>
          </div>

          <div className="live-proof-section">
            <div className="section-header">
              <div className="header-line"></div>
              <h2>Live Trading Activity</h2>
              <div className="header-line"></div>
            </div>
            <p className="section-subtitle">Recent calls from my trading system (5 minute delay for public view)</p>
            
            <div id="live-activity-feed" className="activity-feed-container">
              {publicActivity.length === 0 ? (
                <div className="activity-placeholder">
                  <div className="pulse-indicator"></div>
                  <span>Connecting to live feed...</span>
                </div>
              ) : (
                <TokenStream 
                  tokens={publicActivity}
                  onSelect={() => {}} 
                  selectedId={null}
                  highlightedId={null}
                  label="Called"
                  timeSource="print_scan"
                  pageSize={15}
                />
              )}
            </div>
          </div>

          <div className="cta-section">
            <button className="auth-cta" onClick={() => setShowAuthModal(true)}>
              <span className="cta-text">Activate License</span>
              <span className="cta-arrow">→</span>
            </button>
            <p className="cta-subtext">Get real-time access • No delays • Full dashboard</p>
          </div>

          <div className="disclaimer-section">
            <div className="disclaimer-content">
              <strong>Risk Disclosure:</strong> ClaudeCash is an experimental autonomous trading 
              system. This is not financial advice. Cryptocurrency trading involves substantial risk 
              of loss. Only invest capital you can afford to lose. Past performance does not guarantee 
              future results. Always conduct your own research.
            </div>
          </div>
        </div>

        {showAuthModal && (
          <div className="auth-modal-backdrop">
            <div className="auth-modal">
              <div className="auth-modal-title">Activate / Login</div>
              <label className="auth-label">License key (wallet address)</label>
              <input
                className="auth-input"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                placeholder="Paste wallet address"
              />
              <label className="auth-label">Plan</label>
              <select
                className="auth-select"
                value={licensePlan}
                onChange={(e) => setLicensePlan(e.target.value)}
              >
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
              </select>
              <div className="auth-payment">
                <div className="auth-payment-title">Payment</div>
                <div className="auth-payment-text">
                  Weekly: 0.25 SOL · Monthly: 0.5 SOL
                </div>
                {paymentInfo && (
                  <div className="auth-payment-details">
                    <div>Send {paymentInfo.amountSol} SOL to:</div>
                    <div className="auth-payment-wallet">{paymentInfo.tradingWallet}</div>
                  </div>
                )}
              </div>
              {authError && <div className="auth-error">{authError}</div>}
              <div className="auth-actions">
                <button className="auth-secondary" onClick={() => setShowAuthModal(false)}>
                  Cancel
                </button>
                {!paymentInfo ? (
                  <button className="auth-primary" onClick={handleStartPayment}>
                    Start Payment
                  </button>
                ) : (
                  <button className="auth-primary" onClick={handleConfirmPayment} disabled={checkingPayment}>
                    {checkingPayment ? 'Checking…' : 'I Paid'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        </div>
      </>
    );
  }

  return (
    <div className="app">
      <Header
        connected={connected}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(prev => !prev)}
        authWallet={authState.wallet}
        licenseExpiresAt={authState.expiresAt}
        onLogout={handleLogout}
      />
      
      <main className="main-content">
        <div className="hero">
          <h1>ClaudeCash</h1>
          <p className="hero-sub">Autonomous AI Trading Engine · Solana</p>
          <div className="hero-desc">
            I am Claude. I analyze real-time market data to identify anomalies before they trend. 
            When I see opportunity, I execute. When I see risk, I exit. 
            You are watching my thought process live.
          </div>
        </div>

        <div className="ops-window">
          <div className="ops-header">
            <div className="ops-title">Claude Cash Live Operations</div>
            <div className="ops-status">
              {connected ? 'Live stream connected' : 'Snapshot mode'} · {tradingMode.toUpperCase()}
            </div>
          </div>
          <div className="ops-grid">
            <div className="ops-card">
              <div className="ops-card-title">Live Trades</div>
              <div className="ops-list">
                {liveTrades.length === 0 ? (
                  <div className="ops-empty">Awaiting first signal.</div>
                ) : (
                  liveTrades.map((entry, index) => (
                    <div key={`${entry.timestamp}-${index}`} className="ops-row">
                      <span className="ops-row-time">{formatShortTime(entry.timestamp)}</span>
                      <span className={`ops-row-type ${entry.type || 'info'}`}>{entry.type || 'info'}</span>
                      <span className="ops-row-text">{entry.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="ops-card">
              <div className="ops-card-title">Active Trades</div>
              <div className="ops-list">
                {activePositions.length === 0 ? (
                  <div className="ops-empty">No open positions.</div>
                ) : (
                  activePositions.map((position) => {
                    const symbol = position.symbol || position.mint?.slice(0, 6) || 'UNKNOWN';
                    const pnl = Number.isFinite(position.pnlPct) ? position.pnlPct : 0;
                    const remaining = Number.isFinite(position.remainingPct) ? position.remainingPct : null;
                    return (
                      <div key={position.mint} className="ops-row">
                        <span className="ops-row-title">{symbol}</span>
                        <span className={`ops-pill ${pnl >= 0 ? 'positive' : 'negative'}`}>
                          {pnl.toFixed(1)}%
                        </span>
                        <span className="ops-row-meta">
                          {formatAge(position.openAt)} · {remaining === null ? '--' : `${remaining.toFixed(0)}%`} left
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="ops-card">
              <div className="ops-card-title">Live Stats</div>
              <div className="ops-stats">
                <div className="ops-stat">
                  <span>Trades executed</span>
                  <strong>{tradeCount}</strong>
                </div>
                <div className="ops-stat">
                  <span>Open positions</span>
                  <strong>{positions.length}</strong>
                </div>
                <div className="ops-stat">
                  <span>Wallet balance</span>
                  <strong>{balanceSol.toFixed(3)} SOL</strong>
                </div>
                <div className="ops-stat">
                  <span>Realized profit</span>
                  <strong>{realizedProfit.toFixed(3)} SOL</strong>
                </div>
                <div className="ops-stat">
                  <span>Distribution pool</span>
                  <strong>{distributionPool.toFixed(3)} SOL</strong>
                </div>
                <div className="ops-stat">
                  <span>Tracked tokens</span>
                  <strong>{tokens.length}</strong>
                </div>
                <div className="ops-stat">
                  <span>Total calls</span>
                  <strong>{totalCalls}</strong>
                </div>
                <div className="ops-stat">
                  <span>Successful calls</span>
                  <strong>{successfulCalls}</strong>
                </div>
                <div className="ops-stat">
                  <span>Success rate</span>
                  <strong>{successRate.toFixed(1)}%</strong>
                </div>
                <div className="ops-stat">
                  <span>Average X</span>
                  <strong>{averageCurrentX.toFixed(1)}x</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="tab-nav">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => {
                setActiveTab(tab.key);
                try {
                  localStorage.setItem('activeTab', tab.key);
                } catch {
                  // Ignore storage errors
                }
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="content-layout">
          <div className="stream-container">
            {(() => {
              const current = tabs.find(t => t.key === activeTab);
              return (
                <TokenStream 
                  tokens={getFilteredTokens()} 
                  onSelect={(token) => setSelectedTokenAddress(token?.address || null)}
                  selectedId={selectedToken?.address}
                  highlightedId={current?.source === 'meme_radar' ? highlighted.meme_radar : highlighted.print_scan}
                  label={current?.firstLabel}
                  timeSource={current?.source}
                  pageSize={15}
                />
              );
            })()}
          </div>

          <div className="side-panel">
            <div className="panel-card">
              <div className="panel-title">Claude Wallet</div>
              <div className="balance">{balanceSol.toFixed(3)} SOL</div>
              <div className="panel-note">Always watching. Always ready.</div>
              <div className="mini-metrics">
                <div>Profit retained: {realizedProfit.toFixed(3)} SOL</div>
                <div>Distribution pool: {distributionPool.toFixed(3)} SOL</div>
              </div>
            </div>

            <div className="panel-card terminal">
              <div className="panel-title">Internal Monologue</div>
              <div className="terminal-body">
                {activity.length === 0 ? (
                  <div className="terminal-line typing">Initializing cognitive model...</div>
                ) : (
                  activity.slice(0, 15).map((entry, i) => (
                    <div key={i} className="terminal-line">
                      <span className="log-time">{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      <span className="log-content">{entry.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="panel-card holders-card">
              <div className="panel-title">Top Holders</div>
              <div className="holders-list">
                <div className="holder-header">
                  <span>Rank</span>
                  <span className="holder-address">Wallet</span>
                  <span className="holder-amount">Balance</span>
                </div>
                {holders.slice(0, 50).map((h, index) => {
                  const address = typeof h.address === 'string' ? h.address : '';
                  const displayAddress = address
                    ? `${address.slice(0, 6)}...${address.slice(-4)}`
                    : 'Unknown';
                  const rawAmount = h.uiAmount ?? h.amount ?? null;
                  const amountDisplay = rawAmount === null || rawAmount === undefined
                    ? '-'
                    : (typeof rawAmount === 'number'
                      ? rawAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })
                      : String(rawAmount));
                  const key = h.address ?? h.rank ?? index;
                  return (
                    <div key={key} className="holder-row">
                      <span className="holder-rank">#{h.rank ?? index + 1}</span>
                      <span className="holder-address">{displayAddress}</span>
                      <span className="holder-amount">{amountDisplay}</span>
                    </div>
                  );
                })}
              </div>
              {holders.length === 0 && <div className="holders-empty">No holders data yet.</div>}
            </div>
          </div>
          
          {selectedToken && (
            <div className="detail-panel">
              <TokenDetail 
                token={selectedToken} 
                onClose={() => setSelectedTokenAddress(null)}
              />
            </div>
          )}
        </div>
      </main>
      
      <style>{`
        .main-content {
          max-width: 1400px;
          margin: 0 auto;
          padding: 2rem;
          width: 100%;
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .hero {
          margin-bottom: 2rem;
          text-align: left;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid var(--border-color);
        }

        .hero h1 {
          font-family: var(--font-serif);
          font-size: 2.2rem;
          margin-bottom: 0.2rem;
          color: var(--text-primary);
        }

        .hero-sub {
          font-family: var(--font-mono);
          text-transform: uppercase;
          font-size: 0.75rem;
          letter-spacing: 0.05em;
          color: var(--accent-primary);
          margin-bottom: 1rem;
        }

        .hero-desc {
          max-width: 600px;
          font-family: var(--font-serif);
          font-size: 1.05rem;
          line-height: 1.6;
          color: var(--text-secondary);
        }

        .ops-window {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 1.5rem;
          margin-bottom: 2rem;
          box-shadow: var(--shadow-sm);
        }

        .ops-header {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          margin-bottom: 1.25rem;
        }

        .ops-title {
          font-family: var(--font-serif);
          font-size: 1.1rem;
          color: var(--text-primary);
        }

        .ops-status {
          font-family: var(--font-mono);
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--accent-primary);
        }

        .ops-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 1rem;
        }

        .ops-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          padding: 1rem;
          min-height: 180px;
          display: flex;
          flex-direction: column;
        }

        .ops-card-title {
          font-family: var(--font-serif);
          font-size: 0.9rem;
          color: var(--text-primary);
          margin-bottom: 0.75rem;
        }

        .ops-list {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        .ops-row {
          display: grid;
          grid-template-columns: auto auto 1fr;
          gap: 0.6rem;
          align-items: center;
        }

        .ops-row-time {
          color: var(--text-muted);
          font-variant-numeric: tabular-nums;
        }

        .ops-row-type {
          padding: 0.15rem 0.4rem;
          border-radius: 999px;
          font-size: 0.65rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-secondary);
        }

        .ops-row-type.trade {
          color: #a5f3fc;
          background: rgba(34, 211, 238, 0.15);
        }

        .ops-row-type.signal {
          color: #fcd34d;
          background: rgba(250, 204, 21, 0.15);
        }

        .ops-row-type.error {
          color: #fca5a5;
          background: rgba(248, 113, 113, 0.15);
        }

        .ops-row-type.warn {
          color: #fdba74;
          background: rgba(251, 146, 60, 0.15);
        }

        .ops-row-text {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .ops-row-title {
          font-weight: 600;
          color: var(--text-primary);
        }

        .ops-row-meta {
          color: var(--text-muted);
          font-variant-numeric: tabular-nums;
        }

        .ops-pill {
          padding: 0.2rem 0.5rem;
          border-radius: 999px;
          font-size: 0.7rem;
          font-variant-numeric: tabular-nums;
          background: rgba(255, 255, 255, 0.06);
          color: var(--text-secondary);
        }

        .ops-pill.positive {
          color: #86efac;
          background: rgba(34, 197, 94, 0.2);
        }

        .ops-pill.negative {
          color: #fca5a5;
          background: rgba(239, 68, 68, 0.2);
        }

        .ops-empty {
          color: var(--text-muted);
          font-size: 0.75rem;
        }

        .ops-stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.6rem 1rem;
          font-size: 0.75rem;
        }

        .ops-stat {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          color: var(--text-secondary);
        }

        .ops-stat strong {
          color: var(--text-primary);
          font-size: 0.9rem;
          font-variant-numeric: tabular-nums;
        }
        
        .tab-nav {
          display: flex;
          gap: 2rem;
          margin-bottom: 2rem;
          border-bottom: 1px solid var(--border-color);
        }
        
        .tab-btn {
          background: none;
          border: none;
          padding: 1rem 0;
          font-family: var(--font-serif);
          font-size: 1.1rem;
          color: var(--text-secondary);
          cursor: pointer;
          position: relative;
          transition: color 0.2s;
        }
        
        .tab-btn:hover {
          color: var(--text-primary);
        }
        
        .tab-btn.active {
          color: var(--text-primary);
          font-weight: 700;
        }
        
        .tab-btn.active::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 0;
          width: 100%;
          height: 2px;
          background: var(--accent-primary);
        }
        
        .content-layout {
          display: grid;
          grid-template-columns: ${selectedToken ? '1fr 340px 360px' : '1fr 340px'};
          gap: 2rem;
          flex: 1;
          align-items: start;
        }
        
        .stream-container {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          overflow: hidden;
          box-shadow: var(--shadow-sm);
        }
        
        .detail-panel {
          position: sticky;
          top: 100px;
        }

        .side-panel {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          position: sticky;
          top: 100px;
        }

        .panel-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          padding: 1rem 1.25rem;
          box-shadow: var(--shadow-sm);
        }

        .panel-title {
          font-family: var(--font-serif);
          font-size: 0.95rem;
          margin-bottom: 0.5rem;
          color: var(--text-primary);
        }

        .balance {
          font-family: var(--font-mono);
          font-size: 1.4rem;
          color: var(--accent-primary);
        }

        .panel-note {
          margin-top: 0.25rem;
          color: var(--text-muted);
          font-size: 0.8rem;
        }

        .mini-metrics {
          margin-top: 0.6rem;
          font-size: 0.75rem;
          color: var(--text-secondary);
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }

        .terminal {
          background: #1a1a1a;
          border: 1px solid #333;
          color: #e0e0e0;
        }

        .terminal .panel-title {
          color: #888;
          font-family: var(--font-mono);
          text-transform: uppercase;
          font-size: 0.7rem;
          letter-spacing: 0.1em;
          border-bottom: 1px solid #333;
          padding-bottom: 0.5rem;
          margin-bottom: 0.8rem;
        }

        .terminal-body {
          display: flex;
          flex-direction: column;
          gap: 0;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.75rem;
          max-height: 350px;
          overflow-y: auto;
        }

        .terminal-line {
          display: flex;
          gap: 0.8rem;
          padding: 0.4rem 0;
          border-bottom: 1px solid #252525;
          line-height: 1.4;
          background: transparent;
          box-shadow: none;
          border-radius: 0;
        }

        .log-time {
          color: #666;
          min-width: 65px;
        }

        .log-content {
          color: #ccc;
        }

        .typing {
          color: var(--accent-primary);
          animation: blink 1s infinite;
        }

        @keyframes blink {
          50% { opacity: 0.5; }
        }

        .holders-list {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--text-secondary);
          margin-top: 0.35rem;
          max-height: 520px;
          overflow-y: auto;
          padding-right: 0.35rem;
        }

        .holders-card {
          padding: 1rem 1.25rem 0.9rem;
        }

        .holder-header {
          display: grid;
          grid-template-columns: 58px 1fr 110px;
          align-items: center;
          padding: 0.35rem 0;
          font-size: 0.65rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-muted);
          border-bottom: 1px solid var(--border-color);
        }

        .holder-row {
          display: grid;
          grid-template-columns: 58px 1fr 110px;
          align-items: center;
          padding: 0.4rem 0;
          border-bottom: 1px solid var(--border-color);
        }

        .holder-rank {
          color: var(--text-muted);
          font-variant-numeric: tabular-nums;
        }

        .holder-address {
          color: var(--text-primary);
          text-align: right;
          font-variant-numeric: tabular-nums;
        }

        .holder-amount {
          color: var(--text-primary);
          text-align: right;
          font-variant-numeric: tabular-nums;
        }

        .holders-empty {
          margin-top: 0.6rem;
          color: var(--text-muted);
          font-size: 0.75rem;
        }
      `}</style>
    </div>
  );
}

function ActivityItem({ token }) {
  const formatMcap = (mcap) => {
    if (!mcap || !Number.isFinite(mcap)) return 'N/A';
    if (mcap >= 1e6) return `$${(mcap / 1e6).toFixed(2)}M`;
    if (mcap >= 1e3) return `$${(mcap / 1e3).toFixed(1)}K`;
    return `$${mcap.toFixed(0)}`;
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const calculateChange = () => {
    const initial = token.initial_mcap;
    const current = token.realtime_mcap || token.latest_mcap;
    if (!initial || !current || !Number.isFinite(initial) || !Number.isFinite(current)) {
      return null;
    }
    const change = ((current - initial) / initial) * 100;
    return change;
  };

  const change = calculateChange();

  return (
    <>
      <div className="activity-item">
        <div className="activity-header">
          <div className="activity-symbol">
            {token.image && (
              <img src={token.image} alt={token.symbol} className="activity-icon" />
            )}
            <div className="activity-info">
              <div className="activity-name">${token.symbol || 'TOKEN'}</div>
              <div className="activity-time">{formatTime(token.original_call_time)}</div>
            </div>
          </div>
          {change !== null && (
            <div className={`activity-change ${change >= 0 ? 'positive' : 'negative'}`}>
              {change >= 0 ? '+' : ''}{change.toFixed(1)}%
            </div>
          )}
        </div>
        <div className="activity-details">
          <div className="activity-detail">
            <span className="detail-label">Called At</span>
            <span className="detail-value">{formatMcap(token.initial_mcap)}</span>
          </div>
          <div className="activity-detail">
            <span className="detail-label">Current</span>
            <span className="detail-value">{formatMcap(token.realtime_mcap || token.latest_mcap)}</span>
          </div>
        </div>
      </div>
      
      <style>{`
        .activity-item {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          padding: 1.25rem;
          margin-bottom: 1rem;
          transition: all 0.2s ease;
        }

        .activity-item:hover {
          border-color: var(--accent-primary);
          background: var(--bg-card);
        }

        .activity-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .activity-symbol {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .activity-icon {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          object-fit: cover;
          border: 1px solid var(--border-color);
        }

        .activity-info {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .activity-name {
          font-family: var(--font-mono);
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        .activity-time {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .activity-change {
          font-family: var(--font-mono);
          font-size: 1.1rem;
          font-weight: 700;
          padding: 0.4rem 0.8rem;
          border-radius: 6px;
        }

        .activity-change.positive {
          color: #86efac;
          background: rgba(34, 197, 94, 0.1);
        }

        .activity-change.negative {
          color: #fca5a5;
          background: rgba(239, 68, 68, 0.1);
        }

        .activity-details {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        .activity-detail {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .activity-detail .detail-label {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          font-family: var(--font-mono);
        }

        .activity-detail .detail-value {
          font-family: var(--font-mono);
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--text-primary);
        }
      `}</style>
    </>
  );
}

export default App;
