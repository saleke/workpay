ALTER TABLE "paypal_oauth_attempts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "paypal_oauth_attempts" CASCADE;--> statement-breakpoint
ALTER TABLE "review_fee_payments" DROP CONSTRAINT "review_fee_payments_mode_binding_valid";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_mode_binding_valid";--> statement-breakpoint
ALTER TABLE "payment_orders" ALTER COLUMN "payer_id_snapshot" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "review_fee_payments" ADD CONSTRAINT "review_fee_payments_payer_bound_for_authorization" CHECK ("review_fee_payments"."mode" = 'FAKE' or "review_fee_payments"."status" not in ('AUTHORIZATION_REQUESTED', 'CAPTURE_REQUESTED', 'PAID') or "review_fee_payments"."payer_id_snapshot" is not null);--> statement-breakpoint
ALTER TABLE "review_fee_payments" ADD CONSTRAINT "review_fee_payments_mode_binding_valid" CHECK (("review_fee_payments"."mode" = 'FAKE' and "review_fee_payments"."payer_id_snapshot" is null and "review_fee_payments"."seller_merchant_id_snapshot" is null) or ("review_fee_payments"."mode" in ('PAYPAL_SANDBOX', 'PAYPAL_LIVE') and "review_fee_payments"."seller_merchant_id_snapshot" is not null));--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_payer_bound_for_authorization" CHECK ("payment_orders"."status" not in ('APPROVED', 'AUTHORIZATION_REQUESTED', 'AUTHORIZED') or "payment_orders"."payer_id_snapshot" is not null);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payer_bound_for_authorization" CHECK ("payments"."mode" = 'FAKE' or "payments"."status"::text not in ('ORDER_APPROVED', 'AUTHORIZATION_REQUESTED', 'AUTHORIZED', 'CAPTURE_REQUESTED', 'CAPTURED', 'VOIDED', 'REFUNDED') or "payments"."payer_id_snapshot" is not null);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_mode_binding_valid" CHECK (("payments"."mode" = 'FAKE' and "payments"."payer_id_snapshot" is null and "payments"."seller_merchant_id_snapshot" is null) or ("payments"."mode" in ('PAYPAL_SANDBOX', 'PAYPAL_LIVE') and "payments"."seller_merchant_id_snapshot" is not null));--> statement-breakpoint
CREATE OR REPLACE FUNCTION workpay_payment_payer_binding_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.payer_id_snapshot IS DISTINCT FROM OLD.payer_id_snapshot
    AND NOT (
      OLD.mode IN ('PAYPAL_SANDBOX', 'PAYPAL_LIVE')
      AND OLD.payer_id_snapshot IS NULL
      AND NEW.payer_id_snapshot IS NOT NULL
    ) THEN
    RAISE EXCEPTION 'payment payer binding is immutable';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER payments_payer_binding_immutable BEFORE UPDATE OF "payer_id_snapshot" ON "payments" FOR EACH ROW EXECUTE FUNCTION workpay_payment_payer_binding_immutable();--> statement-breakpoint
CREATE OR REPLACE FUNCTION workpay_payment_order_payer_binding_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.payer_id_snapshot IS DISTINCT FROM OLD.payer_id_snapshot
    AND NOT (
      OLD.mode IN ('PAYPAL_SANDBOX', 'PAYPAL_LIVE')
      AND OLD.payer_id_snapshot IS NULL
      AND NEW.payer_id_snapshot IS NOT NULL
    ) THEN
    RAISE EXCEPTION 'payment order payer binding is immutable';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER payment_orders_payer_binding_immutable BEFORE UPDATE OF "payer_id_snapshot" ON "payment_orders" FOR EACH ROW EXECUTE FUNCTION workpay_payment_order_payer_binding_immutable();--> statement-breakpoint
CREATE OR REPLACE FUNCTION workpay_review_fee_binding_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.mode IS DISTINCT FROM OLD.mode
    OR NEW.engagement_id IS DISTINCT FROM OLD.engagement_id
    OR NEW.payer_user_id IS DISTINCT FROM OLD.payer_user_id
    OR NEW.reviewer_provider_id IS DISTINCT FROM OLD.reviewer_provider_id
    OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR (
      NEW.payer_id_snapshot IS DISTINCT FROM OLD.payer_id_snapshot
      AND NOT (
        OLD.mode IN ('PAYPAL_SANDBOX', 'PAYPAL_LIVE')
        AND OLD.payer_id_snapshot IS NULL
        AND NEW.payer_id_snapshot IS NOT NULL
      )
    )
    OR NEW.seller_merchant_id_snapshot IS DISTINCT FROM OLD.seller_merchant_id_snapshot THEN
    RAISE EXCEPTION 'review fee economic binding is immutable';
  END IF;
  RETURN NEW;
END;
$$;
