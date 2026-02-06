import EventEmitter from 'events';
import { UserWalletService } from './user-wallet-service.js';

/**
 * UserTradingEngine - Extends trading logic for user wallets
 * Implements 1-second delay after AI wallet trades (internal only)
 * Routes 2% fee to TRADING_WALLET_ADDRESS per transaction
 */
export class UserTradingEngine extends EventEmitter {
    constructor({ tradingEngine }) {
        super();

        this.tradingEngine = tradingEngine;
        this.userWalletService = new UserWalletService();

        // Configuration from environment (default 1 second delay)
        this.tradeDelayMs = parseInt(process.env.USER_TRADE_DELAY_MS || '1000', 10);
        this.tradeFeePercent = parseFloat(process.env.USER_TRADE_FEE_PCT || '2');
        this.tradingWallet = process.env.TRADING_WALLET_ADDRESS;

        // Pending trades queue (processed after AI wallet)
        this.pendingTrades = new Map(); // mint -> { token, users: [...] }

        // Pending dump-buy queue: users waiting for first dump before buying
        // mint -> { token, initialMcap, users: [{ wallet, config, positions }] }
        this.pendingDumpBuys = new Map();

        // Bind event handlers
        this.handleAITrade = this.handleAITrade.bind(this);
        this.handleAIPositionUpdate = this.handleAIPositionUpdate.bind(this);
    }

    /**
     * Initialize the user trading engine
     */
    async initialize() {
        console.log('[UserTradingEngine] Initializing...');

        // Initialize user wallet service
        await this.userWalletService.initialize();

        // Listen to AI trading engine events
        this.tradingEngine.on('trade', this.handleAITrade);
        this.tradingEngine.on('positions', this.handleAIPositionUpdate);

        // Forward user service events
        this.userWalletService.on('positionOpened', (data) => this.emit('userPositionOpened', data));
        this.userWalletService.on('positionUpdated', (data) => this.emit('userPositionUpdated', data));
        this.userWalletService.on('positionClosed', (data) => this.emit('userPositionClosed', data));
        this.userWalletService.on('statsUpdated', (data) => this.emit('userStatsUpdated', data));
        this.userWalletService.on('configUpdated', (data) => this.emit('userConfigUpdated', data));

        console.log(`[UserTradingEngine] Initialized with ${this.tradeDelayMs}ms delay, ${this.tradeFeePercent}% fee`);
    }

    /**
     * Handle AI wallet trade - trigger user trades after delay
     * THIS IS THE SECRET 1-SECOND DELAY - AI ALWAYS TRADES FIRST
     */
    handleAITrade({ mint, token, action, payload }) {
        if (action !== 'buy') return;

        // Get users with auto-trading enabled
        const autoTradingUsers = this.userWalletService.getAutoTradingUsers();
        if (autoTradingUsers.length === 0) return;

        const initialMcap = parseFloat(token.latest_mcap || token.initial_mcap || 0);

        // Separate users: immediate buyers vs dump-waiters
        const immediateBuyers = [];
        const dumpWaiters = [];

        for (const user of autoTradingUsers) {
            if (user.config.buy_on_first_dump_enabled) {
                dumpWaiters.push(user);
            } else {
                immediateBuyers.push(user);
            }
        }

        // Queue immediate buyers with delay
        if (immediateBuyers.length > 0) {
            console.log(`[UserTradingEngine] AI traded ${token?.symbol || mint?.slice(0, 8)}. Queuing ${immediateBuyers.length} immediate buys with ${this.tradeDelayMs}ms delay.`);
            setTimeout(() => {
                this.executeUserBuys(mint, token, immediateBuyers);
            }, this.tradeDelayMs);
        }

        // Queue dump-waiters for later execution when first dump triggers
        if (dumpWaiters.length > 0) {
            console.log(`[UserTradingEngine] Queuing ${dumpWaiters.length} users to buy on first dump for ${token?.symbol || mint?.slice(0, 8)} at initial mcap $${initialMcap.toFixed(0)}`);
            this.pendingDumpBuys.set(mint, {
                token,
                initialMcap,
                users: dumpWaiters,
                queuedAt: Date.now(),
            });
        }
    }

    /**
     * Execute buy orders for all eligible users
     */
    async executeUserBuys(mint, token, users) {
        for (const { wallet, config, positions } of users) {
            try {
                // Skip if user already has position in this token
                const existingPositions = positions.filter(p => p.mint === mint && p.is_open);
                if (existingPositions.length > 0) {
                    console.log(`[UserTradingEngine] User ${wallet.slice(0, 6)}... already has position in ${token?.symbol || mint.slice(0, 8)}`);
                    continue;
                }

                // Check SOL limits
                const tradeAmount = config.trade_amount_sol;
                if (tradeAmount < config.min_sol_entry || tradeAmount > config.max_sol_entry) {
                    console.log(`[UserTradingEngine] Trade amount ${tradeAmount} outside user limits for ${wallet.slice(0, 6)}...`);
                    continue;
                }

                // Execute the trade (paper mode simulation for now)
                const entryMcap = parseFloat(token.latest_mcap || token.initial_mcap || 0);

                if (entryMcap <= 0) {
                    console.log(`[UserTradingEngine] Invalid mcap for ${token?.symbol}, skipping user ${wallet.slice(0, 6)}...`);
                    continue;
                }

                // Open position for user
                const result = await this.userWalletService.openPosition(wallet, {
                    mint,
                    symbol: token.symbol,
                    entryMcap,
                    amountSol: tradeAmount,
                    tokenAmount: 0, // Paper mode
                });

                if (result.ok) {
                    console.log(`[UserTradingEngine] Opened position for ${wallet.slice(0, 6)}... in ${token?.symbol || mint.slice(0, 8)} at $${entryMcap.toFixed(0)}`);

                    // Emit event for WebSocket broadcast
                    this.emit('userTrade', {
                        wallet,
                        mint,
                        symbol: token.symbol,
                        action: 'buy',
                        amountSol: tradeAmount,
                        entryMcap,
                        position: result.position,
                    });
                }
            } catch (err) {
                console.error(`[UserTradingEngine] Error executing buy for ${wallet.slice(0, 6)}...:`, err?.message || err);
            }
        }
    }

    /**
     * Handle AI position updates - sync to user positions
     */
    handleAIPositionUpdate(aiPositions) {
        // Check pending dump-buy users for first dump trigger
        this.checkPendingDumpBuys(aiPositions);

        // Update user positions with current market data
        const autoTradingUsers = this.userWalletService.getAutoTradingUsers();

        for (const { wallet, config } of autoTradingUsers) {
            const userPositions = this.userWalletService.getPositions(wallet);

            for (const userPos of userPositions) {
                // Find matching AI position for market data
                const aiPos = aiPositions.find(p => p.mint === userPos.mint);
                if (!aiPos) continue;

                // Calculate user's PnL based on their entry
                const currentMcap = aiPos.currentMcap || aiPos.maxMcap;
                if (!currentMcap) continue;

                const pnlPct = ((currentMcap - userPos.entry_mcap) / userPos.entry_mcap) * 100;
                const maxMcapFromEntry = Math.max(userPos.max_mcap || 0, currentMcap);
                const dropFromMax = maxMcapFromEntry > 0
                    ? ((maxMcapFromEntry - currentMcap) / maxMcapFromEntry) * 100
                    : 0;

                // Check stop-loss
                if (pnlPct <= config.stop_loss_pct && userPos.remaining_pct > 0) {
                    this.executeUserSell(wallet, userPos, 100, 'stop_loss');
                    continue;
                }

                // Check take-profit
                if (pnlPct >= config.take_profit_pct && userPos.remaining_pct === 100) {
                    this.executeUserSell(wallet, userPos, config.take_profit_sell_pct, 'take_profit');
                    continue;
                }

                // Check trailing stop (only if above entry)
                if (pnlPct > 0 && dropFromMax >= config.trailing_stop_pct && userPos.remaining_pct > 0) {
                    this.executeUserSell(wallet, userPos, userPos.remaining_pct, 'trailing_stop');
                    continue;
                }

                // Update position with current market data
                this.userWalletService.updatePosition(wallet, userPos.mint, {
                    current_mcap: currentMcap,
                    pnl_pct: pnlPct,
                });
            }
        }
    }

    /**
     * Check pending dump-buy users and trigger buys when first dump threshold met
     */
    checkPendingDumpBuys(aiPositions) {
        if (this.pendingDumpBuys.size === 0) return;

        for (const [mint, pending] of this.pendingDumpBuys.entries()) {
            // Find current mcap from AI positions
            const aiPos = aiPositions.find(p => p.mint === mint);
            if (!aiPos) continue;

            const currentMcap = aiPos.currentMcap || aiPos.maxMcap || 0;
            if (currentMcap <= 0) continue;

            const initialMcap = pending.initialMcap;
            const pctChange = ((currentMcap - initialMcap) / initialMcap) * 100;

            // Check each user's first_dump_pct threshold
            const usersToTrigger = [];
            const remainingUsers = [];

            for (const user of pending.users) {
                const threshold = user.config.first_dump_pct || -20;
                // first_dump_pct is negative (e.g., -20), pctChange must be <= threshold
                if (pctChange <= threshold) {
                    usersToTrigger.push(user);
                } else {
                    remainingUsers.push(user);
                }
            }

            // Execute buys for triggered users
            if (usersToTrigger.length > 0) {
                console.log(`[UserTradingEngine] First dump triggered for ${pending.token?.symbol || mint.slice(0, 8)}! ${pctChange.toFixed(1)}% from initial. Executing ${usersToTrigger.length} buy(s).`);
                this.executeUserBuys(mint, pending.token, usersToTrigger);
            }

            // Update or remove from pending map
            if (remainingUsers.length > 0) {
                pending.users = remainingUsers;
            } else {
                this.pendingDumpBuys.delete(mint);
            }

            // Expire old pending buys (30 minutes)
            if (Date.now() - pending.queuedAt > 30 * 60 * 1000) {
                console.log(`[UserTradingEngine] Expiring old pending dump-buy for ${pending.token?.symbol || mint.slice(0, 8)}`);
                this.pendingDumpBuys.delete(mint);
            }
        }
    }

    /**
     * Execute sell for user position
     */
    async executeUserSell(wallet, position, sellPct, reason) {
        try {
            const pnlPct = position.pnl_pct || 0;
            const pnlSol = (pnlPct / 100) * position.amount_sol * (sellPct / 100);

            console.log(`[UserTradingEngine] Selling ${sellPct}% of ${position.symbol} for ${wallet.slice(0, 6)}... (${reason}), PnL: ${pnlSol.toFixed(4)} SOL`);

            if (sellPct >= 100 || sellPct >= position.remaining_pct) {
                // Close position entirely
                await this.userWalletService.closePosition(wallet, position.mint, pnlSol, reason);
            } else {
                // Partial sell - update remaining percentage
                const newRemaining = position.remaining_pct - sellPct;
                await this.userWalletService.updatePosition(wallet, position.mint, {
                    remaining_pct: newRemaining,
                });
            }

            // Calculate and route fee to trading wallet (2% of profit)
            if (pnlSol > 0) {
                const fee = pnlSol * (this.tradeFeePercent / 100);
                console.log(`[UserTradingEngine] Fee for trading wallet: ${fee.toFixed(6)} SOL`);
                // Note: In live mode, this would transfer SOL to TRADING_WALLET_ADDRESS
            }

            this.emit('userTrade', {
                wallet,
                mint: position.mint,
                symbol: position.symbol,
                action: 'sell',
                sellPct,
                reason,
                pnlSol,
            });
        } catch (err) {
            console.error(`[UserTradingEngine] Error executing sell:`, err?.message || err);
        }
    }

    // ========== API Methods ==========

    /**
     * Register user with private key (for imports)
     */
    async registerWithPrivateKey(privateKey) {
        return this.userWalletService.registerWithPrivateKey(privateKey);
    }

    /**
     * Generate new wallet and register - RETURNS PRIVATE KEY ONCE
     */
    async generateWallet() {
        return this.userWalletService.generateAndRegister();
    }

    /**
     * Get user configuration
     */
    async getUserConfig(walletAddress) {
        return this.userWalletService.getConfig(walletAddress);
    }

    /**
     * Update user configuration
     */
    async updateUserConfig(walletAddress, updates) {
        return this.userWalletService.updateConfig(walletAddress, updates);
    }

    /**
     * Get user positions
     */
    getUserPositions(walletAddress) {
        return this.userWalletService.getPositions(walletAddress);
    }

    /**
     * Get user statistics
     */
    async getUserStats(walletAddress) {
        return this.userWalletService.getStats(walletAddress);
    }

    /**
     * Logout user
     */
    async logoutUser(walletAddress) {
        return this.userWalletService.logoutUser(walletAddress);
    }

    /**
     * Get full user state for WebSocket
     */
    getUserState(walletAddress) {
        return this.userWalletService.getUserState(walletAddress);
    }

    /**
     * Get all active user wallets
     */
    getActiveUsers() {
        return Array.from(this.userWalletService.users.keys());
    }
}

export default UserTradingEngine;
