import { useEffect, useState } from 'react';

export function Toast({ toasts, onDismiss }) {
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
      
      <style>{`
        .toast-container {
          position: fixed;
          top: 100px;
          right: 2rem;
          z-index: 1000;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          max-width: 420px;
          pointer-events: none;
        }

        @media (max-width: 768px) {
          .toast-container {
            right: 1rem;
            left: 1rem;
            top: 80px;
            max-width: none;
          }
        }

        .toast-item {
          background: var(--bg-card);
          border: 1px solid var(--accent-primary);
          border-radius: 12px;
          padding: 1.25rem 1.5rem;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(218, 119, 86, 0.1);
          animation: toastSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          pointer-events: auto;
          position: relative;
          overflow: hidden;
        }

        .toast-item::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 4px;
          height: 100%;
          background: var(--accent-primary);
        }

        .toast-item.exiting {
          animation: toastSlideOut 0.3s cubic-bezier(0.4, 0, 1, 1) forwards;
        }

        @keyframes toastSlideIn {
          from {
            transform: translateX(120%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes toastSlideOut {
          to {
            transform: translateX(120%);
            opacity: 0;
          }
        }

        .toast-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.75rem;
        }

        .toast-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.25rem 0.6rem;
          background: rgba(218, 119, 86, 0.1);
          border-radius: 999px;
          font-family: var(--font-mono);
          font-size: 0.65rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--accent-primary);
        }

        .badge-pulse {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent-primary);
          animation: pulse 1.5s ease-in-out infinite;
        }

        .toast-close {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 0.25rem;
          font-size: 1.25rem;
          line-height: 1;
          transition: color 0.2s ease;
        }

        .toast-close:hover {
          color: var(--text-primary);
        }

        .toast-body {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .toast-symbol {
          font-family: var(--font-mono);
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        .toast-details {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          font-size: 0.85rem;
          color: var(--text-secondary);
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .detail-label {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
        }

        .detail-value {
          font-family: var(--font-mono);
          font-weight: 600;
          color: var(--text-primary);
        }

        .detail-value.positive {
          color: #86efac;
        }

        .detail-value.negative {
          color: #fca5a5;
        }

        .toast-time {
          margin-top: 0.5rem;
          padding-top: 0.5rem;
          border-top: 1px solid var(--border-color);
          font-family: var(--font-mono);
          font-size: 0.7rem;
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}

function ToastItem({ toast, onDismiss }) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleDismiss();
    }, 10000); // 10 seconds

    return () => clearTimeout(timer);
  }, [toast.id]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss(toast.id);
    }, 300);
  };

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
    const initial = toast.initial_mcap || toast.initialMcap;
    const current = toast.realtime_mcap || toast.currentMcap;
    if (!initial || !current || !Number.isFinite(initial) || !Number.isFinite(current)) {
      return null;
    }
    const change = ((current - initial) / initial) * 100;
    return change;
  };

  const change = calculateChange();

  return (
    <div className={`toast-item ${isExiting ? 'exiting' : ''}`}>
      <div className="toast-header">
        <div className="toast-badge">
          <span className="badge-pulse"></span>
          <span>Claude Called</span>
        </div>
        <button className="toast-close" onClick={handleDismiss} aria-label="Dismiss">
          ×
        </button>
      </div>

      <div className="toast-body">
        <div className="toast-symbol">${toast.symbol || 'TOKEN'}</div>
        
        <div className="toast-details">
          <div className="detail-row">
            <span className="detail-label">Called At</span>
            <span className="detail-value">{formatMcap(toast.initial_mcap || toast.initialMcap)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Now</span>
            <span className="detail-value">{formatMcap(toast.realtime_mcap || toast.currentMcap)}</span>
          </div>
          {change !== null && (
            <div className="detail-row">
              <span className="detail-label">Change</span>
              <span className={`detail-value ${change >= 0 ? 'positive' : 'negative'}`}>
                {change >= 0 ? '+' : ''}{change.toFixed(1)}%
              </span>
            </div>
          )}
        </div>

        <div className="toast-time">
          {formatTime(toast.original_call_time || toast.callTime)} · 5 min delay
        </div>
      </div>
    </div>
  );
}
