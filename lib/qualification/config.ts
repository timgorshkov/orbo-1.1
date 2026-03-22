// Qualification Form Configuration
// This config can be easily updated to change questions without code changes

export const QUALIFICATION_FORM_VERSION = 'v3';

export interface QualificationOption {
  value: string;
  label: string;
  icon?: string;
}

export interface QualificationQuestion {
  id: string;
  question: string;
  type: 'single' | 'multi';
  maxSelections?: number; // For multi-select
  options: QualificationOption[];
  required?: boolean;
}

export interface QualificationStep {
  id: string;
  title: string;
  subtitle?: string;
  questions: QualificationQuestion[];
}

export const QUALIFICATION_STEPS: QualificationStep[] = [
  {
    id: 'step1',
    title: 'Пара вопросов о вас',
    subtitle: 'Это поможет настроить платформу под ваши задачи',
    questions: [
      {
        id: 'community_type',
        question: 'Какой тип сообщества?',
        type: 'single',
        required: true,
        options: [
          { value: 'business_club', label: 'Бизнес-клуб или закрытое сообщество', icon: '💎' },
          { value: 'professional', label: 'Профессиональное сообщество', icon: '💼' },
          { value: 'education', label: 'Онлайн-школа / образовательный проект', icon: '🎓' },
          { value: 'brand_community', label: 'Бренд с клиентским комьюнити', icon: '🏷️' },
          { value: 'local_hub', label: 'Локальный хаб (коворкинг, апарт, посёлок)', icon: '🏢' },
          { value: 'expert_brand', label: 'Эксперт / личный бренд', icon: '🎤' },
          { value: 'client_chats', label: 'Агентство / рабочие чаты с клиентами', icon: '💬' },
          { value: 'planning', label: 'Ещё нет сообщества, хочу создать', icon: '🚀' },
          { value: 'other', label: 'Другое (личная группа, чат друзей)', icon: '🌐' },
        ],
      },
      {
        id: 'pain_points',
        question: 'Что сейчас доставляет неудобства?',
        type: 'multi',
        maxSelections: 3,
        required: false,
        options: [
          { value: 'telegram_blocking', label: 'Боюсь потерять контакты при блокировке TG', icon: '🔒' },
          { value: 'no_subscriber_data', label: 'Не знаю своих подписчиков', icon: '👤' },
          { value: 'low_attendance', label: 'Люди не доходят до событий', icon: '📉' },
          { value: 'no_crm', label: 'Нет единого профиля участника', icon: '📇' },
          { value: 'event_registration', label: 'Регистрации и сбор оплат на события', icon: '🎟️' },
          { value: 'manual_applications', label: 'Ручная обработка заявок, спам', icon: '🤖' },
          { value: 'missing_messages', label: 'Важные сообщения теряются в чате', icon: '📩' },
          { value: 'scattered_tools', label: 'Разрозненные инструменты', icon: '🔧' },
        ],
      },
    ],
  },
];

// Optional: referral source question (can be added to any step)
export const REFERRAL_QUESTION: QualificationQuestion = {
  id: 'referral_source',
  question: 'Как вы узнали об Orbo?',
  type: 'single',
  required: false,
  options: [
    { value: 'friend', label: 'Рекомендация друга/коллеги', icon: '🤝' },
    { value: 'social', label: 'Социальные сети', icon: '📱' },
    { value: 'search', label: 'Поиск в интернете', icon: '🔍' },
    { value: 'telegram', label: 'Telegram канал/чат', icon: '✈️' },
    { value: 'event', label: 'Мероприятие/конференция', icon: '🎤' },
    { value: 'other', label: 'Другое', icon: '💡' },
  ],
};

// Helper function to get all question IDs
export function getAllQuestionIds(): string[] {
  return QUALIFICATION_STEPS.flatMap(step => 
    step.questions.map(q => q.id)
  );
}

// Helper function to validate responses
export function validateResponses(responses: Record<string, unknown>): {
  valid: boolean;
  missingRequired: string[];
} {
  const missingRequired: string[] = [];
  
  for (const step of QUALIFICATION_STEPS) {
    for (const question of step.questions) {
      if (question.required) {
        const response = responses[question.id];
        if (!response || (Array.isArray(response) && response.length === 0)) {
          missingRequired.push(question.id);
        }
      }
    }
  }
  
  return {
    valid: missingRequired.length === 0,
    missingRequired,
  };
}

// Labels for superadmin display
export const RESPONSE_LABELS: Record<string, Record<string, string>> = {
  role: {
    owner: 'Владелец',
    community_manager: 'Комьюнити-менеджер',
    event_organizer: 'Организатор событий',
    marketer: 'Маркетолог',
    tech_partner: 'Тех. партнёр',
    admin: 'Администратор',
    project_manager: 'Менеджер проектов',
    hr: 'HR',
    other: 'Другое',
  },
  community_type: {
    business_club: 'Бизнес-клуб / закрытое',
    professional: 'Профессиональное',
    education: 'Онлайн-школа',
    brand_community: 'Бренд с комьюнити',
    local_hub: 'Локальный хаб',
    expert_brand: 'Эксперт / личный бренд',
    client_chats: 'Агентство / клиентские чаты',
    planning: 'Планирует создать',
    hobby: 'Клуб по интересам',
    internal: 'Внутренние коммуникации',
    other: 'Другое',
  },
  team_size: {
    'solo': 'Один',
    '2-3': '2–3',
    '4-10': '4–10',
    '10+': '10+',
  },
  groups_count: {
    '1-2': '1-2',
    '3-5': '3-5',
    '6-10': '6-10',
    '11-20': '11-20',
    '20+': '20+',
  },
  pain_points: {
    low_attendance: 'Не доходят до событий',
    manual_applications: 'Ручные заявки',
    no_subscriber_data: 'Не знаю подписчиков',
    event_registration: 'Регистрации и оплаты',
    no_crm: 'Нет CRM',
    missing_messages: 'Пропуск сообщений',
    scattered_tools: 'Разрозненные инструменты',
    inactive_tracking: 'Отслеживание неактивных',
    access_management: 'Управление доступом',
    telegram_blocking: 'Страх блокировки TG',
    fear_of_blocking: 'Страх блокировок',
  },
};
