-- Check constraints on organizations table
SELECT conname, contype, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'organizations'::regclass;

-- Check indexes
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'organizations';

-- Check triggers
SELECT tgname, proname, tgtype 
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE tgrelid = 'organizations'::regclass;

-- Try to insert and see what happens (will rollback)
BEGIN;
INSERT INTO organizations (name, plan) VALUES ('test_insert_check', 'free') RETURNING id, name, created_at;
ROLLBACK;

