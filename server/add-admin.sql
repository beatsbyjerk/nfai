-- Add admin wallet to licenses table
INSERT INTO licenses (wallet, plan, activated_at, expires_at, created_at)
VALUES (
  '3sxAez3yght687RKUAjN3qRxHtY12YmLJL2vBLtdM8L',
  'admin',
  NOW(),
  NULL,  -- Admin never expires
  NOW()
)
ON CONFLICT (wallet) 
DO UPDATE SET 
  plan = 'admin',
  expires_at = NULL,
  activated_at = COALESCE(licenses.activated_at, NOW());
