-- Проверка старой системы материалов
-- Выполните этот скрипт в Supabase SQL Editor

-- =====================================================
-- Проверка наличия данных в старых таблицах материалов
-- =====================================================

DO $$
DECLARE
  folders_count INTEGER := 0;
  items_count INTEGER := 0;
  access_count INTEGER := 0;
  folders_exists BOOLEAN;
  items_exists BOOLEAN;
  access_exists BOOLEAN;
BEGIN
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'ПРОВЕРКА СТАРОЙ СИСТЕМЫ МАТЕРИАЛОВ';
  RAISE NOTICE '==============================================';
  
  -- Проверка существования таблиц
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'material_folders'
  ) INTO folders_exists;
  
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'material_items'
  ) INTO items_exists;
  
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'material_access'
  ) INTO access_exists;
  
  -- Подсчет записей
  IF folders_exists THEN
    SELECT COUNT(*) INTO folders_count FROM material_folders;
  END IF;
  
  IF items_exists THEN
    SELECT COUNT(*) INTO items_count FROM material_items;
  END IF;
  
  IF access_exists THEN
    SELECT COUNT(*) INTO access_count FROM material_access;
  END IF;
  
  -- Вывод результатов
  RAISE NOTICE '';
  RAISE NOTICE 'Результаты проверки:';
  RAISE NOTICE '  material_folders: % (существует: %)', folders_count, folders_exists;
  RAISE NOTICE '  material_items: % (существует: %)', items_count, items_exists;
  RAISE NOTICE '  material_access: % (существует: %)', access_count, access_exists;
  RAISE NOTICE '';
  
  -- Рекомендации
  IF (folders_count = 0 AND items_count = 0 AND access_count = 0) THEN
    RAISE NOTICE '✅ РЕКОМЕНДАЦИЯ: Все старые таблицы пусты';
    RAISE NOTICE '   Можно безопасно удалить:';
    RAISE NOTICE '   DROP TABLE IF EXISTS material_access CASCADE;';
    RAISE NOTICE '   DROP TABLE IF EXISTS material_items CASCADE;';
    RAISE NOTICE '   DROP TABLE IF EXISTS material_folders CASCADE;';
  ELSE
    RAISE WARNING '⚠️  ВНИМАНИЕ: Обнаружены данные в старых таблицах!';
    RAISE WARNING '   Требуется миграция на material_pages';
    RAISE WARNING '   НЕ удаляйте таблицы без миграции данных!';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '==============================================';
END $$;

-- =====================================================
-- Проверка новой системы материалов
-- =====================================================

DO $$
DECLARE
  pages_count INTEGER;
  pages_exists BOOLEAN;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE 'ПРОВЕРКА НОВОЙ СИСТЕМЫ МАТЕРИАЛОВ';
  RAISE NOTICE '==============================================';
  
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'material_pages'
  ) INTO pages_exists;
  
  IF pages_exists THEN
    SELECT COUNT(*) INTO pages_count FROM material_pages;
    RAISE NOTICE '  material_pages: % записей ✅', pages_count;
  ELSE
    RAISE WARNING '  material_pages: таблица не существует ⚠️';
  END IF;
  
  RAISE NOTICE '==============================================';
END $$;

-- =====================================================
-- Детальная информация о старых материалах (если есть)
-- =====================================================

DO $$
DECLARE
  folders_count INTEGER := 0;
  folders_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'material_folders'
  ) INTO folders_exists;
  
  IF folders_exists THEN
    SELECT COUNT(*) INTO folders_count FROM material_folders;
    
    IF folders_count > 0 THEN
      RAISE NOTICE '';
      RAISE NOTICE 'ДЕТАЛИ СТАРЫХ МАТЕРИАЛОВ:';
      RAISE NOTICE '==============================================';
      RAISE NOTICE 'Структура material_folders (первые 5):';
      
      -- Здесь можно добавить SELECT для просмотра данных
      -- Но в DO блоке нельзя делать SELECT с результатами
      -- Используйте отдельный запрос ниже
    END IF;
  END IF;
END $$;

-- Если в material_folders есть данные, выполните этот запрос отдельно:
-- SELECT * FROM material_folders LIMIT 5;
-- SELECT * FROM material_items LIMIT 5;
-- SELECT * FROM material_access LIMIT 5;



