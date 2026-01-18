export function TokenDetail({ token, onClose }) {
  const formatMcap = (mcap) => {
    if (mcap == null) return '-';
    if (mcap >= 1000000) return '$' + (mcap / 1000000).toFixed(2) + 'M';
    if (mcap >= 1000) return '$' + (mcap / 1000).toFixed(1) + 'K';
    return '$' + mcap.toFixed(0);
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(token.address);
  };

  return (
    <div className="token-detail">
      <div className="detail-header">
        <div className="identity">
          {token.image ? (
            <img 
              src={token.image} 
              alt={token.symbol}
              className="detail-logo"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = `https://api.dicebear.com/7.x/shapes/svg?seed=${token.address}`;
              }}
            />
          ) : (
            <div className="detail-logo-placeholder">
              {(token.symbol || '?')[0]}
            </div>
          )}
          <div>
            <h2 className="detail-symbol">{token.symbol || 'UNKNOWN'}</h2>
            <div className="detail-name">{token.name}</div>
          </div>
        </div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>
      
      <div className="detail-content">
        <div className="address-box" onClick={copyAddress} title="Click to copy">
          <code className="address-text">{token.address}</code>
          <span className="copy-icon">📋</span>
        </div>
        
        <div className="metrics-grid">
          <div className="metric">
            <label>Market Cap</label>
            <div className="value">{formatMcap(token.latest_mcap)}</div>
          </div>
          <div className="metric">
            <label>Initial</label>
            <div className="value">{formatMcap(token.initial_mcap)}</div>
          </div>
          <div className="metric">
            <label>ATH</label>
            <div className="value">{formatMcap(token.ath_mcap)}</div>
          </div>
          <div className="metric">
            <label>Current X</label>
            <div className="value accent">
              {token.initial_mcap && token.latest_mcap
                ? (token.latest_mcap / token.initial_mcap).toFixed(2)
                : '-'}
            </div>
          </div>
        </div>
        
        <div className="actions">
          <a 
            href={`https://pump.fun/${token.address}`} 
            target="_blank" 
            rel="noopener noreferrer"
            className="action-btn"
          >
            View on Pump.fun ↗
          </a>
          <a 
            href={`https://dexscreener.com/solana/${token.address}`} 
            target="_blank" 
            rel="noopener noreferrer"
            className="action-btn"
          >
            DexScreener ↗
          </a>
        </div>
      </div>
      
      <style>{`
        .token-detail {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 1.5rem;
          box-shadow: var(--shadow-md);
        }
        
        .detail-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1.5rem;
        }
        
        .identity {
          display: flex;
          gap: 1rem;
          align-items: center;
        }
        
        .detail-logo, .detail-logo-placeholder {
          width: 64px;
          height: 64px;
          border-radius: 12px;
          object-fit: cover;
          border: 1px solid var(--border-color);
        }
        
        .detail-logo-placeholder {
          background: var(--bg-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          color: var(--text-secondary);
        }
        
        .detail-symbol {
          font-family: var(--font-serif);
          font-size: 1.5rem;
          margin: 0;
          color: var(--text-primary);
        }
        
        .detail-name {
          color: var(--text-secondary);
          font-size: 0.9rem;
        }
        
        .close-btn {
          background: none;
          border: none;
          font-size: 1.5rem;
          color: var(--text-muted);
          cursor: pointer;
          line-height: 1;
        }
        
        .close-btn:hover {
          color: var(--text-primary);
        }
        
        .address-box {
          background: var(--bg-secondary);
          padding: 0.75rem;
          border-radius: 6px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          margin-bottom: 1.5rem;
          transition: background 0.2s;
        }
        
        .address-box:hover {
          background: var(--bg-hover);
        }
        
        .address-text {
          font-family: var(--font-mono);
          font-size: 0.8rem;
          color: var(--text-secondary);
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .metrics-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        
        .metric {
          padding: 0.75rem;
          border: 1px solid var(--border-color);
          border-radius: 8px;
        }
        
        .metric label {
          display: block;
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          margin-bottom: 0.25rem;
        }
        
        .metric .value {
          font-family: var(--font-mono);
          font-size: 1.1rem;
          font-weight: 500;
          color: var(--text-primary);
        }
        
        .metric .value.accent {
          color: var(--accent-primary);
        }
        
        .metric .value.positive { color: #10b981; }
        .metric .value.negative { color: #ef4444; }
        
        .actions {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        
        .action-btn {
          display: block;
          text-align: center;
          padding: 0.75rem;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          color: var(--text-primary);
          text-decoration: none;
          font-size: 0.9rem;
          font-weight: 500;
          transition: all 0.2s;
        }
        
        .action-btn:hover {
          border-color: var(--text-secondary);
          background: var(--bg-hover);
        }
      `}</style>
    </div>
  );
}
