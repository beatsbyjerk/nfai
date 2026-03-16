// One-off utility to backfill missing symbol/name for print_scan + meme_radar tokens
// Run from project root with:
//   node scripts/backfill-symbols.js
//
// It ONLY updates rows where symbol is NULL/empty and sources include
// print_scan or meme_radar, using values from raw_data.token_symbol / token_name.

const Database = require("better-sqlite3");

const DB_PATH = process.env.TOKENS_DB_PATH || "data/tokens.db";
const db = new Database(DB_PATH);

const rows = db
  .prepare(`
    SELECT address, raw_data
    FROM tokens
    WHERE (symbol IS NULL OR symbol = '')
      AND (
        sources LIKE '%print_scan%'
        OR sources LIKE '%meme_radar%'
      )
  `)
  .all();

console.log(`Found ${rows.length} tokens with missing symbol in print_scan/meme_radar sources.`);

const update = db.prepare(`
  UPDATE tokens
  SET symbol = COALESCE(@symbol, symbol),
      name   = COALESCE(@name,   name)
  WHERE address = @address
`);

db.transaction(() => {
  for (const row of rows) {
    if (!row.raw_data) continue;
    try {
      const raw = JSON.parse(row.raw_data || "{}");
      const symbol =
        raw.token_symbol ||
        raw.symbol ||
        raw.metadata?.token?.symbol ||
        null;
      const name =
        raw.token_name ||
        raw.name ||
        raw.metadata?.token?.name ||
        null;

      if (!symbol && !name) continue;

      update.run({
        address: row.address,
        symbol,
        name,
      });
    } catch (e) {
      console.warn(`Failed to parse raw_data for ${row.address.slice(0, 8)}…: ${e.message}`);
    }
  }
})();

console.log("Backfill complete.");

