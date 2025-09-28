-- Скрипт для проверки и создания записей в таблице telegram_group_admins

DO $$ 
BEGIN
  -- Проверяем существование таблицы telegram_group_admins
  IF NOT EXISTS (
    SELECT FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'telegram_group_admins'
  ) THEN
    -- Создаем таблицу, если она не существует
    CREATE TABLE public.telegram_group_admins (
      id SERIAL PRIMARY KEY,
      tg_chat_id BIGINT NOT NULL,
      tg_user_id BIGINT NOT NULL,
      user_telegram_account_id INTEGER REFERENCES public.user_telegram_accounts(id),
      is_owner BOOLEAN DEFAULT FALSE,
      is_admin BOOLEAN DEFAULT TRUE,
      can_manage_chat BOOLEAN DEFAULT FALSE,
      can_delete_messages BOOLEAN DEFAULT FALSE,
      can_manage_video_chats BOOLEAN DEFAULT FALSE,
      can_restrict_members BOOLEAN DEFAULT FALSE,
      can_promote_members BOOLEAN DEFAULT FALSE,
      can_change_info BOOLEAN DEFAULT FALSE,
      can_invite_users BOOLEAN DEFAULT FALSE,
      can_pin_messages BOOLEAN DEFAULT FALSE,
      verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(tg_chat_id, tg_user_id)
    );
    
    RAISE NOTICE 'Created table telegram_group_admins';
  END IF;
  
  -- Проверяем наличие записей в таблице
  IF (SELECT COUNT(*) FROM public.telegram_group_admins) = 0 THEN
    -- Таблица пуста, заполняем данными из существующих связей
    
    RAISE NOTICE 'telegram_group_admins table is empty. Adding records from existing connections...';
    
    -- Добавляем записи для всех верифицированных пользователей и их групп
    INSERT INTO public.telegram_group_admins (
      tg_chat_id, 
      tg_user_id, 
      user_telegram_account_id,
      is_owner,
      is_admin,
      can_manage_chat,
      can_delete_messages,
      can_restrict_members,
      can_invite_users,
      can_pin_messages
    )
    SELECT 
      tg.tg_chat_id,
      uta.telegram_user_id,
      uta.id AS user_telegram_account_id,
      TRUE AS is_owner, -- Предполагаем, что пользователь является владельцем
      TRUE AS is_admin,
      TRUE AS can_manage_chat,
      TRUE AS can_delete_messages,
      TRUE AS can_restrict_members,
      TRUE AS can_invite_users,
      TRUE AS can_pin_messages
    FROM 
      public.telegram_groups tg
    JOIN 
      public.user_telegram_accounts uta ON tg.org_id = uta.org_id
    WHERE 
      uta.is_verified = TRUE
      AND tg.bot_status = 'connected'
    ON CONFLICT (tg_chat_id, tg_user_id) DO NOTHING;
    
    RAISE NOTICE 'Added % records to telegram_group_admins', 
      (SELECT COUNT(*) FROM public.telegram_group_admins);
  ELSE
    RAISE NOTICE 'telegram_group_admins table already has % records', 
      (SELECT COUNT(*) FROM public.telegram_group_admins);
  END IF;
  
  -- Обновляем поле verified_by_user_id в telegram_groups, если оно пусто
  UPDATE public.telegram_groups tg
  SET 
    verified_by_user_id = uta.user_id,
    verification_status = 'verified',
    last_verification_at = NOW()
  FROM 
    public.user_telegram_accounts uta
  JOIN 
    public.telegram_group_admins tga ON uta.telegram_user_id = tga.tg_user_id
  WHERE 
    tg.tg_chat_id = tga.tg_chat_id
    AND tg.org_id = uta.org_id
    AND (tg.verified_by_user_id IS NULL OR tg.verification_status IS NULL);
    
  RAISE NOTICE 'Updated verification status for telegram groups';
  
END $$;
