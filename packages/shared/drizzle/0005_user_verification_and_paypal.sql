-- Migration 0005: User verification tiers, developer identity, and PayPal binding
ALTER TABLE users ADD COLUMN IF NOT EXISTS username varchar(32);
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS legal_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_username text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_verified_at timestamp with time zone;
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_verification_status varchar(32) NOT NULL DEFAULT 'UNVERIFIED';
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_verified_at timestamp with time zone;
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_document_type varchar(32);
ALTER TABLE users ADD COLUMN IF NOT EXISTS paypal_payer_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS paypal_payout_email text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS paypal_linked_at timestamp with time zone;
ALTER TABLE users ADD COLUMN IF NOT EXISTS paypal_verified boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS paypal_auto_hold_enabled boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users(username);
