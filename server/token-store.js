import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

export class TokenStore {
  constructor() {
    this.db = new Database(join(dataDir, 'tokens.db'));
    this.initDB();
  }

  initDB() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tokens (
        address TEXT PRIMARY KEY,
        symbol TEXT,
        name TEXT,
        image TEXT,
        description TEXT,
        
        -- Metrics
        initial_mcap REAL,
        latest_mcap REAL,
        ath_mcap REAL,
        highest_multiplier REAL,
        latest_multiplier REAL,
        volume_24h REAL,
        transactions_24h INTEGER,
        price_change_1m REAL,
        price_change_5m REAL,
        price_change_1h REAL,
        
        -- Social
        twitter TEXT,
        telegram TEXT,
        website TEXT,
        
        -- Tracking
        first_seen TEXT,
        first_seen_print_scan TEXT,
        first_seen_local TEXT,
        last_updated TEXT,
        source TEXT,
        sources TEXT,
        
        -- Platform info
        platform TEXT,
        is_vamped INTEGER DEFAULT 0,
        
        -- Raw data
        raw_data TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_first_seen ON tokens(first_seen);
      CREATE INDEX IF NOT EXISTS idx_latest_mcap ON tokens(latest_mcap);
      CREATE INDEX IF NOT EXISTS idx_highest_multiplier ON tokens(highest_multiplier);
      CREATE INDEX IF NOT EXISTS idx_source ON tokens(source);
    `);

    try {
      this.db.exec(`ALTER TABLE tokens ADD COLUMN sources TEXT`);
    } catch (e) {
      // Column already exists
    }

    try {
      this.db.exec(`ALTER TABLE tokens ADD COLUMN first_seen_print_scan TEXT`);
    } catch (e) {
      // Column already exists
    }

    this.db.exec(`UPDATE tokens SET sources = source WHERE sources IS NULL OR sources = ''`);
  }

  backfillMissingMetrics(limit = 500) {
    const rows = this.db.prepare(`
      SELECT address, raw_data, initial_mcap, latest_mcap, ath_mcap
      FROM tokens
      WHERE raw_data IS NOT NULL
        AND (initial_mcap IS NULL OR latest_mcap IS NULL OR ath_mcap IS NULL)
      LIMIT ?
    `).all(limit);

    if (rows.length === 0) return 0;

    const updateStmt = this.db.prepare(`
      UPDATE tokens
      SET initial_mcap = COALESCE(initial_mcap, ?),
          latest_mcap = COALESCE(latest_mcap, ?),
          ath_mcap = COALESCE(ath_mcap, ?)
      WHERE address = ?
    `);

    let updated = 0;
    for (const row of rows) {
      try {
        const data = JSON.parse(row.raw_data);
        const initial = parseFloat(
          data.initial_mcap ?? data.initial_market_cap ?? data.initial_mc
        );
        const latest = parseFloat(
          data.latest_mcap ?? data.marketcap ?? data.current_mc
        );
        const ath = parseFloat(
          data.ath ?? data.ath_mcap ?? data.ath_mc ?? data.ath_market_cap
        );
        updateStmt.run(
          Number.isFinite(initial) ? initial : null,
          Number.isFinite(latest) ? latest : null,
          Number.isFinite(ath) ? ath : null,
          row.address
        );
        updated += 1;
      } catch {
        // Ignore parse errors
      }
    }
    return updated;
  }

  upsertToken(tokenData, source = 'print_scan') {
    const address = tokenData.token_address || tokenData.mint || tokenData.mintAddress;
    if (!address) return false;

    const existing = this.db.prepare('SELECT address, first_seen_local, source, sources FROM tokens WHERE address = ?').get(address);
    const isNew = !existing;
    
    const now = new Date().toISOString();
    const firstSeenLocal =
      existing?.first_seen_local ||
      tokenData.first_seen ||
      tokenData.created_at ||
      now;
    const lastUpdated = tokenData.updated_at || now;
    const sourceFirstSeen = tokenData.first_seen || tokenData.created_at || tokenData.first_called || null;
    
    // Normalize token data from different sources
    const existingSources = (existing?.sources || existing?.source || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const mergedSources = Array.from(new Set([...existingSources, source]));

    const normalized = {
      address,
      symbol: tokenData.token_symbol || tokenData.symbol || null,
      name: tokenData.token_name || tokenData.name || null,
      image: tokenData.image || tokenData.image_uri ||
             tokenData.metadata?.image || tokenData.metadata?.image_uri ||
             tokenData.metadata?.token?.image ||
             tokenData.metadata?.token?.image_uri ||
             tokenData.metadata?.token?.image_url ||
             tokenData.metadata?.token?.logo ||
             tokenData.solanatracker?.token?.image ||
             tokenData.tokenInfo?.image || null,
      description: tokenData.description || 
                   tokenData.solanatracker?.token?.description || null,
      
      initial_mcap: parseFloat(tokenData.initial_mcap || tokenData.initial_market_cap || tokenData.initial_mc) || null,
      latest_mcap: parseFloat(tokenData.latest_mcap || tokenData.marketcap || tokenData.current_mc) || null,
      ath_mcap: parseFloat(tokenData.ath || tokenData.ath_market_cap || tokenData.ath_mc) || null,
      highest_multiplier: parseFloat(tokenData.highest_multiplier) || null,
      latest_multiplier: parseFloat(tokenData.latest_multiplier) || null,
      volume_24h: parseFloat(tokenData.volume_24h) || null,
      transactions_24h: parseInt(tokenData.transactions_24h) || null,
      price_change_1m: parseFloat(tokenData.price_change_percent1m) || null,
      price_change_5m: parseFloat(tokenData.price_change_percent5m) || null,
      price_change_1h: parseFloat(tokenData.price_change_percent1h) || null,
      
      twitter: tokenData.twitter || tokenData.solanatracker?.token?.twitter || null,
      telegram: tokenData.telegram || tokenData.solanatracker?.token?.telegram || null,
      website: tokenData.website || tokenData.solanatracker?.token?.website || null,
      
      first_seen: tokenData.first_seen || tokenData.created_at || tokenData.first_called || null,
      first_seen_print_scan: source === 'print_scan' ? sourceFirstSeen : null,
      first_seen_local: firstSeenLocal,
      last_updated: lastUpdated,
      source,
      sources: mergedSources.join(','),
      
      platform: tokenData.platform || 'Unknown',
      is_vamped: tokenData.isVamped ? 1 : 0,
      
      raw_data: JSON.stringify(tokenData)
    };

    const stmt = this.db.prepare(`
      INSERT INTO tokens (
        address, symbol, name, image, description,
        initial_mcap, latest_mcap, ath_mcap, highest_multiplier, latest_multiplier,
        volume_24h, transactions_24h, price_change_1m, price_change_5m, price_change_1h,
        twitter, telegram, website,
        first_seen, first_seen_print_scan, first_seen_local, last_updated, source, sources,
        platform, is_vamped, raw_data
      ) VALUES (
        @address, @symbol, @name, @image, @description,
        @initial_mcap, @latest_mcap, @ath_mcap, @highest_multiplier, @latest_multiplier,
        @volume_24h, @transactions_24h, @price_change_1m, @price_change_5m, @price_change_1h,
        @twitter, @telegram, @website,
        @first_seen, @first_seen_print_scan, @first_seen_local, @last_updated, @source, @sources,
        @platform, @is_vamped, @raw_data
      )
      ON CONFLICT(address) DO UPDATE SET
        symbol = COALESCE(@symbol, symbol),
        name = COALESCE(@name, name),
        image = COALESCE(@image, image),
        description = COALESCE(@description, description),
        initial_mcap = COALESCE(initial_mcap, @initial_mcap),
        latest_mcap = COALESCE(@latest_mcap, latest_mcap),
        ath_mcap = CASE WHEN @ath_mcap > COALESCE(ath_mcap, 0) THEN @ath_mcap ELSE ath_mcap END,
        highest_multiplier = CASE WHEN @highest_multiplier > COALESCE(highest_multiplier, 0) THEN @highest_multiplier ELSE highest_multiplier END,
        latest_multiplier = COALESCE(@latest_multiplier, latest_multiplier),
        volume_24h = COALESCE(@volume_24h, volume_24h),
        transactions_24h = COALESCE(@transactions_24h, transactions_24h),
        price_change_1m = COALESCE(@price_change_1m, price_change_1m),
        price_change_5m = COALESCE(@price_change_5m, price_change_5m),
        price_change_1h = COALESCE(@price_change_1h, price_change_1h),
        twitter = COALESCE(@twitter, twitter),
        telegram = COALESCE(@telegram, telegram),
        website = COALESCE(@website, website),
        source = @source,
        sources = COALESCE(@sources, sources),
        first_seen_print_scan = COALESCE(first_seen_print_scan, @first_seen_print_scan),
        last_updated = @last_updated,
        raw_data = @raw_data
    `);

    stmt.run(normalized);
    
    if (isNew) {
      console.log(`New token: ${normalized.symbol || address.slice(0, 8)} (${source})`);
    }
    
    return isNew;
  }

  getToken(address) {
    return this.db.prepare('SELECT * FROM tokens WHERE address = ?').get(address);
  }

  getAllTokens() {
    return this.db
      .prepare('SELECT * FROM tokens ORDER BY COALESCE(first_seen, first_seen_local) DESC')
      .all();
  }

  getTokens({ sort = 'first_seen_local', order = 'desc', limit = 100 }) {
    const validSorts = ['first_seen_local', 'first_seen', 'latest_mcap', 'highest_multiplier', 'ath_mcap', 'last_updated'];
    const sortCol = validSorts.includes(sort) ? sort : 'first_seen_local';
    const orderDir = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    
    return this.db.prepare(`
      SELECT * FROM tokens 
      ORDER BY ${sortCol} ${orderDir} 
      LIMIT ?
    `).all(limit);
  }

  getStats() {
    const stats = this.db.prepare(`
      SELECT 
        COUNT(*) as totalTokens,
        COUNT(CASE WHEN date(first_seen_local) = date('now') THEN 1 END) as tokensToday,
        MAX(first_seen_local) as lastUpdate,
        AVG(latest_mcap) as avgMcap,
        MAX(highest_multiplier) as maxMultiplier
      FROM tokens
    `).get();
    
    const bySource = this.db.prepare(`
      SELECT source, COUNT(*) as count 
      FROM tokens 
      GROUP BY source
    `).all();
    
    return {
      ...stats,
      bySource: Object.fromEntries(bySource.map(s => [s.source, s.count]))
    };
  }

  syncSourceSnapshot(source, addresses) {
    if (!source || !Array.isArray(addresses)) return;
    const current = new Set(addresses.filter(Boolean));
    const rows = this.db.prepare('SELECT address, sources, source FROM tokens WHERE sources LIKE ? OR source = ?').all(`%${source}%`, source);
    const updateStmt = this.db.prepare('UPDATE tokens SET sources = ?, source = ? WHERE address = ?');
    const deleteStmt = this.db.prepare('DELETE FROM tokens WHERE address = ?');

    for (const row of rows) {
      if (current.has(row.address)) continue;
      const sources = (row.sources || row.source || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .filter(s => s !== source);
      if (sources.length === 0) {
        deleteStmt.run(row.address);
      } else {
        updateStmt.run(sources.join(','), sources[0], row.address);
      }
    }
  }
}
