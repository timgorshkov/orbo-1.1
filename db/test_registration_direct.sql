-- Test script to call register_for_event RPC directly
-- This will return actual rows instead of RAISE NOTICE (which Supabase SQL Editor doesn't show)

-- Replace these UUIDs with your actual test values
SELECT 
  'Test Parameters' as stage,
  '135a7206-38e2-4d9b-90c0-e73c7ad054dc'::text as event_id,
  'a2cc0553-e952-41ea-8a18-9d93b6b92d97'::text as participant_id,
  1 as quantity,
  null::text as error

UNION ALL

-- Try to call the RPC function
SELECT 
  'RPC Result' as stage,
  registration_event_id::text as event_id,
  registration_participant_id::text as participant_id,
  registration_quantity as quantity,
  null::text as error
FROM register_for_event(
  '135a7206-38e2-4d9b-90c0-e73c7ad054dc'::uuid,
  'a2cc0553-e952-41ea-8a18-9d93b6b92d97'::uuid,
  '{}'::jsonb,
  1
);

