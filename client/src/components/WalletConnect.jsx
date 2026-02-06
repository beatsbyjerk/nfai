import { useState } from 'react';

/**
 * WalletConnect - Premium wallet import modal
 * Matches existing NFAi design with glassmorphism
 */
export function WalletConnect({ onConnect, onClose, loading, error }) {
    const [walletAddress, setWalletAddress] = useState('');
    const [localError, setLocalError] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        setLocalError('');

        const trimmed = walletAddress.trim();
        if (!trimmed) {
            setLocalError('Please enter a wallet address');
            return;
        }

        // Validate Solana address format
        const walletRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
        if (!walletRegex.test(trimmed)) {
            setLocalError('Invalid Solana wallet address');
            return;
        }

        onConnect(trimmed);
    };

    const displayError = error || localError;

    return (
        <div className="wallet-connect-overlay">
            <div className="wallet-connect-modal">
                {/* Header */}
                <div className="modal-header">
                    <div className="modal-title-section">
                        <div className="modal-icon">◈</div>
                        <h2 className="modal-title">Connect Wallet</h2>
                    </div>
                    <button className="modal-close" onClick={onClose}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* Description */}
                <p className="modal-description">
                    Import your Solana wallet to start auto-trading NFAi signals with your own configuration.
                </p>

                {/* Features List */}
                <div className="features-list">
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

                {/* Form */}
                <form onSubmit={handleSubmit} className="wallet-form">
                    <div className="input-container">
                        <label className="input-label">Wallet Address</label>
                        <div className="input-wrapper">
                            <input
                                type="text"
                                placeholder="Enter your Solana wallet address..."
                                value={walletAddress}
                                onChange={(e) => setWalletAddress(e.target.value)}
                                className="wallet-input"
                                disabled={loading}
                                autoFocus
                            />
                        </div>
                    </div>

                    {displayError && (
                        <div className="error-message">
                            <span className="error-icon">⚠</span>
                            {displayError}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="connect-btn"
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <span className="spinner" />
                                Connecting...
                            </>
                        ) : (
                            <>
                                <span className="btn-icon">🔗</span>
                                Connect Wallet
                            </>
                        )}
                    </button>
                </form>

                {/* Footer */}
                <div className="modal-footer">
                    <span className="footer-note">
                        Your wallet address is used as your unique identifier. No private keys required.
                    </span>
                </div>
            </div>

            <style>{`
        .wallet-connect-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
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
          background: rgba(11, 22, 36, 0.98);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 1.75rem;
          max-width: 440px;
          width: 100%;
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
          animation: slideUp 0.3s ease-out;
        }

        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(20px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .modal-title-section {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .modal-icon {
          font-size: 1.5rem;
          color: var(--accent-primary);
        }

        .modal-title {
          font-family: var(--font-serif);
          font-size: 1.35rem;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }

        .modal-close {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .modal-close:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: var(--text-secondary);
          color: var(--text-primary);
        }

        .modal-description {
          color: var(--text-secondary);
          font-size: 0.9rem;
          line-height: 1.5;
          margin-bottom: 1.25rem;
        }

        .features-list {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          margin-bottom: 1.5rem;
          padding: 1rem;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }

        .feature-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-size: 0.85rem;
          color: var(--text-primary);
        }

        .feature-icon {
          font-size: 1rem;
        }

        .wallet-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .input-container {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .input-label {
          font-size: 0.8rem;
          font-weight: 500;
          color: var(--text-secondary);
        }

        .input-wrapper {
          position: relative;
        }

        .wallet-input {
          width: 100%;
          padding: 0.85rem 1rem;
          background: rgba(5, 10, 20, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: var(--text-primary);
          font-family: var(--font-mono);
          font-size: 0.85rem;
          outline: none;
          transition: all 0.2s ease;
        }

        .wallet-input::placeholder {
          color: var(--text-muted);
        }

        .wallet-input:focus {
          border-color: var(--accent-primary);
          background: rgba(5, 10, 20, 1);
          box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.1);
        }

        .wallet-input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .error-message {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 8px;
          color: #ef4444;
          font-size: 0.85rem;
        }

        .error-icon {
          font-size: 1rem;
        }

        .connect-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.6rem;
          width: 100%;
          padding: 0.95rem 1.5rem;
          background: linear-gradient(135deg, var(--accent-primary), #F59E0B);
          border: none;
          border-radius: 10px;
          color: #050A14;
          font-weight: 600;
          font-size: 0.95rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .connect-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(212, 175, 55, 0.35);
        }

        .connect-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          transform: none;
        }

        .btn-icon {
          font-size: 1.1rem;
        }

        .spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(5, 10, 20, 0.3);
          border-top-color: #050A14;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .modal-footer {
          margin-top: 1.25rem;
          padding-top: 1rem;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .footer-note {
          display: block;
          text-align: center;
          font-size: 0.75rem;
          color: var(--text-muted);
          line-height: 1.4;
        }
      `}</style>
        </div>
    );
}

export default WalletConnect;
