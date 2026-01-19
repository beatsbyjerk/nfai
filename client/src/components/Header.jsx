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

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const formatTimeRemaining = (ms) => {
    if (!ms || ms <= 0) return 'Expired';
    const mins = Math.floor(ms / 60000);
    const hours = Math.floor(mins / 60);
    if (hours > 0) return `${hours}h ${mins % 60}m`;
    return `${mins}m`;
  };

  return (
    <header className="header">
      <div className="header-content">
        <div className="logo-section">
          <div className="logo">
            <img src="/logo.png" alt="ClaudeCash" className="logo-img" />
            <span className="logo-text">ClaudeCash</span>
          </div>
        </div>
        
        <div className="header-right">
          {authWallet && (
            <div className="license-status">
              <div className="license-wallet">{authWallet.slice(0, 4)}…{authWallet.slice(-4)}</div>
              {licenseExpiresAt && (
                <div className="license-expiry">
                  {formatTimeRemaining(new Date(licenseExpiresAt).getTime() - Date.now())}
                </div>
              )}
              {onLogout && (
                <button className="license-logout" onClick={onLogout}>
                  Logout
                </button>
              )}
            </div>
          )}
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle Theme">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <button
            className={`sound-toggle ${soundEnabled ? 'on' : 'off'}`}
            onClick={onToggleSound}
            title={soundEnabled ? 'Sound on' : 'Sound off'}
            aria-pressed={soundEnabled}
          >
            {soundEnabled ? '🔔' : '🔕'}
          </button>

          <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
            <span className="status-dot"></span>
            <span className="status-text">{connected ? 'LIVE' : 'WAITING'}</span>
          </div>
        </div>
      </div>
      
      <style>{`
        .header {
          background: var(--bg-primary);
          border-bottom: 1px solid var(--border-color);
          padding: 1rem 2rem;
          position: sticky;
          top: 0;
          z-index: 50;
          transition: background 0.3s ease;
        }
        
        .header-content {
          max-width: 1400px;
          margin: 0 auto;
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
          gap: 0.5rem;
          font-family: var(--font-serif);
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.02em;
        }
        
        .logo-img {
          width: 32px;
          height: 32px;
          border-radius: 6px;
          object-fit: cover;
        }
        
        .header-right {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .license-status {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.4rem 0.6rem;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: var(--bg-secondary);
          font-size: 0.85rem;
        }

        .license-wallet {
          color: var(--text-primary);
          font-weight: 600;
        }

        .license-expiry {
          color: var(--text-secondary);
        }

        .license-logout {
          border: none;
          background: var(--accent-primary);
          color: #fff;
          padding: 0.3rem 0.6rem;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.8rem;
        }
        
        .theme-toggle {
          background: transparent;
          border: 1px solid var(--border-color);
          color: var(--text-primary);
          width: 36px;
          height: 36px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .theme-toggle:hover {
          background: var(--bg-hover);
          border-color: var(--text-secondary);
        }

        .sound-toggle {
          background: transparent;
          border: 1px solid var(--border-color);
          color: var(--text-primary);
          width: 36px;
          height: 36px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .sound-toggle:hover {
          background: var(--bg-hover);
          border-color: var(--text-secondary);
        }

        .sound-toggle.on {
          color: var(--accent-primary);
        }
        
        .connection-status {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.4rem 0.8rem;
          border-radius: 20px;
          font-family: var(--font-sans);
          font-size: 0.75rem;
          font-weight: 500;
          background: var(--bg-secondary);
          color: var(--text-secondary);
        }
        
        .status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--text-muted);
        }
        
        .connected .status-dot {
          background: var(--accent-primary);
          box-shadow: 0 0 0 2px rgba(218, 119, 86, 0.2);
        }
      `}</style>
    </header>
  );
}
