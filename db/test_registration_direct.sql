-- Test script to call register_for_event RPC directly and see detailed logs
-- This will help us understand if the problem is in the RPC function itself
-- or in how it's being called from the API

-- Replace these UUIDs with your actual test values
DO $$
DECLARE
  test_event_id UUID := '135a7206-38e2-4d9b-90c0-e73c7ad054dc';
  test_participant_id UUID := 'a2cc0553-e952-41ea-8a18-9d93b6b92d97';
  test_registration_data JSONB := '{}'::jsonb;
  test_quantity INTEGER := 1;
  result RECORD;
BEGIN
  RAISE NOTICE '=== STARTING DIRECT RPC TEST ===';
  RAISE NOTICE 'Event ID: %', test_event_id;
  RAISE NOTICE 'Participant ID: %', test_participant_id;
  RAISE NOTICE 'Quantity: %', test_quantity;
  
  -- Call the RPC function
  SELECT * INTO result
  FROM register_for_event(
    test_event_id,
    test_participant_id,
    test_registration_data,
    test_quantity
  );
  
  RAISE NOTICE '=== RPC CALL SUCCESSFUL ===';
  RAISE NOTICE 'Registration ID: %', result.registration_id;
  RAISE NOTICE 'Status: %', result.registration_status;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '=== RPC CALL FAILED ===';
    RAISE NOTICE 'Error: %', SQLERRM;
    RAISE NOTICE 'Error Code: %', SQLSTATE;
    RAISE NOTICE 'Error Detail: %', PG_EXCEPTION_DETAIL;
    RAISE NOTICE 'Error Hint: %', PG_EXCEPTION_HINT;
    RAISE NOTICE 'Error Context: %', PG_EXCEPTION_CONTEXT;
END $$;

