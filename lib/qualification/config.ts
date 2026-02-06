// Qualification Form Configuration
// This config can be easily updated to change questions without code changes

export const QUALIFICATION_FORM_VERSION = 'v1';

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
    title: 'Расскажите о себе',
    subtitle: 'Это поможет нам настроить платформу под ваши задачи',
    questions: [
      {
        id: 'role',
        question: 'Какова ваша роль?',
        type: 'single',
        required: true,
        options: [
          { value: 'owner', label: 'Владелец / основатель', icon: '👑' },
          { value: 'community_manager', label: 'Комьюнити-менеджер', icon: '🎯' },
          { value: 'event_organizer', label: 'Организатор мероприятий', icon: '🎪' },
          { value: 'marketer', label: 'Маркетолог', icon: '📣' },
          { value: 'tech_partner', label: 'Технический партнёр / интегратор', icon: '⚙️' },
          { value: 'other', label: 'Другое', icon: '✨' },
        ],
      },
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
          { value: 'other', label: 'Другое', icon: '🌐' },
        ],
      },
    ],
  },
  {
    id: 'step2',
    title: 'Масштаб и задачи',
    subtitle: 'Поможет подобрать нужные инструменты',
    questions: [
      {
        id: 'team_size',
        question: 'Сколько человек управляет сообществом?',
        type: 'single',
        required: true,
        options: [
          { value: 'solo', label: 'Я один(а)', icon: '👤' },
          { value: '2-3', label: '2–3 человека', icon: '👥' },
          { value: '4-10', label: 'Небольшая команда (4–10)', icon: '👨‍👩‍👧‍👦' },
          { value: '10+', label: 'Команда больше 10', icon: '🏢' },
        ],
      },
      {
        id: 'pain_points',
        question: 'Что сейчас доставляет неудобства?',
        type: 'multi',
        maxSelections: 3,
        required: false,
        options: [
          { value: 'low_attendance', label: 'Люди не доходят до событий', icon: '📉' },
          { value: 'manual_applications', label: 'Ручная обработка заявок, спам', icon: '🤖' },
          { value: 'no_subscriber_data', label: 'Не знаю своих подписчиков', icon: '👤' },
          { value: 'event_registration', label: 'Регистрации и сбор оплат на события', icon: '🎟️' },
          { value: 'no_crm', label: 'Нет единого профиля участника', icon: '📇' },
          { value: 'missing_messages', label: 'Пропускаю важные сообщения', icon: '📩' },
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
    // Legacy values for backward compatibility
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
    // Legacy values for backward compatibility
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
  // Legacy - for backward compatibility
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
    // Legacy values for backward compatibility
    inactive_tracking: 'Отслеживание неактивных',
    access_management: 'Управление доступом',
    fear_of_blocking: 'Страх блокировок',
  },
};

