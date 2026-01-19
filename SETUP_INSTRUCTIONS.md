# 🚀 ClaudeCash Production Setup - DO THIS NOW

## Step 1: Add Admin Wallet to Supabase (1 minute)

Go to: https://supabase.com/dashboard/project/rbmzrqsnsvzgoxzpynky/sql/new

**Run this SQL:**

```sql
-- First, ensure tables exist
CREATE TABLE IF NOT EXISTS public.licenses (
  wallet text primary key,
  plan text not null,
  activated_at timestamptz,
  expires_at timestamptz,
  device_id text,
  session_token text,
  last_seen_at timestamptz,
  created_at timestamptz default now()
);

CREATE INDEX IF NOT EXISTS licenses_session_token_idx ON public.licenses (session_token);

CREATE TABLE IF NOT EXISTS public.license_payments (
  id uuid default gen_random_uuid() primary key,
  wallet text not null,
  plan text not null,
  amount_sol numeric not null,
  status text not null,
  signature text,
  created_at timestamptz default now(),
  paid_at timestamptz
);

CREATE INDEX IF NOT EXISTS license_payments_wallet_idx ON public.license_payments (wallet);
CREATE UNIQUE INDEX IF NOT EXISTS license_payments_signature_idx ON public.license_payments (signature);

-- Add your admin wallet
INSERT INTO public.licenses (wallet, plan, activated_at, expires_at, created_at)
VALUES (
  '3sxAez3yght687RKUAjN3qRxHtY12YmLJL2vBLtdM8L',
  'admin',
  NOW(),
  NULL,
  NOW()
)
ON CONFLICT (wallet) 
DO UPDATE SET 
  plan = 'admin',
  expires_at = NULL;
```

Click **RUN** → Should see "Success. No rows returned"

---

## Step 2: Set Digital Ocean Environment Variables (2 minutes)

Go to: https://cloud.digitalocean.com/apps/claudecash-3arpi/settings

Click **App-Level Environment Variables** → Edit

**Add/Update these:**

```
SUPABASE_URL=https://rbmzrqsnsvzgoxzpynky.supabase.co

SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJibXpycXNuc3Z6Z294enB5bmt5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjQ0OTg2MywiZXhwIjoyMDc4MDI1ODYzfQ.2LWSL_-rKZuaRqugScUUWusupdD2a-z8SACQmcUuh9w

TRADING_WALLET_ADDRESS=3sxAez3yght687RKUAjN3qRxHtY12YmLJL2vBLtdM8L

ADMIN=3sxAez3yght687RKUAjN3qRxHtY12YmLJL2vBLtdM8L

HELIUS_API=YOUR_HELIUS_KEY

PRIVY_COOKIES=privy-session=t; privy-token=eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Note:** Replace YOUR_HELIUS_KEY with your actual key from the screenshot (if visible)

Click **Save** → This will trigger a redeployment

---

## Step 3: Force Rebuild (if not auto-deploying)

If the app doesn't auto-rebuild after saving env vars:

1. Go to **Settings** → **General**
2. Scroll to bottom
3. Click **Force Rebuild and Deploy**
4. Wait 3-5 minutes for build to complete

---

## Step 4: Verify Server is Running

After deployment completes, test:

```bash
curl https://claudecash-3arpi.ondigitalocean.app/api/status
```

**Expected Response:**
```json
{
  "authenticated": true,
  "authMode": "privy",
  "tokenCount": 20,
  ...
}
```

**If you get HTML or 504:** Server still crashed - check runtime logs

---

## Step 5: Login as Admin

1. Go to: https://claudecash-3arpi.ondigitalocean.app
2. Landing page should load with:
   - Your logo
   - Theme toggle
   - X button
   - "Connecting to live feed..." or actual tokens
3. Click **"Activate License"**
4. Enter wallet: `3sxAez3yght687RKUAjN3qRxHtY12YmLJL2vBLtdM8L`
5. Select any plan (doesn't matter)
6. Click green **"Activate"** button
7. ✅ Should log in instantly without payment

---

## 🐛 Troubleshooting

### If "License key not found"
- Check Supabase licenses table for your wallet
- Verify SQL from Step 1 ran successfully

### If "Unexpected token" error
- Server is returning HTML instead of JSON
- Check Digital Ocean runtime logs
- Verify environment variables are set

### If WebSocket won't connect
- Check Digital Ocean app settings
- Ensure HTTP/HTTPS Ports are enabled
- Check Runtime Logs for WebSocket errors

### If 504 Gateway Timeout
- Server crashed on startup
- Check for missing env variables in logs
- Verify database connection works

---

## 📊 Check Digital Ocean Logs

```bash
# Using CLI
doctl apps list
doctl apps logs YOUR_APP_ID --follow --type run

# Or in dashboard:
# Apps → claudecash-3arpi → Runtime Logs
```

Look for:
- ✅ "Server: http://..." - Started successfully
- ❌ "Supabase not configured" - Missing env vars
- ❌ "Error:" - Crash details

---

## ✅ Success Checklist

- [ ] Supabase SQL executed successfully
- [ ] Environment variables saved in Digital Ocean
- [ ] App redeployed (green checkmark in deployments)
- [ ] `/api/status` returns JSON (not HTML)
- [ ] Landing page loads with theme
- [ ] Admin wallet logs in with "Activate" button
- [ ] WebSocket shows "connected" in console
- [ ] Tokens appear in feed

---

**Estimated Time:** 5-10 minutes total

Once this is done, everything will work! 🎉
