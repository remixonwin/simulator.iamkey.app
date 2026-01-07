-- =============================================================================
-- IAMKey Blackbox Simulator - Seed Data
-- =============================================================================

-- Pre-generated Anvil accounts (first 10 from default mnemonic)
-- Mnemonic: test test test test test test test test test test test junk

-- =============================================================================
-- SIMULATED USERS
-- =============================================================================

INSERT INTO simulated_users (id, username, phone_number, phone_hash, salt, wallet_address, private_key, telegram_id, trust_level) VALUES
  -- Alice (Primary test user)
  ('a0000000-0000-0000-0000-000000000001', 'alice', '+9779841234567', 
   '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
   '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
   '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
   '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
   'alice_telegram', 100),
  
  -- Bob (Secondary test user)
  ('b0000000-0000-0000-0000-000000000002', 'bob', '+9779842345678',
   '0x2345678901abcdef2345678901abcdef2345678901abcdef2345678901abcdef',
   '0xbcdef12345678901bcdef12345678901bcdef12345678901bcdef12345678901',
   '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
   '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
   'bob_telegram', 85),
  
  -- Carol (Guardian 1)
  ('c0000000-0000-0000-0000-000000000003', 'carol', '+9779843456789',
   '0x3456789012abcdef3456789012abcdef3456789012abcdef3456789012abcdef',
   '0xcdef123456789012cdef123456789012cdef123456789012cdef123456789012',
   '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
   '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
   'carol_telegram', 90),
  
  -- Dave (Guardian 2)
  ('d0000000-0000-0000-0000-000000000004', 'dave', '+9779844567890',
   '0x456789013abcdef456789013abcdef456789013abcdef456789013abcdef0123',
   '0xdef123456789013adef123456789013adef123456789013adef123456789013a',
   '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
   '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
   'dave_telegram', 75),
  
  -- Eve (Guardian 3)
  ('e0000000-0000-0000-0000-000000000005', 'eve', '+9779845678901',
   '0x56789014abcdef56789014abcdef56789014abcdef56789014abcdef01234567',
   '0xef123456789014abef123456789014abef123456789014abef123456789014ab',
   '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
   '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
   'eve_telegram', 95),

  -- Frank (Resolver/Arbitrator)
  ('f0000000-0000-0000-0000-000000000006', 'frank', '+2348031234567',
   '0x6789015abcdef6789015abcdef6789015abcdef6789015abcdef012345678901',
   '0xf123456789015abcf123456789015abcf123456789015abcf123456789015abc',
   '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
   '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
   'frank_telegram', 150);

-- =============================================================================
-- SIMULATED DEVICES
-- =============================================================================

INSERT INTO simulated_devices (user_id, device_name, platform, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Alice Phone', 'android', TRUE),
  ('a0000000-0000-0000-0000-000000000001', 'Alice Tablet', 'android', TRUE),
  ('a0000000-0000-0000-0000-000000000001', 'Alice Web', 'web', TRUE),
  ('b0000000-0000-0000-0000-000000000002', 'Bob Phone', 'android', TRUE),
  ('c0000000-0000-0000-0000-000000000003', 'Carol iPhone', 'ios', TRUE),
  ('d0000000-0000-0000-0000-000000000004', 'Dave Phone', 'android', TRUE),
  ('e0000000-0000-0000-0000-000000000005', 'Eve Phone', 'android', TRUE),
  ('f0000000-0000-0000-0000-000000000006', 'Frank Phone', 'android', TRUE);

-- =============================================================================
-- VIRTUAL PHONES (USSD)
-- =============================================================================

INSERT INTO virtual_phones (phone_number, provider, country_code, balance, currency, user_id, pin) VALUES
  -- Nepal (NTC, Ncell)
  ('+9779841234567', 'NTC', 'NP', 5000.00, 'NPR', 'a0000000-0000-0000-0000-000000000001', '1234'),
  ('+9779842345678', 'NCELL', 'NP', 2500.00, 'NPR', 'b0000000-0000-0000-0000-000000000002', '1234'),
  ('+9779843456789', 'NTC', 'NP', 3000.00, 'NPR', 'c0000000-0000-0000-0000-000000000003', '1234'),
  ('+9779844567890', 'NCELL', 'NP', 1500.00, 'NPR', 'd0000000-0000-0000-0000-000000000004', '1234'),
  ('+9779845678901', 'NTC', 'NP', 4000.00, 'NPR', 'e0000000-0000-0000-0000-000000000005', '1234'),
  
  -- Nigeria (MTN)
  ('+2348031234567', 'MTN', 'NG', 25000.00, 'NGN', 'f0000000-0000-0000-0000-000000000006', '1234');

-- =============================================================================
-- GUARDIAN RELATIONSHIPS (Pre-configured for Alice)
-- =============================================================================

INSERT INTO guardian_relationships (identity_user_id, guardian_user_id, status, activated_at) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'active', NOW()),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000004', 'active', NOW()),
  ('a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000005', 'active', NOW());

-- =============================================================================
-- SAMPLE MARKETPLACE ORDERS
-- =============================================================================

INSERT INTO marketplace_orders (
  id, creator_user_id, type, local_amount, local_currency, dai_amount, 
  exchange_rate, telecom_provider, phone_number, status, expires_at
) VALUES
  -- Alice selling 1000 NPR
  ('11111111-1111-1111-1111-111111111111', 
   'a0000000-0000-0000-0000-000000000001', 
   'sell', 1000.00, 'NPR', 7.49, 133.50, 'NTC', '+9779841234567', 
   'created', NOW() + INTERVAL '24 hours'),
  
  -- Bob buying 500 NPR
  ('22222222-2222-2222-2222-222222222222',
   'b0000000-0000-0000-0000-000000000002',
   'buy', 500.00, 'NPR', 3.75, 133.50, 'NCELL', '+9779842345678',
   'created', NOW() + INTERVAL '24 hours');
