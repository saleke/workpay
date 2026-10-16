-- Immutability and append-only guards.
--
-- WorkPay's financial safety depends on some rows never changing once written.
-- Application code is the first line of defense; these triggers are the second,
-- so a bug or a manual query cannot silently rewrite history.
--
-- Tables guarded:
--   payment_operations : append-only ledger of external money operations
--   events             : append-only domain event store
--   audit_records      : append-only audit trail
--   outbox_events      : payload columns are immutable; only dispatch columns move
--   payment_decisions  : append-only policy decisions

CREATE OR REPLACE FUNCTION workpay_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only; % is not permitted', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION workpay_block_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only; DELETE is not permitted', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

-- payment_operations: no UPDATE or DELETE, ever.
CREATE TRIGGER payment_operations_no_update
  BEFORE UPDATE ON payment_operations
  FOR EACH ROW EXECUTE FUNCTION workpay_block_mutation();

CREATE TRIGGER payment_operations_no_delete
  BEFORE DELETE ON payment_operations
  FOR EACH ROW EXECUTE FUNCTION workpay_block_delete();

-- events: no UPDATE or DELETE. Facts do not change.
CREATE TRIGGER events_no_update
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION workpay_block_mutation();

CREATE TRIGGER events_no_delete
  BEFORE DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION workpay_block_delete();

-- audit_records: no UPDATE or DELETE.
CREATE TRIGGER audit_records_no_update
  BEFORE UPDATE ON audit_records
  FOR EACH ROW EXECUTE FUNCTION workpay_block_mutation();

CREATE TRIGGER audit_records_no_delete
  BEFORE DELETE ON audit_records
  FOR EACH ROW EXECUTE FUNCTION workpay_block_delete();

-- payment_decisions: no UPDATE or DELETE. A new decision is appended.
CREATE TRIGGER payment_decisions_no_update
  BEFORE UPDATE ON payment_decisions
  FOR EACH ROW EXECUTE FUNCTION workpay_block_mutation();

CREATE TRIGGER payment_decisions_no_delete
  BEFORE DELETE ON payment_decisions
  FOR EACH ROW EXECUTE FUNCTION workpay_block_delete();

-- outbox_events: the event identity and payload are immutable. The publisher
-- may only advance dispatch columns (status, attempts, last_error,
-- available_at, published_at). Any attempt to rewrite the event identity fails.
CREATE OR REPLACE FUNCTION workpay_outbox_guard_update() RETURNS trigger AS $$
BEGIN
  IF NEW.id <> OLD.id
     OR NEW.event_id <> OLD.event_id
     OR NEW.event_type <> OLD.event_type
     OR NEW.aggregate_type <> OLD.aggregate_type
     OR NEW.aggregate_id <> OLD.aggregate_id
     OR NEW.task_id <> OLD.task_id
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'outbox_events event identity is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER outbox_events_guard_update
  BEFORE UPDATE ON outbox_events
  FOR EACH ROW EXECUTE FUNCTION workpay_outbox_guard_update();

CREATE TRIGGER outbox_events_no_delete
  BEFORE DELETE ON outbox_events
  FOR EACH ROW EXECUTE FUNCTION workpay_block_delete();
