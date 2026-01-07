-- Migration: Cleanup unused Supabase roles
-- Description: Revoke privileges and drop unused Supabase roles (anon, authenticated, service_role)
-- 
-- ⚠️ IMPORTANT: Run this migration ONLY after confirming the application works without Supabase
-- This migration removes legacy Supabase roles that are no longer needed after PostgreSQL migration
--
-- Author: Security Audit
-- Date: 2026-01-07

-- =====================================================
-- Step 1: Revoke privileges from 'anon' role
-- =====================================================
DO $$
BEGIN
    -- Revoke all privileges on all functions in public schema
    EXECUTE (
        SELECT string_agg('REVOKE ALL ON FUNCTION ' || oid::regprocedure || ' FROM anon;', E'\n')
        FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace
        AND has_function_privilege('anon', oid, 'EXECUTE')
    );
    
    -- Revoke schema usage
    REVOKE ALL ON SCHEMA public FROM anon;
    
    RAISE NOTICE 'Privileges revoked from anon role';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error revoking anon privileges: %', SQLERRM;
END $$;

-- =====================================================
-- Step 2: Revoke privileges from 'authenticated' role
-- =====================================================
DO $$
BEGIN
    EXECUTE (
        SELECT string_agg('REVOKE ALL ON FUNCTION ' || oid::regprocedure || ' FROM authenticated;', E'\n')
        FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace
        AND has_function_privilege('authenticated', oid, 'EXECUTE')
    );
    
    REVOKE ALL ON SCHEMA public FROM authenticated;
    
    RAISE NOTICE 'Privileges revoked from authenticated role';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error revoking authenticated privileges: %', SQLERRM;
END $$;

-- =====================================================
-- Step 3: Revoke privileges from 'service_role' role
-- =====================================================
DO $$
BEGIN
    EXECUTE (
        SELECT string_agg('REVOKE ALL ON FUNCTION ' || oid::regprocedure || ' FROM service_role;', E'\n')
        FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace
        AND has_function_privilege('service_role', oid, 'EXECUTE')
    );
    
    REVOKE ALL ON SCHEMA public FROM service_role;
    
    RAISE NOTICE 'Privileges revoked from service_role role';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error revoking service_role privileges: %', SQLERRM;
END $$;

-- =====================================================
-- Step 4: Drop the roles (if no remaining dependencies)
-- =====================================================
DO $$
BEGIN
    -- Try to drop anon
    BEGIN
        DROP ROLE IF EXISTS anon;
        RAISE NOTICE 'Role anon dropped successfully';
    EXCEPTION
        WHEN dependent_objects_still_exist THEN
            RAISE NOTICE 'Role anon still has dependencies, skipping';
    END;
    
    -- Try to drop authenticated
    BEGIN
        DROP ROLE IF EXISTS authenticated;
        RAISE NOTICE 'Role authenticated dropped successfully';
    EXCEPTION
        WHEN dependent_objects_still_exist THEN
            RAISE NOTICE 'Role authenticated still has dependencies, skipping';
    END;
    
    -- Try to drop service_role
    BEGIN
        DROP ROLE IF EXISTS service_role;
        RAISE NOTICE 'Role service_role dropped successfully';
    EXCEPTION
        WHEN dependent_objects_still_exist THEN
            RAISE NOTICE 'Role service_role still has dependencies, skipping';
    END;
    
    -- Try to drop supabase_admin (if exists)
    BEGIN
        DROP ROLE IF EXISTS supabase_admin;
        RAISE NOTICE 'Role supabase_admin dropped successfully';
    EXCEPTION
        WHEN dependent_objects_still_exist THEN
            RAISE NOTICE 'Role supabase_admin still has dependencies, skipping';
    END;
END $$;

-- =====================================================
-- Verification: List remaining Supabase-related roles
-- =====================================================
SELECT rolname, rolsuper, rolcreaterole, rolcreatedb 
FROM pg_roles 
WHERE rolname IN ('anon', 'authenticated', 'service_role', 'authenticator', 'supabase_admin');

-- =====================================================
-- Note: If roles still exist after this migration,
-- they have dependencies that need manual review.
-- Check with:
--   SELECT * FROM pg_depend WHERE refobjid = (SELECT oid FROM pg_roles WHERE rolname = 'anon');
-- =====================================================

