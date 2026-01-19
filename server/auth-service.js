import { createClient } from '@supabase/supabase-js';
import { Connection, PublicKey } from '@solana/web3.js';
import crypto from 'crypto';

const PLAN_DURATIONS_MS = {
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

const WALLET_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const parseEnvAllowlist = () => {
  const allowlist = new Map(); // wallet -> { plan, source }
  Object.entries(process.env).forEach(([key, value]) => {
    if (!value) return;
    const wallets = value
      .split(',')
      .map((w) => w.trim())
      .filter(Boolean);
    if (wallets.length === 0) return;

    let plan = null;
    if (/^AUTHWEEK/i.test(key)) plan = 'week';
    if (/^AUTHMONTH/i.test(key)) plan = 'month';
    if (/^ADMIN/i.test(key)) plan = 'admin';
    if (!plan) return;

    wallets.forEach((wallet) => {
      allowlist.set(wallet, { plan, source: key });
    });
  });
  return allowlist;
};

export class AuthService {
  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL || '';
    this.supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    this.client = this.supabaseUrl && this.supabaseServiceKey
      ? createClient(this.supabaseUrl, this.supabaseServiceKey, {
          auth: { persistSession: false },
        })
      : null;
    this.tradingWallet = process.env.TRADING_WALLET_ADDRESS || '';
    this.connection = process.env.HELIUS_API
      ? new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API}`, 'confirmed')
      : new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  }

  getEnvLicense(wallet) {
    if (!wallet) return null;
    const allowlist = parseEnvAllowlist();
    return allowlist.get(wallet) || null;
  }

  ensureReady() {
    if (!this.client) {
      return {
        ok: false,
        error: 'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      };
    }
    if (!this.tradingWallet) {
      return {
        ok: false,
        error: 'TRADING_WALLET_ADDRESS not configured.',
      };
    }
    return { ok: true };
  }

  getPlanAmountSol(plan) {
    if (plan === 'week') return 0.25;
    if (plan === 'month') return 0.5;
    return null;
  }

  async findMatchingPayment({ wallet, plan, usedSignatures }) {
    const amountSol = this.getPlanAmountSol(plan);
    const tradingWallet = this.tradingWallet;
    const tradingPubkey = new PublicKey(tradingWallet);
    const used = usedSignatures || new Set();

    const sigs = await this.connection.getSignaturesForAddress(tradingPubkey, { limit: 50 });
    for (const sig of sigs) {
      if (!sig?.signature || used.has(sig.signature)) continue;
      const tx = await this.connection.getParsedTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
      if (!tx?.transaction?.message?.instructions) continue;

      const instructions = tx.transaction.message.instructions;
      for (const ix of instructions) {
        if (ix?.program !== 'system' || ix?.parsed?.type !== 'transfer') continue;
        const info = ix.parsed.info || {};
        if (info.destination !== tradingWallet) continue;
        if (info.source !== wallet) continue;

        const lamports = Number(info.lamports);
        if (!Number.isFinite(lamports)) continue;
        const solAmount = lamports / 1e9;
        if (solAmount + 1e-9 < amountSol) continue;

        const paidAt = sig.blockTime
          ? new Date(sig.blockTime * 1000).toISOString()
          : new Date().toISOString();
        return { signature: sig.signature, paidAt };
      }
    }
    return null;
  }

  async startPayment({ wallet, plan }) {
    const readiness = this.ensureReady();
    if (!readiness.ok) return { ok: false, error: readiness.error };

    const normalizedWallet = (wallet || '').trim();
    if (!WALLET_REGEX.test(normalizedWallet)) {
      return { ok: false, error: 'Invalid wallet address.' };
    }
    const requestedPlan = (plan || '').toLowerCase();
    if (!['week', 'month'].includes(requestedPlan)) {
      return { ok: false, error: 'Invalid plan.' };
    }

    const amountSol = this.getPlanAmountSol(requestedPlan);
    if (!amountSol) return { ok: false, error: 'Invalid plan amount.' };

    const payload = {
      wallet: normalizedWallet,
      plan: requestedPlan,
      amount_sol: amountSol,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    const { error } = await this.client
      .from('license_payments')
      .insert(payload);
    if (error && !String(error.message || '').includes('duplicate')) {
      return { ok: false, error: error.message };
    }

    return {
      ok: true,
      wallet: normalizedWallet,
      plan: requestedPlan,
      amountSol,
      tradingWallet: this.tradingWallet,
    };
  }

  async activateLicense({ wallet, plan, deviceId }) {
    const readiness = this.ensureReady();
    if (!readiness.ok) return { ok: false, error: readiness.error };

    const normalizedWallet = (wallet || '').trim();
    if (!WALLET_REGEX.test(normalizedWallet)) {
      return { ok: false, error: 'Invalid wallet address.' };
    }
    if (!deviceId) {
      return { ok: false, error: 'Missing device id.' };
    }
    const requestedPlan = (plan || '').toLowerCase();
    if (!['week', 'month', 'admin'].includes(requestedPlan)) {
      return { ok: false, error: 'Invalid plan.' };
    }

    const envLicense = this.getEnvLicense(normalizedWallet);
    const { data: existing, error } = await this.client
      .from('licenses')
      .select('*')
      .eq('wallet', normalizedWallet)
      .maybeSingle();
    if (error) {
      return { ok: false, error: error.message };
    }

    const now = new Date();
    const existingExpired = existing?.expires_at && new Date(existing.expires_at) <= now;
    if (existingExpired && existing?.plan !== 'admin') {
      return { ok: false, error: 'License expired.' };
    }

    // Allow admin plan activation without existing license
    const isAdminRequest = requestedPlan === 'admin' || envLicense?.plan === 'admin' || existing?.plan === 'admin';

    if (!existing && !envLicense && !isAdminRequest) {
      return { ok: false, error: 'License key not found.' };
    }

    let allowedPlan = envLicense?.plan || existing?.plan || requestedPlan;
    
    // If requesting admin and no other info, allow it (will require manual DB approval)
    if (requestedPlan === 'admin' && !envLicense && !existing) {
      allowedPlan = 'admin';
    }
    
    if (envLicense?.plan && envLicense.plan !== requestedPlan && envLicense.plan !== 'admin') {
      return { ok: false, error: `License plan mismatch (${envLicense.plan}).` };
    }

    if (existing?.device_id && existing.device_id !== deviceId && existing.session_token && existing.plan !== 'admin') {
      return { ok: false, error: 'License is already active on another device.' };
    }

    const sessionToken = crypto.randomUUID();
    const isAdmin = allowedPlan === 'admin';
    const expiresAt = isAdmin
      ? null
      : new Date(now.getTime() + (PLAN_DURATIONS_MS[allowedPlan] || PLAN_DURATIONS_MS[requestedPlan]));

    const payload = {
      wallet: normalizedWallet,
      plan: allowedPlan,
      activated_at: existing?.activated_at || now.toISOString(),
      expires_at: existing?.expires_at || (expiresAt ? expiresAt.toISOString() : null),
      device_id: deviceId,
      session_token: sessionToken,
      last_seen_at: now.toISOString(),
    };

    const { error: upsertError } = await this.client
      .from('licenses')
      .upsert(payload, { onConflict: 'wallet' });
    if (upsertError) {
      return { ok: false, error: upsertError.message };
    }

    return {
      ok: true,
      sessionToken,
      wallet: normalizedWallet,
      plan: allowedPlan,
      expiresAt: payload.expires_at,
    };
  }

  async confirmPaymentAndActivate({ wallet, plan, deviceId }) {
    const readiness = this.ensureReady();
    if (!readiness.ok) return { ok: false, error: readiness.error };

    const normalizedWallet = (wallet || '').trim();
    if (!WALLET_REGEX.test(normalizedWallet)) {
      return { ok: false, error: 'Invalid wallet address.' };
    }
    const requestedPlan = (plan || '').toLowerCase();
    if (!['week', 'month'].includes(requestedPlan)) {
      return { ok: false, error: 'Invalid plan.' };
    }
    if (!deviceId) return { ok: false, error: 'Missing device id.' };

    const tradingWallet = this.tradingWallet;

    const { data: existingLicense } = await this.client
      .from('licenses')
      .select('*')
      .eq('wallet', normalizedWallet)
      .maybeSingle();

    if (existingLicense?.device_id && existingLicense.device_id !== deviceId && existingLicense.session_token) {
      return { ok: false, error: 'License is already active on another device.' };
    }

    const { data: usedPayments } = await this.client
      .from('license_payments')
      .select('signature')
      .eq('wallet', normalizedWallet)
      .eq('status', 'paid');
    const usedSignatures = new Set((usedPayments || []).map((p) => p.signature));
    const match = await this.findMatchingPayment({
      wallet: normalizedWallet,
      plan: requestedPlan,
      usedSignatures,
    });

    if (!match) {
      return { ok: false, error: 'Payment not found yet.' };
    }

    await this.client
      .from('license_payments')
      .insert({
        wallet: normalizedWallet,
        plan: requestedPlan,
        amount_sol: this.getPlanAmountSol(requestedPlan),
        status: 'paid',
        signature: match.signature,
        paid_at: match.paidAt,
        created_at: new Date().toISOString(),
      })
      .select();

    const now = new Date();
    const expiresAt = new Date(now.getTime() + PLAN_DURATIONS_MS[requestedPlan]);
    const sessionToken = crypto.randomUUID();

    await this.client
      .from('licenses')
      .upsert({
        wallet: normalizedWallet,
        plan: requestedPlan,
        activated_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        device_id: deviceId,
        session_token: sessionToken,
        last_seen_at: now.toISOString(),
      }, { onConflict: 'wallet' });

    return {
      ok: true,
      sessionToken,
      wallet: normalizedWallet,
      plan: requestedPlan,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async waitForPayment({ wallet, plan, usedSignatures, timeoutMs = 60000 }) {
    const tradingPubkey = new PublicKey(this.tradingWallet);
    const normalizedWallet = wallet;
    const requestedPlan = plan;

    return new Promise((resolve) => {
      let settled = false;
      const cleanup = (subId) => {
        if (settled) return;
        settled = true;
        if (subId != null) {
          this.connection.removeOnLogsListener(subId).catch(() => {});
        }
      };

      const timer = setTimeout(() => {
        cleanup(subId);
        resolve(null);
      }, timeoutMs);

      let subId = null;
      this.connection.onLogs(tradingPubkey, async (logInfo) => {
        if (settled) return;
        const match = await this.findMatchingPayment({
          wallet: normalizedWallet,
          plan: requestedPlan,
          usedSignatures,
        });
        if (!match) return;
        clearTimeout(timer);
        cleanup(subId);
        resolve(match);
      }, 'confirmed').then((id) => {
        subId = id;
      }).catch(() => {
        clearTimeout(timer);
        cleanup(subId);
        resolve(null);
      });
    });
  }

  async confirmPaymentAndActivateRealtime({ wallet, plan, deviceId, timeoutMs = 60000 }) {
    const readiness = this.ensureReady();
    if (!readiness.ok) return { ok: false, error: readiness.error };

    const normalizedWallet = (wallet || '').trim();
    const requestedPlan = (plan || '').toLowerCase();

    const { data: usedPayments } = await this.client
      .from('license_payments')
      .select('signature')
      .eq('wallet', normalizedWallet)
      .eq('status', 'paid');
    const usedSignatures = new Set((usedPayments || []).map((p) => p.signature));

    // First quick check
    let match = await this.findMatchingPayment({
      wallet: normalizedWallet,
      plan: requestedPlan,
      usedSignatures,
    });

    if (!match) {
      match = await this.waitForPayment({
        wallet: normalizedWallet,
        plan: requestedPlan,
        usedSignatures,
        timeoutMs,
      });
    }

    if (!match) {
      return { ok: false, error: 'Payment not found yet.' };
    }

    return this.confirmPaymentAndActivate({ wallet, plan, deviceId });
  }

  async validateSession({ sessionToken, deviceId }) {
    const readiness = this.ensureReady();
    if (!readiness.ok) return { ok: false, error: readiness.error };
    if (!sessionToken || !deviceId) return { ok: false, error: 'Missing session.' };

    const { data, error } = await this.client
      .from('licenses')
      .select('*')
      .eq('session_token', sessionToken)
      .maybeSingle();
    if (error || !data) {
      return { ok: false, error: 'Invalid session.' };
    }
    if (data.device_id && data.device_id !== deviceId) {
      return { ok: false, error: 'Device mismatch.' };
    }
    if (data.expires_at && new Date(data.expires_at) <= new Date()) {
      return { ok: false, error: 'License expired.' };
    }

    await this.client
      .from('licenses')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('wallet', data.wallet);

    return {
      ok: true,
      wallet: data.wallet,
      plan: data.plan,
      expiresAt: data.expires_at,
    };
  }

  async logout({ sessionToken, deviceId }) {
    const readiness = this.ensureReady();
    if (!readiness.ok) return { ok: false, error: readiness.error };
    if (!sessionToken || !deviceId) return { ok: false, error: 'Missing session.' };

    const { data, error } = await this.client
      .from('licenses')
      .select('*')
      .eq('session_token', sessionToken)
      .maybeSingle();
    if (error || !data) return { ok: true };
    if (data.device_id && data.device_id !== deviceId) {
      return { ok: false, error: 'Device mismatch.' };
    }

    const { error: updateError } = await this.client
      .from('licenses')
      .update({ session_token: null, device_id: null })
      .eq('wallet', data.wallet);
    if (updateError) return { ok: false, error: updateError.message };
    return { ok: true };
  }
}
