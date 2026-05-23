-- ============================================================================
--  Sovera Postgres bootstrap
--  Run as the admin (or via Entra group) once after the Phase 1 deploy.
--    psql "host=<fqdn> dbname=postgres user=<admin> sslmode=require" -f bootstrap.sql
-- ============================================================================

-- 1. Database
CREATE DATABASE sovera;
\connect sovera

-- 2. Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgaudit;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- 3. Schemas
CREATE SCHEMA IF NOT EXISTS app;          -- tenant data
CREATE SCHEMA IF NOT EXISTS audit;        -- append-only audit
CREATE SCHEMA IF NOT EXISTS dl;           -- Sovera internals (claims, helpers)

-- 4. Roles
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

-- 5. JWT-claim helpers (DAB sets session context with `set-session-context: true`)
--    Claims are exposed via current_setting('claims.<name>', true).
CREATE OR REPLACE FUNCTION dl.tenant_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('claims.tid', true), '')::uuid
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION dl.user_sub() RETURNS text AS $$
  SELECT current_setting('claims.sub', true)
$$ LANGUAGE sql STABLE;

-- 6. Example tenant-scoped table with RLS (template for real entities)
CREATE TABLE IF NOT EXISTS app.patients (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    uuid NOT NULL,
  full_name    text NOT NULL,
  dob          date,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   text NOT NULL DEFAULT dl.user_sub()
);

ALTER TABLE app.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.patients FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_tenant_isolation ON app.patients;
CREATE POLICY p_tenant_isolation ON app.patients
  USING (tenant_id = dl.tenant_id())
  WITH CHECK (tenant_id = dl.tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON app.patients TO authenticated;

-- 7. Audit trigger (append-only, immutable from app)
CREATE TABLE IF NOT EXISTS audit.events (
  id           bigserial PRIMARY KEY,
  ts           timestamptz NOT NULL DEFAULT now(),
  tenant_id    uuid,
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
  v_tid uuid := dl.tenant_id();
  v_sub text := dl.user_sub();
  v_id uuid;
  v_diff jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_id := OLD.id; v_diff := to_jsonb(OLD);
  ELSE
    v_id := NEW.id; v_diff := to_jsonb(NEW);
  END IF;
  INSERT INTO audit.events(tenant_id, user_sub, table_name, op, row_id, diff)
  VALUES (v_tid, v_sub, TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME, TG_OP, v_id, v_diff);
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_patients ON app.patients;
CREATE TRIGGER trg_audit_patients
AFTER INSERT OR UPDATE OR DELETE ON app.patients
FOR EACH ROW EXECUTE FUNCTION audit.fn_audit();

-- 8. Logical replication publication for the Realtime bridge
DROP PUBLICATION IF EXISTS sovera_realtime;
CREATE PUBLICATION sovera_realtime FOR TABLE app.patients;
-- Add more tables here, or use FOR ALL TABLES IN SCHEMA app once stable.
