import { useState, useEffect } from 'react';

export function Header({ connected, soundEnabled, onToggleSound, authWallet, licenseExpiresAt, onLogout, userWallet, onOpenWalletConnect, onOpenDashboard }) {
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
            <img src="/cyphoai-logo.jpg" alt="Cyphoai" className="logo-img" />
            <span className="logo-text">Cyphoai</span>
          </div>
        </div>

        <div className="header-right">
          {/* X (Twitter) Link */}
          <a 
            href="https://x.com/cypho_ai" 
            target="_blank" 
            rel="noopener noreferrer"
            className="social-link"
            aria-label="Follow us on X"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          </a>

          {/* User Wallet Trading Button */}
          {userWallet ? (
            <button className="user-wallet-btn connected" onClick={onOpenDashboard}>
              <span className="wallet-indicator"></span>
              <span className="dashboard-label">Dashboard</span>
              <span className="wallet-text">{userWallet.slice(0, 4)}...{userWallet.slice(-4)}</span>
            </button>
          ) : (
            <button className="user-wallet-btn" onClick={onOpenWalletConnect}>
              <span className="connect-icon">◈</span>
              <span className="connect-text">Connect Wallet</span>
            </button>
          )}

          {authWallet && authWallet !== 'GUEST_ACCESS' && (
            <div className="license-status">
              <span className="license-wallet">{authWallet.slice(0, 4)}...{authWallet.slice(-4)}</span>
              {licenseExpiresAt && <span className="license-expiry">Active</span>}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .header {
          background: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid var(--border-color);
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
          gap: 1rem;
        }

        .social-link {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          color: var(--text-secondary);
          transition: all 0.2s ease;
        }

        .social-link:hover {
          background: #0f172a;
          border-color: #0f172a;
          color: white;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        /* User Wallet Button Styles */
        .user-wallet-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.55rem 1rem;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-primary);
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .user-wallet-btn:hover {
          background: var(--bg-hover);
          border-color: var(--accent-primary);
          color: var(--accent-primary);
          transform: translateY(-1px);
          box-shadow: var(--shadow-sm);
        }

        .user-wallet-btn.connected {
          background: var(--bg-card);
          border: 1px solid var(--accent-secondary);
          color: var(--accent-secondary);
          padding: 0.6rem 1.2rem;
        }

        .user-wallet-btn.connected:hover {
          background: var(--bg-hover);
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
        }

        .wallet-indicator {
          width: 10px;
          height: 10px;
          background: var(--accent-secondary);
          border-radius: 50%;
          box-shadow: 0 0 10px var(--accent-secondary);
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .dashboard-label {
          font-weight: 700;
          font-size: 0.9rem;
          color: var(--accent-secondary);
          letter-spacing: 0.02em;
        }

        .wallet-text {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--text-secondary);
          background: var(--bg-secondary);
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
          border: 1px solid var(--border-color);
        }

        .connect-icon {
          font-size: 1rem;
        }

        .connect-text {
          font-weight: 600;
        }

        .dashboard-icon {
          font-size: 0.9rem;
          margin-left: 0.2rem;
        }

        .license-status {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.4rem 0.75rem;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 6px;
        }

        .license-wallet {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        .license-expiry {
          font-size: 0.7rem;
          color: var(--accent-secondary);
          font-weight: 600;
        }
      `}</style>
    </header>
  );
}
