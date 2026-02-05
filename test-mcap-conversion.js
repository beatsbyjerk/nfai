import WebSocket from 'ws';
import fetch from 'node-fetch';

const MINT = '4eTrkqsMAzaykKumHKAfbHFeKz8HuDLPoKfMohMgpump';
const WS_URL = 'wss://pumpportal.fun/api/data';

// Helper to get SOL/USD price
async function getSolUsdPrice() {
  try {
    // Try CoinGecko first (most reliable)
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    if (res.ok) {
      const json = await res.json();
      const price = json?.solana?.usd;
      if (Number.isFinite(price)) {
        return price;
      }
    }
  } catch (e) {
    console.error('CoinGecko failed:', e.message);
  }
  
  // Fallback to Jupiter
  try {
    const res = await fetch('https://api.jup.ag/price/v2?ids=SOL');
    if (res.ok) {
      const json = await res.json();
      const price = json?.data?.SOL?.price;
      if (Number.isFinite(price)) {
        return price;
      }
    }
  } catch (e) {
    console.error('Jupiter price API failed:', e.message);
  }
  
  return null;
}

console.log(`Testing Market Cap Conversion for: ${MINT.slice(0, 8)}...`);
console.log('Connecting to PumpPortal WebSocket...\n');

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('✓ WebSocket connected');
  ws.send(JSON.stringify({ 
    method: 'subscribeTokenTrade', 
    keys: [MINT] 
  }));
  console.log(`✓ Subscribed to token trades`);
  console.log('Waiting for trade event...\n');
});

ws.on('message', async (data) => {
  try {
    const message = JSON.parse(data.toString());
    
    const mint = message?.mint || 
                 message?.token || 
                 message?.tokenMint || 
                 message?.data?.mint;
    
    if (mint && mint.includes(MINT.slice(0, 8))) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📨 Trade event received!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      // Extract SOL market cap from PumpPortal
      const mcapSol = message?.marketCapSol ?? 
                      message?.market_cap_sol ?? 
                      message?.data?.marketCapSol ?? 
                      message?.data?.market_cap_sol;
      
      // Extract USD market cap (if available)
      const mcapUsd = message?.usd_market_cap ?? 
                      message?.usdMarketCap ?? 
                      message?.data?.usd_market_cap ?? 
                      message?.data?.usdMarketCap;
      
      console.log('📊 Raw Data from PumpPortal:');
      if (mcapSol) {
        console.log(`   SOL Market Cap: ${mcapSol} SOL`);
      }
      if (mcapUsd) {
        console.log(`   USD Market Cap (if provided): $${mcapUsd.toLocaleString()}`);
      }
      
      // Convert SOL to USD
      if (mcapSol && Number.isFinite(mcapSol) && mcapSol > 0) {
        console.log('\n🔄 Converting SOL Market Cap to USD...');
        const solUsdPrice = await getSolUsdPrice();
        
        if (solUsdPrice && Number.isFinite(solUsdPrice)) {
          const calculatedMcapUsd = mcapSol * solUsdPrice;
          
          console.log(`   SOL/USD Price: $${solUsdPrice.toFixed(2)}`);
          console.log(`   Calculation: ${mcapSol} SOL × $${solUsdPrice.toFixed(2)} = $${calculatedMcapUsd.toFixed(2)}`);
          console.log(`\n✅ USD Market Cap: $${calculatedMcapUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
          
          // Compare with provided USD if available
          if (mcapUsd && Number.isFinite(mcapUsd)) {
            const diff = Math.abs(calculatedMcapUsd - mcapUsd);
            const diffPct = (diff / mcapUsd) * 100;
            console.log(`\n📊 Comparison with PumpPortal USD value:`);
            console.log(`   PumpPortal USD: $${mcapUsd.toLocaleString()}`);
            console.log(`   Calculated USD: $${calculatedMcapUsd.toLocaleString()}`);
            console.log(`   Difference: $${diff.toFixed(2)} (${diffPct.toFixed(2)}%)`);
          }
        } else {
          console.log('   ❌ Failed to fetch SOL/USD price');
        }
      } else {
        console.log('\n⚠️  No SOL market cap found in message');
      }
      
      console.log('\n✓ Conversion test complete!\n');
      
      setTimeout(() => {
        ws.close();
        process.exit(0);
      }, 1000);
    }
  } catch (e) {
    console.error('❌ Error:', e.message);
  }
});

ws.on('error', (err) => {
  console.error('❌ WebSocket error:', err.message);
});

ws.on('close', () => {
  console.log('🔌 WebSocket closed');
});

setTimeout(() => {
  console.log('\n⏱️  Timeout: No trade events received in 30 seconds');
  ws.close();
  process.exit(1);
}, 30000);
