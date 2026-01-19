-- ==========================================
-- MANUAL LICENSE ACTIVATION SCRIPT
-- Use this to manually add/activate user licenses
-- ==========================================

-- ==========================================
-- WEEKLY LICENSE (7 days)
-- ==========================================
-- Replace USER_WALLET_HERE with actual wallet address
INSERT INTO public.licenses (
  wallet, 
  plan, 
  activated_at, 
  expires_at, 
  created_at,
  device_id,
  session_token
)
VALUES (
  'USER_WALLET_HERE',  -- Replace with user's wallet
  'week',
  NOW(),  -- Activated now
  NOW() + INTERVAL '7 days',  -- Expires in 7 days
  NOW(),
  NULL,  -- User will set on first login
  NULL   -- Session token generated on login
)
ON CONFLICT (wallet) 
DO UPDATE SET 
  plan = 'week',
  activated_at = NOW(),
  expires_at = NOW() + INTERVAL '7 days',
  device_id = NULL,  -- Reset device (user can login fresh)
  session_token = NULL;  -- Clear old session

-- ==========================================
-- MONTHLY LICENSE (30 days)
-- ==========================================
-- Replace USER_WALLET_HERE with actual wallet address
INSERT INTO public.licenses (
  wallet, 
  plan, 
  activated_at, 
  expires_at, 
  created_at,
  device_id,
  session_token
)
VALUES (
  'USER_WALLET_HERE',  -- Replace with user's wallet
  'month',
  NOW(),  -- Activated now
  NOW() + INTERVAL '30 days',  -- Expires in 30 days
  NOW(),
  NULL,  -- User will set on first login
  NULL   -- Session token generated on login
)
ON CONFLICT (wallet) 
DO UPDATE SET 
  plan = 'month',
  activated_at = NOW(),
  expires_at = NOW() + INTERVAL '30 days',
  device_id = NULL,  -- Reset device (user can login fresh)
  session_token = NULL;  -- Clear old session

-- ==========================================
-- EXTEND EXISTING LICENSE (add more time)
-- ==========================================
-- Adds 7 days to current expiration (for weekly)
UPDATE public.licenses
SET expires_at = COALESCE(expires_at, NOW()) + INTERVAL '7 days'
WHERE wallet = 'USER_WALLET_HERE';

-- Adds 30 days to current expiration (for monthly)
UPDATE public.licenses
SET expires_at = COALESCE(expires_at, NOW()) + INTERVAL '30 days'
WHERE wallet = 'USER_WALLET_HERE';

-- ==========================================
-- QUICK EXAMPLES (Copy & Edit These)
-- ==========================================

-- Example 1: Add weekly license for wallet ABC123...
/*
INSERT INTO public.licenses (wallet, plan, activated_at, expires_at, created_at)
VALUES (
  'ABC123XYZ789WalletAddress',
  'week',
  NOW(),
  NOW() + INTERVAL '7 days',
  NOW()
)
ON CONFLICT (wallet) 
DO UPDATE SET 
  plan = 'week',
  activated_at = NOW(),
  expires_at = NOW() + INTERVAL '7 days';
*/

-- Example 2: Add monthly license for wallet DEF456...
/*
INSERT INTO public.licenses (wallet, plan, activated_at, expires_at, created_at)
VALUES (
  'DEF456GHI012WalletAddress',
  'month',
  NOW(),
  NOW() + INTERVAL '30 days',
  NOW()
)
ON CONFLICT (wallet) 
DO UPDATE SET 
  plan = 'month',
  activated_at = NOW(),
  expires_at = NOW() + INTERVAL '30 days';
*/

-- ==========================================
-- VERIFY LICENSE WAS ADDED
-- ==========================================
-- Check license status
SELECT 
  wallet,
  plan,
  activated_at,
  expires_at,
  expires_at - NOW() as time_remaining,
  CASE 
    WHEN expires_at IS NULL THEN 'NEVER EXPIRES (Admin)'
    WHEN expires_at > NOW() THEN 'ACTIVE'
    ELSE 'EXPIRED'
  END as status
FROM public.licenses
WHERE wallet = 'USER_WALLET_HERE';

-- ==========================================
-- BULK ADD MULTIPLE USERS (if needed)
-- ==========================================
/*
INSERT INTO public.licenses (wallet, plan, activated_at, expires_at, created_at)
VALUES 
  ('Wallet1Here', 'week', NOW(), NOW() + INTERVAL '7 days', NOW()),
  ('Wallet2Here', 'month', NOW(), NOW() + INTERVAL '30 days', NOW()),
  ('Wallet3Here', 'week', NOW(), NOW() + INTERVAL '7 days', NOW())
ON CONFLICT (wallet) 
DO UPDATE SET 
  activated_at = EXCLUDED.activated_at,
  expires_at = EXCLUDED.expires_at;
*/

-- ==========================================
-- TROUBLESHOOTING COMMANDS
-- ==========================================

-- View all active licenses
SELECT wallet, plan, expires_at - NOW() as time_left
FROM public.licenses
WHERE expires_at > NOW() OR expires_at IS NULL
ORDER BY activated_at DESC;

-- View all payments for a wallet
SELECT wallet, plan, amount_sol, status, signature, paid_at
FROM public.license_payments
WHERE wallet = 'USER_WALLET_HERE'
ORDER BY created_at DESC;

-- Manually mark a payment as paid (if payment confirmed but not detected)
UPDATE public.license_payments
SET status = 'paid', paid_at = NOW()
WHERE wallet = 'USER_WALLET_HERE' 
  AND plan = 'week'  -- or 'month'
  AND status = 'pending';
