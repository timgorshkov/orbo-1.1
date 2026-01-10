'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  ArrowRight, Calendar, CreditCard, MousePointerClick, Users, CalendarPlus,
  Bell, Brain, History, TrendingUp, MessageSquare, AlertTriangle, Eye,
  Megaphone, UserCheck, Zap, CheckCircle, Shield, Clock, DollarSign,
  Mail, Database, Sparkles
} from 'lucide-react';
import { Header, Footer } from '@/components/website';

// Telegram Logo SVG
const TelegramLogo = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="messenger-icon">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
);

// Tab Component for feature sections
interface TabItem {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
  visual: React.ReactNode;
}

function FeatureTabs({ tabs, defaultTab }: { tabs: TabItem[], defaultTab: string }) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const activeContent = tabs.find(t => t.id === activeTab);
  
  return (
    <div className="feature-tabs">
      <div className="feature-tabs__nav">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`feature-tabs__btn ${activeTab === tab.id ? 'feature-tabs__btn--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            <span>{tab.title}</span>
          </button>
        ))}
      </div>
      {activeContent && (
        <div className="feature-tabs__content">
          <div className="feature-tabs__text">
            <h4 className="feature-tabs__title">{activeContent.subtitle}</h4>
            <p className="feature-tabs__description">{activeContent.description}</p>
          </div>
          <div className="feature-tabs__visual">
            {activeContent.visual}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EventsOrganizersPage() {
  // Tabs for "События и Продажи"
  const eventsTabs: TabItem[] = [
    {
      id: 'seamless',
      title: 'В 2 клика',
      subtitle: 'Забудьте про Google-формы',
      description: 'Участник нажимает кнопку в боте, открывается Mini App прямо в мессенджере. Данные (Имя, Фото) подтягиваются автоматически. Без переключения между вкладками, без "остывания" клиента.',
      icon: <MousePointerClick size={18} />,
      visual: (
        <div className="tab-visual tab-visual--phone-app">
          <div className="events-phone-mock">
            <div className="events-phone-mock__header">
              <TelegramLogo />
              <span>Telegram</span>
            </div>
            <div className="events-phone-mock__content">
              <div className="events-phone-mock__form">
                <div className="events-phone-mock__avatar">👤</div>
                <div className="events-phone-mock__field">
                  <span>Имя</span>
                  <strong>Иван Петров</strong>
                </div>
                <div className="events-phone-mock__field">
                  <span>Телефон</span>
                  <strong>+7 999 ***-**-**</strong>
                </div>
                <button className="events-phone-mock__btn">
                  Зарегистрироваться →
                </button>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'payments',
      title: 'Контроль оплат',
      subtitle: 'ORBO убирает ручную сверку',
      description: 'Подключите ЮKassa или другие шлюзы. Бот сам примет оплату и сменит статус участника на «Оплачено». Никаких скриншотов в личке. Никаких "скинь на карту Сбера".',
      icon: <CreditCard size={18} />,
      visual: (
        <div className="tab-visual tab-visual--payments">
          <div className="events-payments-list">
            <div className="events-payment-item events-payment-item--paid">
              <div className="events-payment-avatar">АС</div>
              <div className="events-payment-info">
                <strong>Анна Смирнова</strong>
                <span>5 000 ₽</span>
              </div>
              <div className="events-payment-badge events-payment-badge--green">
                <CheckCircle size={14} /> Оплачено
              </div>
            </div>
            <div className="events-payment-item events-payment-item--paid">
              <div className="events-payment-avatar">ИП</div>
              <div className="events-payment-info">
                <strong>Иван Петров</strong>
                <span>5 000 ₽</span>
              </div>
              <div className="events-payment-badge events-payment-badge--green">
                <CheckCircle size={14} /> Оплачено
              </div>
            </div>
            <div className="events-payment-item events-payment-item--pending">
              <div className="events-payment-avatar">МК</div>
              <div className="events-payment-info">
                <strong>Мария Козлова</strong>
                <span>5 000 ₽</span>
              </div>
              <div className="events-payment-badge events-payment-badge--yellow">
                <Clock size={14} /> Ожидает
              </div>
            </div>
          </div>
          <div className="events-notification-pop">
            <span className="events-notification-badge">🟢</span>
            <div>
              <strong>Новая регистрация</strong>
              <p>Иван П. (+5 000 ₽)</p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'calendar',
      title: 'Календарь событий',
      subtitle: 'Повышайте доходимость',
      description: 'После регистрации участник может в один клик добавить событие в свой Google Calendar или Apple Calendar, чтобы точно не забыть о встрече.',
      icon: <CalendarPlus size={18} />,
      visual: (
        <div className="tab-visual tab-visual--calendar">
          <div className="events-calendar-mock">
            <div className="events-calendar-header">
              <Calendar size={20} />
              <span>Добавить в календарь</span>
            </div>
            <div className="events-calendar-options">
              <button className="events-calendar-option">
                <span className="events-calendar-icon">📅</span>
                Google Calendar
              </button>
              <button className="events-calendar-option">
                <span className="events-calendar-icon">🍎</span>
                Apple Calendar
              </button>
            </div>
            <div className="events-calendar-preview">
              <div className="events-calendar-event">
                <div className="events-calendar-event-marker"></div>
                <div>
                  <strong>Бизнес-завтрак: Инвестиции</strong>
                  <span>25 янв, 10:00 • WeWork Белая Площадь</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    }
  ];
  
  // Tabs for "CRM Участников"
  const crmTabs: TabItem[] = [
    {
      id: 'ai-analysis',
      title: 'AI анализ интересов',
      subtitle: 'Знайте больше о ваших гостях',
      description: 'Накапливая данные, AI анализирует сообщения и формирует портрет участника: что он ищет, что предлагает, в чем эксперт. Это поможет делать персонализированные приглашения.',
      icon: <Brain size={18} />,
      visual: (
        <div className="tab-visual tab-visual--profile">
          <div className="tab-visual__profile-card">
            <div className="tab-visual__profile-header">
              <div className="tab-visual__profile-avatar">ИП</div>
              <div>
                <strong>Иван Петров</strong>
                <span>Предприниматель</span>
              </div>
            </div>
            <div className="tab-visual__profile-tags">
              <span className="tab-visual__tag">📌 Стартапы</span>
              <span className="tab-visual__tag">🔍 Ищет: Инвестора</span>
              <span className="tab-visual__tag">💡 Маркетинг</span>
            </div>
            <div className="tab-visual__profile-insight">
              <strong>AI-инсайт:</strong> Посетил 3 ивента. Активно интересуется инвестициями в стартапы.
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'core-analysis',
      title: 'Аналитика Ядра',
      subtitle: 'Выделите самых лояльных',
      description: 'Система автоматически категоризирует базу: кто ваше «Ядро» (ходит постоянно), кто «Новичок», а кто перестал проявлять активность.',
      icon: <TrendingUp size={18} />,
      visual: (
        <div className="tab-visual tab-visual--analytics">
          <div className="events-analytics-card">
            <div className="events-analytics-header">📊 Сегменты аудитории</div>
            <div className="events-analytics-segments">
              <div className="events-segment events-segment--core">
                <div className="events-segment-bar" style={{ width: '30%' }}></div>
                <div className="events-segment-info">
                  <span className="events-segment-label">🌟 Ядро</span>
                  <span className="events-segment-count">47 чел.</span>
                </div>
              </div>
              <div className="events-segment events-segment--new">
                <div className="events-segment-bar" style={{ width: '45%' }}></div>
                <div className="events-segment-info">
                  <span className="events-segment-label">🆕 Новички</span>
                  <span className="events-segment-count">72 чел.</span>
                </div>
              </div>
              <div className="events-segment events-segment--silent">
                <div className="events-segment-bar" style={{ width: '25%' }}></div>
                <div className="events-segment-info">
                  <span className="events-segment-label">⚪ Молчуны</span>
                  <span className="events-segment-count">38 чел.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'history',
      title: 'История активности',
      subtitle: 'Вся история взаимодействий',
      description: 'Соберите хронологию: какие ивенты посещал человек, как активно общался в чате. Не теряйте «теплых» лидов после завершения мероприятия.',
      icon: <History size={18} />,
      visual: (
        <div className="tab-visual tab-visual--history">
          <div className="events-history-card">
            <div className="events-history-header">
              <div className="tab-visual__profile-avatar">АС</div>
              <span>Анна Смирнова — Активность</span>
            </div>
            <div className="events-history-list">
              <div className="events-history-item">
                <span className="events-history-date">15 янв</span>
                <span className="events-history-event">🎫 Бизнес-завтрак: Инвестиции</span>
              </div>
              <div className="events-history-item">
                <span className="events-history-date">02 дек</span>
                <span className="events-history-event">🎫 Нетворкинг CEO</span>
              </div>
              <div className="events-history-item">
                <span className="events-history-date">18 ноя</span>
                <span className="events-history-event">💬 12 сообщений в чате</span>
              </div>
              <div className="events-history-item">
                <span className="events-history-date">05 окт</span>
                <span className="events-history-event">🎫 Маркетинг 2024</span>
              </div>
            </div>
          </div>
        </div>
      )
    }
  ];
  
  // Tabs for "Коммуникация и Порядок"
  const commTabs: TabItem[] = [
    {
      id: 'announcements',
      title: 'Умные анонсы',
      subtitle: 'Красивые публикации',
      description: 'Бот отправит в канал профессионально оформленный пост с обложкой и кнопкой «Зарегистрироваться». Один клик — анонс уже в вашем канале.',
      icon: <Megaphone size={18} />,
      visual: (
        <div className="tab-visual tab-visual--announcement">
          <div className="events-announcement-mock">
            <div className="events-announcement-image">
              <div className="events-announcement-gradient">
                <span>🎯 Бизнес-завтрак</span>
                <strong>Инвестиции 2024</strong>
              </div>
            </div>
            <div className="events-announcement-body">
              <p>25 января • 10:00 • WeWork</p>
              <p className="events-announcement-desc">Обсуждаем тренды венчурного рынка с топовыми инвесторами</p>
            </div>
            <button className="events-announcement-btn">
              Зарегистрироваться
            </button>
          </div>
        </div>
      )
    },
    {
      id: 'negativity',
      title: 'Детекция негатива (AI)',
      subtitle: 'Потушите пожар, пока он не разгорелся',
      description: 'ORBO обнаружит негатив в чате ивента или неотвеченные вопросы (например, «Где вход?»). Система пришлет алерт администратору, если вопрос висит без ответа слишком долго.',
      icon: <AlertTriangle size={18} />,
      visual: (
        <div className="tab-visual tab-visual--negativity">
          <div className="tab-visual__chat-bubble tab-visual__chat-bubble--client">
            <span className="tab-visual__chat-name">Участник</span>
            <p>Где парковка? Уже 10 минут ищу 😤</p>
          </div>
          <div className="tab-visual__mock-notification tab-visual__mock-notification--alert">
            <div className="tab-visual__notif-header">
              <AlertTriangle size={16} className="tab-visual__notif-icon tab-visual__notif-icon--red" />
              <span>❓ Неотвеченный вопрос</span>
            </div>
            <div className="tab-visual__notif-body">
              <strong>Чат: Конференция 2024</strong>
              <p>"Где парковка?" — висит 15 мин</p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'profiles',
      title: 'Умные профили',
      subtitle: 'Нетворкинг до начала',
      description: 'Участники могут посмотреть, кто еще идет на мероприятие, изучить профили и «О себе» заранее. Это спасает от неловкого молчания на старте.',
      icon: <Eye size={18} />,
      visual: (
        <div className="tab-visual tab-visual--profiles">
          <div className="events-profiles-list">
            <div className="events-profile-card">
              <div className="events-profile-avatar">АК</div>
              <div className="events-profile-info">
                <strong>Алексей Козлов</strong>
                <span>CEO, TechStartup</span>
                <p>Ищу партнера для B2B проекта</p>
              </div>
            </div>
            <div className="events-profile-card">
              <div className="events-profile-avatar">МС</div>
              <div className="events-profile-info">
                <strong>Мария Сидорова</strong>
                <span>Маркетинг-директор</span>
                <p>Помогаю с выходом на рынок</p>
              </div>
            </div>
            <div className="events-profile-card">
              <div className="events-profile-avatar">ДП</div>
              <div className="events-profile-info">
                <strong>Дмитрий Павлов</strong>
                <span>Инвестор</span>
                <p>Смотрю FoodTech стартапы</p>
              </div>
            </div>
          </div>
        </div>
      )
    }
  ];
  
  return (
    <>
      <Header />
      
      {/* Hero Section */}
      <section className="events-org-hero">
        <div className="website-container">
          <div className="events-org-hero__content">
            <h1 className="events-org-hero__title">
              ORBO AI — помогает организаторам превратить хаос регистраций в систему
            </h1>
            <h2 className="events-org-hero__subtitle">
              Event-платформа полного цикла внутри Telegram с AI-аналитикой — автоматизирует продажи билетов, устраняет ручную сверку оплат и сохраняет контакты аудитории навсегда.
            </h2>
            <div className="events-org-hero__bullets">
              <div className="events-org-hero__bullet">
                <MousePointerClick size={20} />
                <span>Регистрация в 2 клика</span>
              </div>
              <div className="events-org-hero__bullet">
                <CheckCircle size={20} />
                <span>0% ручной сверки оплат</span>
              </div>
              <div className="events-org-hero__bullet">
                <TrendingUp size={20} />
                <span>Рост доходимости</span>
              </div>
            </div>
            <div className="events-org-hero__actions">
              <Link href="https://my.orbo.ru/signup" className="btn-pill btn-pill--primary btn-pill--lg">
                Попробовать бесплатно
              </Link>
              <Link href="https://calendly.com/timgorshkov/30min" className="btn-pill btn-pill--outline btn-pill--lg">
                Записаться на демо
              </Link>
            </div>
            <p className="events-org-hero__note">
              Бесплатно. Без привязки карты. 10 минут и готово.
            </p>
          </div>
          <div className="events-org-hero__visual">
            {/* Dashboard + Phone mockup */}
            <div className="events-org-hero__mockup">
              <div className="events-org-hero__mockup-header">
                <span className="events-org-hero__mockup-dot events-org-hero__mockup-dot--red"></span>
                <span className="events-org-hero__mockup-dot events-org-hero__mockup-dot--yellow"></span>
                <span className="events-org-hero__mockup-dot events-org-hero__mockup-dot--green"></span>
                <span className="events-org-hero__mockup-url">my.orbo.ru/events</span>
              </div>
              <div className="events-org-hero__mockup-body">
                <div className="events-org-hero__event-card">
                  <div className="events-org-hero__event-header">
                    <span className="events-org-hero__event-badge">🔴 Live</span>
                    <span>Бизнес-завтрак: Инвестиции</span>
                  </div>
                  <div className="events-org-hero__event-stats">
                    <div className="events-org-hero__stat">
                      <span className="events-org-hero__stat-value">47</span>
                      <span className="events-org-hero__stat-label">участников</span>
                    </div>
                    <div className="events-org-hero__stat">
                      <span className="events-org-hero__stat-value">235 000 ₽</span>
                      <span className="events-org-hero__stat-label">собрано</span>
                    </div>
                  </div>
                  <div className="events-org-hero__participants">
                    <div className="events-org-hero__participant events-org-hero__participant--paid">
                      <span>Анна С.</span>
                      <span className="events-org-hero__participant-badge events-org-hero__participant-badge--green">Оплачено</span>
                    </div>
                    <div className="events-org-hero__participant events-org-hero__participant--paid">
                      <span>Иван П.</span>
                      <span className="events-org-hero__participant-badge events-org-hero__participant-badge--green">Оплачено</span>
                    </div>
                    <div className="events-org-hero__participant events-org-hero__participant--pending">
                      <span>Мария К.</span>
                      <span className="events-org-hero__participant-badge events-org-hero__participant-badge--yellow">Ожидает</span>
                    </div>
                  </div>
                </div>
                <div className="events-org-hero__notification">
                  <span className="events-org-hero__notification-badge">🟢</span>
                  <div>
                    <strong>Новая регистрация</strong>
                    <p>Иван П. (+5 000 ₽)</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="events-org-hero__phone">
              <div className="events-org-hero__phone-header">
                <TelegramLogo />
              </div>
              <div className="events-org-hero__phone-content">
                <div className="events-org-hero__ticket">
                  <div className="events-org-hero__ticket-header">🎫 Ваш билет</div>
                  <div className="events-org-hero__ticket-body">
                    <strong>Бизнес-завтрак</strong>
                    <span>25 янв • 10:00</span>
                    <div className="events-org-hero__ticket-qr">
                      <div className="events-org-hero__ticket-qr-placeholder"></div>
                    </div>
                    <span className="events-org-hero__ticket-status">✅ Оплачено</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* Emotional Quote */}
      <section className="agencies-quote">
        <div className="website-container">
          <blockquote className="agencies-quote__text">
            "Когда у вас 10 участников на завтраке, вы помните каждого. Когда вы делаете конференцию на 500 человек, чат превращается в черный ящик, а личка разрывается от скриншотов."
          </blockquote>
        </div>
      </section>
      
      {/* Problems Section */}
      <section className="website-section">
        <div className="website-container">
          <div className="section-header section-header--center">
            <h2 className="section-header__title">Почему организаторы теряют деньги и нервные клетки?</h2>
          </div>
          
          <div className="agencies-problems">
            <div className="agencies-problem agencies-problem--red">
              <div className="agencies-problem__icon">
                <MousePointerClick size={24} />
              </div>
              <div className="agencies-problem__content">
                <h3>Регистрационный ад</h3>
                <p>Связка «Анонс → Сайт → Google Form → Оплата». На каждом переходе теряется конверсия. Клиент «остывает», пока переключается между вкладками.</p>
              </div>
            </div>
            
            <div className="agencies-problem agencies-problem--orange">
              <div className="agencies-problem__icon">
                <CreditCard size={24} />
              </div>
              <div className="agencies-problem__content">
                <h3>Ручная сверка оплат</h3>
                <p>«Скинь скрин в личку». Вы тратите часы на проверку поступлений и ручное добавление людей в закрытый чат. Это рутина, убивающая энергию перед ивентом.</p>
              </div>
            </div>
            
            <div className="agencies-problem agencies-problem--yellow">
              <div className="agencies-problem__icon">
                <Database size={24} />
              </div>
              <div className="agencies-problem__content">
                <h3>Потеря базы после ивента</h3>
                <p>Ивент прошел — чат умер. Контакты остались в разрозненных таблицах или исчезли. Вы не можете сделать Upsell, потому что собираете аудиторию каждый раз с нуля.</p>
              </div>
            </div>
            
            <div className="agencies-problem agencies-problem--blue">
              <div className="agencies-problem__icon">
                <DollarSign size={24} />
              </div>
              <div className="agencies-problem__content">
                <h3>«Скиньте на карту Сбера»</h3>
                <p>Сбор денег по номеру телефона снижает статус мероприятия. Премиальная аудитория не доверяет таким переводам и требует нормального сервиса.</p>
              </div>
            </div>
            
            <div className="agencies-problem agencies-problem--brown">
              <div className="agencies-problem__icon">
                <Mail size={24} />
              </div>
              <div className="agencies-problem__content">
                <h3>Низкая доходимость</h3>
                <p>Человек зарегистрировался в форме, но письмо с напоминанием улетело в спам. Вы теряете участников, которые просто забыли о дате.</p>
              </div>
            </div>
          </div>
          
          <div className="agencies-problems-summary">
            <p>Вы не видите, кто реально ходит к вам постоянно (ваше ядро). Вы тратите время на администрирование вместо контента. Вы теряете контекст, когда ивент заканчивается.</p>
          </div>
        </div>
      </section>
      
      {/* Vision Quote */}
      <section className="agencies-big-quote">
        <div className="website-container">
          <p className="agencies-big-quote__text">
            Представьте, что регистрация, оплата и сбор базы происходят автоматически внутри Telegram, пока вы занимаетесь программой мероприятия.
          </p>
        </div>
      </section>
      
      {/* Product Introduction */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div className="section-header section-header--center">
            <h2 className="section-header__title">Мы создали ORBO AI для ивентов</h2>
            <p className="section-header__subtitle">
              Система с искусственным интеллектом, которая помогает профессионально организовать события и управлять сообществом участников.
            </p>
          </div>
          
          {/* AI Profile mockup */}
          <div className="events-ai-showcase">
            <div className="events-ai-showcase__sidebar">
              <div className="events-ai-showcase__event-item events-ai-showcase__event-item--active">
                <Calendar size={16} />
                <span>Бизнес-завтрак: Инвестиции</span>
              </div>
              <div className="events-ai-showcase__event-item">
                <Calendar size={16} />
                <span>Нетворкинг CEO</span>
              </div>
              <div className="events-ai-showcase__event-item">
                <Calendar size={16} />
                <span>Маркетинг 2024</span>
              </div>
            </div>
            <div className="events-ai-showcase__profile">
              <div className="events-ai-showcase__profile-header">
                <div className="events-ai-showcase__profile-avatar">ИП</div>
                <div className="events-ai-showcase__profile-info">
                  <strong>Иван Петров</strong>
                  <span>Предприниматель • 3 ивента</span>
                </div>
              </div>
              <div className="events-ai-showcase__ai-block">
                <div className="events-ai-showcase__ai-header">
                  <Sparkles size={16} />
                  <span>AI-анализ</span>
                </div>
                <div className="events-ai-showcase__ai-tags">
                  <span className="events-ai-showcase__ai-tag">📌 Интересы: Маркетинг</span>
                  <span className="events-ai-showcase__ai-tag">🔍 Ищет: Инвестора</span>
                  <span className="events-ai-showcase__ai-tag">🎯 Посетил: 3 ивента</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="agencies-cta-center">
            <Link href="https://calendly.com/timgorshkov/30min" className="btn-pill btn-pill--primary btn-pill--lg">
              Записаться на демо
            </Link>
          </div>
        </div>
      </section>
      
      {/* Events & Sales */}
      <section className="website-section">
        <div className="website-container">
          <div className="section-header">
            <span className="section-header__eyebrow">Организация мероприятий</span>
            <h2 className="section-header__title">Регистрация и прием оплат прямо в Telegram без сторонних сайтов</h2>
          </div>
          
          <FeatureTabs tabs={eventsTabs} defaultTab="seamless" />
        </div>
      </section>
      
      {/* CRM */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div className="section-header">
            <span className="section-header__eyebrow">CRM участников</span>
            <h2 className="section-header__title">Больше знаний об аудитории — выше LTV и продажи</h2>
          </div>
          
          <FeatureTabs tabs={crmTabs} defaultTab="ai-analysis" />
        </div>
      </section>
      
      {/* Communication */}
      <section className="website-section">
        <div className="website-container">
          <div className="section-header">
            <span className="section-header__eyebrow">Управление сообществом</span>
            <h2 className="section-header__title">Превратите чат мероприятия из свалки в ценный актив</h2>
          </div>
          
          <FeatureTabs tabs={commTabs} defaultTab="announcements" />
        </div>
      </section>
      
      {/* How it works */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div className="section-header section-header--center">
            <h2 className="section-header__title">Работает там, где работаете вы</h2>
          </div>
          
          <div className="steps-grid steps-grid--3col">
            <div className="step-card">
              <div className="step-card__number">1</div>
              <h4 className="step-card__title">Создайте событие</h4>
              <p className="step-card__text">
                Укажите дату, время, цену билета. Настройте форму регистрации под себя.
              </p>
            </div>
            <div className="step-card">
              <div className="step-card__number">2</div>
              <h4 className="step-card__title">Опубликуйте анонс</h4>
              <p className="step-card__text">
                Отправьте красивый пост с кнопкой «Зарегистрироваться» в ваш Telegram-канал через бота.
              </p>
            </div>
            <div className="step-card">
              <div className="step-card__number">3</div>
              <h4 className="step-card__title">Всё!</h4>
              <p className="step-card__text">
                Регистрации и оплаты идут автоматически. База собирается. Вы занимаетесь контентом, а не рутиной.
              </p>
            </div>
          </div>
          
          <div className="agencies-cta-center">
            <Link href="https://my.orbo.ru/signup" className="btn-pill btn-pill--primary btn-pill--lg">
              Попробовать бесплатно
            </Link>
          </div>
        </div>
      </section>
      
      {/* Final CTA */}
      <section className="cta-section">
        <div className="website-container">
          <h2 className="cta-section__title">Прозрачность, предсказуемость, полная база = Успешные ивенты</h2>
          <p className="cta-section__text">
            Превратите хаос регистраций в систему и собирайте полную базу участников
          </p>
          <div className="cta-section__actions">
            <Link href="https://my.orbo.ru/signup" className="btn-pill btn-pill--white">
              Начать бесплатно
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
