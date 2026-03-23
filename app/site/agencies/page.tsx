'use client';

import { useState } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { 
  ArrowRight, Clock, AlertTriangle, UserX, HelpCircle, MessagesSquare,
  Bell, FileText, Scale, Brain, History, Users, Send, Calendar,
  CheckCircle, Zap, Shield, TrendingUp
} from 'lucide-react';
import { Header, Footer, BrowserFrame, PhoneFrame } from '@/components/website';

// Telegram Logo SVG
const TelegramLogo = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="messenger-icon">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
);

// WhatsApp Logo SVG
const WhatsAppLogo = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="messenger-icon">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

// Max Messenger Logo SVG  
const MaxLogo = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="messenger-icon">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
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

export default function AgenciesPage() {
  // Tabs for "Контроль коммуникации"
  const communicationTabs: TabItem[] = [
    {
      id: 'slow-response',
      title: 'Долгие ответы',
      subtitle: 'AI увидит вопросы и скорость ответов',
      description: 'Настройте уведомления о неотвеченных сообщениях клиенту, чтобы оценить нагрузку на проджектов, видеть неотвеченные сообщения от клиентов и быстрее отвечать им в рабочих чатах.',
      icon: <Clock size={18} />,
      visual: (
        <div className="tab-visual tab-visual--notification">
          <div className="tab-visual__mock-notification">
            <div className="tab-visual__notif-header">
              <Bell size={16} className="tab-visual__notif-icon" />
              <span>Уведомление Orbo</span>
            </div>
            <div className="tab-visual__notif-body">
              <strong>⏰ Нет ответа 4+ часа</strong>
              <p>Чат: <em>Project Alpha</em></p>
              <p>Клиент спрашивает про статус макетов</p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'negativity',
      title: 'Негатив в чатах',
      subtitle: 'Потушите пожар, пока он не разгорелся',
      description: 'Orbo обнаружит негатив, агрессивное настроение, оскорбления, жалобы, недовольство и конфликты. Система уведомляет ответственного и рекомендует, как потушить накал страстей.',
      icon: <AlertTriangle size={18} />,
      visual: (
        <div className="tab-visual tab-visual--negativity">
          <div className="tab-visual__chat-bubble tab-visual__chat-bubble--client">
            <span className="tab-visual__chat-name">Клиент</span>
            <p>Мы третью неделю ждем правки, это несерьезно! 😤</p>
          </div>
          <div className="tab-visual__mock-notification tab-visual__mock-notification--alert">
            <div className="tab-visual__notif-header">
              <AlertTriangle size={16} className="tab-visual__notif-icon tab-visual__notif-icon--red" />
              <span>🔴 Негатив обнаружен</span>
            </div>
            <div className="tab-visual__notif-body">
              <strong>Project X</strong>
              <p>Клиент выражает недовольство сроками</p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'reports',
      title: 'Обоснование оплаты',
      subtitle: 'Orbo сделает отчет клиенту о проделанной работе',
      description: 'Запустите аналитику рабочего чата с помощью AI и предоставьте максимально полный отчет по задачам и действиям, чтобы у клиента не осталось вопросов "За что мы им платим".',
      icon: <FileText size={18} />,
      visual: (
        <div className="tab-visual tab-visual--report">
          <div className="tab-visual__report-card">
            <div className="tab-visual__report-header">📊 Отчет за месяц</div>
            <ul className="tab-visual__report-list">
              <li>✓ 47 задач выполнено</li>
              <li>✓ 12 созвонов проведено</li>
              <li>✓ 156 правок внесено</li>
              <li>✓ 8 презентаций подготовлено</li>
            </ul>
          </div>
          <div className="tab-visual__chat-bubble tab-visual__chat-bubble--client tab-visual__chat-bubble--positive">
            <span className="tab-visual__chat-name">Клиент</span>
            <p>Ого, это все за месяц? Впечатляет! 👍</p>
          </div>
        </div>
      )
    },
    {
      id: 'disputes',
      title: 'Решение споров',
      subtitle: 'Больше не услышите "мы это не утверждали"',
      description: 'С помощью поиска конкретных обсуждений сведите к минимуму спорные ситуации. AI-анализ найдет нужные договоренности в переписке за секунды.',
      icon: <Scale size={18} />,
      visual: (
        <div className="tab-visual tab-visual--search">
          <div className="tab-visual__search-box">
            <input type="text" placeholder='Поиск: "утверждение логотипа"' disabled />
          </div>
          <div className="tab-visual__search-results">
            <div className="tab-visual__search-result">
              <span className="tab-visual__result-date">15 ноя, 14:32</span>
              <p>"Да, логотип утверждаем в этом варианте ✅"</p>
              <span className="tab-visual__result-author">— Иван Петров (клиент)</span>
            </div>
          </div>
        </div>
      )
    }
  ];
  
  // Tabs for "CRM участников"
  const crmTabs: TabItem[] = [
    {
      id: 'ai-analysis',
      title: 'AI анализ интересов',
      subtitle: 'Знайте больше о ваших клиентах',
      description: 'Накапливая данные, AI анализ профиля может сформировать портрет клиента основываясь на его диалогах, что поможет вам делать более персонализированные предложения и развивать отношения.',
      icon: <Brain size={18} />,
      visual: (
        <div className="tab-visual tab-visual--profile">
          <div className="tab-visual__profile-card">
            <div className="tab-visual__profile-header">
              <div className="tab-visual__profile-avatar">ИП</div>
              <div>
                <strong>Иван Петров</strong>
                <span>CEO, TechStartup</span>
              </div>
            </div>
            <div className="tab-visual__profile-tags">
              <span className="tab-visual__tag">🎯 Быстрый рост</span>
              <span className="tab-visual__tag">💡 Инновации</span>
              <span className="tab-visual__tag">📱 Mobile-first</span>
            </div>
            <div className="tab-visual__profile-insight">
              <strong>AI-инсайт:</strong> Интересуется чат-ботами и AI-решениями. Упоминал планы по автоматизации.
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'history',
      title: 'История из разных источников',
      subtitle: 'ORBO объединяет историю сообщений из разных каналов',
      description: 'Для удержания хронологии и истории коммуникации с клиентом вы можете объединить историю диалогов в разных мессенджерах и не упустить важное.',
      icon: <History size={18} />,
      visual: (
        <div className="tab-visual tab-visual--unified">
          <div className="tab-visual__sources">
            <div className="tab-visual__source tab-visual__source--tg">
              <TelegramLogo /> Telegram
            </div>
            <div className="tab-visual__source tab-visual__source--wa">
              <WhatsAppLogo /> WhatsApp
            </div>
            <div className="tab-visual__source tab-visual__source--max">
              <MaxLogo /> Max
            </div>
          </div>
          <div className="tab-visual__arrow">→</div>
          <div className="tab-visual__unified-history">
            <div className="tab-visual__unified-header">📋 Единая история</div>
            <div className="tab-visual__unified-items">
              <div className="tab-visual__unified-item">
                <span className="tab-visual__unified-badge tab-visual__unified-badge--tg">TG</span>
                12:30 — Обсуждение ТЗ
              </div>
              <div className="tab-visual__unified-item">
                <span className="tab-visual__unified-badge tab-visual__unified-badge--wa">WA</span>
                14:15 — Согласование макета
              </div>
              <div className="tab-visual__unified-item">
                <span className="tab-visual__unified-badge tab-visual__unified-badge--tg">TG</span>
                16:45 — Правки от клиента
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'groups',
      title: 'Принадлежность к группам',
      subtitle: 'Узнайте в каких группах состоят ваши клиенты',
      description: 'Их интересы и запросы в других группах помогут предложить новый продукт, понять мотивы и актуальные боли.',
      icon: <Users size={18} />,
      visual: (
        <div className="tab-visual tab-visual--groups">
          <div className="tab-visual__client-groups">
            <div className="tab-visual__client-header">
              <div className="tab-visual__profile-avatar">ИП</div>
              <span>Группы клиента:</span>
            </div>
            <div className="tab-visual__groups-list">
              <div className="tab-visual__group-item">🏍️ Мотоспорт Москва</div>
              <div className="tab-visual__group-item">🤖 AI чат-боты</div>
              <div className="tab-visual__group-item">🌴 Чат Таиланда</div>
            </div>
          </div>
          <div className="tab-visual__insight-bubble">
            💡 <strong>Идея:</strong> Он интересуется чат-ботами — предложим разработку AI-ассистента на следующем митинге!
          </div>
        </div>
      )
    }
  ];
  
  // Tabs for "Рассылки"
  const broadcastTabs: TabItem[] = [
    {
      id: 'weekend',
      title: 'Режим выходного дня',
      subtitle: 'Автоматизируйте рутинные сообщения',
      description: 'Настройте правило: каждую пятницу в 19:00 бот желает клиентам хороших выходных и оставляет контакт для экстренной связи. В понедельник в 10:00 — сообщает, что команда снова в строю.',
      icon: <Calendar size={18} />,
      visual: (
        <div className="tab-visual tab-visual--broadcast">
          <div className="tab-visual__broadcast-card">
            <div className="tab-visual__broadcast-header">📨 Создание рассылки</div>
            <div className="tab-visual__broadcast-preview">
              <p>"Коллеги, уходим на выходные, вернемся в понедельник! 🌴</p>
              <p>Если что-то срочное — пишите дежурному: +7..."</p>
            </div>
            <div className="tab-visual__broadcast-settings">
              <span>📍 Все клиентские чаты</span>
              <span>🕐 Пятница, 19:00</span>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'instant',
      title: 'Мгновенные анонсы',
      subtitle: 'Один клик — все в курсе',
      description: 'Отправьте важное сообщение во все 50 чатов сразу. Без копипаста. Без ошибок. Персонализированно.',
      icon: <Send size={18} />,
      visual: (
        <div className="tab-visual tab-visual--instant">
          <div className="tab-visual__phones-row">
            <div className="tab-visual__mini-phone">
              <div className="tab-visual__phone-header">Client A</div>
              <div className="tab-visual__phone-msg">🔧 Тех.работы 10:00-12:00</div>
            </div>
            <div className="tab-visual__mini-phone">
              <div className="tab-visual__phone-header">Client B</div>
              <div className="tab-visual__phone-msg">🔧 Тех.работы 10:00-12:00</div>
            </div>
            <div className="tab-visual__mini-phone">
              <div className="tab-visual__phone-header">Client C</div>
              <div className="tab-visual__phone-msg">🔧 Тех.работы 10:00-12:00</div>
            </div>
          </div>
          <div className="tab-visual__instant-label">
            <Zap size={16} /> Отправлено в 50 чатов за 2 сек
          </div>
        </div>
      )
    }
  ];
  
  return (
    <>
      <Header />
      
      {/* Hero Section */}
      <section className="agencies-hero">
        <div className="website-container">
          <div className="agencies-hero__content">
            <h1 className="agencies-hero__title">
              Orbo AI — помогает агентствам сохранить клиентов на долгие годы
            </h1>
            <h2 className="agencies-hero__subtitle">
              Система управления группами и сообществами в мессенджерах с AI-аналитикой — превращает хаос в систему и продлевает "жизнь" клиентам
            </h2>
            <div className="agencies-hero__bullets">
              <div className="agencies-hero__bullet">
                <TrendingUp size={20} />
                <span>Рост LTV</span>
              </div>
              <div className="agencies-hero__bullet">
                <Shield size={20} />
                <span>Ниже отток</span>
              </div>
              <div className="agencies-hero__bullet">
                <CheckCircle size={20} />
                <span>Контроль до 200 чатов</span>
              </div>
            </div>
            <div className="agencies-hero__actions">
              <Link href="https://my.orbo.ru/signup" className="btn-pill btn-pill--primary btn-pill--lg">
                Попробовать бесплатно
              </Link>
              <Link href="/demo" className="btn-pill btn-pill--outline btn-pill--lg">
                Посмотреть демо
              </Link>
            </div>
            <p className="agencies-hero__note">
              Бесплатно. Без привязки карты. 10 минут и готово.
            </p>
          </div>
          <div className="agencies-hero__visual">
            {/* Placeholder for dashboard mockup */}
            <div className="agencies-hero__mockup">
              <div className="agencies-hero__mockup-header">
                <span className="agencies-hero__mockup-dot agencies-hero__mockup-dot--red"></span>
                <span className="agencies-hero__mockup-dot agencies-hero__mockup-dot--yellow"></span>
                <span className="agencies-hero__mockup-dot agencies-hero__mockup-dot--green"></span>
              </div>
              <div className="agencies-hero__mockup-body">
                <div className="agencies-hero__chat-list">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="agencies-hero__chat-item agencies-hero__chat-item--green">
                      <div className="agencies-hero__chat-avatar"></div>
                      <div className="agencies-hero__chat-info">
                        <div className="agencies-hero__chat-skeleton"></div>
                        <div className="agencies-hero__chat-skeleton agencies-hero__chat-skeleton--short"></div>
                      </div>
                      <div className="agencies-hero__chat-status agencies-hero__chat-status--green"></div>
                    </div>
                  ))}
                  <div className="agencies-hero__chat-item agencies-hero__chat-item--yellow">
                    <div className="agencies-hero__chat-avatar"></div>
                    <div className="agencies-hero__chat-info">
                      <div className="agencies-hero__chat-skeleton"></div>
                      <div className="agencies-hero__chat-skeleton agencies-hero__chat-skeleton--short"></div>
                    </div>
                    <div className="agencies-hero__chat-status agencies-hero__chat-status--yellow"></div>
                  </div>
                  <div className="agencies-hero__chat-item agencies-hero__chat-item--red">
                    <div className="agencies-hero__chat-avatar"></div>
                    <div className="agencies-hero__chat-info">
                      <div className="agencies-hero__chat-skeleton"></div>
                      <div className="agencies-hero__chat-skeleton agencies-hero__chat-skeleton--short"></div>
                    </div>
                    <div className="agencies-hero__chat-status agencies-hero__chat-status--red">🔥</div>
                  </div>
                </div>
                <div className="agencies-hero__notification">
                  <span className="agencies-hero__notification-badge">🔴</span>
                  <div>
                    <strong>Негатив: Project X</strong>
                    <p>"Мы третью неделю ждем правки..."</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* Quote */}
      <section className="agencies-quote">
        <div className="website-container">
          <blockquote className="agencies-quote__text">
            "Когда у вас пять клиентов, вы помните каждый диалог. Когда их пятьдесят, Telegram/WhatsApp/Max превращаются в чёрный ящик."
          </blockquote>
        </div>
      </section>
      
      {/* Problems Section */}
      <section className="website-section">
        <div className="website-container">
          <div className="section-header section-header--center">
            <h2 className="section-header__title">Почему агентства теряют клиентов и нервные клетки?</h2>
          </div>
          
          <div className="agencies-problems">
            <div className="agencies-problem agencies-problem--red">
              <div className="agencies-problem__icon">
                <MessagesSquare size={24} />
              </div>
              <div className="agencies-problem__content">
                <h3>Чатов стало много</h3>
                <p>20–50 диалогов. Физически не прочитать всё. О проблеме узнаете, когда клиент уже недоволен.</p>
              </div>
            </div>
            
            <div className="agencies-problem agencies-problem--orange">
              <div className="agencies-problem__icon">
                <Clock size={24} />
              </div>
              <div className="agencies-problem__content">
                <h3>Клиент "висит" без ответа</h3>
                <p>Ответили позже → клиент остыл → доверие упало.</p>
              </div>
            </div>
            
            <div className="agencies-problem agencies-problem--yellow">
              <div className="agencies-problem__icon">
                <UserX size={24} />
              </div>
              <div className="agencies-problem__content">
                <h3>Сменился менеджер — ушла история</h3>
                <p>Новый менеджер долго разбирается, клиент нервничает.</p>
              </div>
            </div>
            
            <div className="agencies-problem agencies-problem--blue">
              <div className="agencies-problem__icon">
                <HelpCircle size={24} />
              </div>
              <div className="agencies-problem__content">
                <h3>"За что я вам плачу?"</h3>
                <p>Команда работает, но клиент этого не чувствует.</p>
              </div>
            </div>
            
            <div className="agencies-problem agencies-problem--brown">
              <div className="agencies-problem__icon">
                <AlertTriangle size={24} />
              </div>
              <div className="agencies-problem__content">
                <h3>Хаос переписок</h3>
                <p>Часть в WhatsApp, часть в Telegram, файлы где-то ещё. Потом — спор "вы обещали / вы не обещали".</p>
              </div>
            </div>
          </div>
          
          <div className="agencies-problems-summary">
            <p>Вы не видите, как общаются ваши менеджеры. Вы пропускаете момент, когда лояльность клиента сменяется раздражением. Вы теряете контекст, когда уходят сотрудники.</p>
          </div>
        </div>
      </section>
      
      {/* Big Quote */}
      <section className="agencies-big-quote">
        <div className="website-container">
          <p className="agencies-big-quote__text">
            Представьте, что каждый ваш клиент платит вам пожизненно и приводит своих друзей-предпринимателей
          </p>
        </div>
      </section>
      
      {/* Orbo Introduction */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div className="section-header section-header--center">
            <h2 className="section-header__title">Мы создали ORBO AI</h2>
            <p className="section-header__subtitle">
              Система с искусственным интеллектом, которая помогает управлять качеством коммуникации и большим количеством чатов
            </p>
          </div>
          
          {/* Placeholder for AI mockup */}
          <div className="agencies-ai-mockup">
            <div className="agencies-ai-mockup__chat-list">
              <div className="agencies-ai-mockup__chat"></div>
              <div className="agencies-ai-mockup__chat"></div>
              <div className="agencies-ai-mockup__chat"></div>
              <div className="agencies-ai-mockup__chat"></div>
            </div>
            <div className="agencies-ai-mockup__center">
              <div className="agencies-ai-mockup__badge">✅</div>
              <p>Вероятность продления договора <strong>98%</strong></p>
              <span>Клиент доволен</span>
            </div>
          </div>
          
          <div className="agencies-cta-center">
            <Link href="/demo" className="btn-pill btn-pill--primary btn-pill--lg">
              Посмотреть демо
            </Link>
          </div>
        </div>
      </section>
      
      {/* Communication Control */}
      <section className="website-section">
        <div className="website-container">
          <div className="section-header">
            <span className="section-header__eyebrow">Контроль коммуникации</span>
            <h2 className="section-header__title">AI анализирует дискуссии до 200 чатов одновременно</h2>
          </div>
          
          <FeatureTabs tabs={communicationTabs} defaultTab="slow-response" />
        </div>
      </section>
      
      {/* CRM */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div className="section-header">
            <span className="section-header__eyebrow">CRM участников</span>
            <h2 className="section-header__title">Больше знаний о клиентах — больше персонализации</h2>
          </div>
          
          <FeatureTabs tabs={crmTabs} defaultTab="ai-analysis" />
        </div>
      </section>
      
      {/* Broadcasts */}
      <section className="website-section">
        <div className="website-container">
          <div className="section-header">
            <span className="section-header__eyebrow">Рассылки в чаты</span>
            <h2 className="section-header__title">Один клик. Все клиенты в курсе.</h2>
            <p className="section-header__subtitle">
              Управляйте ожиданиями массово, но персонально. Нужно сообщить о технических работах? Поздравить с праздником?
            </p>
          </div>
          
          <FeatureTabs tabs={broadcastTabs} defaultTab="weekend" />
        </div>
      </section>
      
      {/* Integrations */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div className="section-header section-header--center">
            <h2 className="section-header__title">Работает там, где работаете вы</h2>
          </div>
          
          <div className="agencies-messengers">
            <div className="agencies-messenger">
              <TelegramLogo />
              <span>Telegram</span>
            </div>
            <div className="agencies-messenger">
              <WhatsAppLogo />
              <span>WhatsApp</span>
            </div>
            <div className="agencies-messenger">
              <MaxLogo />
              <span>Max</span>
            </div>
          </div>
        </div>
      </section>
      
      {/* Steps */}
      <section className="website-section">
        <div className="website-container">
          <div className="section-header section-header--center">
            <h2 className="section-header__title">Начать легко</h2>
          </div>
          
          <div className="steps-grid steps-grid--3col">
            <div className="step-card">
              <div className="step-card__number">1</div>
              <h4 className="step-card__title">Создайте проект</h4>
              <p className="step-card__text">
                Зарегистрируйтесь в ORBO и создайте организацию
              </p>
            </div>
            <div className="step-card">
              <div className="step-card__number">2</div>
              <h4 className="step-card__title">Добавьте бота</h4>
              <p className="step-card__text">
                Добавьте нашего бота в клиентский чат Telegram
              </p>
            </div>
            <div className="step-card">
              <div className="step-card__number">3</div>
              <h4 className="step-card__title">Готово!</h4>
              <p className="step-card__text">
                Аналитика уже собирается. Никакого сложного софта. Клиенты даже не заметят разницы. Вы заметите результат.
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
          <h2 className="cta-section__title">Прозрачность, предсказуемость, внимание = Клиенты навсегда</h2>
          <p className="cta-section__text">
            Превратите хаос переписок в систему удержания клиентов
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
