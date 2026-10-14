-- BINPC2 privacy residue READ ONLY check (2026-10-13)
-- Target only the separately verified BINPC2 Supabase project; NEVER run on another project.
-- SELECT only; do not add DELETE, UPDATE, TRUNCATE, DROP, CREATE or transaction-changing commands.
-- Counts are a live snapshot, not proof that an unlinked row is safe to delete.
-- Do NOT export any id, token, phone number, nickname, PIN, hash or image data.
-- Validated by actual READ-ONLY SELECT against BINPC2 on 2026-10-13.

-- 1) Private table record counts classified only by current profile ID reference.
-- NULL relationship means UNKNOWN: room history, legacy audit and aggregate history
-- are not sorted into deletion candidates by this query.
WITH current_profiles AS (
 SELECT data->>'id' AS profile_id
 FROM public.app_kv_rows WHERE table_name = 'profiles'
), relations AS (
 SELECT k.table_name,
 CASE k.table_name
 WHEN 'device_secrets' THEN EXISTS (SELECT 1 FROM current_profiles p WHERE p.profile_id = k.data->>'user_id')
 WHEN 'push_subscriptions' THEN EXISTS (SELECT 1 FROM current_profiles p WHERE p.profile_id = k.data->>'user_id')
 WHEN 'profile_views' THEN EXISTS (SELECT 1 FROM current_profiles p WHERE p.profile_id = k.data->>'viewer_id' OR p.profile_id = k.data->>'viewed_id')
 WHEN 'heart_balances' THEN EXISTS (SELECT 1 FROM current_profiles p WHERE p.profile_id = k.data->>'id')
 WHEN 'chat_reads' THEN EXISTS (SELECT 1 FROM current_profiles p WHERE p.profile_id = k.data->>'reader_id')
 WHEN 'user_signals' THEN EXISTS (SELECT 1 FROM current_profiles p WHERE p.profile_id = k.data->>'user_id')
 WHEN 'blocked_users' THEN EXISTS (SELECT 1 FROM current_profiles p WHERE p.profile_id = k.data->>'user_id' OR p.profile_id = k.data->>'target_id')
 WHEN 'group_participants' THEN EXISTS (SELECT 1 FROM current_profiles p WHERE p.profile_id = k.data->>'user_id')
 ELSE NULL
 END AS active_profile_reference
 FROM public.app_kv_rows k WHERE k.table_name IN
 ('device_secrets','push_subscriptions','profile_views','heart_balances',
  'chat_reads','user_signals','blocked_users','group_participants',
  'group_chats','session_history','event_anonymous_archives',
  'event_sales_reports','audit_log')
)
SELECT table_name,
 count(*)::int AS total_rows,
 count(*) FILTER (WHERE active_profile_reference IS TRUE)::int AS linked_to_current,
 count(*) FILTER (WHERE active_profile_reference IS FALSE)::int AS not_directly_linked,
 count(*) FILTER (WHERE active_profile_reference IS NULL)::int AS not_classified
FROM relations
GROUP BY table_name
ORDER BY total_rows DESC, table_name;

-- 2) Storage sizing metadata only. Does NOT read/download actual photos.
SELECT
 pg_database_size(current_database())::bigint AS full_database_bytes,
 pg_total_relation_size('public.app_kv_rows')::bigint AS kv_table_total_bytes,
 pg_total_relation_size('public.app_image_store')::bigint AS image_table_total_bytes,
 (SELECT COALESCE(sum(octet_length(data_url)),0)::bigint
   FROM public.app_image_store) AS image_data_url_bytes,
 (SELECT count(*)::int FROM public.app_kv_rows WHERE table_name='profiles') AS current_profiles,
 (SELECT count(*)::int FROM public.app_kv_rows WHERE table_name='push_subscriptions') AS push_subscription_rows;

-- 3) Role privileges (raw participant DB rows must NOT be exposed).
SELECT tablename, rolname, can_select, can_insert, can_update, can_delete
FROM (VALUES ('app_kv_rows'::text,'anon'::text),
             ('app_kv_rows','authenticated'),
             ('app_image_store','anon'),
             ('app_image_store','authenticated')) x(tablename,rolname)
CROSS JOIN LATERAL (
 SELECT has_table_privilege(rolname, 'public.'||tablename, 'SELECT') AS can_select,
        has_table_privilege(rolname, 'public.'||tablename, 'INSERT') AS can_insert,
        has_table_privilege(rolname, 'public.'||tablename, 'UPDATE') AS can_update,
        has_table_privilege(rolname, 'public.'||tablename, 'DELETE') AS can_delete
) p ORDER BY tablename,rolname;

-- STOP: The output is an audit to inform policy and backups, not a deletion plan.
-- No DB/image/Secret disposal until owner approves policy, verified encrypted
-- restore point, tested dependency mapping and a reversible isolated test.
