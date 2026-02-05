import { useState, useEffect } from 'react';

export function Header({ connected, soundEnabled, onToggleSound, authWallet, licenseExpiresAt, onLogout }) {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('theme') || 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('theme', theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  return (
    <header className="header">
      <div className="header-content">
        <div className="logo-section">
          <div className="logo">
            <img src="/logo.png" alt="NFAi" className="logo-img" />
            <span className="logo-text">NFAi</span>
          </div>
        </div>

        <div className="header-right">
          {authWallet && authWallet !== 'GUEST_ACCESS' && (
            <div className="license-status">
              <span className="license-wallet">{authWallet.slice(0, 4)}...{authWallet.slice(-4)}</span>
              {licenseExpiresAt && <span className="license-expiry">Active</span>}
            </div>
          )}
          <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
            <span className="status-dot"></span>
            <span className="status-text">{connected ? 'LIVE' : 'WAITING'}</span>
          </div>
        </div>
      </div>

      <style>{`
        .header {
          background: rgba(5, 10, 20, 0.85); /* Deep Navy Glass */
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          padding: 1rem 2rem;
          position: sticky;
          top: 0;
          z-index: 50;
          transition: all 0.3s ease;
        }

        .header-content {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .logo-section {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 0.8rem;
          font-family: var(--font-sans); /* Uncut Sans */
          font-size: 1.4rem;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.02em;
        }

        .logo-img {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          object-fit: cover;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 1.25rem;
        }

        .connection-status {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.4rem 1rem;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 100px; /* Pill shape */
          font-family: var(--font-mono);
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.05em;
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-secondary);
        }

        .connected .status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent-secondary);
          box-shadow: 0 0 8px var(--accent-secondary);
        }

        .status-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </header>
  );
}
