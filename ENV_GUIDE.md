# ClaudeCash Environment Variables

Create or update your `.env` at the project root with the following values.

## Authentication

```bash
PRIVY_COOKIES=privy-session=...; privy-token=...; privy-id-token=...
```

- Get this from `document.cookie` after logging in.

## Trading + Wallet

```bash
TRADING_MODE=paper                # paper | live
TRADING_WALLET_ADDRESS=...        # required to display balance
TRADING_PRIVATE_KEY=...           # base58 private key (required for live trading)
TRADE_AMOUNT_SOL=0.2
STOP_LOSS_PCT=-30
TAKE_PROFIT_PCT=100
TAKE_PROFIT_SELL_PCT=75
TRAILING_STOP_PCT=25
JUPITER_SLIPPAGE_BPS=500
JUPITER_API_BASE=https://quote-api.jup.ag/v6
JUPITER_PRICE_BASE=https://price.jup.ag/v6
REALTIME_MCAP=true
REALTIME_MCAP_INTERVAL_MS=4000
REALTIME_MCAP_TTL_MS=5000
PUMP_PORTAL_URL=https://pumpportal.fun/api/trade-local
PUMP_PORTAL_POOL=auto
PUMP_PORTAL_PRIORITY_FEE_SOL=0.00001
PUMP_PORTAL_WS_URL=wss://pumpportal.fun/api/data
MIGRATION_STATE_TTL_MS=300000
```

## Helius (Required for balance + holders)

```bash
HELIUS_API=YOUR_HELIUS_KEY
HOLDERS_MINT=YOUR_TOKEN_MINT
DISTRIBUTION_INTERVAL_TRADES=5
DISTRIBUTION_TOP_HOLDERS=50
DISTRIBUTION_ENABLED=false
```
