-- =============================================================================
-- IAMKey Blackbox Simulator - Database Schema
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- SIMULATED USERS & DEVICES
-- =============================================================================

CREATE TABLE simulated_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(100) NOT NULL,
  phone_number VARCHAR(20) NOT NULL UNIQUE,
  phone_hash VARCHAR(66) NOT NULL UNIQUE,
  salt VARCHAR(66) NOT NULL,
  wallet_address VARCHAR(42) NOT NULL UNIQUE,
  private_key VARCHAR(66) NOT NULL,
  telegram_id VARCHAR(50),
  fcm_token VARCHAR(255),
  trust_level INTEGER DEFAULT 100,
  is_frozen BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE simulated_devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES simulated_users(id) ON DELETE CASCADE,
  device_name VARCHAR(100) NOT NULL,
  platform VARCHAR(20) NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  session_token VARCHAR(255),
  fcm_token VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  last_seen_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- VIRTUAL TELECOM NETWORK (USSD SIMULATION)
-- =============================================================================

CREATE TABLE virtual_phones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number VARCHAR(20) NOT NULL UNIQUE,
  provider VARCHAR(20) NOT NULL,
  country_code VARCHAR(2) NOT NULL,
  balance DECIMAL(15,2) NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL,
  user_id UUID REFERENCES simulated_users(id) ON DELETE SET NULL,
  pin VARCHAR(10) DEFAULT '1234',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ussd_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number VARCHAR(20) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('balance_check', 'transfer_out', 'transfer_in', 'topup', 'purchase')),
  amount DECIMAL(15,2),
  counterparty VARCHAR(20),
  ussd_code VARCHAR(100),
  response_text TEXT,
  status VARCHAR(20) DEFAULT 'completed',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE balance_proofs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  balance_before DECIMAL(15,2) NOT NULL,
  balance_after DECIMAL(15,2) NOT NULL,
  delta DECIMAL(15,2) NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  verification_method VARCHAR(20) DEFAULT 'ussd',
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- MARKETPLACE ORDERS & TRADES
-- =============================================================================

CREATE TABLE marketplace_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trade_id VARCHAR(66),
  creator_user_id UUID REFERENCES simulated_users(id),
  counterparty_user_id UUID REFERENCES simulated_users(id),
  type VARCHAR(10) NOT NULL CHECK (type IN ('buy', 'sell')),
  local_amount DECIMAL(15,2) NOT NULL,
  local_currency VARCHAR(3) NOT NULL,
  dai_amount DECIMAL(18,8) NOT NULL,
  exchange_rate DECIMAL(15,6) NOT NULL,
  telecom_provider VARCHAR(20) NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  recipient_phone VARCHAR(20),
  status VARCHAR(20) NOT NULL DEFAULT 'created',
  dispute_status VARCHAR(20) DEFAULT NULL CHECK (dispute_status IN ('open', 'resolved', 'closed', NULL)),
  dispute_reason TEXT,
  escrow_tx_hash VARCHAR(66),
  release_tx_hash VARCHAR(66),
  balance_proof_id UUID REFERENCES balance_proofs(id),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  matched_at TIMESTAMP,
  funded_at TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE TABLE disputes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES marketplace_orders(id) ON DELETE CASCADE,
  opened_by UUID REFERENCES simulated_users(id),
  reason TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'open',
  resolution_notes TEXT,
  resolved_in_favor_of UUID REFERENCES simulated_users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);

-- =============================================================================
-- GUARDIAN RELATIONSHIPS
-- =============================================================================

CREATE TABLE guardian_relationships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identity_user_id UUID REFERENCES simulated_users(id) ON DELETE CASCADE,
  guardian_user_id UUID REFERENCES simulated_users(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive', 'revoked')),
  public_key_hash VARCHAR(66),
  created_at TIMESTAMP DEFAULT NOW(),
  activated_at TIMESTAMP,
  UNIQUE(identity_user_id, guardian_user_id)
);

CREATE TABLE recovery_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identity_user_id UUID REFERENCES simulated_users(id) ON DELETE CASCADE,
  new_address VARCHAR(42) NOT NULL,
  approvals INTEGER DEFAULT 0,
  required_approvals INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'executed', 'cancelled')),
  created_at TIMESTAMP DEFAULT NOW(),
  executed_at TIMESTAMP
);

CREATE TABLE recovery_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES recovery_sessions(id) ON DELETE CASCADE,
  guardian_user_id UUID REFERENCES simulated_users(id),
  approved_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(session_id, guardian_user_id)
);

-- =============================================================================
-- TELEGRAM VERIFICATION (MOCK)
-- =============================================================================

CREATE TABLE telegram_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number VARCHAR(20) NOT NULL,
  verification_code VARCHAR(10) NOT NULL,
  telegram_chat_id VARCHAR(50),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'verified', 'expired')),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  verified_at TIMESTAMP
);

-- =============================================================================
-- NOTIFICATIONS (MOCK FCM)
-- =============================================================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES simulated_users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  type VARCHAR(50) NOT NULL,
  data JSONB,
  is_read BOOLEAN DEFAULT FALSE,
  delivered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- SCENARIO EXECUTION LOG
-- =============================================================================

CREATE TABLE scenario_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scenario_name VARCHAR(100) NOT NULL,
  status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  config JSONB,
  result JSONB,
  error_message TEXT,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_virtual_phones_user ON virtual_phones(user_id);
CREATE INDEX idx_ussd_transactions_phone ON ussd_transactions(phone_number);
CREATE INDEX idx_ussd_transactions_created ON ussd_transactions(created_at DESC);
CREATE INDEX idx_marketplace_orders_status ON marketplace_orders(status);
CREATE INDEX idx_marketplace_orders_creator ON marketplace_orders(creator_user_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_telegram_verifications_phone ON telegram_verifications(phone_number);

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at
CREATE TRIGGER update_simulated_users_updated_at
  BEFORE UPDATE ON simulated_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_virtual_phones_updated_at
  BEFORE UPDATE ON virtual_phones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
