-- ПОЛИТИКИ ДОСТУПА ДЛЯ STORAGE BUCKET
-- Важно: Перед выполнением этого скрипта необходимо создать bucket "materials" в Supabase Storage
-- через Dashboard или API

-- Включаем RLS для bucket materials
BEGIN;

-- Удаляем все существующие политики (если такие есть)
DROP POLICY IF EXISTS "Allow authenticated users to read materials bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow members to upload to their organization's folder" ON storage.objects;
DROP POLICY IF EXISTS "Allow owners and admins to update materials" ON storage.objects;
DROP POLICY IF EXISTS "Allow owners and admins to delete materials" ON storage.objects;

-- Создаем политики для чтения
-- Пользователи могут читать файлы из bucket materials только если они имеют доступ к соответствующей организации
CREATE POLICY "Allow authenticated users to read materials bucket"
ON storage.objects FOR SELECT
USING (
  -- Проверяем, что файл находится в bucket materials
  (bucket_id = 'materials') 
  AND
  -- Извлекаем org_id из пути файла (формат: materials/{org_id}/...)
  EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE 
      -- Извлечение org_id из пути файла (materials/{org_id}/...)
      user_id = auth.uid() AND 
      org_id::text = (string_to_array(storage.objects.name, '/') )[2]
  )
);

-- Создаем политики для создания файлов
-- Пользователи с ролью member и выше могут загружать файлы в свою организацию
CREATE POLICY "Allow members to upload to their organization's folder"
ON storage.objects FOR INSERT
WITH CHECK (
  -- Проверяем, что файл загружается в bucket materials
  (bucket_id = 'materials') 
  AND
  -- Извлекаем org_id из пути файла (формат: materials/{org_id}/...)
  EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE 
      user_id = auth.uid() AND 
      role IN ('owner', 'admin', 'member') AND
      org_id::text = (string_to_array(storage.objects.name, '/') )[2]
  )
);

-- Создаем политики для обновления файлов
-- Только владельцы и админы могут обновлять файлы
CREATE POLICY "Allow owners and admins to update materials"
ON storage.objects FOR UPDATE
USING (
  -- Проверяем, что файл находится в bucket materials
  (bucket_id = 'materials') 
  AND
  -- Извлекаем org_id из пути файла (формат: materials/{org_id}/...)
  EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE 
      user_id = auth.uid() AND 
      role IN ('owner', 'admin') AND
      org_id::text = (string_to_array(storage.objects.name, '/') )[2]
  )
);

-- Создаем политики для удаления файлов
-- Только владельцы и админы могут удалять файлы
CREATE POLICY "Allow owners and admins to delete materials"
ON storage.objects FOR DELETE
USING (
  -- Проверяем, что файл находится в bucket materials
  (bucket_id = 'materials') 
  AND
  -- Извлекаем org_id из пути файла (формат: materials/{org_id}/...)
  EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE 
      user_id = auth.uid() AND 
      role IN ('owner', 'admin') AND
      org_id::text = (string_to_array(storage.objects.name, '/') )[2]
  )
);

COMMIT;

-- Проверьте, что все политики успешно применены, выполнив:
-- SELECT * FROM pg_policies WHERE tablename = 'objects';
