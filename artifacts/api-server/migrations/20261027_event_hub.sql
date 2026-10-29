-- Additive only. Run explicitly against an isolated development DB first.
-- Independent of app_kv_rows: the existing 17:00 reset cannot delete this ledger.
CREATE TABLE IF NOT EXISTS event_hub_records (
  kind text NOT NULL CHECK (kind IN ('owner','member','settings','event','application','request','thread','stock','error')),
  id text NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS event_hub_owner_application ON event_hub_records
  ((data->>'eventId'),(data->>'owner')) WHERE kind='application';
CREATE UNIQUE INDEX IF NOT EXISTS event_hub_rank ON event_hub_records
  ((data->>'eventId'),((data->>'rank')::bigint)) WHERE kind='application';
CREATE UNIQUE INDEX IF NOT EXISTS event_hub_recovery ON event_hub_records
  ((data->>'recoveryHash')) WHERE kind='owner';
CREATE UNIQUE INDEX IF NOT EXISTS event_hub_member_name ON event_hub_records
  ((data->>'nicknameKey')) WHERE kind='member';

-- Private keyed lookup metadata; no plaintext nickname/phone index.
CREATE INDEX IF NOT EXISTS event_hub_application_nickname ON event_hub_records ((data->>'nicknameLookup')) WHERE kind='application';
CREATE INDEX IF NOT EXISTS event_hub_member_owner ON event_hub_records ((data->>'owner')) WHERE kind='member';
CREATE INDEX IF NOT EXISTS event_hub_legacy_nickname ON event_hub_records (kind,id) WHERE kind IN ('application','member') AND NOT(data ? 'nicknameLookup');
CREATE INDEX IF NOT EXISTS event_hub_legacy_member_owner ON event_hub_records (id) WHERE kind='member' AND NOT(data ? 'owner');
CREATE INDEX IF NOT EXISTS event_hub_member_nickname_lookup ON event_hub_records ((data->>'nicknameLookup')) WHERE kind='member';

-- Add isolated encrypted laboratory namespaces without modifying existing records or keys.
-- The test reset only deletes laboratory-workspace; operational reset never owns these kinds.
ALTER TABLE event_hub_records DROP CONSTRAINT IF EXISTS event_hub_records_kind_check;
ALTER TABLE event_hub_records ADD CONSTRAINT event_hub_records_kind_check
  CHECK (kind IN ('owner','member','settings','event','application','request','thread','stock','error','laboratory-mode','laboratory-workspace'));

-- Event-scoped stock lookup; payload authentication and atomic reservation remain mandatory.
CREATE INDEX IF NOT EXISTS event_hub_stock_event ON event_hub_records ((data->>'eventId')) WHERE kind='stock';

-- Server-only session/grant store. Never expose either new table via Supabase REST roles.
CREATE TABLE IF NOT EXISTS app_sessions (
  sid varchar NOT NULL PRIMARY KEY,
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS app_sessions_expire_idx ON app_sessions(expire);
ALTER TABLE event_hub_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON event_hub_records, app_sessions FROM PUBLIC;
DO $$
DECLARE external_role text;
BEGIN
  FOREACH external_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = external_role) THEN
      EXECUTE format('REVOKE ALL ON event_hub_records, app_sessions FROM %I', external_role);
    END IF;
  END LOOP;
END $$;
-- Existing app tables, role membership, keys and records are not changed.
