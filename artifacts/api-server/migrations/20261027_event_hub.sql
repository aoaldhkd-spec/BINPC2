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
