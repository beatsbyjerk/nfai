const Database=require('better-sqlite3');
const db=new Database('data/tokens.db');
const row=db.prepare("SELECT address, symbol, raw_data FROM tokens WHERE sources LIKE '%print_scan%' AND initial_mcap IS NULL LIMIT 1").get();
if(!row){console.log('no missing initial in print_scan'); process.exit(0);} 
const data=JSON.parse(row.raw_data);
console.log('symbol',row.symbol);
console.log('keys',Object.keys(data));
console.log('initial_mcap',data.initial_mcap,'initial_mc',data.initial_mc,'marketcap',data.marketcap,'latest_mcap',data.latest_mcap,'ath',data.ath,'created_at',data.created_at);
