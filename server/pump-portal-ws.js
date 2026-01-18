import EventEmitter from 'events';
import WebSocket from 'ws';

export class PumpPortalWebSocket extends EventEmitter {
  constructor({ url, accountKeys = [], tokenKeys = [] } = {}) {
    super();
    this.url = url || 'wss://pumpportal.fun/api/data';
    this.accountKeys = accountKeys.filter(Boolean);
    this.tokenKeys = tokenKeys.filter(Boolean);
    this.ws = null;
    this.reconnectDelayMs = 5000;
    this.shouldReconnect = true;
  }

  start() {
    if (!this.url) return;
    this.connect();
  }

  stop() {
    this.shouldReconnect = false;
    this.ws?.close();
  }

  connect() {
    this.ws = new WebSocket(this.url);
    this.ws.on('open', () => this.handleOpen());
    this.ws.on('message', (data) => this.handleMessage(data));
    this.ws.on('error', (err) => this.emit('error', err));
    this.ws.on('close', () => {
      if (this.shouldReconnect) {
        setTimeout(() => this.connect(), this.reconnectDelayMs);
      }
    });
  }

  handleOpen() {
    this.send({ method: 'subscribeNewToken' });
    this.send({ method: 'subscribeMigration' });
    if (this.accountKeys.length > 0) {
      this.send({ method: 'subscribeAccountTrade', keys: this.accountKeys });
    }
    this.subscribeTokenTrades();
  }

  send(payload) {
    try {
      this.ws?.send(JSON.stringify(payload));
    } catch (e) {
      this.emit('error', e);
    }
  }

  setTokenKeys(keys = []) {
    const unique = Array.from(new Set(keys.filter(Boolean)));
    this.tokenKeys = unique;
    this.subscribeTokenTrades();
  }

  subscribeTokenTrades() {
    if (this.tokenKeys.length > 0) {
      this.send({ method: 'subscribeTokenTrade', keys: this.tokenKeys });
    }
  }

  handleMessage(data) {
    let message = null;
    try {
      const raw = typeof data === 'string' ? data : data.toString();
      message = JSON.parse(raw);
    } catch (e) {
      this.emit('error', e);
      return;
    }

    const mint = this.extractMint(message);
    const migrationState = this.extractMigrationState(message);

    if (migrationState !== null && mint) {
      this.emit('migration', { mint, state: migrationState, payload: message });
    }

    if (message?.method?.toLowerCase?.().includes('trade') || message?.type?.toLowerCase?.().includes('trade')) {
      this.emit('trade', { mint, payload: message });
    }
  }

  extractMint(message) {
    return (
      message?.mint ||
      message?.token ||
      message?.tokenMint ||
      message?.token_address ||
      message?.ca ||
      message?.data?.mint ||
      message?.data?.token ||
      message?.data?.tokenMint ||
      message?.data?.token_address ||
      message?.data?.ca ||
      null
    );
  }

  extractMigrationState(message) {
    const status =
      message?.status ||
      message?.migration_status ||
      message?.migrationStatus ||
      message?.data?.status ||
      message?.data?.migration_status ||
      message?.data?.migrationStatus ||
      null;
    const migrated =
      message?.migrated ??
      message?.is_migrated ??
      message?.migration_complete ??
      message?.data?.migrated ??
      message?.data?.is_migrated ??
      message?.data?.migration_complete ??
      null;
    const inProgress =
      message?.is_migrating ??
      message?.migrating ??
      message?.migration_in_progress ??
      message?.data?.is_migrating ??
      message?.data?.migrating ??
      message?.data?.migration_in_progress ??
      null;
    const progress =
      message?.migration_progress ??
      message?.data?.migration_progress ??
      null;

    if (typeof migrated === 'boolean') return !migrated;
    if (typeof inProgress === 'boolean') return inProgress;
    if (typeof status === 'string') {
      const lowered = status.toLowerCase();
      if (lowered.includes('complete') || lowered.includes('migrated')) return false;
      if (lowered.includes('progress') || lowered.includes('migrat')) return true;
    }
    if (typeof progress === 'number') return progress < 1;
    return null;
  }
}
