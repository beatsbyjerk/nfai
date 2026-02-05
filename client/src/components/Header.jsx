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
            <img src="/logo.png" alt="NFAi" className="logo-img" />
            <span className="logo-text">NFAi</span>
          </div>
        </div>

        <div className="header-right">
          {/* {authWallet && (
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
          )} */}
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
          background: rgba(11, 26, 47, 0.7);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-bottom: 1px solid rgba(212, 175, 55, 0.3);
          padding: 1rem 2rem;
          position: sticky;
          top: 0;
          z-index: 50;
          transition: background 0.3s ease;
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
          gap: 0.75rem;
          font-family: var(--font-serif);
          font-size: 1.6rem;
          font-weight: 700;
          color: #f5f0e8;
          letter-spacing: 0.05em;
          text-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        
        .logo-img {
          width: 36px;
          height: 36px;
          border-radius: 4px;
          object-fit: cover;
          border: 1px solid rgba(212, 175, 55, 0.5);
        }
        
        .header-right {
          display: flex;
          align-items: center;
          gap: 1.25rem;
        }

        .license-status {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.4rem 0.8rem;
          border: 1px solid rgba(212, 175, 55, 0.3);
          border-radius: 4px; /* Roman Sharpness */
          background: rgba(14, 25, 41, 0.6);
          font-size: 0.85rem;
          color: #f5f0e8;
        }

        .license-wallet {
          color: #d4af37;
          font-weight: 600;
          font-family: var(--font-mono);
        }

        .license-expiry {
          color: rgba(245, 240, 232, 0.7);
        }

        .license-logout {
          border: 1px solid rgba(212, 175, 55, 0.5);
          background: rgba(212, 175, 55, 0.1);
          color: #d4af37;
          padding: 0.2rem 0.6rem;
          border-radius: 2px;
          cursor: pointer;
          font-size: 0.75rem;
          font-family: var(--font-serif);
          text-transform: uppercase;
          transition: all 0.2s ease;
        }
        
        .license-logout:hover {
            background: rgba(212, 175, 55, 0.3);
            color: #f5f0e8;
        }
        
        .theme-toggle,
        .sound-toggle {
          background: transparent;
          border: 1px solid rgba(212, 175, 55, 0.3);
          color: #d4af37;
          width: 40px;
          height: 40px;
          border-radius: 50%; /* Medallion Style */
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 1.1rem;
        }
        
        .theme-toggle:hover,
        .sound-toggle:hover {
          background: rgba(212, 175, 55, 0.2);
          border-color: #d4af37;
          color: #f5f0e8;
          box-shadow: 0 0 10px rgba(212, 175, 55, 0.2);
          transform: translateY(-1px);
        }

        .sound-toggle.on {
          color: #f5f0e8;
          background: rgba(212, 175, 55, 0.15);
          border-color: #d4af37;
        }
        
        .connection-status {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.4rem 1rem;
          border: 1px solid rgba(212, 175, 55, 0.4);
          border-radius: 2px; /* Sharp/Roman */
          font-family: var(--font-serif);
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          background: rgba(14, 25, 41, 0.6);
          color: #f5f0e8;
          text-transform: uppercase;
        }
        
        .status-dot {
          width: 6px;
          height: 6px;
          transform: rotate(45deg); /* Diamond Dot */
          background: rgba(245, 240, 232, 0.3);
        }
        
        .connected .status-dot {
          background: #00ff9d;
          box-shadow: 0 0 8px #00ff9d;
        }
      `}</style>
    </header>
  );
}
