import { useState, useEffect } from 'react';

/**
 * UserDashboard - Premium trading dashboard for user wallet management
 * Matches existing NFAi design language with glassmorphism and gold accents
 */
export function UserDashboard({
    userWallet,
    userConfig,
    userPositions,
    userStats,
    onUpdateConfig,
    onLogout,
    onClose
}) {
    const [activeTab, setActiveTab] = useState('positions');
    const [editingConfig, setEditingConfig] = useState(false);
    const [configForm, setConfigForm] = useState({
        trade_amount_sol: userConfig?.trade_amount_sol || 0.2,
        stop_loss_pct: userConfig?.stop_loss_pct || -30,
        take_profit_pct: userConfig?.take_profit_pct || 100,
        take_profit_sell_pct: userConfig?.take_profit_sell_pct || 75,
        trailing_stop_pct: userConfig?.trailing_stop_pct || 25,
        min_sol_entry: userConfig?.min_sol_entry || 0.05,
        max_sol_entry: userConfig?.max_sol_entry || 1.0,
        auto_trading_enabled: userConfig?.auto_trading_enabled || false,
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (userConfig) {
            setConfigForm({
                trade_amount_sol: userConfig.trade_amount_sol || 0.2,
                stop_loss_pct: userConfig.stop_loss_pct || -30,
                take_profit_pct: userConfig.take_profit_pct || 100,
                take_profit_sell_pct: userConfig.take_profit_sell_pct || 75,
                trailing_stop_pct: userConfig.trailing_stop_pct || 25,
                min_sol_entry: userConfig.min_sol_entry || 0.05,
                max_sol_entry: userConfig.max_sol_entry || 1.0,
                auto_trading_enabled: userConfig.auto_trading_enabled || false,
            });
        }
    }, [userConfig]);

    const handleSaveConfig = async () => {
        setSaving(true);
        try {
            await onUpdateConfig(configForm);
            setEditingConfig(false);
        } catch (err) {
            console.error('Failed to save config:', err);
        } finally {
            setSaving(false);
        }
    };

    const formatPercent = (value) => {
        const num = parseFloat(value);
        if (!Number.isFinite(num)) return '0%';
        return `${num > 0 ? '+' : ''}${num.toFixed(1)}%`;
    };

    const formatSol = (value) => {
        const num = parseFloat(value);
        if (!Number.isFinite(num)) return '0.00';
        return num.toFixed(4);
    };

    const formatMcap = (value) => {
        const num = parseFloat(value);
        if (!Number.isFinite(num) || num <= 0) return '$0';
        if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
        if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
        if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
        return `$${num.toFixed(0)}`;
    };

    const winRate = userStats?.total_trades > 0
        ? ((userStats.winning_trades / userStats.total_trades) * 100).toFixed(1)
        : '0.0';

    return (
        <div className="user-dashboard">
            {/* Header with wallet info and close/logout */}
            <div className="dashboard-header">
                <div className="dashboard-title-section">
                    <h2 className="dashboard-title">Trading Dashboard</h2>
                    <div className="wallet-badge">
                        <span className="wallet-icon">◈</span>
                        <span className="wallet-address">
                            {userWallet?.slice(0, 6)}...{userWallet?.slice(-4)}
                        </span>
                    </div>
                </div>
                <div className="dashboard-actions">
                    <button className="btn-icon" onClick={onClose} title="Close Dashboard">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Stats Overview Cards */}
            <div className="stats-overview">
                <div className="stat-card">
                    <div className="stat-label">Total PnL</div>
                    <div className={`stat-value ${(userStats?.total_pnl_sol || 0) >= 0 ? 'positive' : 'negative'}`}>
                        {formatSol(userStats?.total_pnl_sol || 0)} SOL
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Win Rate</div>
                    <div className="stat-value">{winRate}%</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Total Trades</div>
                    <div className="stat-value">{userStats?.total_trades || 0}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Open Positions</div>
                    <div className="stat-value accent">{userPositions?.length || 0}</div>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="dashboard-tabs">
                <button
                    className={`tab-btn ${activeTab === 'positions' ? 'active' : ''}`}
                    onClick={() => setActiveTab('positions')}
                >
                    <span className="tab-icon">📊</span>
                    Positions
                </button>
                <button
                    className={`tab-btn ${activeTab === 'config' ? 'active' : ''}`}
                    onClick={() => setActiveTab('config')}
                >
                    <span className="tab-icon">⚙️</span>
                    Configuration
                </button>
                <button
                    className={`tab-btn ${activeTab === 'stats' ? 'active' : ''}`}
                    onClick={() => setActiveTab('stats')}
                >
                    <span className="tab-icon">📈</span>
                    Statistics
                </button>
            </div>

            {/* Tab Content */}
            <div className="dashboard-content">
                {/* Positions Tab */}
                {activeTab === 'positions' && (
                    <div className="positions-section">
                        {(!userPositions || userPositions.length === 0) ? (
                            <div className="empty-state">
                                <div className="empty-icon">📭</div>
                                <p>No open positions</p>
                                <span className="empty-hint">
                                    {configForm.auto_trading_enabled
                                        ? 'Your trades will appear here when NFAi signals trigger'
                                        : 'Enable auto-trading in Configuration to start sniping'}
                                </span>
                            </div>
                        ) : (
                            <div className="positions-grid">
                                {userPositions.map((pos) => (
                                    <div key={pos.mint} className="position-card">
                                        <div className="position-header">
                                            <span className="position-symbol">{pos.symbol || pos.mint?.slice(0, 6)}</span>
                                            <span className={`position-pnl ${pos.pnl_pct >= 0 ? 'positive' : 'negative'}`}>
                                                {formatPercent(pos.pnl_pct)}
                                            </span>
                                        </div>
                                        <div className="position-details">
                                            <div className="detail-row">
                                                <span className="detail-label">Entry</span>
                                                <span className="detail-value">{formatMcap(pos.entry_mcap)}</span>
                                            </div>
                                            <div className="detail-row">
                                                <span className="detail-label">Current</span>
                                                <span className="detail-value">{formatMcap(pos.max_mcap)}</span>
                                            </div>
                                            <div className="detail-row">
                                                <span className="detail-label">Size</span>
                                                <span className="detail-value">{formatSol(pos.amount_sol)} SOL</span>
                                            </div>
                                            <div className="detail-row">
                                                <span className="detail-label">Remaining</span>
                                                <span className="detail-value">{pos.remaining_pct}%</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Configuration Tab */}
                {activeTab === 'config' && (
                    <div className="config-section">
                        {/* Auto Trading Toggle */}
                        <div className="config-group featured">
                            <div className="config-row toggle-row">
                                <div className="config-info">
                                    <label className="config-label">Auto Trading</label>
                                    <span className="config-hint">Automatically trade when NFAi signals trigger</span>
                                </div>
                                <button
                                    className={`toggle-btn ${configForm.auto_trading_enabled ? 'active' : ''}`}
                                    onClick={() => setConfigForm(prev => ({ ...prev, auto_trading_enabled: !prev.auto_trading_enabled }))}
                                >
                                    <span className="toggle-track">
                                        <span className="toggle-thumb" />
                                    </span>
                                    <span className="toggle-label">{configForm.auto_trading_enabled ? 'ON' : 'OFF'}</span>
                                </button>
                            </div>
                        </div>

                        {/* Trade Size Configuration */}
                        <div className="config-group">
                            <h3 className="config-group-title">Trade Size</h3>
                            <div className="config-grid">
                                <div className="config-item">
                                    <label className="config-label">Amount per Trade</label>
                                    <div className="input-group">
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0.01"
                                            value={configForm.trade_amount_sol}
                                            onChange={(e) => setConfigForm(prev => ({ ...prev, trade_amount_sol: parseFloat(e.target.value) || 0 }))}
                                            className="config-input"
                                        />
                                        <span className="input-suffix">SOL</span>
                                    </div>
                                </div>
                                <div className="config-item">
                                    <label className="config-label">Min Entry</label>
                                    <div className="input-group">
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0.01"
                                            value={configForm.min_sol_entry}
                                            onChange={(e) => setConfigForm(prev => ({ ...prev, min_sol_entry: parseFloat(e.target.value) || 0 }))}
                                            className="config-input"
                                        />
                                        <span className="input-suffix">SOL</span>
                                    </div>
                                </div>
                                <div className="config-item">
                                    <label className="config-label">Max Entry</label>
                                    <div className="input-group">
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0.1"
                                            value={configForm.max_sol_entry}
                                            onChange={(e) => setConfigForm(prev => ({ ...prev, max_sol_entry: parseFloat(e.target.value) || 0 }))}
                                            className="config-input"
                                        />
                                        <span className="input-suffix">SOL</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Risk Management Configuration */}
                        <div className="config-group">
                            <h3 className="config-group-title">Risk Management</h3>
                            <div className="config-grid">
                                <div className="config-item">
                                    <label className="config-label">Stop Loss</label>
                                    <div className="input-group">
                                        <input
                                            type="number"
                                            step="1"
                                            max="0"
                                            value={configForm.stop_loss_pct}
                                            onChange={(e) => setConfigForm(prev => ({ ...prev, stop_loss_pct: parseFloat(e.target.value) || 0 }))}
                                            className="config-input negative"
                                        />
                                        <span className="input-suffix">%</span>
                                    </div>
                                    <span className="config-hint">Exit when loss exceeds this %</span>
                                </div>
                                <div className="config-item">
                                    <label className="config-label">Take Profit</label>
                                    <div className="input-group">
                                        <input
                                            type="number"
                                            step="10"
                                            min="0"
                                            value={configForm.take_profit_pct}
                                            onChange={(e) => setConfigForm(prev => ({ ...prev, take_profit_pct: parseFloat(e.target.value) || 0 }))}
                                            className="config-input positive"
                                        />
                                        <span className="input-suffix">%</span>
                                    </div>
                                    <span className="config-hint">Target profit to trigger sell</span>
                                </div>
                                <div className="config-item">
                                    <label className="config-label">TP Sell %</label>
                                    <div className="input-group">
                                        <input
                                            type="number"
                                            step="5"
                                            min="1"
                                            max="100"
                                            value={configForm.take_profit_sell_pct}
                                            onChange={(e) => setConfigForm(prev => ({ ...prev, take_profit_sell_pct: parseFloat(e.target.value) || 0 }))}
                                            className="config-input"
                                        />
                                        <span className="input-suffix">%</span>
                                    </div>
                                    <span className="config-hint">% of position to sell at TP</span>
                                </div>
                                <div className="config-item">
                                    <label className="config-label">Trailing Stop</label>
                                    <div className="input-group">
                                        <input
                                            type="number"
                                            step="5"
                                            min="0"
                                            value={configForm.trailing_stop_pct}
                                            onChange={(e) => setConfigForm(prev => ({ ...prev, trailing_stop_pct: parseFloat(e.target.value) || 0 }))}
                                            className="config-input"
                                        />
                                        <span className="input-suffix">%</span>
                                    </div>
                                    <span className="config-hint">Exit when drops this % from peak</span>
                                </div>
                            </div>
                        </div>

                        {/* Save Button */}
                        <div className="config-actions">
                            <button
                                className="btn-primary save-btn"
                                onClick={handleSaveConfig}
                                disabled={saving}
                            >
                                {saving ? (
                                    <>
                                        <span className="spinner" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <span className="save-icon">✓</span>
                                        Save Configuration
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* Statistics Tab */}
                {activeTab === 'stats' && (
                    <div className="stats-section">
                        <div className="stats-grid-detailed">
                            <div className="stat-detail-card">
                                <div className="stat-detail-icon">🎯</div>
                                <div className="stat-detail-content">
                                    <div className="stat-detail-value">{userStats?.winning_trades || 0}</div>
                                    <div className="stat-detail-label">Winning Trades</div>
                                </div>
                            </div>
                            <div className="stat-detail-card">
                                <div className="stat-detail-icon">❌</div>
                                <div className="stat-detail-content">
                                    <div className="stat-detail-value">{userStats?.losing_trades || 0}</div>
                                    <div className="stat-detail-label">Losing Trades</div>
                                </div>
                            </div>
                            <div className="stat-detail-card highlight">
                                <div className="stat-detail-icon">💰</div>
                                <div className="stat-detail-content">
                                    <div className="stat-detail-value positive">{formatSol(userStats?.largest_win_sol || 0)} SOL</div>
                                    <div className="stat-detail-label">Largest Win</div>
                                </div>
                            </div>
                            <div className="stat-detail-card">
                                <div className="stat-detail-icon">📉</div>
                                <div className="stat-detail-content">
                                    <div className="stat-detail-value negative">{formatSol(userStats?.largest_loss_sol || 0)} SOL</div>
                                    <div className="stat-detail-label">Largest Loss</div>
                                </div>
                            </div>
                            <div className="stat-detail-card full-width">
                                <div className="stat-detail-icon">📊</div>
                                <div className="stat-detail-content">
                                    <div className={`stat-detail-value ${(userStats?.realized_profit_sol || 0) >= 0 ? 'positive' : 'negative'}`}>
                                        {formatSol(userStats?.realized_profit_sol || 0)} SOL
                                    </div>
                                    <div className="stat-detail-label">Realized Profit</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer with Logout */}
            <div className="dashboard-footer">
                <button className="btn-logout" onClick={onLogout}>
                    <span className="logout-icon">⏏</span>
                    Disconnect Wallet
                </button>
            </div>

            <style>{`
        .user-dashboard {
          background: rgba(11, 22, 36, 0.95);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 1.5rem;
          max-width: 700px;
          width: 100%;
          max-height: 85vh;
          overflow-y: auto;
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
        }

        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .dashboard-title-section {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .dashboard-title {
          font-family: var(--font-serif);
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }

        .wallet-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.3rem 0.7rem;
          background: linear-gradient(135deg, rgba(212, 175, 55, 0.15), rgba(212, 175, 55, 0.05));
          border: 1px solid rgba(212, 175, 55, 0.3);
          border-radius: 6px;
          font-family: var(--font-mono);
          font-size: 0.75rem;
        }

        .wallet-icon {
          color: var(--accent-primary);
        }

        .wallet-address {
          color: var(--text-secondary);
        }

        .dashboard-actions {
          display: flex;
          gap: 0.5rem;
        }

        .btn-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-icon:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: var(--accent-primary);
          color: var(--accent-primary);
        }

        /* Stats Overview */
        .stats-overview {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }

        .stat-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 10px;
          padding: 1rem;
          text-align: center;
        }

        .stat-label {
          font-size: 0.7rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 0.4rem;
        }

        .stat-value {
          font-family: var(--font-mono);
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .stat-value.positive { color: var(--accent-secondary); }
        .stat-value.negative { color: #ef4444; }
        .stat-value.accent { color: var(--accent-primary); }

        /* Tabs */
        .dashboard-tabs {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
          padding: 0.25rem;
          background: rgba(255, 255, 255, 0.02);
          border-radius: 10px;
        }

        .tab-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          background: transparent;
          border: none;
          border-radius: 8px;
          color: var(--text-secondary);
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .tab-btn:hover {
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-primary);
        }

        .tab-btn.active {
          background: rgba(212, 175, 55, 0.15);
          color: var(--accent-primary);
          border: 1px solid rgba(212, 175, 55, 0.3);
        }

        .tab-icon {
          font-size: 1rem;
        }

        /* Content Area */
        .dashboard-content {
          min-height: 300px;
        }

        /* Empty State */
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 3rem 2rem;
          text-align: center;
        }

        .empty-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
          opacity: 0.5;
        }

        .empty-state p {
          color: var(--text-primary);
          font-size: 1.1rem;
          margin-bottom: 0.5rem;
        }

        .empty-hint {
          color: var(--text-muted);
          font-size: 0.85rem;
        }

        /* Positions Grid */
        .positions-grid {
          display: grid;
          gap: 0.75rem;
        }

        .position-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 1rem;
        }

        .position-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
        }

        .position-symbol {
          font-weight: 600;
          color: var(--text-primary);
          font-size: 1rem;
        }

        .position-pnl {
          font-family: var(--font-mono);
          font-weight: 600;
          font-size: 0.9rem;
        }

        .position-pnl.positive { color: var(--accent-secondary); }
        .position-pnl.negative { color: #ef4444; }

        .position-details {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.5rem;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 0.25rem 0;
        }

        .detail-label {
          color: var(--text-muted);
          font-size: 0.75rem;
        }

        .detail-value {
          color: var(--text-secondary);
          font-family: var(--font-mono);
          font-size: 0.8rem;
        }

        /* Configuration */
        .config-section {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .config-group {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          padding: 1.25rem;
        }

        .config-group.featured {
          background: linear-gradient(135deg, rgba(212, 175, 55, 0.08), rgba(212, 175, 55, 0.02));
          border-color: rgba(212, 175, 55, 0.2);
        }

        .config-group-title {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 1rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .config-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
        }

        .config-item {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .config-label {
          font-size: 0.8rem;
          color: var(--text-secondary);
          font-weight: 500;
        }

        .config-hint {
          font-size: 0.7rem;
          color: var(--text-muted);
        }

        .input-group {
          display: flex;
          align-items: center;
          background: rgba(5, 10, 20, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          overflow: hidden;
        }

        .config-input {
          flex: 1;
          background: transparent;
          border: none;
          padding: 0.65rem 0.75rem;
          color: var(--text-primary);
          font-family: var(--font-mono);
          font-size: 0.9rem;
          outline: none;
        }

        .config-input:focus {
          background: rgba(255, 255, 255, 0.02);
        }

        .config-input.positive { color: var(--accent-secondary); }
        .config-input.negative { color: #ef4444; }

        .input-suffix {
          padding: 0 0.75rem;
          color: var(--text-muted);
          font-size: 0.8rem;
          font-weight: 500;
        }

        /* Toggle */
        .toggle-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .config-info {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }

        .toggle-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: transparent;
          border: none;
          cursor: pointer;
          padding: 0;
        }

        .toggle-track {
          width: 48px;
          height: 26px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 13px;
          position: relative;
          transition: all 0.2s ease;
        }

        .toggle-btn.active .toggle-track {
          background: linear-gradient(135deg, var(--accent-primary), #F59E0B);
        }

        .toggle-thumb {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 20px;
          height: 20px;
          background: white;
          border-radius: 50%;
          transition: all 0.2s ease;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .toggle-btn.active .toggle-thumb {
          left: 25px;
        }

        .toggle-label {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-muted);
          min-width: 30px;
        }

        .toggle-btn.active .toggle-label {
          color: var(--accent-primary);
        }

        /* Save Button */
        .config-actions {
          display: flex;
          justify-content: flex-end;
          padding-top: 0.5rem;
        }

        .btn-primary {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.85rem 1.5rem;
          background: linear-gradient(135deg, var(--accent-primary), #F59E0B);
          border: none;
          border-radius: 10px;
          color: #050A14;
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(212, 175, 55, 0.3);
        }

        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .save-icon {
          font-size: 1rem;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(5, 10, 20, 0.3);
          border-top-color: #050A14;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Statistics */
        .stats-grid-detailed {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.75rem;
        }

        .stat-detail-card {
          display: flex;
          align-items: center;
          gap: 1rem;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 10px;
          padding: 1rem;
        }

        .stat-detail-card.full-width {
          grid-column: span 2;
        }

        .stat-detail-card.highlight {
          background: linear-gradient(135deg, rgba(0, 255, 157, 0.08), rgba(0, 255, 157, 0.02));
          border-color: rgba(0, 255, 157, 0.2);
        }

        .stat-detail-icon {
          font-size: 1.5rem;
        }

        .stat-detail-content {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }

        .stat-detail-value {
          font-family: var(--font-mono);
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .stat-detail-value.positive { color: var(--accent-secondary); }
        .stat-detail-value.negative { color: #ef4444; }

        .stat-detail-label {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        /* Footer */
        .dashboard-footer {
          margin-top: 1.5rem;
          padding-top: 1rem;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          display: flex;
          justify-content: center;
        }

        .btn-logout {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.6rem 1.25rem;
          background: transparent;
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 8px;
          color: #ef4444;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-logout:hover {
          background: rgba(239, 68, 68, 0.1);
          border-color: rgba(239, 68, 68, 0.5);
        }

        .logout-icon {
          font-size: 1rem;
        }

        /* Responsive */
        @media (max-width: 600px) {
          .stats-overview {
            grid-template-columns: repeat(2, 1fr);
          }

          .config-grid {
            grid-template-columns: 1fr;
          }

          .stats-grid-detailed {
            grid-template-columns: 1fr;
          }

          .stat-detail-card.full-width {
            grid-column: span 1;
          }
        }
      `}</style>
        </div>
    );
}

export default UserDashboard;
