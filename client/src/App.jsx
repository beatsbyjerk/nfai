import { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { TokenStream } from './components/TokenStream';
import { TokenDetail } from './components/TokenDetail';

function App() {
  const [tokens, setTokens] = useState([]);
  const [connected, setConnected] = useState(false);
  const [selectedToken, setSelectedToken] = useState(null);
  const tabs = [
    { key: 'gambles', label: 'Gambles', source: 'meme_radar', firstLabel: 'First Called' },
    { key: 'claudecash', label: 'ClaudeCash', source: 'print_scan', firstLabel: 'First' },
  ];
  const [activeTab, setActiveTab] = useState('gambles');
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
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const audioRef = useRef(null);
  const tokensRef = useRef(tokens);
  const activeTabRef = useRef(activeTab);
  const soundEnabledRef = useRef(soundEnabled);
  const claudeCashSeenRef = useRef(new Set());
  const lastSoundTokenRef = useRef(null);
  const lastActivitySoundRef = useRef(null);

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

  const connectWebSocket = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const isDev = window.location.port === '5173';
    const wsUrl = isDev ? 'ws://localhost:3001' : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
    const mergeRefreshTokens = (incoming) => {
      const live = tokensRef.current || [];
      const liveMap = new Map(live.map(token => [token.address, token]));
      return (incoming || []).map(token => {
        const existing = liveMap.get(token.address);
        if (!existing) return token;
        const merged = { ...token };
        const candidateMcap = token.latest_mcap ?? token.marketcap ?? token.current_mc;
        const parsed = Number(candidateMcap);
        if (!Number.isFinite(parsed)) {
          if (existing.latest_mcap != null) merged.latest_mcap = existing.latest_mcap;
          if (existing.marketcap != null) merged.marketcap = existing.marketcap;
          if (existing.current_mc != null) merged.current_mc = existing.current_mc;
        }
        const candidateAth = token.ath_mcap ?? token.ath_market_cap ?? token.ath_mc ?? token.ath;
        const athParsed = Number(candidateAth);
        if (!Number.isFinite(athParsed)) {
          if (existing.ath_mcap != null) merged.ath_mcap = existing.ath_mcap;
          if (existing.ath_market_cap != null) merged.ath_market_cap = existing.ath_market_cap;
          if (existing.ath_mc != null) merged.ath_mc = existing.ath_mc;
          if (existing.ath != null) merged.ath = existing.ath;
        }
        return merged;
      });
    };
    
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => setConnected(true);
    ws.onerror = () => setConnected(false);
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'init':
          case 'refresh':
            const refreshedTokens = mergeRefreshTokens(message.data.tokens || []);
            setTokens(refreshedTokens);
            claudeCashSeenRef.current = hydrateClaudeCashSeen(refreshedTokens);
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

  const getTokenTimeBySource = (token, source) => {
    if (source === 'print_scan') {
      return token.first_seen_print_scan || token.first_called || token.first_seen || token.first_seen_local || token.created_at;
    }
    return token.first_called || token.first_seen || token.created_at || token.first_seen_local;
  };

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
    const initial = initialCap(token);
    const ath = claudeCashAthCap(token);
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
  const athMultiples = claudeCashStatsTokens
    .map(claudeCashAthMultiple)
    .filter((value) => Number.isFinite(value) && value > 0);
  const successfulCalls = athMultiples.filter((value) => value > 1).length;
  const successRate = totalCalls > 0 ? (successfulCalls / totalCalls) * 100 : 0;
  const averageAthX =
    athMultiples.length > 0
      ? athMultiples.reduce((sum, value) => sum + value, 0) / athMultiples.length
      : 0;

  return (
    <div className="app">
      <Header
        connected={connected}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(prev => !prev)}
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
                  <span>Average ATH X</span>
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
              onClick={() => setActiveTab(tab.key)}
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
                  onSelect={setSelectedToken}
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
                onClose={() => setSelectedToken(null)}
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

export default App;
