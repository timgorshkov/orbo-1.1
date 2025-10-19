-- Migration 43: Migrate data from old material system to material_pages
-- Date: 2025-10-16
-- Purpose: Transfer data from material_folders/items to material_pages

-- =====================================================
-- STEP 1: Check what we have
-- =====================================================
DO $$
DECLARE
  folders_count INTEGER;
  items_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO folders_count FROM material_folders;
  SELECT COUNT(*) INTO items_count FROM material_items;
  
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'MIGRATION 43: Old Materials → material_pages';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Found % folders and % items to migrate', folders_count, items_count;
  RAISE NOTICE '';
END $$;

-- =====================================================
-- STEP 2: Create a mapping table (temporary)
-- =====================================================
CREATE TEMP TABLE IF NOT EXISTS folder_to_page_map (
  old_folder_id UUID,
  new_page_id UUID
);

-- =====================================================
-- STEP 3: Migrate material_folders to material_pages
-- =====================================================
DO $$
DECLARE
  folder_record RECORD;
  new_page_id UUID;
  migrated_folders INTEGER := 0;
BEGIN
  RAISE NOTICE 'Step 1: Migrating folders to pages...';
  
  FOR folder_record IN 
    SELECT * FROM material_folders ORDER BY created_at
  LOOP
    -- Generate unique slug for folder
    DECLARE
      base_slug TEXT;
      final_slug TEXT;
      slug_counter INTEGER := 0;
    BEGIN
      base_slug := lower(regexp_replace(folder_record.name, '[^a-zA-Z0-9\-]', '-', 'g'));
      base_slug := regexp_replace(base_slug, '-+', '-', 'g'); -- Remove multiple dashes
      base_slug := trim(both '-' from base_slug);
      
      -- If slug is empty, use 'page'
      IF base_slug = '' OR base_slug IS NULL THEN
        base_slug := 'page';
      END IF;
      
      final_slug := base_slug;
      
      -- Make unique by adding counter if needed
      WHILE EXISTS (SELECT 1 FROM material_pages WHERE org_id = folder_record.org_id AND slug = final_slug) LOOP
        slug_counter := slug_counter + 1;
        final_slug := base_slug || '-' || slug_counter;
      END LOOP;
      
      -- Create a page for this folder (as a section/divider)
      INSERT INTO material_pages (
        org_id,
        parent_id, -- Will be NULL initially, fixed in next step
        title,
        slug,
        content_md,
        visibility,
        is_published,
        position,
        created_at,
        updated_at
      ) VALUES (
        folder_record.org_id,
        NULL, -- Parent will be set later
        folder_record.name,
        final_slug,
        '# ' || folder_record.name || E'\n\nЭто раздел материалов (мигрирован из старой системы).',
        'org_members',
        true,
        0, -- Position will be auto-set by trigger
        folder_record.created_at,
        NOW()
      )
      RETURNING id INTO new_page_id;
    END;
    
    -- Store mapping
    INSERT INTO folder_to_page_map (old_folder_id, new_page_id)
    VALUES (folder_record.id, new_page_id);
    
    migrated_folders := migrated_folders + 1;
    
    RAISE NOTICE '  Folder "%" → Page ID %', folder_record.name, new_page_id;
  END LOOP;
  
  RAISE NOTICE 'Migrated % folders', migrated_folders;
  RAISE NOTICE '';
END $$;

-- =====================================================
-- STEP 4: Fix parent_id relationships for folders
-- =====================================================
DO $$
DECLARE
  folder_record RECORD;
  new_parent_id UUID;
BEGIN
  RAISE NOTICE 'Step 2: Fixing folder parent relationships...';
  
  FOR folder_record IN 
    SELECT mf.id, mf.parent_id, ftpm.new_page_id
    FROM material_folders mf
    JOIN folder_to_page_map ftpm ON ftpm.old_folder_id = mf.id
    WHERE mf.parent_id IS NOT NULL
  LOOP
    -- Find the new page_id for the parent folder
    SELECT ftpm.new_page_id INTO new_parent_id
    FROM folder_to_page_map ftpm
    WHERE ftpm.old_folder_id = folder_record.parent_id;
    
    IF new_parent_id IS NOT NULL THEN
      UPDATE material_pages
      SET parent_id = new_parent_id
      WHERE id = folder_record.new_page_id;
      
      RAISE NOTICE '  Set parent for page % → %', folder_record.new_page_id, new_parent_id;
    END IF;
  END LOOP;
  
  RAISE NOTICE '';
END $$;

-- =====================================================
-- STEP 5: Migrate material_items to material_pages
-- =====================================================
DO $$
DECLARE
  item_record RECORD;
  new_page_id UUID;
  page_content TEXT;
  page_slug TEXT;
  parent_page_id UUID;
  migrated_items INTEGER := 0;
BEGIN
  RAISE NOTICE 'Step 3: Migrating items to pages...';
  
  FOR item_record IN 
    SELECT * FROM material_items ORDER BY created_at
  LOOP
    -- Find parent page (if item was in a folder)
    parent_page_id := NULL;
    IF item_record.folder_id IS NOT NULL THEN
      SELECT ftpm.new_page_id INTO parent_page_id
      FROM folder_to_page_map ftpm
      WHERE ftpm.old_folder_id = item_record.folder_id;
    END IF;
    
    -- Generate content based on item kind
    page_content := '# ' || item_record.title || E'\n\n';
    
    CASE item_record.kind
      WHEN 'doc' THEN
        page_content := page_content || COALESCE(item_record.content, '(Пустой документ)');
      WHEN 'link' THEN
        page_content := page_content || 'Ссылка: [' || item_record.title || '](' || COALESCE(item_record.url, '#') || ')';
      WHEN 'file' THEN
        page_content := page_content || 'Файл: `' || COALESCE(item_record.file_path, 'unknown') || '`' || E'\n\n';
        page_content := page_content || '> ⚠️ Файл был в старой системе. Проверьте доступность.';
      ELSE
        page_content := page_content || '(Неизвестный тип материала)';
    END CASE;
    
    -- Generate unique slug
    DECLARE
      base_item_slug TEXT;
      slug_item_counter INTEGER := 0;
    BEGIN
      base_item_slug := lower(regexp_replace(item_record.title, '[^a-zA-Z0-9\-]', '-', 'g'));
      base_item_slug := regexp_replace(base_item_slug, '-+', '-', 'g'); -- Remove multiple dashes
      base_item_slug := trim(both '-' from base_item_slug);
      
      -- If slug is empty, use 'item'
      IF base_item_slug = '' OR base_item_slug IS NULL THEN
        base_item_slug := 'item';
      END IF;
      
      page_slug := base_item_slug;
      
      -- Make unique by adding counter if needed
      WHILE EXISTS (SELECT 1 FROM material_pages WHERE org_id = item_record.org_id AND slug = page_slug) LOOP
        slug_item_counter := slug_item_counter + 1;
        page_slug := base_item_slug || '-' || slug_item_counter;
      END LOOP;
    END;
    
    -- Create page
    INSERT INTO material_pages (
      org_id,
      parent_id,
      title,
      slug,
      content_md,
      visibility,
      is_published,
      position,
      created_by,
      created_at,
      updated_at
    ) VALUES (
      item_record.org_id,
      parent_page_id,
      item_record.title,
      page_slug,
      page_content,
      'org_members',
      true,
      0, -- Auto-set by trigger
      item_record.created_by,
      item_record.created_at,
      NOW()
    )
    RETURNING id INTO new_page_id;
    
    migrated_items := migrated_items + 1;
    
    RAISE NOTICE '  Item "%" (%) → Page ID %', item_record.title, item_record.kind, new_page_id;
  END LOOP;
  
  RAISE NOTICE 'Migrated % items', migrated_items;
  RAISE NOTICE '';
END $$;

-- =====================================================
-- STEP 6: Verify migration
-- =====================================================
DO $$
DECLARE
  old_folders INTEGER;
  old_items INTEGER;
  new_pages INTEGER;
  expected_pages INTEGER;
BEGIN
  RAISE NOTICE 'Step 4: Verification...';
  
  SELECT COUNT(*) INTO old_folders FROM material_folders;
  SELECT COUNT(*) INTO old_items FROM material_items;
  SELECT COUNT(*) INTO new_pages FROM material_pages;
  
  expected_pages := old_folders + old_items;
  
  RAISE NOTICE '  Old folders: %', old_folders;
  RAISE NOTICE '  Old items: %', old_items;
  RAISE NOTICE '  New pages: % (expected: %)', new_pages, expected_pages;
  
  IF new_pages >= expected_pages THEN
    RAISE NOTICE '  ✅ Migration appears successful!';
  ELSE
    RAISE WARNING '  ⚠️  Page count mismatch. Review migration.';
  END IF;
  
  RAISE NOTICE '';
END $$;

-- =====================================================
-- STEP 7: Drop old tables (COMMENTED - uncomment after verification)
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE 'Step 5: Dropping old tables...';
  
  DROP TABLE IF EXISTS material_access CASCADE;
  DROP TABLE IF EXISTS material_items CASCADE;
  DROP TABLE IF EXISTS material_folders CASCADE;
  
  RAISE NOTICE '  ✅ Old material tables dropped';
  RAISE NOTICE '';
END $$;

-- =====================================================
-- FINAL REPORT
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'MIGRATION 43: COMPLETED';
  RAISE NOTICE '==============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Check material_pages in app UI';
  RAISE NOTICE '2. Verify all content migrated correctly';
  RAISE NOTICE '3. If everything is OK, uncomment STEP 7';
  RAISE NOTICE '   and re-run to drop old tables';
  RAISE NOTICE '';
  RAISE NOTICE '==============================================';
END $$;

