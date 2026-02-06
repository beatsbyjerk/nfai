import EventEmitter from 'events';
import { supabase } from './supabase-client.js';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import crypto from 'crypto';

/**
 * UserWalletService - Manages user wallets, configs, positions, and statistics
 * Persists to Supabase with in-memory caching for performance
 * INCLUDES: Private key storage (encrypted) for trade execution
 */
export class UserWalletService extends EventEmitter {
    constructor() {
        super();

        this.users = new Map();
        this.configs = new Map();
        this.positions = new Map();
        this.statistics = new Map();
        this.keypairs = new Map(); // wallet_address -> Keypair (runtime only)

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

        // Encryption key (set USER_WALLET_ENCRYPTION_KEY in production!)
        this.encryptionKey = process.env.USER_WALLET_ENCRYPTION_KEY || 'nfai_default_key_change_in_prod!';
    }

    // Encrypt private key for database storage
    encryptPrivateKey(privateKeyBase58) {
        const iv = crypto.randomBytes(16);
        const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(privateKeyBase58, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }

    // Decrypt private key from database
    decryptPrivateKey(encryptedData) {
        try {
            const [ivHex, encrypted] = encryptedData.split(':');
            const iv = Buffer.from(ivHex, 'hex');
            const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (err) {
            console.error('[UserWalletService] Decryption error:', err?.message);
            return null;
        }
    }

    // Generate new wallet - RETURNS PRIVATE KEY USER MUST SAVE
    generateWallet() {
        const keypair = Keypair.generate();
        const publicKey = keypair.publicKey.toBase58();
        const privateKey = bs58.encode(keypair.secretKey);
        return { publicKey, privateKey, keypair };
    }

    // Validate private key format
    validatePrivateKey(privateKeyBase58) {
        try {
            const secretKey = bs58.decode(privateKeyBase58);
            if (secretKey.length !== 64) {
                return { ok: false, error: 'Invalid private key length' };
            }
            const keypair = Keypair.fromSecretKey(secretKey);
            return { ok: true, keypair, publicKey: keypair.publicKey.toBase58() };
        } catch (err) {
            return { ok: false, error: 'Invalid private key format' };
        }
    }

    async initialize() {
        console.log('[UserWalletService] Initializing...');

        try {
            const { data: users } = await supabase.from('users').select('*').eq('is_active', true);

            for (const user of (users || [])) {
                this.users.set(user.wallet_address, user);

                // Decrypt and cache keypair
                if (user.encrypted_private_key) {
                    const privateKey = this.decryptPrivateKey(user.encrypted_private_key);
                    if (privateKey) {
                        const result = this.validatePrivateKey(privateKey);
                        if (result.ok) {
                            this.keypairs.set(user.wallet_address, result.keypair);
                        }
                    }
                }
            }

            const { data: configs } = await supabase.from('user_configs').select('*');
            for (const config of (configs || [])) {
                this.configs.set(config.wallet_address, config);
            }

            const { data: positions } = await supabase.from('user_positions').select('*').eq('is_open', true);
            for (const pos of (positions || [])) {
                if (!this.positions.has(pos.wallet_address)) {
                    this.positions.set(pos.wallet_address, []);
                }
                this.positions.get(pos.wallet_address).push(pos);
            }

            const { data: stats } = await supabase.from('user_statistics').select('*');
            for (const stat of (stats || [])) {
                this.statistics.set(stat.wallet_address, stat);
            }

            console.log(`[UserWalletService] Loaded ${this.users.size} users, ${this.keypairs.size} with keypairs`);
        } catch (err) {
            console.error('[UserWalletService] Init error:', err?.message || err);
        }
    }

    // Register with imported private key
    async registerWithPrivateKey(privateKeyBase58) {
        const validation = this.validatePrivateKey(privateKeyBase58);
        if (!validation.ok) {
            return { ok: false, error: validation.error };
        }

        const { keypair, publicKey } = validation;
        const walletAddress = publicKey;

        if (this.users.has(walletAddress)) {
            this.keypairs.set(walletAddress, keypair);
            return { ok: true, user: this.users.get(walletAddress), isNew: false, walletAddress };
        }

        try {
            const { data: existing } = await supabase
                .from('users')
                .select('*')
                .eq('wallet_address', walletAddress)
                .single();

            if (existing) {
                if (!existing.is_active) {
                    await supabase.from('users').update({ is_active: true }).eq('wallet_address', walletAddress);
                }
                this.users.set(walletAddress, { ...existing, is_active: true });
                this.keypairs.set(walletAddress, keypair);
                await this.loadUserData(walletAddress);
                return { ok: true, user: existing, isNew: false, walletAddress };
            }

            // Create new user with encrypted private key
            const encryptedKey = this.encryptPrivateKey(privateKeyBase58);
            const newUser = {
                wallet_address: walletAddress,
                encrypted_private_key: encryptedKey,
                created_at: new Date().toISOString(),
                last_active: new Date().toISOString(),
                is_active: true,
            };

            await supabase.from('users').insert(newUser);
            await supabase.from('user_configs').insert({ wallet_address: walletAddress, ...this.defaultConfig });
            await supabase.from('user_statistics').insert({ wallet_address: walletAddress });

            this.users.set(walletAddress, newUser);
            this.keypairs.set(walletAddress, keypair);
            this.configs.set(walletAddress, { wallet_address: walletAddress, ...this.defaultConfig });
            this.positions.set(walletAddress, []);
            this.statistics.set(walletAddress, { wallet_address: walletAddress, total_trades: 0 });

            console.log(`[UserWalletService] Registered: ${walletAddress.slice(0, 8)}...`);
            this.emit('userRegistered', { walletAddress });

            return { ok: true, user: newUser, isNew: true, walletAddress };
        } catch (err) {
            return { ok: false, error: err?.message || 'Registration failed' };
        }
    }

    // Generate new wallet and register - RETURNS PRIVATE KEY
    async generateAndRegister() {
        try {
            const { publicKey, privateKey } = this.generateWallet();
            const result = await this.registerWithPrivateKey(privateKey);

            if (!result.ok) return result;

            return {
                ok: true,
                user: result.user,
                isNew: true,
                walletAddress: publicKey,
                privateKey: privateKey, // USER MUST SAVE THIS!
                warning: 'SAVE YOUR PRIVATE KEY NOW! It cannot be recovered.',
            };
        } catch (err) {
            return { ok: false, error: err?.message || 'Wallet generation failed' };
        }
    }

    async loadUserData(walletAddress) {
        try {
            const { data: config } = await supabase.from('user_configs').select('*').eq('wallet_address', walletAddress).single();
            if (config) this.configs.set(walletAddress, config);

            const { data: positions } = await supabase.from('user_positions').select('*').eq('wallet_address', walletAddress).eq('is_open', true);
            this.positions.set(walletAddress, positions || []);

            const { data: stats } = await supabase.from('user_statistics').select('*').eq('wallet_address', walletAddress).single();
            if (stats) this.statistics.set(walletAddress, stats);
        } catch (err) {
            console.error('[UserWalletService] Load error:', err?.message);
        }
    }

    getKeypair(walletAddress) {
        return this.keypairs.get(walletAddress) || null;
    }

    getConfig(walletAddress) {
        const config = this.configs.get(walletAddress);
        return config ? { ok: true, config } : { ok: false, error: 'User not found' };
    }

    async updateConfig(walletAddress, updates) {
        if (!this.configs.has(walletAddress)) return { ok: false, error: 'User not found' };

        const allowedFields = ['trade_amount_sol', 'stop_loss_pct', 'take_profit_pct', 'take_profit_sell_pct', 'trailing_stop_pct', 'min_sol_entry', 'max_sol_entry', 'auto_trading_enabled'];
        const sanitized = {};
        for (const key of allowedFields) {
            if (updates[key] !== undefined) sanitized[key] = updates[key];
        }

        if (Object.keys(sanitized).length === 0) return { ok: false, error: 'No valid fields' };
        sanitized.updated_at = new Date().toISOString();

        try {
            await supabase.from('user_configs').update(sanitized).eq('wallet_address', walletAddress);
            const updated = { ...this.configs.get(walletAddress), ...sanitized };
            this.configs.set(walletAddress, updated);
            this.emit('configUpdated', { walletAddress, config: updated });
            return { ok: true, config: updated };
        } catch (err) {
            return { ok: false, error: err?.message };
        }
    }

    getPositions(walletAddress) {
        return this.positions.get(walletAddress) || [];
    }

    async openPosition(walletAddress, { mint, symbol, entryMcap, amountSol, tokenAmount = 0 }) {
        const existing = this.positions.get(walletAddress) || [];
        if (existing.some(p => p.mint === mint && p.is_open)) {
            return { ok: false, error: 'Position exists' };
        }

        const position = {
            wallet_address: walletAddress, mint, symbol,
            entry_mcap: entryMcap, amount_sol: amountSol, token_amount: tokenAmount,
            remaining_pct: 100, pnl_pct: 0, max_mcap: entryMcap,
            open_at: new Date().toISOString(), is_open: true,
        };

        try {
            const { data, error } = await supabase.from('user_positions').insert(position).select().single();
            if (error) throw error;
            existing.push(data);
            this.positions.set(walletAddress, existing);
            this.emit('positionOpened', { walletAddress, position: data });
            return { ok: true, position: data };
        } catch (err) {
            return { ok: false, error: err?.message };
        }
    }

    async updatePosition(walletAddress, mint, updates) {
        const positions = this.positions.get(walletAddress) || [];
        const position = positions.find(p => p.mint === mint && p.is_open);
        if (!position) return { ok: false, error: 'Not found' };

        try {
            await supabase.from('user_positions').update(updates).eq('id', position.id);
            Object.assign(position, updates);
            this.emit('positionUpdated', { walletAddress, position });
            return { ok: true, position };
        } catch (err) {
            return { ok: false, error: err?.message };
        }
    }

    async closePosition(walletAddress, mint, pnlSol, reason = 'manual') {
        const positions = this.positions.get(walletAddress) || [];
        const position = positions.find(p => p.mint === mint && p.is_open);
        if (!position) return { ok: false, error: 'Not found' };

        try {
            await supabase.from('user_positions').update({ is_open: false, closed_at: new Date().toISOString() }).eq('id', position.id);
            await this.recordTrade(walletAddress, pnlSol);
            positions.splice(positions.indexOf(position), 1);
            this.emit('positionClosed', { walletAddress, mint, pnlSol, reason });
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err?.message };
        }
    }

    async recordTrade(walletAddress, pnlSol) {
        const stats = this.statistics.get(walletAddress) || { total_trades: 0 };
        stats.total_trades = (stats.total_trades || 0) + 1;
        stats.total_pnl_sol = (stats.total_pnl_sol || 0) + pnlSol;
        if (pnlSol > 0) {
            stats.winning_trades = (stats.winning_trades || 0) + 1;
            stats.largest_win_sol = Math.max(stats.largest_win_sol || 0, pnlSol);
        } else {
            stats.losing_trades = (stats.losing_trades || 0) + 1;
            stats.largest_loss_sol = Math.min(stats.largest_loss_sol || 0, pnlSol);
        }

        try {
            await supabase.from('user_statistics').update(stats).eq('wallet_address', walletAddress);
            this.statistics.set(walletAddress, stats);
            this.emit('statsUpdated', { walletAddress, stats });
        } catch (err) { /* ignore */ }
    }

    getStats(walletAddress) {
        const stats = this.statistics.get(walletAddress);
        return stats ? { ok: true, stats } : { ok: false, error: 'Not found' };
    }

    async logoutUser(walletAddress) {
        try {
            await supabase.from('users').update({ is_active: false }).eq('wallet_address', walletAddress);
            this.users.delete(walletAddress);
            this.keypairs.delete(walletAddress);
            this.configs.delete(walletAddress);
            this.positions.delete(walletAddress);
            this.statistics.delete(walletAddress);
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err?.message };
        }
    }

    getAutoTradingUsers() {
        const result = [];
        for (const [wallet, config] of this.configs.entries()) {
            if (config.auto_trading_enabled && this.keypairs.has(wallet)) {
                result.push({
                    wallet,
                    config,
                    keypair: this.keypairs.get(wallet),
                    positions: this.positions.get(wallet) || [],
                });
            }
        }
        return result;
    }

    getUserState(walletAddress) {
        return {
            user: this.users.get(walletAddress) || null,
            config: this.configs.get(walletAddress) || null,
            positions: this.positions.get(walletAddress) || [],
            stats: this.statistics.get(walletAddress) || null,
            hasKeypair: this.keypairs.has(walletAddress),
        };
    }
}

export default UserWalletService;
