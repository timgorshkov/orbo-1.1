-- Migration 140: Remove unused tables and related objects
-- Date: Dec 10, 2025
-- Purpose: Clean up tables that were created but never used in production

-- ============================================================================
-- PART 1: Drop app_item_* tables (ORBO Apps - never implemented)
-- ============================================================================

DROP TABLE IF EXISTS public.app_item_reactions CASCADE;
DROP TABLE IF EXISTS public.app_item_comments CASCADE;

DO $$ BEGIN 
  RAISE NOTICE 'Part 1 Complete: Dropped app_item_comments and app_item_reactions.';
END $$;

-- ============================================================================
-- PART 2: Drop integration_* tables (integrations feature - no UI)
-- ============================================================================

-- Drop in correct order due to foreign keys
DROP TABLE IF EXISTS public.integration_job_logs CASCADE;
DROP TABLE IF EXISTS public.integration_jobs CASCADE;
DROP TABLE IF EXISTS public.integration_connections CASCADE;
DROP TABLE IF EXISTS public.integration_connectors CASCADE;

DO $$ BEGIN 
  RAISE NOTICE 'Part 2 Complete: Dropped integration_* tables (4 tables).';
END $$;

-- ============================================================================
-- PART 3: Drop material_page_* auxiliary tables (no history/locking UI)
-- ============================================================================

DROP TABLE IF EXISTS public.material_page_locks CASCADE;
DROP TABLE IF EXISTS public.material_page_history CASCADE;

DO $$ BEGIN 
  RAISE NOTICE 'Part 3 Complete: Dropped material_page_history and material_page_locks.';
END $$;

-- ============================================================================
-- SUMMARY
-- ============================================================================

DO $$ BEGIN 
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 140 Complete: Removed 8 unused tables';
  RAISE NOTICE '- app_item_comments';
  RAISE NOTICE '- app_item_reactions';
  RAISE NOTICE '- integration_connectors';
  RAISE NOTICE '- integration_connections';
  RAISE NOTICE '- integration_jobs';
  RAISE NOTICE '- integration_job_logs';
  RAISE NOTICE '- material_page_history';
  RAISE NOTICE '- material_page_locks';
  RAISE NOTICE '========================================';
END $$;

