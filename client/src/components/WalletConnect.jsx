import { useState } from 'react';

export function WalletConnect({ onConnect, onGenerate, onClose, loading, error }) {
  const [mode, setMode] = useState('import'); // 'import' or 'generate'
  const [privateKey, setPrivateKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [localError, setLocalError] = useState('');

  // For generated wallet display
  const [generatedWallet, setGeneratedWallet] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleImport = async () => {
    setLocalError('');

    if (!privateKey.trim()) {
      setLocalError('Please enter your private key');
      return;
    }

    // Basic validation (base58, 64 or 88 chars typical)
    if (privateKey.trim().length < 60) {
      setLocalError('Invalid private key format');
      return;
    }

    await onConnect(privateKey.trim());
  };

  const handleGenerate = async () => {
    setLocalError('');

    try {
      const res = await fetch('/api/user/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate wallet');
      }

      // Show the generated wallet with private key warning
      setGeneratedWallet(data);
    } catch (err) {
      setLocalError(err.message || 'Generation failed');
    }
  };

  const handleCopyKey = () => {
    if (generatedWallet?.privateKey) {
      navigator.clipboard.writeText(generatedWallet.privateKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleConfirmSaved = () => {
    if (generatedWallet) {
      onGenerate?.(generatedWallet);
    }
  };

  return (
    <div className="wallet-connect-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="wallet-connect-modal">
        <button className="modal-close" onClick={onClose}>×</button>

        {!generatedWallet ? (
          <>
            <div className="modal-header">
              <span className="modal-icon">◈</span>
              <h2>Connect Wallet</h2>
            </div>

            <p className="modal-subtitle">
              Import your wallet or generate a new one to start auto-trading NFAi signals.
            </p>

            {/* Mode Toggle */}
            <div className="mode-toggle">
              <button
                className={`mode-btn ${mode === 'import' ? 'active' : ''}`}
                onClick={() => setMode('import')}
              >
                Import Wallet
              </button>
              <button
                className={`mode-btn ${mode === 'generate' ? 'active' : ''}`}
                onClick={() => setMode('generate')}
              >
                Generate New
              </button>
            </div>

            {mode === 'import' ? (
              <>
                <div className="feature-list">
                  <div className="feature-item">
                    <span className="feature-icon">⚡</span>
                    <span>Auto-snipe NFAi signals</span>
                  </div>
                  <div className="feature-item">
                    <span className="feature-icon">🎯</span>
                    <span>Custom stop-loss & take-profit</span>
                  </div>
                  <div className="feature-item">
                    <span className="feature-icon">📊</span>
                    <span>Track your performance</span>
                  </div>
                </div>

                <div className="input-group">
                  <label>Private Key</label>
                  <div className="input-wrapper">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={privateKey}
                      onChange={(e) => setPrivateKey(e.target.value)}
                      placeholder="Enter your Solana private key (base58)..."
                      disabled={loading}
                    />
                    <button
                      type="button"
                      className="toggle-visibility"
                      onClick={() => setShowKey(!showKey)}
                    >
                      {showKey ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                {(error || localError) && (
                  <div className="error-message">{error || localError}</div>
                )}

                <button
                  className="connect-btn"
                  onClick={handleImport}
                  disabled={loading || !privateKey.trim()}
                >
                  {loading ? (
                    <span className="loading-spinner">◌</span>
                  ) : (
                    <>
                      <span className="btn-icon">🔗</span>
                      <span>Import Wallet</span>
                    </>
                  )}
                </button>

                <p className="security-note">
                  🔒 Your private key is encrypted and stored securely. Only you control your funds.
                </p>
              </>
            ) : (
              <>
                <div className="generate-info">
                  <div className="warning-box">
                    <span className="warning-icon">⚠️</span>
                    <div>
                      <strong>Important!</strong>
                      <p>You will receive a private key. You MUST save it securely. It cannot be recovered!</p>
                    </div>
                  </div>

                  <div className="feature-list">
                    <div className="feature-item">
                      <span className="feature-icon">🆕</span>
                      <span>Fresh wallet generated instantly</span>
                    </div>
                    <div className="feature-item">
                      <span className="feature-icon">🔐</span>
                      <span>Private key shown once only</span>
                    </div>
                    <div className="feature-item">
                      <span className="feature-icon">💰</span>
                      <span>Fund with SOL to start trading</span>
                    </div>
                  </div>
                </div>

                {(error || localError) && (
                  <div className="error-message">{error || localError}</div>
                )}

                <button
                  className="connect-btn generate"
                  onClick={handleGenerate}
                  disabled={loading}
                >
                  {loading ? (
                    <span className="loading-spinner">◌</span>
                  ) : (
                    <>
                      <span className="btn-icon">✨</span>
                      <span>Generate New Wallet</span>
                    </>
                  )}
                </button>
              </>
            )}
          </>
        ) : (
          /* Generated Wallet Display */
          <div className="generated-wallet">
            <div className="modal-header success">
              <span className="modal-icon">✅</span>
              <h2>Wallet Generated!</h2>
            </div>

            <div className="critical-warning">
              <span className="warning-icon">🚨</span>
              <strong>SAVE YOUR PRIVATE KEY NOW!</strong>
              <p>This is the ONLY time it will be shown. Write it down or store it securely.</p>
            </div>

            <div className="wallet-info">
              <label>Your Wallet Address</label>
              <div className="wallet-address">{generatedWallet.walletAddress}</div>
            </div>

            <div className="private-key-box">
              <label>Your Private Key (SAVE THIS!)</label>
              <div className="key-display">
                <code>{generatedWallet.privateKey}</code>
              </div>
              <button className="copy-btn" onClick={handleCopyKey}>
                {copied ? '✓ Copied!' : '📋 Copy to Clipboard'}
              </button>
            </div>

            <div className="confirm-saved">
              <label className="checkbox-label">
                <input type="checkbox" id="confirm-checkbox" />
                <span>I have saved my private key securely</span>
              </label>
            </div>

            <button
              className="connect-btn confirm"
              onClick={handleConfirmSaved}
            >
              <span className="btn-icon">🚀</span>
              <span>Continue to Dashboard</span>
            </button>

            <p className="fund-note">
              💡 Fund your wallet with SOL to start trading!
            </p>
          </div>
        )}
      </div>

      <style>{`
        .wallet-connect-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .wallet-connect-modal {
          background: linear-gradient(135deg, rgba(11, 22, 36, 0.98), rgba(5, 10, 20, 0.98));
          border: 1px solid rgba(212, 175, 55, 0.3);
          border-radius: 16px;
          padding: 2rem;
          width: 100%;
          max-width: 440px;
          position: relative;
          box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
          animation: slideUp 0.3s ease-out;
        }

        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .modal-close {
          position: absolute;
          top: 1rem;
          right: 1rem;
          background: none;
          border: none;
          color: var(--text-secondary);
          font-size: 1.5rem;
          cursor: pointer;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          transition: all 0.2s;
        }

        .modal-close:hover {
          background: rgba(255, 255, 255, 0.1);
          color: var(--text-primary);
        }

        .modal-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }

        .modal-header.success .modal-icon {
          color: var(--accent-secondary);
        }

        .modal-icon {
          font-size: 1.5rem;
          color: var(--accent-primary);
        }

        .modal-header h2 {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }

        .modal-subtitle {
          color: var(--text-secondary);
          font-size: 0.95rem;
          margin-bottom: 1.5rem;
          line-height: 1.5;
        }

        .mode-toggle {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
          background: rgba(0, 0, 0, 0.3);
          padding: 4px;
          border-radius: 10px;
        }

        .mode-btn {
          flex: 1;
          padding: 0.6rem;
          background: transparent;
          border: none;
          border-radius: 8px;
          color: var(--text-secondary);
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .mode-btn:hover {
          color: var(--text-primary);
        }

        .mode-btn.active {
          background: rgba(212, 175, 55, 0.2);
          color: var(--accent-primary);
        }

        .feature-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }

        .feature-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          color: var(--text-secondary);
          font-size: 0.9rem;
        }

        .feature-icon {
          font-size: 1rem;
        }

        .input-group {
          margin-bottom: 1rem;
        }

        .input-group label {
          display: block;
          color: var(--text-secondary);
          font-size: 0.85rem;
          margin-bottom: 0.5rem;
          font-weight: 500;
        }

        .input-wrapper {
          position: relative;
        }

        .input-group input {
          width: 100%;
          padding: 0.85rem 3rem 0.85rem 1rem;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: var(--text-primary);
          font-family: var(--font-mono);
          font-size: 0.85rem;
          transition: all 0.2s;
        }

        .input-group input:focus {
          outline: none;
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.1);
        }

        .input-group input::placeholder {
          color: var(--text-muted);
        }

        .toggle-visibility {
          position: absolute;
          right: 0.75rem;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          font-size: 1rem;
          cursor: pointer;
          padding: 0.25rem;
        }

        .error-message {
          color: #ff6b6b;
          font-size: 0.85rem;
          margin-bottom: 1rem;
          padding: 0.5rem;
          background: rgba(255, 107, 107, 0.1);
          border-radius: 6px;
        }

        .connect-btn {
          width: 100%;
          padding: 0.9rem;
          background: linear-gradient(135deg, #D4AF37, #F59E0B);
          border: none;
          border-radius: 10px;
          color: #000;
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          transition: all 0.2s;
        }

        .connect-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(212, 175, 55, 0.3);
        }

        .connect-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .connect-btn.generate {
          background: linear-gradient(135deg, #00FF9D, #00CC7D);
        }

        .connect-btn.confirm {
          background: linear-gradient(135deg, #00FF9D, #00CC7D);
        }

        .loading-spinner {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .security-note {
          margin-top: 1rem;
          color: var(--text-muted);
          font-size: 0.8rem;
          text-align: center;
        }

        .warning-box {
          display: flex;
          gap: 0.75rem;
          padding: 1rem;
          background: rgba(255, 193, 7, 0.1);
          border: 1px solid rgba(255, 193, 7, 0.3);
          border-radius: 10px;
          margin-bottom: 1.5rem;
        }

        .warning-box .warning-icon {
          font-size: 1.25rem;
        }

        .warning-box strong {
          color: #FFC107;
          display: block;
          margin-bottom: 0.25rem;
        }

        .warning-box p {
          color: var(--text-secondary);
          font-size: 0.85rem;
          margin: 0;
        }

        .generate-info {
          margin-bottom: 1rem;
        }

        /* Generated wallet styles */
        .generated-wallet {
          text-align: center;
        }

        .critical-warning {
          background: rgba(255, 0, 0, 0.1);
          border: 2px solid rgba(255, 0, 0, 0.4);
          border-radius: 12px;
          padding: 1rem;
          margin-bottom: 1.5rem;
        }

        .critical-warning .warning-icon {
          font-size: 1.5rem;
          display: block;
          margin-bottom: 0.5rem;
        }

        .critical-warning strong {
          color: #ff6b6b;
          font-size: 1rem;
        }

        .critical-warning p {
          color: var(--text-secondary);
          font-size: 0.85rem;
          margin: 0.5rem 0 0;
        }

        .wallet-info {
          text-align: left;
          margin-bottom: 1rem;
        }

        .wallet-info label {
          color: var(--text-secondary);
          font-size: 0.8rem;
          display: block;
          margin-bottom: 0.25rem;
        }

        .wallet-address {
          font-family: var(--font-mono);
          font-size: 0.85rem;
          color: var(--accent-secondary);
          word-break: break-all;
          background: rgba(0, 255, 157, 0.05);
          padding: 0.5rem;
          border-radius: 6px;
        }

        .private-key-box {
          text-align: left;
          margin-bottom: 1.5rem;
        }

        .private-key-box label {
          color: #ff6b6b;
          font-size: 0.85rem;
          font-weight: 600;
          display: block;
          margin-bottom: 0.5rem;
        }

        .key-display {
          background: rgba(0, 0, 0, 0.5);
          border: 2px solid rgba(255, 193, 7, 0.3);
          border-radius: 8px;
          padding: 0.75rem;
          margin-bottom: 0.5rem;
          max-height: 80px;
          overflow-y: auto;
        }

        .key-display code {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: #FFC107;
          word-break: break-all;
        }

        .copy-btn {
          width: 100%;
          padding: 0.6rem;
          background: rgba(255, 193, 7, 0.1);
          border: 1px solid rgba(255, 193, 7, 0.3);
          border-radius: 6px;
          color: #FFC107;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .copy-btn:hover {
          background: rgba(255, 193, 7, 0.2);
        }

        .confirm-saved {
          margin-bottom: 1rem;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          color: var(--text-secondary);
          font-size: 0.85rem;
        }

        .checkbox-label input {
          width: 18px;
          height: 18px;
          accent-color: var(--accent-secondary);
        }

        .fund-note {
          margin-top: 1rem;
          color: var(--text-muted);
          font-size: 0.85rem;
        }
      `}</style>
    </div>
  );
}
