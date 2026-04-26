\echo === QUERY 1: Long running queries ===
SELECT pid, now() - query_start AS duration, state, left(query, 200) FROM pg_stat_activity WHERE datname='orbo' AND state != 'idle' AND now() - query_start > interval '1 second' ORDER BY duration DESC LIMIT 20;

\echo === QUERY 2: Blocked queries (waiting locks) ===
SELECT pid, locktype, mode, granted, left(query, 100) FROM pg_locks LEFT JOIN pg_stat_activity USING (pid) WHERE NOT granted;

\echo === QUERY 3: Bloated tables (dead tuples) ===
SELECT relname, n_live_tup, n_dead_tup, round(100.0*n_dead_tup/NULLIF(n_live_tup+n_dead_tup,0),1) AS dead_pct, last_autovacuum FROM pg_stat_user_tables WHERE n_dead_tup > 1000 ORDER BY n_dead_tup DESC LIMIT 15;

\echo === QUERY 4: Connection count ===
SELECT count(*), state FROM pg_stat_activity WHERE datname='orbo' GROUP BY state;

\echo === QUERY 5: Table sizes ===
SELECT relname, pg_size_pretty(pg_total_relation_size(C.oid)) AS total, pg_size_pretty(pg_relation_size(C.oid)) AS data FROM pg_class C LEFT JOIN pg_namespace N ON N.oid=C.relnamespace WHERE nspname='public' AND relkind='r' ORDER BY pg_total_relation_size(C.oid) DESC LIMIT 15;
