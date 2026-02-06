import EventEmitter from 'events';
import supabase from './supabase-client.js';

/**
 * UserWalletService - Manages user wallets, configurations, positions, and statistics
 * All data persists to Supabase for server restart resilience
 */
export class UserWalletService extends EventEmitter {
    constructor() {
        super();

        // In-memory caches for fast access
        this.users = new Map(); // walletAddress -> user
        this.configs = new Map(); // walletAddress -> config
        this.positions = new Map(); // walletAddress -> Map<mint, position>
        this.statistics = new Map(); // walletAddress -> stats

        // Default configuration template
        this.defaultConfig = {
            trade_amount_sol: 0.2,
            stop_loss_pct: -30,
            take_profit_pct: 100,
            take_profit_sell_pct: 75,
            trailing_stop_pct: 25,
            min_sol_entry: 0.05,
            max_sol_entry: 1.0,
            auto_trading_enabled: false,
        };
    }

    /**
     * Initialize service - load all active users from Supabase
     */
    async initialize() {
        console.log('[UserWalletService] Initializing and loading user data from Supabase...');

        try {
            // Load active users
            const { data: users, error: usersError } = await supabase
                .from('users')
                .select('*')
                .eq('is_active', true);

            if (usersError) throw usersError;

            for (const user of users || []) {
                this.users.set(user.wallet_address, user);
            }

            // Load configs for active users
            const wallets = Array.from(this.users.keys());
            if (wallets.length > 0) {
                const { data: configs, error: configsError } = await supabase
                    .from('user_configs')
                    .select('*')
                    .in('wallet_address', wallets);

                if (configsError) throw configsError;

                for (const config of configs || []) {
                    this.configs.set(config.wallet_address, config);
                }

                // Load open positions
                const { data: positions, error: positionsError } = await supabase
                    .from('user_positions')
                    .select('*')
                    .in('wallet_address', wallets)
                    .eq('is_open', true);

                if (positionsError) throw positionsError;

                for (const pos of positions || []) {
                    if (!this.positions.has(pos.wallet_address)) {
                        this.positions.set(pos.wallet_address, new Map());
                    }
                    this.positions.get(pos.wallet_address).set(pos.mint, pos);
                }

                // Load statistics
                const { data: stats, error: statsError } = await supabase
                    .from('user_statistics')
                    .select('*')
                    .in('wallet_address', wallets);

                if (statsError) throw statsError;

                for (const stat of stats || []) {
                    this.statistics.set(stat.wallet_address, stat);
                }
            }

            console.log(`[UserWalletService] Loaded ${this.users.size} users, ${this.configs.size} configs, ${this.countOpenPositions()} open positions`);
        } catch (err) {
            console.error('[UserWalletService] Initialization error:', err?.message || err);
        }
    }

    countOpenPositions() {
        let count = 0;
        for (const posMap of this.positions.values()) {
            count += posMap.size;
        }
        return count;
    }

    /**
     * Register or get existing user by wallet address
     */
    async registerUser(walletAddress) {
        if (!walletAddress || typeof walletAddress !== 'string') {
            return { ok: false, error: 'Invalid wallet address' };
        }

        const normalized = walletAddress.trim();

        // Check cache first
        if (this.users.has(normalized)) {
            await this.updateLastActive(normalized);
            return { ok: true, user: this.users.get(normalized), isNew: false };
        }

        try {
            // Check if exists in DB
            const { data: existing, error: selectError } = await supabase
                .from('users')
                .select('*')
                .eq('wallet_address', normalized)
                .single();

            if (existing) {
                // Reactivate if needed
                if (!existing.is_active) {
                    await supabase
                        .from('users')
                        .update({ is_active: true, last_active_at: new Date().toISOString() })
                        .eq('wallet_address', normalized);
                    existing.is_active = true;
                }

                this.users.set(normalized, existing);

                // Load config
                const { data: config } = await supabase
                    .from('user_configs')
                    .select('*')
                    .eq('wallet_address', normalized)
                    .single();

                if (config) {
                    this.configs.set(normalized, config);
                }

                return { ok: true, user: existing, isNew: false };
            }

            // Create new user
            const newUser = {
                wallet_address: normalized,
                created_at: new Date().toISOString(),
                last_active_at: new Date().toISOString(),
                is_active: true,
            };

            const { error: insertError } = await supabase
                .from('users')
                .insert(newUser);

            if (insertError) throw insertError;

            // Create default config
            const newConfig = {
                wallet_address: normalized,
                ...this.defaultConfig,
                updated_at: new Date().toISOString(),
            };

            await supabase.from('user_configs').insert(newConfig);

            // Create initial statistics
            const newStats = {
                wallet_address: normalized,
                total_trades: 0,
                winning_trades: 0,
                losing_trades: 0,
                total_pnl_sol: 0,
                realized_profit_sol: 0,
                largest_win_sol: 0,
                largest_loss_sol: 0,
                updated_at: new Date().toISOString(),
            };

            await supabase.from('user_statistics').insert(newStats);

            // Cache
            this.users.set(normalized, newUser);
            this.configs.set(normalized, newConfig);
            this.statistics.set(normalized, newStats);
            this.positions.set(normalized, new Map());

            console.log(`[UserWalletService] New user registered: ${normalized.slice(0, 8)}...`);

            return { ok: true, user: newUser, isNew: true };
        } catch (err) {
            console.error('[UserWalletService] Register user error:', err?.message || err);
            return { ok: false, error: err?.message || 'Registration failed' };
        }
    }

    async updateLastActive(walletAddress) {
        try {
            await supabase
                .from('users')
                .update({ last_active_at: new Date().toISOString() })
                .eq('wallet_address', walletAddress);
        } catch (err) {
            // Silent fail - non-critical
        }
    }

    /**
     * Get user configuration
     */
    async getConfig(walletAddress) {
        if (this.configs.has(walletAddress)) {
            return { ok: true, config: this.configs.get(walletAddress) };
        }

        try {
            const { data, error } = await supabase
                .from('user_configs')
                .select('*')
                .eq('wallet_address', walletAddress)
                .single();

            if (error || !data) {
                return { ok: false, error: 'Config not found' };
            }

            this.configs.set(walletAddress, data);
            return { ok: true, config: data };
        } catch (err) {
            return { ok: false, error: err?.message || 'Failed to load config' };
        }
    }

    /**
     * Update user configuration
     */
    async updateConfig(walletAddress, updates) {
        if (!this.users.has(walletAddress)) {
            return { ok: false, error: 'User not found' };
        }

        // Validate and sanitize updates
        const allowedFields = [
            'trade_amount_sol', 'stop_loss_pct', 'take_profit_pct',
            'take_profit_sell_pct', 'trailing_stop_pct', 'min_sol_entry',
            'max_sol_entry', 'auto_trading_enabled'
        ];

        const sanitized = {};
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                sanitized[field] = updates[field];
            }
        }

        if (Object.keys(sanitized).length === 0) {
            return { ok: false, error: 'No valid fields to update' };
        }

        sanitized.updated_at = new Date().toISOString();

        try {
            const { error } = await supabase
                .from('user_configs')
                .update(sanitized)
                .eq('wallet_address', walletAddress);

            if (error) throw error;

            // Update cache
            const current = this.configs.get(walletAddress) || { wallet_address: walletAddress };
            const updated = { ...current, ...sanitized };
            this.configs.set(walletAddress, updated);

            this.emit('configUpdated', { walletAddress, config: updated });

            return { ok: true, config: updated };
        } catch (err) {
            return { ok: false, error: err?.message || 'Failed to update config' };
        }
    }

    /**
     * Get user positions
     */
    getPositions(walletAddress) {
        const posMap = this.positions.get(walletAddress);
        if (!posMap) return [];
        return Array.from(posMap.values());
    }

    /**
     * Open a new position for user
     */
    async openPosition(walletAddress, positionData) {
        const { mint, symbol, entryMcap, amountSol, tokenAmount = 0 } = positionData;

        if (!this.positions.has(walletAddress)) {
            this.positions.set(walletAddress, new Map());
        }

        const userPositions = this.positions.get(walletAddress);

        // Check if already has position
        if (userPositions.has(mint)) {
            return { ok: false, error: 'Position already exists' };
        }

        const position = {
            wallet_address: walletAddress,
            mint,
            symbol,
            entry_mcap: entryMcap,
            max_mcap: entryMcap,
            amount_sol: amountSol,
            token_amount: tokenAmount,
            remaining_pct: 100,
            pnl_pct: 0,
            open_at: new Date().toISOString(),
            is_open: true,
        };

        try {
            const { data, error } = await supabase
                .from('user_positions')
                .insert(position)
                .select()
                .single();

            if (error) throw error;

            userPositions.set(mint, data);

            this.emit('positionOpened', { walletAddress, position: data });

            return { ok: true, position: data };
        } catch (err) {
            return { ok: false, error: err?.message || 'Failed to open position' };
        }
    }

    /**
     * Update position (mcap, pnl, etc.)
     */
    async updatePosition(walletAddress, mint, updates) {
        const userPositions = this.positions.get(walletAddress);
        if (!userPositions || !userPositions.has(mint)) {
            return { ok: false, error: 'Position not found' };
        }

        const current = userPositions.get(mint);
        const updated = { ...current, ...updates };

        // Update max mcap if current is higher
        if (updates.current_mcap && updates.current_mcap > (current.max_mcap || 0)) {
            updated.max_mcap = updates.current_mcap;
        }

        // Calculate PnL
        if (updates.current_mcap && current.entry_mcap) {
            updated.pnl_pct = ((updates.current_mcap - current.entry_mcap) / current.entry_mcap) * 100;
        }

        try {
            await supabase
                .from('user_positions')
                .update({
                    max_mcap: updated.max_mcap,
                    pnl_pct: updated.pnl_pct,
                    remaining_pct: updated.remaining_pct,
                    token_amount: updated.token_amount,
                })
                .eq('id', current.id);

            userPositions.set(mint, updated);

            this.emit('positionUpdated', { walletAddress, position: updated });

            return { ok: true, position: updated };
        } catch (err) {
            return { ok: false, error: err?.message || 'Failed to update position' };
        }
    }

    /**
     * Close position
     */
    async closePosition(walletAddress, mint, pnlSol, reason = 'manual') {
        const userPositions = this.positions.get(walletAddress);
        if (!userPositions || !userPositions.has(mint)) {
            return { ok: false, error: 'Position not found' };
        }

        const position = userPositions.get(mint);

        try {
            await supabase
                .from('user_positions')
                .update({
                    is_open: false,
                    closed_at: new Date().toISOString(),
                    pnl_pct: position.pnl_pct,
                })
                .eq('id', position.id);

            // Update statistics
            await this.recordTrade(walletAddress, pnlSol);

            // Remove from cache
            userPositions.delete(mint);

            this.emit('positionClosed', { walletAddress, mint, pnlSol, reason });

            return { ok: true };
        } catch (err) {
            return { ok: false, error: err?.message || 'Failed to close position' };
        }
    }

    /**
     * Record trade in statistics
     */
    async recordTrade(walletAddress, pnlSol) {
        const stats = this.statistics.get(walletAddress) || {
            wallet_address: walletAddress,
            total_trades: 0,
            winning_trades: 0,
            losing_trades: 0,
            total_pnl_sol: 0,
            realized_profit_sol: 0,
            largest_win_sol: 0,
            largest_loss_sol: 0,
        };

        stats.total_trades += 1;
        stats.total_pnl_sol += pnlSol;
        stats.realized_profit_sol += pnlSol;

        if (pnlSol > 0) {
            stats.winning_trades += 1;
            if (pnlSol > stats.largest_win_sol) {
                stats.largest_win_sol = pnlSol;
            }
        } else if (pnlSol < 0) {
            stats.losing_trades += 1;
            if (pnlSol < stats.largest_loss_sol) {
                stats.largest_loss_sol = pnlSol;
            }
        }

        stats.updated_at = new Date().toISOString();

        try {
            await supabase
                .from('user_statistics')
                .upsert(stats);

            this.statistics.set(walletAddress, stats);

            this.emit('statsUpdated', { walletAddress, stats });
        } catch (err) {
            console.error('[UserWalletService] Failed to update stats:', err?.message || err);
        }
    }

    /**
     * Get user statistics
     */
    async getStats(walletAddress) {
        if (this.statistics.has(walletAddress)) {
            return { ok: true, stats: this.statistics.get(walletAddress) };
        }

        try {
            const { data, error } = await supabase
                .from('user_statistics')
                .select('*')
                .eq('wallet_address', walletAddress)
                .single();

            if (error || !data) {
                return { ok: true, stats: null };
            }

            this.statistics.set(walletAddress, data);
            return { ok: true, stats: data };
        } catch (err) {
            return { ok: false, error: err?.message || 'Failed to load stats' };
        }
    }

    /**
     * Logout user - deactivate but preserve data
     */
    async logoutUser(walletAddress) {
        try {
            await supabase
                .from('users')
                .update({ is_active: false })
                .eq('wallet_address', walletAddress);

            // Clear from cache
            this.users.delete(walletAddress);
            this.configs.delete(walletAddress);
            // Keep positions in memory for now (they'll be restored on next login)

            return { ok: true };
        } catch (err) {
            return { ok: false, error: err?.message || 'Logout failed' };
        }
    }

    /**
     * Get all active users with auto-trading enabled
     */
    getAutoTradingUsers() {
        const result = [];
        for (const [wallet, config] of this.configs.entries()) {
            if (config.auto_trading_enabled && this.users.has(wallet)) {
                result.push({
                    wallet,
                    config,
                    positions: this.getPositions(wallet),
                });
            }
        }
        return result;
    }

    /**
     * Get all user data for WebSocket broadcast
     */
    getUserState(walletAddress) {
        return {
            wallet: walletAddress,
            config: this.configs.get(walletAddress) || null,
            positions: this.getPositions(walletAddress),
            stats: this.statistics.get(walletAddress) || null,
        };
    }
}

export default UserWalletService;
