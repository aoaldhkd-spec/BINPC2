-- BINPC2: Supabase "rls_disabled_in_public" remediation
-- Project: dlliqqlqdtdkfakdtwyw
--
-- BINPC2 uses Supabase only as managed Postgres (DATABASE_URL on Render).
-- The app never uses the Supabase anon key; all access goes through api-server.
-- PostgREST still exposes public tables to anyone with the project URL + anon key
-- unless Row Level Security is enabled.
--
-- Safe to run multiple times. Does NOT affect the postgres role (API server bypasses RLS).
-- No policies are added: anon/authenticated are denied by default when RLS is on.

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', r.tablename);
    RAISE NOTICE 'RLS enabled on public.%', r.tablename;
  END LOOP;
END $$;
