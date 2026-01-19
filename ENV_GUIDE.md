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
AUTO_EXECUTION_ENABLED=true          # Enable/disable auto-executions (stop loss, take profit, trailing stop). When false, only buys execute, no sells.
STOP_LOSS_PCT=-30
TAKE_PROFIT_PCT=100
TAKE_PROFIT_SELL_PCT=75
TRAILING_STOP_PCT=25
JUPITER_SLIPPAGE_BPS=500
JUPITER_API_BASE=https://lite-api.jup.ag/swap/v1
JUPITER_PRICE_BASE=https://api.jup.ag/price/v2
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

## Auto Token Gate (Automatic authorization for token holders)

```bash
AUTO_TOKEN_GATE_ENABLED=true           # Enable/disable automatic token gating (separate from payment gate)
TOKEN_GATE_MIN_AMOUNT=10000000         # Minimum tokens required (10M default)
HOLDERS_MINT=YOUR_TOKEN_MINT           # Same as above - the token to check
```

When enabled:
- Users holding >= TOKEN_GATE_MIN_AMOUNT of HOLDERS_MINT are auto-authorized
- They get a "holder" plan with no expiration
- If they sell below the threshold, they are automatically deactivated (checked every 30s via existing holder monitoring)
- Works alongside existing payment gate system (paid users keep their plan)
