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
    
    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    return `${Math.floor(diffHours / 24)}d`;
  };

  const getTimeColor = (dateStr) => {
    if (!dateStr) return '#94a3b8';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMins = Math.floor((now - date) / 60000);
    
    if (diffMins < 5) return '#10b981';   // Fresh - green
    if (diffMins < 30) return '#3b82f6';  // Recent - blue
    if (diffMins < 120) return '#f59e0b'; // Getting old - amber
    return '#94a3b8';                      // Old - gray
  };

  // Helper to extract nested metrics safely
  const getRawData = (token) => {
    if (!token?.raw_data) return null;
    try {
      return typeof token.raw_data === 'string' ? JSON.parse(token.raw_data) : token.raw_data;
    } catch {
      return null;
    }
  };

  const initialCap = (token) => {
      const raw = getRawData(token);
      return token.initial_mcap || token.first_called_mcap || raw?.initial_mcap || 0;
  };
  
  const currentCap = (token) => 
      token.realtime_mcap || token.latest_mcap || token.marketcap || token.current_mc || 0;
      
  const athCap = (token) => 
      token.ath_mcap || token.ath_market_cap || token.ath_mc || 0;

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

  const formatMult = (val) => {
      if (!val || !Number.isFinite(val)) return '-';
      return val.toFixed(1) + 'x';
  };

  const isPaginated = Number.isFinite(pageSize) && pageSize > 0;
  const totalPages = isPaginated ? Math.max(1, Math.ceil(tokens.length / pageSize)) : 1;
  const [currentPage, setCurrentPage] = useState(1);

  const pagedTokens = useMemo(() => {
    if (!isPaginated) return tokens;
    const startIndex = (currentPage - 1) * pageSize;
    return tokens.slice(startIndex, startIndex + pageSize);
  }, [tokens, currentPage, pageSize, isPaginated]);

  return (
    <div className="token-list-container">
      <div className="list-header">
        <div className="col-token">Token</div>
        <div className="col-caps">Market Caps</div>
        <div className="col-perf">Performance</div>
        <div className="col-time">Time</div>
        <div className="col-action"></div>
      </div>
      
      <div className="list-body">
        {tokens.length === 0 ? (
          <div className="empty-state">No signals active</div>
        ) : (
          pagedTokens.map((token) => {
             const curMult = currentMultiple(token);
             const athMult = athMultiple(token);
             
             return (
                <div 
                  key={token.address} 
                  className={`list-row ${selectedId === token.address ? 'selected' : ''} ${highlightedId === token.address ? 'highlight' : ''}`}
                  onClick={() => onSelect(token)}
                >
                  <div className="col-token">
                    {token.image ? (
                      <img src={token.image} alt="" className="row-icon" />
                    ) : (
                      <div className="row-icon-placeholder">{token.symbol?.[0]}</div>
                    )}
                    <div className="token-info">
                      <div className="symbol-row">
                        <span className="symbol">{token.symbol}</span>
                      </div>
                      <span className="name">{token.name}</span>
                    </div>
                  </div>

                  <div className="col-caps">
                     <div className="cap-row">
                        <span className="cap-label">Init:</span>
                        <span className="cap-val" style={{ color: '#8b5cf6' }}>{formatMcap(initialCap(token))}</span>
                     </div>
                     <div className="cap-row">
                        <span className="cap-label">Now:</span>
                        <span className="cap-val" style={{ color: curMult >= 1 ? '#10b981' : '#ef4444', fontWeight: 700 }}>{formatMcap(currentCap(token))}</span>
                     </div>
                     <div className="cap-row">
                        <span className="cap-label">ATH:</span>
                        <span className="cap-val" style={{ color: '#3b82f6', fontWeight: 600 }}>{formatMcap(athCap(token))}</span>
                     </div>
                  </div>

                  <div className="col-perf">
                     <div className="perf-pill" style={{ 
                        background: curMult > 2 ? 'rgba(16, 185, 129, 0.15)' : curMult > 1 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                        color: curMult > 1 ? '#10b981' : '#ef4444',
                        border: `1px solid ${curMult > 1 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                     }}>
                        <span className="perf-label">Curr</span>
                        <span className="perf-val">{formatMult(curMult)}</span>
                     </div>
                     <div className="perf-pill" style={{
                        background: athMult > 3 ? 'rgba(59, 130, 246, 0.15)' : athMult > 2 ? 'rgba(59, 130, 246, 0.1)' : 'rgba(139, 92, 246, 0.08)',
                        color: athMult > 2 ? '#3b82f6' : '#8b5cf6',
                        border: `1px solid ${athMult > 2 ? 'rgba(59, 130, 246, 0.3)' : 'rgba(139, 92, 246, 0.3)'}`
                     }}>
                        <span className="perf-label">ATH</span>
                        <span className="perf-val">{formatMult(athMult)}</span>
                     </div>
                  </div>

                  <div className="col-time" style={{ color: getTimeColor(token.created_at || token.first_seen) }}>{formatTime(token.created_at || token.first_seen)}</div>
                  
                  <div className="col-action">
                    <button className="scan-btn">SCAN</button>
                  </div>
                </div>
             );
          })
        )}
      </div>

      {isPaginated && totalPages > 1 && (
        <div className="pagination">
           <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>←</button>
           <span>{currentPage} / {totalPages}</span>
           <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>→</button>
        </div>
      )}

      <style>{`
        .token-list-container {
          background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          overflow: hidden;
          font-family: 'Inter', sans-serif;
          box-shadow: 0 4px 20px rgba(0,0,0,0.06);
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .list-header {
          display: grid;
          grid-template-columns: 2.2fr 1.4fr 1.4fr 0.6fr 70px;
          padding: 1rem 1.25rem;
          background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          color: #94a3b8;
          letter-spacing: 0.08em;
          position: sticky;
          top: 0;
          z-index: 10;
        }

        .list-body {
          flex: 1;
          overflow-y: auto;
        }

        .list-row {
          display: grid;
          grid-template-columns: 2.2fr 1.4fr 1.4fr 0.6fr 70px;
          padding: 1rem 1.25rem;
          align-items: center;
          border-bottom: 1px solid #f1f5f9;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
        }

        .list-row::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background: transparent;
          transition: background 0.2s;
        }

        .list-row:hover {
          background: linear-gradient(90deg, rgba(37, 99, 235, 0.04) 0%, transparent 100%);
        }

        .list-row:hover::before {
          background: #3b82f6;
        }

        .list-row.selected {
          background: linear-gradient(90deg, rgba(37, 99, 235, 0.08) 0%, rgba(37, 99, 235, 0.02) 100%);
        }

        .list-row.selected::before {
          background: #3b82f6;
        }
        
        .list-row.highlight {
          background: linear-gradient(90deg, rgba(16, 185, 129, 0.08) 0%, transparent 100%);
          animation: highlightPulse 2s ease-out;
        }

        .list-row.highlight::before {
          background: #10b981;
        }

        @keyframes highlightPulse {
          0% { background: rgba(16, 185, 129, 0.2); }
          100% { background: linear-gradient(90deg, rgba(16, 185, 129, 0.08) 0%, transparent 100%); }
        }

        .col-token {
          display: flex;
          align-items: center;
          gap: 0.85rem;
        }

        .row-icon {
          width: 42px;
          height: 42px;
          border-radius: 10px;
          object-fit: cover;
          border: 2px solid #e2e8f0;
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        }

        .row-icon-placeholder {
          width: 42px;
          height: 42px;
          border-radius: 10px;
          background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 1rem;
          color: #64748b;
          border: 2px solid #e2e8f0;
        }

        .token-info {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .symbol {
          font-weight: 800;
          color: #0f172a;
          font-size: 0.95rem;
          letter-spacing: -0.01em;
        }

        .name {
          font-size: 0.75rem;
          color: #64748b;
          max-width: 140px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .col-caps {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 0.75rem;
        }
        
        .cap-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .cap-label { 
          color: #94a3b8; 
          width: 28px;
          font-size: 0.65rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .cap-val { 
          font-family: 'JetBrains Mono', monospace; 
          color: #475569;
          font-size: 0.8rem;
        }

        .cap-val.highlight { color: #0f172a; font-weight: 600; }
        
        .col-perf {
          display: flex;
          gap: 0.5rem;
        }
        
        .perf-pill {
          display: flex;
          flex-direction: column;
          padding: 4px 10px;
          border-radius: 8px;
          align-items: center;
          min-width: 55px;
          transition: transform 0.15s ease;
        }

        .perf-pill:hover {
          transform: scale(1.05);
        }

        .perf-label { 
          font-size: 0.6rem; 
          text-transform: uppercase; 
          opacity: 0.7;
          font-weight: 600;
          letter-spacing: 0.03em;
        }

        .perf-val { 
          font-family: 'JetBrains Mono', monospace; 
          font-size: 0.85rem; 
          font-weight: 800;
        }

        .col-time {
          font-size: 0.85rem;
          font-weight: 600;
          font-family: 'JetBrains Mono', monospace;
        }

        .col-action {
          text-align: right;
        }

        .scan-btn {
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          border: 1px solid #e2e8f0;
          color: #64748b;
          font-size: 0.65rem;
          padding: 0.4rem 0.9rem;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          transition: all 0.2s;
        }
        
        .scan-btn:hover {
          border-color: #2563eb;
          color: white;
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
          transform: translateY(-1px);
        }

        .pagination {
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 1rem;
          gap: 1rem;
          background: #f8fafc;
          border-top: 1px solid #e2e8f0;
          font-size: 0.85rem;
          font-weight: 600;
          color: #64748b;
        }

        .pagination button {
          border: 1px solid #e2e8f0;
          background: white;
          padding: 0.4rem 1rem;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.2s;
        }

        .pagination button:hover:not(:disabled) {
          border-color: #3b82f6;
          color: #3b82f6;
        }

        .pagination button:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .empty-state {
          padding: 3rem;
          text-align: center;
          color: #94a3b8;
          font-size: 0.9rem;
        }
      `}</style>
    </div>
  );
}
