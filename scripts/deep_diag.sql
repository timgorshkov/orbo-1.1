\echo === Indexes on participant_messages ===
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'participant_messages';

\echo === Indexes on activity_events ===
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'activity_events';

\echo === Indexes on participants ===
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'participants';

\echo === Participants count for the org ===
SELECT count(*) FROM participants WHERE org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1' AND participant_status != 'excluded' AND merged_into IS NULL;

\echo === Check pg_stat_statements top 10 slowest (if extension exists) ===
SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') as has_pgss;

\echo === Recent autovacuum on key tables ===
SELECT relname, last_autovacuum, last_autoanalyze, n_live_tup, n_dead_tup, autovacuum_count, autoanalyze_count
FROM pg_stat_user_tables
WHERE relname IN ('participants', 'participant_messages', 'activity_events', 'memberships', 'participant_groups', 'telegram_auth_codes')
ORDER BY relname;

\echo === PostgreSQL settings (work_mem, shared_buffers, etc) ===
SELECT name, setting, unit FROM pg_settings WHERE name IN ('work_mem', 'shared_buffers', 'effective_cache_size', 'max_connections', 'random_page_cost', 'effective_io_concurrency', 'maintenance_work_mem');

\echo === Cache hit ratio ===
SELECT sum(heap_blks_read) as heap_read, sum(heap_blks_hit) as heap_hit, 
  round(sum(heap_blks_hit)::numeric / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0) * 100, 2) as cache_hit_pct
FROM pg_statio_user_tables;
