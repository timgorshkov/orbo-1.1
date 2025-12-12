/**
 * Коды ошибок и их описания для системы мониторинга
 * 
 * Уровни:
 * - error: Критическая ошибка, требует немедленного исправления
 * - warn: Предупреждение, требует анализа паттернов
 * - info: Информационное сообщение
 */

export interface ErrorCodeInfo {
  code: string;
  category: string;
  description: string;
  recommendation: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export const ERROR_CODES: Record<string, ErrorCodeInfo> = {
  // ==========================================
  // АВТОРИЗАЦИЯ И РЕГИСТРАЦИЯ
  // ==========================================
  
  AUTH_EMAIL_LINK_FAILED: {
    code: 'AUTH_EMAIL_LINK_FAILED',
    category: 'Авторизация',
    description: 'Переход по email-ссылке не привёл к успешному входу',
    recommendation: 'Проверить настройки email-доставки, возможно ссылка истекла или была уже использована',
    severity: 'medium'
  },
  
  AUTH_EMAIL_INTERNAL_ERROR: {
    code: 'AUTH_EMAIL_INTERNAL_ERROR',
    category: 'Авторизация',
    description: 'Серверная ошибка при email-авторизации',
    recommendation: 'Срочно проверить логи Supabase Auth, возможно проблема с конфигурацией',
    severity: 'critical'
  },
  
  AUTH_TG_CODE_FAILED: {
    code: 'AUTH_TG_CODE_FAILED',
    category: 'Авторизация',
    description: 'Неверный или истёкший код авторизации Telegram',
    recommendation: 'Если много таких ошибок от одного IP — возможен спам. Если от разных — проверить время жизни кода',
    severity: 'medium'
  },
  
  AUTH_TG_CODE_EXPIRED: {
    code: 'AUTH_TG_CODE_EXPIRED',
    category: 'Авторизация',
    description: 'Код авторизации Telegram истёк',
    recommendation: 'Рассмотреть увеличение времени жизни кода (сейчас 5 минут)',
    severity: 'low'
  },
  
  AUTH_TG_CODE_ERROR: {
    code: 'AUTH_TG_CODE_ERROR',
    category: 'Авторизация',
    description: 'Серверная ошибка при проверке кода Telegram',
    recommendation: 'Срочно исправить! Проверить подключение к базе данных',
    severity: 'critical'
  },
  
  AUTH_TG_GENERATE_ERROR: {
    code: 'AUTH_TG_GENERATE_ERROR',
    category: 'Авторизация',
    description: 'Ошибка генерации кода авторизации Telegram',
    recommendation: 'Проверить работу Telegram бота и доступ к БД',
    severity: 'critical'
  },
  
  AUTH_TG_WIDGET_FAILED: {
    code: 'AUTH_TG_WIDGET_FAILED',
    category: 'Авторизация',
    description: 'Ошибка авторизации через Telegram виджет',
    recommendation: 'Проверить настройки бота и домен в BotFather',
    severity: 'high'
  },
  
  AUTH_TG_WIDGET_ERROR: {
    code: 'AUTH_TG_WIDGET_ERROR',
    category: 'Авторизация',
    description: 'Серверная ошибка при обработке Telegram виджета',
    recommendation: 'Срочно исправить! Проверить TELEGRAM_BOT_TOKEN',
    severity: 'critical'
  },

  // ==========================================
  // TELEGRAM ГРУППЫ
  // ==========================================
  
  TG_GROUP_ADD_INCOMPLETE: {
    code: 'TG_GROUP_ADD_INCOMPLETE',
    category: 'Telegram группы',
    description: 'Добавление группы не завершено пользователем',
    recommendation: 'Проанализировать UX — возможно, процесс слишком сложен',
    severity: 'low'
  },
  
  TG_GROUP_ADD_ERROR: {
    code: 'TG_GROUP_ADD_ERROR',
    category: 'Telegram группы',
    description: 'Серверная ошибка при добавлении группы',
    recommendation: 'Проверить права бота и доступ к Telegram API',
    severity: 'high'
  },
  
  TG_GROUP_SYNC_ERROR: {
    code: 'TG_GROUP_SYNC_ERROR',
    category: 'Telegram группы',
    description: 'Ошибка синхронизации группы с Telegram',
    recommendation: 'Проверить, что бот — админ в группе с правами на чтение',
    severity: 'high'
  },
  
  TG_GROUP_NOT_FOUND: {
    code: 'TG_GROUP_NOT_FOUND',
    category: 'Telegram группы',
    description: 'Telegram группа не найдена в базе',
    recommendation: 'Группа могла быть удалена или бот был исключён',
    severity: 'medium'
  },
  
  TG_BOT_NOT_ADMIN: {
    code: 'TG_BOT_NOT_ADMIN',
    category: 'Telegram группы',
    description: 'Бот не является администратором в группе',
    recommendation: 'Уведомить владельца организации о необходимости дать права боту',
    severity: 'medium'
  },

  // ==========================================
  // WEBHOOK
  // ==========================================
  
  WEBHOOK_PROCESSING_ERROR: {
    code: 'WEBHOOK_PROCESSING_ERROR',
    category: 'Webhook',
    description: 'Ошибка обработки входящего webhook от Telegram',
    recommendation: 'Критично! Проверить логи, возможно изменился формат данных от Telegram',
    severity: 'critical'
  },
  
  WEBHOOK_TIMEOUT: {
    code: 'WEBHOOK_TIMEOUT',
    category: 'Webhook',
    description: 'Таймаут при обработке webhook',
    recommendation: 'Оптимизировать обработку или увеличить timeout. Проверить нагрузку на БД',
    severity: 'high'
  },
  
  WEBHOOK_UNKNOWN_CHAT: {
    code: 'WEBHOOK_UNKNOWN_CHAT',
    category: 'Webhook',
    description: 'Получено сообщение из неизвестной группы',
    recommendation: 'Информационно — группа не добавлена в систему',
    severity: 'low'
  },

  // ==========================================
  // ИМПОРТ ИСТОРИИ
  // ==========================================
  
  IMPORT_INVALID_FORMAT: {
    code: 'IMPORT_INVALID_FORMAT',
    category: 'Импорт истории',
    description: 'Неверный формат файла для импорта',
    recommendation: 'Улучшить инструкции для пользователя. Проверить поддержку форматов',
    severity: 'medium'
  },
  
  IMPORT_FILE_TOO_LARGE: {
    code: 'IMPORT_FILE_TOO_LARGE',
    category: 'Импорт истории',
    description: 'Файл для импорта слишком большой',
    recommendation: 'Рассмотреть увеличение лимита или добавить разбивку на части',
    severity: 'low'
  },
  
  IMPORT_NO_MESSAGES: {
    code: 'IMPORT_NO_MESSAGES',
    category: 'Импорт истории',
    description: 'В файле не найдено сообщений',
    recommendation: 'Проверить парсер. Возможно файл пустой или неверный формат',
    severity: 'medium'
  },
  
  IMPORT_NO_PARTICIPANTS: {
    code: 'IMPORT_NO_PARTICIPANTS',
    category: 'Импорт истории',
    description: 'В файле не найдено участников',
    recommendation: 'Проверить парсер и формат экспорта',
    severity: 'medium'
  },
  
  IMPORT_PARSE_ERROR: {
    code: 'IMPORT_PARSE_ERROR',
    category: 'Импорт истории',
    description: 'Ошибка парсинга файла импорта',
    recommendation: 'Проверить формат файла, возможно новая версия экспорта',
    severity: 'medium'
  },
  
  IMPORT_SERVER_ERROR: {
    code: 'IMPORT_SERVER_ERROR',
    category: 'Импорт истории',
    description: 'Серверная ошибка при импорте',
    recommendation: 'Срочно исправить! Проверить логи и подключение к БД',
    severity: 'critical'
  },
  
  WHATSAPP_IMPORT_PARSE_ERROR: {
    code: 'WHATSAPP_IMPORT_PARSE_ERROR',
    category: 'Импорт WhatsApp',
    description: 'Ошибка парсинга WhatsApp-экспорта',
    recommendation: 'Проверить формат файла. Возможно изменился формат экспорта WhatsApp',
    severity: 'medium'
  },
  
  WHATSAPP_IMPORT_ERROR: {
    code: 'WHATSAPP_IMPORT_ERROR',
    category: 'Импорт WhatsApp',
    description: 'Серверная ошибка при импорте WhatsApp',
    recommendation: 'Срочно исправить! Проверить логи',
    severity: 'critical'
  },

  // ==========================================
  // СОБЫТИЯ
  // ==========================================
  
  EVENT_CREATE_ERROR: {
    code: 'EVENT_CREATE_ERROR',
    category: 'События',
    description: 'Ошибка создания события',
    recommendation: 'Проверить валидацию данных и доступ к БД',
    severity: 'high'
  },
  
  EVENT_REGISTER_ERROR: {
    code: 'EVENT_REGISTER_ERROR',
    category: 'События',
    description: 'Ошибка регистрации на событие',
    recommendation: 'Критично для воронки! Срочно исправить',
    severity: 'critical'
  },
  
  EVENT_REGISTER_DUPLICATE: {
    code: 'EVENT_REGISTER_DUPLICATE',
    category: 'События',
    description: 'Попытка повторной регистрации на событие',
    recommendation: 'Информационно — пользователь уже зарегистрирован',
    severity: 'low'
  },
  
  EVENT_REGISTER_CLOSED: {
    code: 'EVENT_REGISTER_CLOSED',
    category: 'События',
    description: 'Регистрация на событие закрыта',
    recommendation: 'Информационно — событие прошло или достигнут лимит',
    severity: 'low'
  },
  
  EVENT_PUBLISH_TG_ERROR: {
    code: 'EVENT_PUBLISH_TG_ERROR',
    category: 'События',
    description: 'Ошибка публикации события в Telegram',
    recommendation: 'Проверить права бота в группе и формат сообщения',
    severity: 'high'
  },
  
  EVENT_NOTIFY_ERROR: {
    code: 'EVENT_NOTIFY_ERROR',
    category: 'События',
    description: 'Ошибка отправки уведомления о событии',
    recommendation: 'Проверить Telegram API и права бота',
    severity: 'high'
  },
  
  EVENT_COVER_UPLOAD_ERROR: {
    code: 'EVENT_COVER_UPLOAD_ERROR',
    category: 'События',
    description: 'Ошибка загрузки обложки события',
    recommendation: 'Проверить Supabase Storage и лимиты',
    severity: 'medium'
  },
  
  EVENT_PAYMENT_ERROR: {
    code: 'EVENT_PAYMENT_ERROR',
    category: 'События',
    description: 'Ошибка обработки оплаты события',
    recommendation: 'Критично! Немедленно проверить и связаться с участником',
    severity: 'critical'
  },

  // ==========================================
  // CRON JOBS
  // ==========================================
  
  CRON_ROLE_UPDATE_PARTIAL: {
    code: 'CRON_ROLE_UPDATE_PARTIAL',
    category: 'Cron Jobs',
    description: 'Ежедневное обновление ролей участников завершилось с частичными ошибками',
    recommendation: 'Проверить конкретных участников в списке ошибок. Возможно проблема с данными отдельных профилей',
    severity: 'medium'
  },
  
  CRON_ROLE_UPDATE_ERROR: {
    code: 'CRON_ROLE_UPDATE_ERROR',
    category: 'Cron Jobs',
    description: 'Критическая ошибка в ежедневном обновлении ролей участников',
    recommendation: 'Срочно проверить! Cron job не выполнился. Проверить подключение к БД и сервис enrichment',
    severity: 'critical'
  },

  // ==========================================
  // ОБЩИЕ
  // ==========================================
  
  DATABASE_ERROR: {
    code: 'DATABASE_ERROR',
    category: 'Система',
    description: 'Общая ошибка базы данных',
    recommendation: 'Проверить подключение к Supabase и состояние БД',
    severity: 'critical'
  },
  
  UNKNOWN_ERROR: {
    code: 'UNKNOWN_ERROR',
    category: 'Система',
    description: 'Неизвестная ошибка',
    recommendation: 'Проанализировать stack trace для определения причины',
    severity: 'high'
  }
};

/**
 * Получить информацию о коде ошибки
 */
export function getErrorCodeInfo(code: string): ErrorCodeInfo {
  return ERROR_CODES[code] || {
    code,
    category: 'Неизвестно',
    description: 'Неизвестный код ошибки',
    recommendation: 'Добавить описание для этого кода в errorCodes.ts',
    severity: 'medium' as const
  };
}

/**
 * Получить цвет для уровня серьёзности
 */
export function getSeverityColor(severity: ErrorCodeInfo['severity']): string {
  switch (severity) {
    case 'critical': return 'text-red-700 bg-red-100 border-red-300';
    case 'high': return 'text-orange-700 bg-orange-100 border-orange-300';
    case 'medium': return 'text-yellow-700 bg-yellow-100 border-yellow-300';
    case 'low': return 'text-blue-700 bg-blue-100 border-blue-300';
    default: return 'text-neutral-700 bg-neutral-100 border-neutral-300';
  }
}

/**
 * Получить название уровня серьёзности на русском
 */
export function getSeverityLabel(severity: ErrorCodeInfo['severity']): string {
  switch (severity) {
    case 'critical': return 'Критично';
    case 'high': return 'Высокий';
    case 'medium': return 'Средний';
    case 'low': return 'Низкий';
    default: return 'Неизвестно';
  }
}

