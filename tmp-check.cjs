const Database=require('better-sqlite3');
const db=new Database('data/tokens.db');
const rows=db.prepare("SELECT symbol, initial_mcap, latest_mcap, ath_mcap, sources, raw_data FROM tokens WHERE symbol = 'PEACHES' COLLATE NOCASE").all();
console.log(rows);
