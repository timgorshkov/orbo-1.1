-- Migration 283: licensee identification for physical customers
-- Date: 2026-04-16
-- Purpose:
--   ФИО и email лицензиата-физлица сохраняются на уровне организации. Используются
--   для акта передачи неисключительных прав (АЛ), в т.ч. при выгрузке в Контур.Эльбу.
--   Запрашиваются при первой оплате тарифа и отображаются блоком на странице
--   «Тариф и оплата». Для юрлиц/ИП эти поля не используются — лицензиат равен
--   самой организации (`organizations.name`).

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS licensee_full_name TEXT,
  ADD COLUMN IF NOT EXISTS licensee_email     TEXT;

COMMENT ON COLUMN public.organizations.licensee_full_name IS
  'ФИО физлица-лицензиата (тот, на кого оформляется лицензионный договор на ПО Orbo). '
  'Заполняется при первой оплате тарифа и отображается в блоке «Лицензиат» на странице биллинга. '
  'Для юрлиц/ИП не используется — лицензиат = сама организация.';

COMMENT ON COLUMN public.organizations.licensee_email IS
  'Контактный email лицензиата-физлица. Используется для контакта в акте и в контрагенте Эльбы.';

DO $$ BEGIN RAISE NOTICE 'Migration 283 complete: organizations.licensee_full_name + licensee_email.'; END $$;
