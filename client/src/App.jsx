import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Header } from './components/Header';
import { TokenStream } from './components/TokenStream';
import { TokenDetail } from './components/TokenDetail';
import { Toast } from './components/Toast';
import { UserDashboard } from './components/UserDashboard';
import { WalletConnect } from './components/WalletConnect';
import { RemotionPlayer } from './components/RemotionPlayer';

function App() {
  const [tokens, setTokens] = useState([]);
  const [connected, setConnected] = useState(false);
  const [selectedTokenAddress, setSelectedTokenAddress] = useState(null);
  const tabs = [
    { key: 'gambles', label: 'Alpha Signals', source: 'meme_radar', firstLabel: 'Signal' },
    { key: 'claudecash', label: 'Cyphoai Select', source: 'print_scan', firstLabel: 'First' },
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
  const [soundEnabled, setSoundEnabled] = useState(false); // Sound disabled
  const [authState, setAuthState] = useState({
    loading: false, // No loading, instant access
    authenticated: true, // Bypassed paywall
    wallet: 'GUEST_ACCESS',
    plan: 'admin', // Grant admin features
    expiresAt: null,
    sessionToken: 'public-session',
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

  // User wallet trading state
  const [userWallet, setUserWallet] = useState(() => {
    try {
      return localStorage.getItem('userWallet') || null;
    } catch {
      return null;
    }
  });
  const [userConfig, setUserConfig] = useState(null);
  const [userPositions, setUserPositions] = useState([]);
  const [userStats, setUserStats] = useState(null);
  const [showWalletConnect, setShowWalletConnect] = useState(false);
  const [showUserDashboard, setShowUserDashboard] = useState(false);
  const [walletConnecting, setWalletConnecting] = useState(false);
  const [walletError, setWalletError] = useState('');

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
    // Only validate if not in public guest mode
    if (authState.sessionToken !== 'public-session') {
      validateSession();
    }
    // Fetch token gate info
    fetch('/api/auth/token-gate')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setTokenGateInfo(data); })
      .catch(() => { });
  }, [getOrCreateDeviceId, validateSession, authState.sessionToken]);

  useEffect(() => {
    if (!authState.authenticated || !authState.sessionToken || authState.sessionToken === 'public-session') return;
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
        setAuthError('Token payment not detected yet. Please ensure you sent 1 NFAi token to the correct wallet, then try again.');
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

  // ==== USER WALLET TRADING HANDLERS ====

  // Connect user wallet with private key
  const handleConnectUserWallet = async (privateKey) => {
    setWalletConnecting(true);
    setWalletError('');

    try {
      const res = await fetch('/api/user/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privateKey }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to connect wallet');
      }

      // Store wallet and update state
      localStorage.setItem('userWallet', data.walletAddress);
      setUserWallet(data.walletAddress);
      setUserConfig(data.config);
      setUserPositions(data.positions || []);
      setUserStats(data.stats);
      setShowWalletConnect(false);
      setShowUserDashboard(true);
    } catch (err) {
      setWalletError(err.message || 'Connection failed');
    } finally {
      setWalletConnecting(false);
    }
  };

  // Handle generated wallet (after user confirms they saved key)
  const handleGeneratedWallet = (data) => {
    localStorage.setItem('userWallet', data.walletAddress);
    setUserWallet(data.walletAddress);
    setUserConfig(data.config);
    setUserPositions(data.positions || []);
    setUserStats(data.stats);
    setShowWalletConnect(false);
    setShowUserDashboard(true);
  };

  // Load user state on mount if wallet exists
  const loadUserState = useCallback(async (wallet) => {
    if (!wallet) return;

    try {
      const res = await fetch(`/api/user/state/${wallet}`);
      if (!res.ok) {
        // User not found, clear storage
        localStorage.removeItem('userWallet');
        setUserWallet(null);
        return;
      }

      const data = await res.json();
      setUserConfig(data.config);
      setUserPositions(data.positions || []);
      setUserStats(data.stats);
    } catch (err) {
      console.error('Failed to load user state:', err);
    }
  }, []);

  // Update user configuration
  const handleUpdateUserConfig = async (updates) => {
    if (!userWallet) return;

    try {
      const res = await fetch(`/api/user/config/${userWallet}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update config');
      }

      setUserConfig(data.config);
    } catch (err) {
      console.error('Failed to update config:', err);
      throw err;
    }
  };

  // Disconnect user wallet
  const handleDisconnectUserWallet = async () => {
    if (!userWallet) return;

    try {
      await fetch('/api/user/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: userWallet }),
      });
    } catch {
      // ignore
    }

    localStorage.removeItem('userWallet');
    setUserWallet(null);
    setUserConfig(null);
    setUserPositions([]);
    setUserStats(null);
    setShowUserDashboard(false);
  };

  // Load user state on mount
  useEffect(() => {
    if (userWallet) {
      loadUserState(userWallet);
    }
  }, [userWallet, loadUserState]);

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
    let qs = `?token=${encodeURIComponent(authState.sessionToken)}&deviceId=${encodeURIComponent(deviceId)}`;

    // If guest access, force public mode on the socket
    if (authState.sessionToken === 'public-session') {
      qs += '&public=true';
    }

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
            setTokens(prev => {
              // Use Map for O(1) lookups instead of Set
              const tokenMap = new Map(prev.map(t => [t.address, t]));

              // Add new tokens, replacing any existing ones
              for (const token of newIncoming) {
                tokenMap.set(token.address, token);
              }

              // Convert back to array and keep last 500
              return Array.from(tokenMap.values()).slice(0, 500);
            });

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
            // Optimize: only update the specific token, not map over all tokens
            setTokens(prev => {
              const updateAddress = message.data.address || message.data.mint;
              const index = prev.findIndex(t => (t.address || t.mint) === updateAddress);
              if (index === -1) return prev; // Token not found, no update needed

              // Create new array with updated token
              const next = [...prev];
              next[index] = { ...prev[index], ...message.data };
              return next;
            });
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

  // Filter tokens based on active tab - MEMOIZED for performance
  const filteredTokens = useMemo(() => {
    const current = tabs.find(t => t.key === activeTab);
    if (!current) return [];

    const list = tokens.filter(t => {
      const sources = (t.sources || t.source || '').split(',').map(s => s.trim());
      return sources.includes(current.source);
    });

    return list.sort((a, b) => {
      const aTime = new Date(getTokenTimeBySource(a, current.source) || 0).getTime();
      const bTime = new Date(getTokenTimeBySource(b, current.source) || 0).getTime();
      return bTime - aTime;
    }).slice(0, 200);
  }, [tokens, activeTab]);

  // Keep old function for backward compatibility
  const getFilteredTokens = () => filteredTokens;

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
  }, [tokens]);

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
          <div className="auth-loading-title">Cyphoai</div>
          <div className="auth-loading-text">Initializing Systems…</div>
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
              <img src="/cyphoai-logo.jpg" alt="Cyphoai" className="landing-logo-img" />
              <span className="landing-logo-text">Cyphoai</span>
            </div>
            <div className="landing-header-controls">
              <button className="landing-theme-toggle" onClick={toggleLandingTheme} title="Toggle Theme">
                {landingTheme === 'light' ? '🌙' : '☀️'}
              </button>
            </div>
          </div>

          <div className="auth-hero">
            <div className="hero-split-layout">
              <div className="hero-text-col">
                <div className="hero-badge">
                  <span className="badge-dot"></span>
                  <span className="badge-text">CYPHOAI INTELLIGENCE</span>
                </div>
                
                <h1 className="auth-title">
                  <span className="title-gradient">Cyphoai</span>
                </h1>
                <p className="auth-subtitle">Automated Degen Intelligence • Solana</p>

                <div className="hero-description">
                  <p>
                    Cyphoai analyzes on-chain data with machine precision. 
                    Identifying opportunities, executing trades, and distributing yield to holders.
                    Clean. Fast. Profitable.
                  </p>
                </div>

                <div className="cta-section">
                  <button className="auth-cta" onClick={() => setShowAuthModal(true)}>
                    <span className="cta-text">Initialize Access</span>
                    <span className="cta-arrow">→</span>
                  </button>
                  <p className="cta-subtext">Real-time signals • Auto-trading • Portfolio tracking</p>
                  <p className="cta-token-gate">
                    🎫 <strong>Auto-authorize:</strong> Hold min {tokenGateInfo.enabled ? `${(tokenGateInfo.minAmount / 1000000).toFixed(0)}M` : '5M'} Cyphoai tokens
                  </p>
                </div>
              </div>

              <div className="hero-video-col">
                <div className="video-frame">
                   <RemotionPlayer 
                      videoSrc="/hero-video.mp4"
                      className="hero-video-element"
                   />
                </div>
              </div>
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
                    <h3>Market Intelligence</h3>
                  </div>
                  <p>
                    Advanced algorithms perceive patterns in the chaos of markets. 
                    Processing on-chain signals and liquidity flows to identify tokens with potential.
                  </p>
                  <div className="capability-footer">
                    <span className="tech-tag">Deep Learning</span>
                    <span className="tech-tag">Pattern Recognition</span>
                  </div>
                </div>

                <div className="capability-card">
                  <div className="capability-header">
                    <div className="capability-number">02</div>
                    <h3>Automated Execution</h3>
                  </div>
                  <p>
                    When opportunity appears, Cyphoai strikes with calculated precision.
                    No hesitation, no emotion. Trades execute at high speed.
                  </p>
                  <div className="capability-footer">
                    <span className="tech-tag">Auto-Trading</span>
                    <span className="tech-tag">Smart Routing</span>
                  </div>
                </div>

                <div className="capability-card">
                  <div className="capability-header">
                    <div className="capability-number">03</div>
                    <h3>Profit Sharing</h3>
                  </div>
                  <p>
                    Profits from successful trades flow automatically to loyal holders.
                    The greater your holdings, the greater your reward.
                  </p>
                  <div className="capability-footer">
                    <span className="tech-tag">Auto-Distribution</span>
                    <span className="tech-tag">Holder Rewards</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="visual-section">
              <div className="section-header">
                <div className="header-line"></div>
                <h2>Visual Intelligence</h2>
                <div className="header-line"></div>
              </div>
              <div className="visual-container">
                 <RemotionPlayer
                    videoSrc="/feature-video.mp4"
                    className="feature-video-player"
                 />
              </div>
            </div>

            <div className="live-proof-section">
              <div className="section-header">
                <div className="header-line"></div>
                <h2>Live Trading Activity</h2>
                <div className="header-line"></div>
              </div>
              <p className="section-subtitle">Recent calls from the system (5 minute delay for public view)</p>

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

            <div className="disclaimer-section">
              <div className="disclaimer-content">
                <strong>Risk Disclosure:</strong> Cyphoai is an experimental autonomous trading
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
                      Hold {(tokenGateInfo.minAmount / 1000000).toFixed(0)}M+ Cyphoai for free access
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
                      Send 1 Cyphoai token to verify wallet ownership
                    </div>
                    <div className="auth-payment-details">
                      <div className="payment-instruction">
                        <strong>Step 1:</strong> Send exactly <strong>1 Cyphoai</strong> token to:
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
                            • Verify you sent exactly 1 Cyphoai token<br />
                            • Check the transaction completed on-chain<br />
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
                            • Verify you sent the exact amount ({paymentInfo?.amountSol} SOL)<br />
                            • Check the transaction completed on-chain<br />
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
        userWallet={userWallet}
        onOpenWalletConnect={() => setShowWalletConnect(true)}
        onOpenDashboard={() => setShowUserDashboard(true)}
      />

      {/* User Wallet Connect Modal */}
      {showWalletConnect && (
        <WalletConnect
          onConnect={handleConnectUserWallet}
          onGenerate={handleGeneratedWallet}
          onClose={() => { setShowWalletConnect(false); setWalletError(''); }}
          loading={walletConnecting}
          error={walletError}
        />
      )}

      {soundEnabled && soundPermissionNeeded && (
        <div className="sound-permission">
          <span>Enable sound for new Cyphoai tokens.</span>
          <button onClick={requestSoundPermission}>Enable sound</button>
        </div>
      )}

      {/* When dashboard is shown, show dashboard page. Otherwise show main content */}
      {showUserDashboard && userWallet ? (
        <main className="dashboard-page-content">
          <UserDashboard
            userWallet={userWallet}
            userConfig={userConfig}
            userPositions={userPositions}
            userStats={userStats}
            onUpdateConfig={handleUpdateUserConfig}
            onLogout={handleDisconnectUserWallet}
            onClose={() => setShowUserDashboard(false)}
          />
        </main>
      ) : (
        <main id="main-content" className="main-content">
          <div className="dashboard-stats-bar">
            <div className="stat-pill">
              <span className="stat-label">System Status</span>
              <span className="stat-value-live">{connected ? 'ONLINE' : 'CONNECTING'}</span>
            </div>
            <div className="stat-pill">
              <span className="stat-label">Trades</span>
              <span className="stat-value">{tradeCount}</span>
            </div>
            <div className="stat-pill">
              <span className="stat-label">Win Rate</span>
              <span className="stat-value highlight">{successRate.toFixed(1)}%</span>
            </div>
            <div className="stat-pill">
              <span className="stat-label">Profit</span>
              <span className="stat-value">{realizedProfit.toFixed(3)} SOL</span>
            </div>
            <div className="stat-pill">
              <span className="stat-label">Avg Return</span>
              <span className="stat-value">{averageAthX.toFixed(1)}x</span>
            </div>
          </div>

          <div className="dashboard-grid">
            {/* Left Column: Feed */}
            <div className="feed-column">
              <div className="feed-header">
                <div className="tab-nav-clean">
                  {tabs.map((tab) => (
                    <button
                      key={tab.key}
                      className={`clean-tab ${activeTab === tab.key ? 'active' : ''}`}
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
              </div>

              <div className="stream-wrapper">
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
                      pageSize={20}
                    />
                  );
                })()}
              </div>
            </div>

            {/* Middle/Right Column: System Info */}
            <div className="info-column">
              {/* Active Trades */}
              <div className="info-card">
                <div className="card-header">
                  <h3>Active Positions</h3>
                  <span className="badge">{positions.length}</span>
                </div>
                <div className="positions-list">
                  {activePositions.length === 0 ? (
                    <div className="empty-state">No active positions</div>
                  ) : (
                    activePositions.map((position) => {
                      const symbol = position.symbol || position.mint?.slice(0, 6) || 'UNKNOWN';
                      const pnl = Number.isFinite(position.pnlPct) ? position.pnlPct : 0;
                      return (
                        <div key={position.mint} className="position-row">
                          <span className="pos-symbol">{symbol}</span>
                          <span className="pos-pnl ${pnl >= 0 ? 'positive' : 'negative'}">
                            {pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* System Console */}
              <div className="info-card console-card">
                <div className="card-header">
                  <h3>System Intelligence</h3>
                </div>
                <div className="console-body">
                  {activity.length === 0 ? (
                    <div className="console-line typing">System initializing...</div>
                  ) : (
                    activity.slice(0, 10).map((entry, i) => (
                      <div key={i} className="console-line">
                        <span className="time">{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="msg">{entry.message}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Top Holders */}
              <div className="info-card holders-card">
                <div className="card-header">
                   <h3>Profit Share (Top 50)</h3>
                </div>
                <div className="holders-list-clean">
                   {holders.slice(0, 50).map((h, index) => (
                      <div key={h.address || index} className="holder-row-clean">
                         <span className="rank">#{index + 1}</span>
                         <span className="address">{h.address ? `${h.address.slice(0,4)}...${h.address.slice(-4)}` : 'Unknown'}</span>
                         <span className="amount">{(h.uiAmount || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      </div>
                   ))}
                </div>
              </div>
            </div>

            {/* Rightmost: Detail Panel (if selected) */}
            {selectedToken && (
              <div className="detail-column desktop-only">
                <div className="sticky-detail">
                   <TokenDetail
                     token={selectedToken}
                     onClose={() => setSelectedTokenAddress(null)}
                   />
                </div>
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
      )}

      <style>{`
        /* --- General Layout --- */
        .app {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        .main-content {
          max-width: 1400px;
          margin: 0 auto;
          padding: 1.5rem;
          width: 100%;
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        /* --- Landing / Hero --- */
        .auth-landing {
          min-height: 100vh;
          background: var(--bg-primary);
        }

        .hero-split-layout {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4rem;
          align-items: center;
          padding: 4rem 1.5rem;
          max-width: 1200px;
          margin: 0 auto;
        }

        .hero-text-col {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .hero-video-col {
          display: flex;
          justify-content: center;
          align-items: center;
        }
        
        .video-frame {
           width: 100%;
           aspect-ratio: 16/9;
           border-radius: 20px;
           overflow: hidden;
           box-shadow: var(--shadow-lg);
           border: 1px solid var(--border-color);
           background: #000;
           position: relative;
        }
        
        .hero-video-element {
           width: 100%;
           height: 100%;
           display: block;
        }

        .visual-section {
           max-width: 1000px;
           margin: 0 auto 4rem;
           padding: 0 1.5rem;
        }
        
        .visual-container {
           width: 100%;
           aspect-ratio: 16/9;
           border-radius: 20px;
           overflow: hidden;
           box-shadow: var(--shadow-lg);
           border: 1px solid var(--border-color);
           background: #000;
        }

        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 50px;
          width: fit-content;
        }

        .badge-dot {
          width: 8px;
          height: 8px;
          background: var(--accent-secondary);
          border-radius: 50%;
          box-shadow: 0 0 10px rgba(16, 185, 129, 0.4);
        }

        .badge-text {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          letter-spacing: 0.05em;
          color: var(--text-secondary);
          font-weight: 600;
        }

        .auth-title {
          font-size: 4.5rem;
          line-height: 1.1;
          margin: 0;
          letter-spacing: -0.02em;
          font-weight: 700;
        }

        .title-gradient {
          background: var(--primary-gradient);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .auth-subtitle {
          font-family: var(--font-mono);
          font-size: 1.1rem;
          color: var(--text-secondary);
          margin: 0;
        }

        .hero-description {
          font-size: 1.1rem;
          line-height: 1.6;
          color: var(--text-secondary);
          max-width: 500px;
        }

        .cta-section {
          margin-top: 1rem;
        }

        .auth-cta {
          display: inline-flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem 2rem;
          background: var(--primary-gradient);
          border: none;
          border-radius: 12px;
          color: #fff;
          font-weight: 600;
          font-size: 1.1rem;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
          box-shadow: 0 4px 15px rgba(37, 99, 235, 0.3);
        }

        .auth-cta:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(37, 99, 235, 0.4);
        }

        .cta-subtext {
          margin-top: 1rem;
          font-size: 0.85rem;
          color: var(--text-muted);
        }

        .cta-token-gate {
          margin-top: 0.5rem;
          font-size: 0.85rem;
          color: var(--accent-primary);
          background: var(--bg-secondary);
          padding: 0.5rem 1rem;
          border-radius: 8px;
          display: inline-block;
          border: 1px solid var(--border-color);
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem;
          max-width: 800px;
          margin: 0 auto 4rem;
          padding: 0 1.5rem;
        }

        .stat-item {
          text-align: center;
          padding: 1.5rem;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          box-shadow: var(--shadow-sm);
        }

        .stat-item .stat-value {
          font-size: 2rem;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 0.5rem;
          font-family: var(--font-mono);
        }

        .stat-item .stat-label {
          font-size: 0.9rem;
          color: var(--text-secondary);
        }

        /* --- Dashboard Layout --- */
        .dashboard-stats-bar {
          display: flex;
          gap: 1.5rem;
          margin-bottom: 2rem;
          overflow-x: auto;
          padding-bottom: 0.5rem;
        }

        .stat-pill {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          padding: 1rem 1.5rem;
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          min-width: 140px;
          box-shadow: var(--shadow-sm);
        }

        .stat-pill .stat-label {
          font-size: 0.75rem;
          text-transform: uppercase;
          color: var(--text-muted);
          font-weight: 600;
        }

        .stat-pill .stat-value {
          font-family: var(--font-mono);
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        
        .stat-pill .stat-value.highlight {
           color: var(--accent-secondary);
        }

        .stat-value-live {
          font-family: var(--font-mono);
          font-size: 1rem;
          color: var(--accent-secondary);
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .stat-value-live::before {
          content: '';
          width: 8px;
          height: 8px;
          background: var(--accent-secondary);
          border-radius: 50%;
          box-shadow: 0 0 8px var(--accent-secondary);
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: 1fr 350px;
          gap: 1.5rem;
          height: calc(100vh - 200px);
        }

        /* Detail column (3 columns layout) */
        @media (min-width: 1400px) {
           .dashboard-grid:has(.detail-column) {
              grid-template-columns: 1fr 300px 320px;
           }
        }

        .feed-column {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          overflow: hidden;
        }

        .feed-header {
           display: flex;
           justify-content: space-between;
           align-items: center;
        }

        .tab-nav-clean {
           display: flex;
           gap: 1rem;
           background: var(--bg-secondary);
           padding: 0.5rem;
           border-radius: 10px;
           border: 1px solid var(--border-color);
        }
        
        .clean-tab {
           background: transparent;
           border: none;
           padding: 0.5rem 1rem;
           border-radius: 8px;
           color: var(--text-secondary);
           cursor: pointer;
           font-weight: 500;
           transition: all 0.2s;
        }
        
        .clean-tab:hover {
           color: var(--text-primary);
           background: var(--bg-hover);
        }
        
        .clean-tab.active {
           background: var(--bg-card);
           color: var(--accent-primary);
           box-shadow: var(--shadow-sm);
        }

        .stream-wrapper {
           flex: 1;
           overflow-y: auto;
           padding-right: 0.5rem;
        }

        .info-column {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          overflow-y: auto;
          padding-right: 0.25rem;
        }

        .info-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 1.25rem;
          box-shadow: var(--shadow-sm);
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .card-header h3 {
          font-size: 1rem;
          margin: 0;
          color: var(--text-primary);
        }

        .badge {
          background: var(--bg-secondary);
          color: var(--text-secondary);
          padding: 0.2rem 0.6rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
          border: 1px solid var(--border-color);
        }

        .positions-list {
           display: flex;
           flex-direction: column;
           gap: 0.75rem;
        }

        .position-row {
           display: flex;
           justify-content: space-between;
           padding: 0.75rem;
           background: var(--bg-secondary);
           border-radius: 8px;
           border: 1px solid var(--border-color);
        }
        
        .pos-symbol {
           font-weight: 600;
           color: var(--text-primary);
        }
        
        .pos-pnl {
           font-family: var(--font-mono);
           font-weight: 600;
        }
        
        .pos-pnl.positive { color: var(--accent-secondary); }
        .pos-pnl.negative { color: #ef4444; }

        .console-card {
           min-height: 200px;
        }
        
        .console-body {
           font-family: 'JetBrains Mono', monospace;
           font-size: 0.8rem;
           color: var(--text-secondary);
           display: flex;
           flex-direction: column;
           gap: 0.5rem;
           max-height: 200px;
           overflow-y: auto;
        }
        
        .console-line {
           display: flex;
           gap: 0.75rem;
        }
        
        .console-line .time {
           color: var(--text-muted);
           min-width: 60px;
        }
        
        .console-line .msg {
           color: var(--text-primary);
        }

        .holders-list-clean {
           display: flex;
           flex-direction: column;
           gap: 0.5rem;
           max-height: 300px;
           overflow-y: auto;
        }
        
        .holder-row-clean {
           display: grid;
           grid-template-columns: 30px 1fr 80px;
           align-items: center;
           padding: 0.5rem;
           background: var(--bg-secondary);
           border-radius: 6px;
           font-size: 0.85rem;
        }
        
        .holder-row-clean .rank {
           color: var(--accent-primary);
           font-weight: 600;
        }
        
        .holder-row-clean .address {
           font-family: var(--font-mono);
           color: var(--text-secondary);
        }
        
        .holder-row-clean .amount {
           text-align: right;
           font-family: var(--font-mono);
           color: var(--text-primary);
        }

        .detail-column {
           height: 100%;
           overflow-y: auto;
        }
        
        .sticky-detail {
           position: sticky;
           top: 0;
        }
        
        .empty-state {
           text-align: center;
           color: var(--text-muted);
           padding: 2rem;
           font-style: italic;
        }

        @media (max-width: 900px) {
           .hero-split-layout {
              grid-template-columns: 1fr;
              gap: 2rem;
              padding: 2rem 1rem;
           }
           
           .auth-title {
              font-size: 3rem;
           }
           
           .dashboard-stats-bar {
              flex-wrap: nowrap;
              overflow-x: auto;
              padding-bottom: 1rem;
           }
           
           .dashboard-grid {
              grid-template-columns: 1fr;
              height: auto;
              overflow: visible;
           }
           
           .info-column {
              overflow: visible;
           }
           
           .desktop-only {
              display: none;
           }
           
           .mobile-only {
              display: block;
           }
        }
      `}</style>
    </div>
  );
}

function ActivityItem({ token }) {
  const formatMcap = (mcap) => {
    if (!mcap || !Number.isFinite(mcap)) return 'N/A';
    if (mcap >= 1e6) return '$' + (mcap / 1e6).toFixed(2) + 'M';
    if (mcap >= 1e3) return '$' + (mcap / 1e3).toFixed(1) + 'K';
    return '$' + mcap.toFixed(0);
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
          color: #10b981;
          background: rgba(16, 185, 129, 0.1);
        }

        .activity-change.negative {
          color: #ef4444;
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
