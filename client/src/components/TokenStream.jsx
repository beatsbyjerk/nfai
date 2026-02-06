import { useMemo, useState, useEffect } from 'react';

export function TokenStream({ tokens, onSelect, selectedId, highlightedId, label, timeSource, pageSize }) {
  const formatMcap = (mcap) => {
    if (!mcap) return '-';
    if (mcap >= 1000000) return '$' + (mcap / 1000000).toFixed(2) + 'M';
    if (mcap >= 1000) return '$' + (mcap / 1000).toFixed(1) + 'K';
    return '$' + mcap.toFixed(0);
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const firstTime = (token) => {
    if (timeSource === 'print_scan') {
      return token.first_seen_print_scan || token.first_called || token.first_seen || token.first_seen_local || token.created_at;
    }
    return token.first_called || token.first_seen || token.first_seen_local || token.created_at;
  };
  const rawInitialCap = (token) => {
    if (!token?.raw_data) return null;
    try {
      const raw = typeof token.raw_data === 'string' ? JSON.parse(token.raw_data) : token.raw_data;
      const value = raw?.initial_mcap ?? raw?.initial_market_cap ?? raw?.initial_mc ?? raw?.first_called_mcap;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  const initialCap = (token) => {
    if (timeSource === 'print_scan') {
      const fromRaw = rawInitialCap(token);
      if (fromRaw !== null) return fromRaw;
    }
    return token.initial_mcap || token.initial_market_cap || token.initial_mc || token.first_called_mcap;
  };
  const currentCap = (token) =>
    token.realtime_mcap ||
    token.realtimeMcap ||
    token.latest_mcap ||
    token.marketcap ||
    token.current_mc;
  const athCap = (token) => token.ath_mcap || token.ath_market_cap || token.ath_mc;
  const isAthAboveInitial = (token) => {
    const initial = initialCap(token);
    const ath = athCap(token);
    return initial && ath && ath > initial;
  };
  const formatMultiple = (value) => {
    if (!value || !Number.isFinite(value)) return '-';
    const decimals = value >= 10 ? 1 : 2;
    return `${value.toFixed(decimals)}x`;
  };
  const currentMultiple = (token) => {
    const initial = initialCap(token);
    const current = currentCap(token);
    if (!initial || !current) return null;
    return current / initial;
  };
  const athMultiple = (token) => {
    const initial = initialCap(token);
    const ath = athCap(token);
    if (!initial || !ath) return null;
    return ath / initial;
  };
  const getLabel = () => 'Called';

  const isPaginated = Number.isFinite(pageSize) && pageSize > 0;
  const totalPages = isPaginated ? Math.max(1, Math.ceil(tokens.length / pageSize)) : 1;
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (!isPaginated) return;
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [isPaginated, totalPages]);

  const pagedTokens = useMemo(() => {
    if (!isPaginated) return tokens;
    const startIndex = (currentPage - 1) * pageSize;
    return tokens.slice(startIndex, startIndex + pageSize);
  }, [tokens, currentPage, pageSize, isPaginated]);

  const pageNumbers = useMemo(() => {
    if (!isPaginated || totalPages <= 1) return [];
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (currentPage <= 4) {
      return [1, 2, 3, 4, 5, '...', totalPages];
    }
    if (currentPage >= totalPages - 3) {
      return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
  }, [isPaginated, totalPages, currentPage]);

  const startCount = isPaginated && tokens.length > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endCount = isPaginated && tokens.length > 0 ? Math.min(tokens.length, currentPage * pageSize) : tokens.length;

  return (
    <div className="token-stream">
      {tokens.length === 0 ? (
        <div className="empty-state">
          <div className="empty-text">Waiting for the next whisper...</div>
        </div>
      ) : (
        pagedTokens.map((token) => (
          <div
            key={token.address}
            className={`token-card ${highlightedId === token.address ? 'new-call-highlight' : ''} ${selectedId === token.address ? 'selected' : ''}`}
            onClick={() => onSelect(token)}
          >
            <div className="card-left">
              {token.image ? (
                <img
                  src={token.image}
                  alt={token.symbol}
                  className="token-logo"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = `https://api.dicebear.com/7.x/shapes/svg?seed=${token.address}`;
                  }}
                />
              ) : (
                <div className="token-logo-placeholder">
                  {(token.symbol || '?')[0]}
                </div>
              )}
            </div>

            <div className="card-main">
              <div className="token-header">
                <span className="token-symbol">{token.symbol || 'UNKNOWN'}</span>
                <span className="token-name truncate">{token.name}</span>
              </div>
              <div className="token-meta">
                <span className="meta-item label">{getLabel()}:</span>
                <span className="meta-item">{formatTime(firstTime(token))}</span>
                <span className="meta-sep">•</span>
                <span className="meta-item">Initial {formatMcap(initialCap(token))}</span>
              </div>
              <div className="token-meta secondary">
                <span className="meta-item">Mcap {formatMcap(currentCap(token))}</span>
                <span className="meta-sep">•</span>
                <span className="meta-item">ATH {formatMcap(athCap(token))}</span>
              </div>
            </div>

            <div className="card-right">
              <div className="metric-grid">
                <div className="metric-row">
                  <span className="metric-label">Initial</span>
                  <span className="metric-value">{formatMcap(initialCap(token))}</span>
                </div>
                <div className="metric-row">
                  <span className="metric-label">Mcap</span>
                  <span className="metric-value">{formatMcap(currentCap(token))}</span>
                </div>
                <div className="metric-row">
                  <span className="metric-label">Mcap X</span>
                  <span
                    className={`metric-value ${currentMultiple(token) !== null && currentMultiple(token) > 1
                      ? 'metric-positive'
                      : currentMultiple(token) !== null && currentMultiple(token) < 1
                        ? 'metric-negative'
                        : ''
                      }`}
                  >
                    {formatMultiple(currentMultiple(token))}
                  </span>
                </div>
                <div className="metric-row">
                  <span className="metric-label">ATH</span>
                  <span className={`metric-value ${isAthAboveInitial(token) ? 'metric-positive' : ''}`}>
                    {formatMcap(athCap(token))}
                  </span>
                </div>
                <div className="metric-row">
                  <span className="metric-label">ATH X</span>
                  <span
                    className={`metric-value ${athMultiple(token) !== null && athMultiple(token) > 1 ? 'metric-positive' : ''}`}
                  >
                    {formatMultiple(athMultiple(token))}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))
      )}

      {isPaginated && tokens.length > 0 && totalPages > 1 && (
        <div className="pagination-bar">
          <div className="pagination-info">
            <div className="pagination-meta">
              Showing {startCount}-{endCount} of {tokens.length}
            </div>
          </div>
          <div className="pagination-controls">
            <button
              className="page-btn"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              Prev
            </button>
            <div className="page-numbers">
              {pageNumbers.map((item, index) => {
                if (item === '...') {
                  return (
                    <span key={`gap-${index}`} className="page-ellipsis">
                      ...
                    </span>
                  );
                }
                return (
                  <button
                    key={item}
                    className={`page-btn page-number ${currentPage === item ? 'active' : ''}`}
                    onClick={() => setCurrentPage(item)}
                    aria-current={currentPage === item ? 'page' : undefined}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
            <button
              className="page-btn"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </button>
          </div>
        </div>
      )}

      <style>{`
        .token-stream {
          display: flex;
          flex-direction: column;
        }
        
        .token-stream {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 1.5rem;
          padding: 1rem 0 3rem;
        }

        .token-card {
          display: flex;
          flex-direction: column;
          padding: 1.5rem;
          background: var(--bg-card);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: var(--shadow-sm);
          position: relative;
          overflow: hidden;
          height: 100%;
          min-height: 240px;
        }

        .token-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; height: 3px;
          background: linear-gradient(90deg, var(--accent-primary), transparent);
          opacity: 0.7;
        }
        
        .token-card:hover {
          transform: translateY(-6px);
          box-shadow: var(--shadow-lg);
          background: var(--bg-hover);
          border-color: var(--accent-primary);
        }
        
        .token-card.selected {
          border-color: var(--accent-primary);
          background: var(--bg-hover);
          box-shadow: 0 0 0 2px var(--accent-highlight);
        }

        .token-card.new-call-highlight {
           animation: newCallEnter 0.6s backwards;
           border: 1px solid var(--accent-primary);
           box-shadow: 0 0 20px var(--accent-highlight);
        }
        
        .card-left {
          display: flex;
          align-items: center;
          margin-bottom: 1rem;
        }
        
        .token-logo {
          width: 56px;
          height: 56px;
          border-radius: 12px;
          object-fit: cover;
          border: 2px solid var(--border-color);
          box-shadow: var(--shadow-sm);
        }
        
        .token-logo-placeholder {
          width: 56px;
          height: 56px;
          border-radius: 12px;
          background: var(--bg-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 1.5rem;
          color: var(--accent-primary);
          border: 1px dashed var(--border-color);
        }
        
        .card-main {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        
        .token-header {
          display: flex;
          flex-direction: column;
          gap: 0.1rem;
          margin-bottom: 0.75rem;
        }
        
        .token-symbol {
          font-family: var(--font-serif);
          font-weight: 700;
          font-size: 1.4rem;
          color: var(--text-primary);
          letter-spacing: 0.02em;
        }
        
        .token-name {
          font-family: var(--font-sans);
          font-size: 0.9rem;
          color: var(--text-secondary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .token-meta {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.75rem;
          font-size: 0.8rem;
          color: var(--text-muted);
          margin-bottom: auto;
          padding-bottom: 1rem;
        }

        .token-meta .label {
          background: var(--bg-secondary);
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          border: 1px solid var(--border-color);
          color: var(--accent-primary);
          font-weight: 600;
        }

        .token-meta.secondary {
          margin-top: 0;
        }
        
        .meta-sep {
          display: none; /* Hide separators in card view */
        }
        
        .card-right {
          margin-top: auto;
          padding-top: 1rem;
          border-top: 1px solid var(--border-color);
          width: 100%;
        }
 
        .metric-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.75rem 1.5rem;
          font-family: var(--font-mono);
          font-size: 0.85rem;
          color: var(--text-secondary);
          width: 100%;
        }

        .metric-row {
          display: flex;
          justify-content: space-between;
          gap: 0.6rem;
        }

        .metric-label {
          color: var(--text-muted);
        }

        .metric-value {
          color: var(--text-primary);
          font-weight: 600;
        }

        .metric-positive {
          color: var(--success, #10b981);
        }

        .metric-negative {
          color: var(--danger, #ef4444);
        }
        
        .empty-state {
          padding: 4rem;
          text-align: center;
          color: var(--text-muted);
          font-family: var(--font-serif);
          font-style: italic;
        }

        .pagination-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.9rem 1.5rem;
          border-top: 1px solid var(--border-color);
          background: var(--bg-card);
          flex-wrap: wrap;
        }

        .pagination-info {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }

        .pagination-meta {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .pagination-controls {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          flex-wrap: wrap;
        }

        .page-numbers {
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }

        .page-btn {
          border: 1px solid var(--border-color);
          background: var(--bg-secondary);
          color: var(--text-primary);
          padding: 0.3rem 0.6rem;
          border-radius: 6px;
          font-family: var(--font-mono);
          font-size: 0.75rem;
          cursor: pointer;
          transition: border-color 0.2s ease, color 0.2s ease, background 0.2s ease;
        }

        .page-btn:hover:not(:disabled) {
          border-color: var(--accent-primary);
          color: var(--accent-primary);
        }

        .page-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .page-number.active {
          background: var(--accent-primary);
          border-color: var(--accent-primary);
          color: #0b0b0b;
          font-weight: 600;
        }

        .page-ellipsis {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        /* Mobile: prevent token cards from forcing horizontal scroll */
        @media (max-width: 900px) {
          .token-card {
            grid-template-columns: 44px 1fr;
            grid-template-rows: auto auto;
            padding: 0.9rem 1rem;
            gap: 0.75rem;
          }

          .card-left {
            margin-right: 0;
          }

          .token-logo,
          .token-logo-placeholder {
            width: 34px;
            height: 34px;
            border-radius: 7px;
          }

          .token-header {
            flex-wrap: wrap;
            row-gap: 0.15rem;
          }

          .token-meta {
            flex-wrap: wrap;
            row-gap: 0.25rem;
          }

          .card-right {
            grid-column: 1 / -1;
            justify-content: flex-start;
          }

          .metric-grid {
            min-width: 0;
            width: 100%;
          }

          .pagination-bar {
            padding: 0.75rem 1rem;
          }
        }
      `}</style>
    </div>
  );
}
