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
        question: 'Какую роль вы выполняете?',
        type: 'single',
        required: true,
        options: [
          { value: 'owner', label: 'Владелец/создатель сообщества', icon: '👑' },
          { value: 'admin', label: 'Администратор/модератор', icon: '🛡️' },
          { value: 'project_manager', label: 'Менеджер проектов', icon: '📋' },
          { value: 'event_organizer', label: 'Организатор мероприятий', icon: '🎪' },
          { value: 'hr', label: 'HR / внутренние коммуникации', icon: '👥' },
          { value: 'other', label: 'Другое', icon: '✨' },
        ],
      },
      {
        id: 'community_type',
        question: 'Какой тип сообщества вы ведёте?',
        type: 'single',
        required: true,
        options: [
          { value: 'professional', label: 'Профессиональное (IT, маркетинг и т.д.)', icon: '💼' },
          { value: 'hobby', label: 'Клуб по интересам / хобби', icon: '🎨' },
          { value: 'education', label: 'Образовательный проект / курсы', icon: '📚' },
          { value: 'client_chats', label: 'Рабочие чаты с клиентами', icon: '💬' },
          { value: 'business_club', label: 'Бизнес-клуб / платное сообщество', icon: '💎' },
          { value: 'internal', label: 'Внутренние коммуникации компании', icon: '🏢' },
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
        id: 'groups_count',
        question: 'Сколько групп/чатов вы ведёте?',
        type: 'single',
        required: true,
        options: [
          { value: '1-2', label: '1-2 группы', icon: '1️⃣' },
          { value: '3-5', label: '3-5 групп', icon: '🔢' },
          { value: '6-10', label: '6-10 групп', icon: '📊' },
          { value: '11-20', label: '11-20 групп', icon: '📈' },
          { value: '20+', label: 'Более 20 групп', icon: '🚀' },
        ],
      },
      {
        id: 'pain_points',
        question: 'Что сейчас доставляет неудобства?',
        type: 'multi',
        maxSelections: 3,
        required: false,
        options: [
          { value: 'missing_messages', label: 'Пропускаю важные сообщения / негатив', icon: '📩' },
          { value: 'inactive_tracking', label: 'Сложно отслеживать неактивных', icon: '👻' },
          { value: 'event_registration', label: 'Нет удобной регистрации на события', icon: '🎟️' },
          { value: 'access_management', label: 'Сложно управлять доступом', icon: '🔐' },
          { value: 'no_crm', label: 'Нет единого профиля участника', icon: '👤' },
          { value: 'scattered_tools', label: 'Разрозненные инструменты', icon: '🔧' },
          { value: 'fear_of_blocking', label: 'Боюсь потерять историю при блокировках', icon: '😰' },
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
    owner: 'Владелец сообщества',
    admin: 'Администратор',
    project_manager: 'Менеджер проектов',
    event_organizer: 'Организатор мероприятий',
    hr: 'HR',
    other: 'Другое',
  },
  community_type: {
    professional: 'Профессиональное',
    hobby: 'Клуб по интересам',
    education: 'Образование',
    client_chats: 'Клиентские чаты',
    business_club: 'Бизнес-клуб',
    internal: 'Внутренние коммуникации',
    other: 'Другое',
  },
  groups_count: {
    '1-2': '1-2',
    '3-5': '3-5',
    '6-10': '6-10',
    '11-20': '11-20',
    '20+': '20+',
  },
  pain_points: {
    missing_messages: 'Пропуск сообщений',
    inactive_tracking: 'Отслеживание неактивных',
    event_registration: 'Регистрация на события',
    access_management: 'Управление доступом',
    no_crm: 'Нет CRM',
    scattered_tools: 'Разрозненные инструменты',
    fear_of_blocking: 'Страх блокировок',
  },
};

