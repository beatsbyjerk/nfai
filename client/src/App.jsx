import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  const [paymentTimeout, setPaymentTimeout] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [tokenGateVerifying, setTokenGateVerifying] = useState(false);
  const [tokenGateTimeout, setTokenGateTimeout] = useState(null);
  const [tokenGateRetryCount, setTokenGateRetryCount] = useState(0);
  const [tokenGateInfo, setTokenGateInfo] = useState({ enabled: false, mint: null, minAmount: 0 });
  const [landingTheme, setLandingTheme] = useState(() => {
    try {
      return localStorage.getItem('theme') || 'light';
    } catch {
      return 'light';
    }
  });
  const [soundPermissionNeeded, setSoundPermissionNeeded] = useState(false);
  
  // Public feed state (for unauthenticated landing page)
  const [publicToasts, setPublicToasts] = useState([]);
  const [publicActivity, setPublicActivity] = useState([]);
  const [publicSelectedToken, setPublicSelectedToken] = useState(null);
  const publicActivityRef = useRef([]);
  
  const deviceIdRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const audioRef = useRef(null);
  const tokensRef = useRef(tokens);
  const activeTabRef = useRef(activeTab);
  const soundEnabledRef = useRef(soundEnabled);
  const lastSoundTokenRef = useRef(null);
  const claudeCashSeenRef = useRef(new Set());
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
    publicActivityRef.current = publicActivity;
  }, [publicActivity]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const requestSoundPermission = useCallback(async () => {
    if (!audioRef.current) return;
    try {
      // Attempt a short play to unlock audio, then pause/reset
      await audioRef.current.play();
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setSoundPermissionNeeded(false);
    } catch (err) {
      console.warn('Unable to unlock audio:', err);
      setSoundPermissionNeeded(true);
    }
  }, []);

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
    // Fetch token gate info
    fetch('/api/auth/token-gate')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setTokenGateInfo(data); })
      .catch(() => {});
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
      const normalizedWallet = (licenseKey || '').trim().replace(/\s+/g, '');
      const res = await fetch('/api/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: normalizedWallet, plan: licensePlan, deviceId }),
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
      const normalizedWallet = (licenseKey || '').trim().replace(/\s+/g, '');
      const res = await fetch('/api/auth/payment/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: normalizedWallet, plan: licensePlan }),
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
    const deviceId = deviceIdRef.current || getOrCreateDeviceId();
    
    const normalizedWallet = (licenseKey || '').trim().replace(/\s+/g, '');
    const walletRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (!normalizedWallet || !walletRegex.test(normalizedWallet)) {
      setAuthError('Invalid wallet address. Please check the address and try again.');
      return;
    }
    
    setCheckingPayment(true);
    setRetryCount(0);
    
    // Set a timeout countdown (30 seconds max per attempt)
    let timeLeft = 30;
    setPaymentTimeout(timeLeft);
    const countdownInterval = setInterval(() => {
      timeLeft--;
      setPaymentTimeout(timeLeft);
      if (timeLeft <= 0) {
        clearInterval(countdownInterval);
      }
    }, 1000);
    
    try {
      const res = await fetch('/api/auth/payment/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          wallet: normalizedWallet, 
          plan: licensePlan, 
          deviceId,
          timeoutMs: 30000 // 30 seconds instead of 60
        }),
      });
      
      clearInterval(countdownInterval);
      setPaymentTimeout(null);
      
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
      setRetryCount(0);
    } catch (error) {
      clearInterval(countdownInterval);
      setPaymentTimeout(null);
      
      const errorMsg = error.message || 'Payment not found';
      if (errorMsg.includes('not found') || errorMsg.includes('timeout')) {
        setAuthError('Payment not detected yet. Please ensure you sent the exact amount to the correct wallet, then try again.');
        setRetryCount(prev => prev + 1);
      } else {
        setAuthError(errorMsg);
      }
    } finally {
      setCheckingPayment(false);
    }
  };

  const handleCancelPayment = () => {
    setPaymentInfo(null);
    setAuthError('');
    setPaymentTimeout(null);
    setCheckingPayment(false);
    setRetryCount(0);
  };

  const handleVerifyTokenGate = async () => {
    setAuthError('');
    setTokenGateVerifying(true);
    setTokenGateRetryCount(0);
    const deviceId = deviceIdRef.current || getOrCreateDeviceId();
    
    // Set a timeout countdown (30 seconds max per attempt)
    let timeLeft = 30;
    setTokenGateTimeout(timeLeft);
    const countdownInterval = setInterval(() => {
      timeLeft--;
      setTokenGateTimeout(timeLeft);
      if (timeLeft <= 0) {
        clearInterval(countdownInterval);
      }
    }, 1000);
    
    try {
      const normalizedWallet = (licenseKey || '').trim().replace(/\s+/g, '');
      const res = await fetch('/api/auth/token-gate/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          wallet: normalizedWallet, 
          deviceId,
          timeoutMs: 30000 // 30 seconds
        }),
      });
      
      clearInterval(countdownInterval);
      setTokenGateTimeout(null);
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Token payment not found');
      
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
      setTokenGateRetryCount(0);
    } catch (error) {
      clearInterval(countdownInterval);
      setTokenGateTimeout(null);
      
      const errorMsg = error.message || 'Token payment not found';
      if (errorMsg.includes('not found') || errorMsg.includes('timeout')) {
        setAuthError('Token payment not detected yet. Please ensure you sent 1 $CLAUDECASH token to the correct wallet, then try again.');
        setTokenGateRetryCount(prev => prev + 1);
      } else {
        setAuthError(errorMsg);
      }
    } finally {
      setTokenGateVerifying(false);
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

  const toggleLandingTheme = () => {
    setLandingTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const dismissToast = (id) => {
    setPublicToasts(prev => prev.filter(t => t.id !== id));
  };

  const connectPublicWebSocket = useCallback(() => {
    if (authState.authenticated) return;
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
          case 'init':
          case 'refresh':
            // Initial load - same as authenticated users but filtered to 5+ min old
            if (message.data?.tokens && Array.isArray(message.data.tokens)) {
              setPublicActivity(message.data.tokens);
              publicActivityRef.current = message.data.tokens;
            }
            break;
            
          case 'new_tokens':
            // New ClaudeCash calls (after 5 min delay)
            if (message.data && Array.isArray(message.data)) {
              // Only toast when a token is actually NEW to the public feed.
              // This prevents "false toasts" on reconnect/resync when the server may
              // send a token that is already visible in the feed.
              const existing = new Set((publicActivityRef.current || []).map(t => t?.address).filter(Boolean));
              const fresh = message.data.filter(t => t?.address && !existing.has(t.address));
              if (fresh.length === 0) break;

              // Add to activity feed (prepend, no duplicates)
              setPublicActivity(prev => {
                const prevList = Array.isArray(prev) ? prev : [];
                const prevByAddress = new Set(prevList.map(t => t?.address).filter(Boolean));
                const uniqueFresh = fresh.filter(t => t?.address && !prevByAddress.has(t.address));
                const next = [...uniqueFresh, ...prevList];
                publicActivityRef.current = next;
                return next;
              });

              // Toast only for tokens that were newly inserted into the feed
              setPublicToasts(prev => {
                const prevList = Array.isArray(prev) ? prev : [];
                const prevToastAddresses = new Set(prevList.map(t => t?.address).filter(Boolean));
                const now = Date.now();
                const toAdd = fresh
                  .filter(t => t?.address && !prevToastAddresses.has(t.address))
                  .map(t => ({ id: `${t.address}-${now}`, ...t }));
                return [...prevList, ...toAdd].slice(-5);
              });
            }
            break;
            
          case 'token_update':
            // Real-time market cap updates (same as authenticated)
            if (message.data?.address) {
              setPublicActivity(prev => 
                prev.map(token => 
                  token.address === message.data.address 
                    ? { ...token, ...message.data }
                    : token
                )
              );
              
              // Also update toasts
              setPublicToasts(prev =>
                prev.map(toast =>
                  toast.address === message.data.address
                    ? { ...toast, ...message.data }
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

            // Replace highlight per source and play sound for new ClaudeCash tokens
            for (const token of newIncoming) {
              const sources = (token.sources || token.source || '').split(',').map(s => s.trim()).filter(Boolean);
              const hasMemeRadar = sources.includes('meme_radar') || token.source === 'meme_radar';
              const hasPrintScan = sources.includes('print_scan') || token.source === 'print_scan';
              
              if (hasMemeRadar) {
                setHighlighted(prev => ({ ...prev, meme_radar: token.address }));
              }
              if (hasPrintScan) {
                setHighlighted(prev => ({ ...prev, print_scan: token.address }));
                
                // Play sound once per new ClaudeCash token
                if (
                  soundEnabledRef.current &&
                  audioRef.current &&
                  token.isNew &&
                  token.address !== lastSoundTokenRef.current
                ) {
                  lastSoundTokenRef.current = token.address;
                  try {
                    audioRef.current.currentTime = 0; // Reset to start
                    audioRef.current.play().catch(err => {
                      console.warn('Failed to play sound:', err);
                      setSoundPermissionNeeded(true);
                    });
                  } catch (err) {
                    console.warn('Error playing sound:', err);
                    setSoundPermissionNeeded(true);
                  }
                }
              }
            }

            break;

          case 'token_update':
            setTokens(prev => prev.map(t => {
              const updateAddress = message.data.address || message.data.mint;
              const tokenAddress = t.address || t.mint;
              if (tokenAddress !== updateAddress) return t;
              return { ...t, ...message.data };
            }));
            break;

          case 'activity':
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
    // Use highest_multiplier from database (correct value)
    if (token.highest_multiplier != null && Number.isFinite(token.highest_multiplier) && token.highest_multiplier > 0) {
      return token.highest_multiplier;
    }
    // Fallback: try from raw_data
    const rawData = getRawData(token);
    if (rawData?.highest_multiplier != null) {
      const parsed = parseFloat(rawData.highest_multiplier);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
    // Last resort: calculate manually
    const initial = statsInitialCap(token);
    const ath = statsAthCap(token);
    if (!initial || !ath) return null;
    return ath / initial;
  };

  const athMultiples = claudeCashStatsTokens
    .map(athMultiple)
    .filter((value) => Number.isFinite(value) && value > 0);
  
  // Success = How many tokens have ATH > Initial (any gain)
  const successfulCalls = athMultiples.filter((value) => value > 1).length;
  const successRate = totalCalls > 0 ? (successfulCalls / totalCalls) * 100 : 0;
  
  // Average X = Average of all ATH X multiples
  const averageAthX = athMultiples.length > 0
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
          <div className="landing-ca-address">
            CA: GR4up7L5HAL1Ww48aLyTcUzE4UiWHV8Txt56KbSupump
          </div>
          <div className="landing-header-controls">
            <a 
              href="https://x.com/claudecash_sol" 
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
                <>
                  <TokenStream 
                    tokens={publicActivity}
                    onSelect={setPublicSelectedToken} 
                    selectedId={publicSelectedToken?.address}
                    highlightedId={null}
                    label="Called"
                    timeSource="print_scan"
                    pageSize={15}
                  />
                  {publicSelectedToken && typeof document !== 'undefined' && createPortal(
                    <div
                      className="token-detail-modal"
                      role="dialog"
                      aria-modal="true"
                      onClick={() => setPublicSelectedToken(null)}
                    >
                      <div className="modal-scrim" />
                      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                      <TokenDetail 
                        token={publicSelectedToken} 
                        onClose={() => setPublicSelectedToken(null)}
                      />
                    </div>
                    </div>,
                    document.body
                  )}
                </>
              )}
            </div>
          </div>

          <div className="cta-section">
            <button className="auth-cta" onClick={() => setShowAuthModal(true)}>
              <span className="cta-text">Activate License</span>
              <span className="cta-arrow">→</span>
            </button>
            <p className="cta-subtext">Get real-time access • No delays • Full dashboard</p>
            <p className="cta-token-gate">
              🎫 <strong>Auto-authorize:</strong> Hold min {tokenGateInfo.enabled ? `${(tokenGateInfo.minAmount / 1000000).toFixed(0)}M` : '5M'} $CLAUDECASH tokens for free access
            </p>
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
              {tokenGateInfo.enabled && (
                <div className="token-gate-info">
                  <span className="token-gate-badge">🎫 Token Gate</span>
                  <span className="token-gate-text">
                    Hold {(tokenGateInfo.minAmount / 1000000).toFixed(0)}M+ $CLAUDECASH for free access
                  </span>
                </div>
              )}
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
                {tokenGateInfo.enabled && <option value="holder">Holder (auto-check)</option>}
              </select>
              {licensePlan === 'holder' && tokenGateInfo.enabled ? (
                <div className="auth-payment">
                  <div className="auth-payment-title">Token Gate Verification</div>
                  <div className="auth-payment-text">
                    Send 1 $CLAUDECASH token to verify wallet ownership
                  </div>
                  <div className="auth-payment-details">
                    <div className="payment-instruction">
                      <strong>Step 1:</strong> Send exactly <strong>1 $CLAUDECASH</strong> token to:
                    </div>
                    <div className="auth-payment-wallet" onClick={() => {
                      if (tokenGateInfo.tradingWallet) {
                        navigator.clipboard.writeText(tokenGateInfo.tradingWallet);
                        alert('Wallet address copied!');
                      }
                    }}>
                      {tokenGateInfo.tradingWallet || 'Loading...'}
                      <span className="copy-hint">Click to copy</span>
                    </div>
                    <div className="payment-instruction">
                      <strong>Step 2:</strong> After sending, click "Verify Token Payment" below
                    </div>
                    {tokenGateVerifying && tokenGateTimeout && (
                      <div className="payment-checking">
                        <div className="checking-spinner"></div>
                        <span>Checking for token payment... ({tokenGateTimeout}s)</span>
                      </div>
                    )}
                    {tokenGateRetryCount > 0 && !tokenGateVerifying && (
                      <div className="payment-retry-info">
                        Attempt {tokenGateRetryCount}. If you sent the token, it may take a moment to confirm on-chain.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
              <div className="auth-payment">
                <div className="auth-payment-title">Payment Options</div>
                <div className="auth-payment-text">
                  Weekly: 2 SOL · Monthly: 4 SOL
                </div>
                {paymentInfo && (
                  <div className="auth-payment-details">
                    <div className="payment-instruction">
                      <strong>Step 1:</strong> Send exactly <strong>{paymentInfo.amountSol} SOL</strong> to:
                    </div>
                    <div className="auth-payment-wallet" onClick={() => {
                      navigator.clipboard.writeText(paymentInfo.tradingWallet);
                      alert('Wallet address copied!');
                    }}>
                      {paymentInfo.tradingWallet}
                      <span className="copy-hint">Click to copy</span>
                    </div>
                    <div className="payment-instruction">
                      <strong>Step 2:</strong> After sending, click "I Paid" below
                    </div>
                    {checkingPayment && paymentTimeout && (
                      <div className="payment-checking">
                        <div className="checking-spinner"></div>
                        <span>Checking for payment... ({paymentTimeout}s)</span>
                      </div>
                    )}
                    {retryCount > 0 && !checkingPayment && (
                      <div className="payment-retry-info">
                        Attempt {retryCount}. If you sent payment, it may take a moment to confirm on-chain.
                      </div>
                    )}
                  </div>
                )}
              </div>
              )}
              {authError && (
                <div className="auth-error">
                  {authError}
                  {licensePlan === 'holder' && tokenGateInfo.enabled ? (
                    <>
                      {tokenGateRetryCount > 0 && tokenGateRetryCount < 3 && (
                        <div className="error-help">
                          • Verify you sent exactly 1 $CLAUDECASH token<br/>
                          • Check the transaction completed on-chain<br/>
                          • Wait 30-60 seconds after sending before clicking "Verify Token Payment"
                        </div>
                      )}
                      {tokenGateRetryCount >= 3 && (
                        <div className="error-help">
                          Still not working? Contact support with your wallet address and transaction signature.
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                  {retryCount > 0 && retryCount < 3 && (
                    <div className="error-help">
                      • Verify you sent the exact amount ({paymentInfo?.amountSol} SOL)<br/>
                      • Check the transaction completed on-chain<br/>
                      • Wait 30-60 seconds after sending before clicking "I Paid"
                    </div>
                  )}
                  {retryCount >= 3 && (
                    <div className="error-help">
                      Still not working? Contact support with your wallet address and transaction signature.
                    </div>
                      )}
                    </>
                  )}
                </div>
              )}
              <div className="auth-actions">
                <button type="button" className="auth-secondary" onClick={() => setShowAuthModal(false)}>
                  Cancel
                </button>
                <button type="button" className="auth-activate" onClick={handleActivate}>
                  Activate Existing
                </button>
                {licensePlan === 'holder' && tokenGateInfo.enabled ? (
                  <button type="button" className="auth-primary" onClick={handleVerifyTokenGate} disabled={tokenGateVerifying || !licenseKey.trim()}>
                    {tokenGateVerifying ? `Verifying (${tokenGateTimeout}s)` : 'Verify Token Payment'}
                  </button>
                ) : !paymentInfo ? (
                  <button type="button" className="auth-primary" onClick={handleStartPayment}>
                    New Payment
                  </button>
                ) : (
                  <>
                    <button type="button" className="auth-cancel-payment" onClick={handleCancelPayment} disabled={checkingPayment}>
                      Cancel Payment
                    </button>
                    <button type="button" className="auth-primary" onClick={handleConfirmPayment} disabled={checkingPayment}>
                      {checkingPayment ? `Checking (${paymentTimeout}s)` : 'I Paid'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
        </div>
      </>
    );
  }

  const handleToggleSound = () => {
    setSoundEnabled(prev => {
      const next = !prev;
      try {
        alert(next ? 'Sound ON: bell enabled' : 'Sound OFF: bell muted');
      } catch {
        // ignore
      }
      if (next && audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {
          setSoundPermissionNeeded(true);
        });
      }
      return next;
    });
  };

  return (
    <div className="app">
      <Header
        connected={connected}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        authWallet={authState.wallet}
        licenseExpiresAt={authState.expiresAt}
        onLogout={handleLogout}
      />
      {soundEnabled && soundPermissionNeeded && (
        <div className="sound-permission">
          <span>Enable sound for new ClaudeCash tokens.</span>
          <button onClick={requestSoundPermission}>Enable sound</button>
        </div>
      )}
      
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
                  liveTrades.map((entry, index) => {
                    let message = entry.message;
                    if (entry.message && entry.message.startsWith('Monitoring ')) {
                      const symbolMatch = entry.message.match(/^Monitoring\s+([^:]+):/);
                      if (symbolMatch) {
                        const symbol = symbolMatch[1].trim();
                        const position = positions.find(p => p.symbol === symbol || (p.mint && symbol.length >= 6 && p.mint.slice(0, 6) === symbol.slice(0, 6)));
                        if (position) {
                          const token = tokens.find(t => t.address === position.mint || t.mint === position.mint);
                          if (token && position.entryMcap) {
                            const currentMcap = token.realtime_mcap || token.latest_mcap;
                            if (currentMcap && Number.isFinite(currentMcap) && currentMcap > 0) {
                              const pnlPct = ((currentMcap - position.entryMcap) / position.entryMcap) * 100;
                              message = `Monitoring ${position.symbol || symbol}: $${currentMcap.toFixed(0)} mcap, ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}% P&L`;
                            }
                          }
                        }
                      }
                    }
                    return (
                      <div key={`${entry.timestamp}-${index}`} className="ops-row">
                        <span className="ops-row-time">{formatShortTime(entry.timestamp)}</span>
                        <span className={`ops-row-type ${entry.type || 'info'}`}>{entry.type || 'info'}</span>
                        <span className="ops-row-text">{message}</span>
                      </div>
                    );
                  })
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
                  <span>Average Profit</span>
                  <strong>{averageAthX.toFixed(1)}x</strong>
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
            <div className="detail-panel desktop-only">
              <TokenDetail 
                token={selectedToken} 
                onClose={() => setSelectedTokenAddress(null)}
              />
            </div>
          )}
        </div>

        {selectedToken && (
          <div
            className="token-detail-modal mobile-only"
            role="dialog"
            aria-modal="true"
            onClick={() => setSelectedTokenAddress(null)}
          >
            <div className="modal-scrim" />
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <TokenDetail token={selectedToken} onClose={() => setSelectedTokenAddress(null)} />
            </div>
          </div>
        )}
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

        .sound-permission {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin: 0 2rem;
          padding: 0.6rem 0.9rem;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-secondary);
        }

        .sound-permission button {
          border: 1px solid var(--border-color);
          background: var(--bg-card);
          padding: 0.35rem 0.75rem;
          border-radius: 6px;
          cursor: pointer;
          color: var(--text-primary);
          transition: all 0.2s ease;
        }

        .sound-permission button:hover {
          border-color: var(--accent-primary);
          color: var(--accent-primary);
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

        /* Mobile: stack columns to avoid horizontal overflow (do not affect desktop) */
        @media (max-width: 900px) {
          .main-content {
            padding: 1rem;
          }

          .ops-grid {
            grid-template-columns: 1fr;
          }

          .content-layout {
            grid-template-columns: 1fr !important;
            gap: 1rem;
          }

          .side-panel,
          .detail-panel {
            position: static;
            top: auto;
          }

          .tab-nav {
            gap: 1rem;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }

          .tab-btn {
            flex: 0 0 auto;
          }
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
