/**
 * Action and Resource descriptions for Audit Log UI
 * 
 * This file is safe to import in client components.
 * It contains only static data without any server-side dependencies.
 */

/**
 * Action descriptions in Russian (for UI)
 */
export const ActionDescriptions: Record<string, string> = {
  // Participants
  update_participant: 'Редактирование профиля участника',
  delete_participant: 'Удаление участника',
  merge_participants: 'Объединение участников',
  enrich_participant: 'AI-анализ участника',
  sync_participant_photo: 'Синхронизация фото участника',
  
  // Events
  create_event: 'Создание события',
  update_event: 'Редактирование события',
  delete_event: 'Удаление события',
  publish_event_tg: 'Публикация события в Telegram',
  update_registration: 'Редактирование регистрации',
  cancel_registration: 'Отмена регистрации',
  add_participant_to_event: 'Добавление участника на событие',
  update_payment_status: 'Изменение статуса оплаты',
  
  // Telegram
  add_telegram_group: 'Добавление Telegram-группы',
  remove_telegram_group: 'Удаление Telegram-группы',
  sync_telegram_group: 'Синхронизация Telegram-группы',
  bot_status_changed: 'Изменение статуса бота в группе',
  
  // Import
  import_telegram_history: 'Импорт истории из Telegram',
  import_whatsapp_history: 'Импорт истории из WhatsApp',
  
  // Digest
  send_test_digest: 'Отправка тестового дайджеста',
  update_digest_settings: 'Изменение настроек дайджеста',
  
  // Organization
  create_organization: 'Создание организации',
  update_org_settings: 'Изменение настроек организации',
  update_org_profile: 'Обновление профиля организации',
  create_invite: 'Создание приглашения',
  add_team_member: 'Добавление члена команды',
  
  // Announcements
  create_announcement: 'Создание анонса',
  send_announcement: 'Отправка анонса в группы',
  
  // Applications
  create_pipeline: 'Создание воронки заявок',
  create_application_form: 'Создание формы заявки',
  move_application_stage: 'Перемещение заявки по воронке',
  
  // Telegram channels
  connect_channel: 'Подключение Telegram-канала',
  
  // AI
  ai_community_insights: 'AI-анализ участников (дашборд)',
  
  // Errors
  resolve_error: 'Разрешение ошибки',
  
  // Apps
  create_app: 'Создание приложения',
  update_app: 'Редактирование приложения',
  delete_app: 'Удаление приложения',
  moderate_item: 'Модерация элемента',
  
  // Payments
  create_payment: 'Создание платежа',
  update_payment: 'Обновление платежа',
  create_subscription: 'Создание подписки',
  update_subscription: 'Обновление подписки',
  cancel_subscription: 'Отмена подписки',
  create_payment_method: 'Добавление способа оплаты',
  update_payment_method: 'Изменение способа оплаты',
  delete_payment_method: 'Удаление способа оплаты',
};

/**
 * Resource type descriptions in Russian (for UI)
 */
export const ResourceDescriptions: Record<string, string> = {
  participant: 'Участник',
  event: 'Событие',
  event_registration: 'Регистрация',
  event_payment: 'Оплата события',
  telegram_group: 'Telegram-группа',
  import: 'Импорт',
  digest: 'Дайджест',
  organization: 'Организация',
  invite: 'Приглашение',
  team_member: 'Команда',
  announcement: 'Анонс',
  pipeline: 'Воронка заявок',
  application_form: 'Форма заявки',
  application: 'Заявка',
  channel: 'Telegram-канал',
  ai_insights: 'AI-анализ',
  error: 'Ошибка',
  app: 'Приложение',
  app_item: 'Элемент приложения',
  payment: 'Платёж',
  subscription: 'Подписка',
  payment_method: 'Способ оплаты',
};

/**
 * Get action description in Russian
 */
export function getActionDescription(action: string): string {
  return ActionDescriptions[action] || action.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Get resource description in Russian
 */
export function getResourceDescription(resource: string): string {
  return ResourceDescriptions[resource] || resource.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

