-- Функция для выполнения произвольного SQL кода
-- Эта функция нужна для запуска миграций через API
-- ВНИМАНИЕ: Использовать только через service_role ключ!

CREATE OR REPLACE FUNCTION exec_sql(sql text) 
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql;
END;
$$;
