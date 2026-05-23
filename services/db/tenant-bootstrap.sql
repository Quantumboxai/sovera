-- ============================================================================
--  Sovera per-tenant Postgres bootstrap
--
--  Run AFTER `infra/modules/tenant.bicep` creates the empty tenant database.
--
--    psql "host=<pg-fqdn> dbname=tnt_<slug> user=<admin> sslmode=require" \
--      -v tenant_id=<tenant-uuid> \
--      -v dab_password='<rotated>' \
--      -f services/db/tenant-bootstrap.sql
--
--  Idempotent: safe to re-run.
-- ============================================================================

\set ON_ERROR_STOP on

-- 1. Extensions (must be created in each new DB)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgaudit;

-- 2. Schemas
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS dl;

-- 3. Roles — `dab_app` is the connection role used by DAB; `authenticated` is
--    the role DAB sets via `SET ROLE` based on the JWT.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dab_app') THEN
    CREATE ROLE dab_app NOINHERIT LOGIN PASSWORD :'dab_password';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anonymous') THEN
    CREATE ROLE anonymous NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA app, dl TO authenticated;
GRANT authenticated TO dab_app;

-- 4. Tenant pinning: hard-bind this database to one tenant UUID.
--    Every row inserted gets stamped, and RLS enforces matching `tid`.
CREATE TABLE IF NOT EXISTS dl.tenant (
  id           uuid PRIMARY KEY,
  created_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO dl.tenant(id)
  VALUES (:'tenant_id'::uuid)
ON CONFLICT (id) DO NOTHING;

-- Helper that returns this DB's tenant UUID (always exactly one row).
CREATE OR REPLACE FUNCTION dl.this_tenant() RETURNS uuid AS $$
  SELECT id FROM dl.tenant LIMIT 1
$$ LANGUAGE sql STABLE;

-- Claims helpers identical to the platform bootstrap.
CREATE OR REPLACE FUNCTION dl.tenant_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('claims.tid', true), '')::uuid
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION dl.user_sub() RETURNS text AS $$
  SELECT current_setting('claims.sub', true)
$$ LANGUAGE sql STABLE;

-- Guard: reject any session whose JWT tenant claim does not match this DB.
CREATE OR REPLACE FUNCTION dl.assert_tenant() RETURNS void AS $$
DECLARE
  v_claim uuid := dl.tenant_id();
  v_pinned uuid := dl.this_tenant();
BEGIN
  IF v_claim IS NULL THEN
    RAISE EXCEPTION 'sovera: missing tenant claim (claims.tid)';
  END IF;
  IF v_claim <> v_pinned THEN
    RAISE EXCEPTION 'sovera: tenant mismatch (claim=% pinned=%)', v_claim, v_pinned;
  END IF;
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 5. Example tenant-scoped table — copy this pattern for real entities.
CREATE TABLE IF NOT EXISTS app.patients (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    uuid NOT NULL DEFAULT dl.this_tenant(),
  full_name    text NOT NULL,
  dob          date,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   text NOT NULL DEFAULT dl.user_sub(),
  CONSTRAINT patients_tenant_pin CHECK (tenant_id = dl.this_tenant())
);

ALTER TABLE app.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.patients FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_tenant_isolation ON app.patients;
CREATE POLICY p_tenant_isolation ON app.patients
  USING (tenant_id = dl.tenant_id() AND tenant_id = dl.this_tenant())
  WITH CHECK (tenant_id = dl.this_tenant());

GRANT SELECT, INSERT, UPDATE, DELETE ON app.patients TO authenticated;

-- 6. Audit (per-tenant, immutable from app role)
CREATE TABLE IF NOT EXISTS audit.events (
  id           bigserial PRIMARY KEY,
  ts           timestamptz NOT NULL DEFAULT now(),
  tenant_id    uuid NOT NULL DEFAULT dl.this_tenant(),
  user_sub     text,
  table_name   text,
  op           text,
  row_id       uuid,
  diff         jsonb
);

REVOKE ALL ON audit.events FROM PUBLIC;
GRANT INSERT ON audit.events TO authenticated;
GRANT USAGE ON SCHEMA audit TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE audit.events_id_seq TO authenticated;

CREATE OR REPLACE FUNCTION audit.fn_audit() RETURNS trigger AS $$
DECLARE
  v_id uuid;
  v_diff jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_id := OLD.id; v_diff := to_jsonb(OLD);
  ELSE
    v_id := NEW.id; v_diff := to_jsonb(NEW);
  END IF;
  INSERT INTO audit.events(user_sub, table_name, op, row_id, diff)
  VALUES (dl.user_sub(), TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME, TG_OP, v_id, v_diff);
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_patients ON app.patients;
CREATE TRIGGER trg_audit_patients
AFTER INSERT OR UPDATE OR DELETE ON app.patients
FOR EACH ROW EXECUTE FUNCTION audit.fn_audit();

-- 7. Logical replication publication (one per DB; bridge subscribes per-tenant)
DROP PUBLICATION IF EXISTS sovera_realtime;
CREATE PUBLICATION sovera_realtime FOR TABLE app.patients;
