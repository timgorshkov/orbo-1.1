import { Metadata } from 'next';
import Link from 'next/link';
import { 
  Bell, AlertTriangle, MessageCircleQuestion, Clock, 
  TrendingDown, Settings, Filter, Zap, Shield, 
  ArrowRight, Building2, Users 
} from 'lucide-react';
import { Header, Footer, BrowserFrame, PhoneFrame, NotificationsFloatingCards } from '@/components/website';

export const metadata: Metadata = {
  title: 'Уведомления и мониторинг групп',
  description: 'AI-мониторинг Telegram-групп: негатив, неотвеченные вопросы, SLA. Не пропускайте важные сообщения участников.',
  alternates: { canonical: '/notifications' },
};

export default function NotificationsPage() {
  return (
    <>
      <Header transparent />
      
      {/* Hero with Floating Cards */}
      <section className="hero-floating">
        <NotificationsFloatingCards />
        
        <div className="hero-floating__content">
          <span className="hero-floating__eyebrow">Уведомления</span>
          <h1 className="hero-floating__title">
            Не пропускайте<br />важное
          </h1>
          <p className="hero-floating__subtitle">
            AI-мониторинг рабочих групп: негатив, неотвеченные вопросы, контроль SLA
          </p>
          <div className="hero-floating__actions">
            <Link href="https://my.orbo.ru/signup" className="btn-pill btn-pill--primary">
              Начать бесплатно
            </Link>
            <Link href="/demo" className="btn-pill btn-pill--outline">
              Посмотреть демо
            </Link>
          </div>
        </div>
      </section>

      {/* Problem / Solution */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Для агентств и команд</span>
            <h2 className="section-header__title">Знакомая ситуация?</h2>
          </div>
          
          <div className="features-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))' }}>
            <div className="audience-card" style={{ borderLeft: '4px solid #ef4444' }}>
              <div className="audience-card__icon" style={{ background: 'linear-gradient(135deg, #fca5a5, #ef4444)' }}>
                <AlertTriangle size={28} />
              </div>
              <h3 className="audience-card__title">❌ Типичные проблемы</h3>
              <ul className="audience-card__features">
                <li><strong>Руководитель не успевает</strong> — 20–50 проектов, невозможно следить за всеми чатами</li>
                <li><strong>Узнаёте поздно</strong> — клиент уже кричит, репутация подорвана</li>
                <li><strong>Проджект нагрубил</strong> — вы не в курсе, пока клиент не ушёл</li>
                <li><strong>SLA нарушено</strong> — вопрос висит 2 дня, никто не заметил</li>
                <li><strong>Аккаунт уволился</strong> — унёс контекст отношений, новый вникает неделями</li>
              </ul>
            </div>
            
            <div className="audience-card" style={{ borderLeft: '4px solid #22c55e' }}>
              <div className="audience-card__icon" style={{ background: 'linear-gradient(135deg, #86efac, #22c55e)' }}>
                <Shield size={28} />
              </div>
              <h3 className="audience-card__title">✅ С Orbo</h3>
              <ul className="audience-card__features">
                <li><strong>«Светофор» проектов</strong> — видите статус всех чатов на одном экране</li>
                <li><strong>AI-алерты мгновенно</strong> — негатив, претензия, срочность → уведомление</li>
                <li><strong>Контроль SLA</strong> — таймер на ответ, алерт при просрочке</li>
                <li><strong>История в профиле</strong> — вся переписка с клиентом в одном месте</li>
                <li><strong>Онбординг за клик</strong> — новый сотрудник видит полный контекст</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Alert Types */}
      <section className="website-section">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">AI-анализ</span>
            <h2 className="section-header__title">Типы уведомлений</h2>
            <p className="section-header__subtitle">
              Orbo анализирует сообщения и отправляет алерты о важном
            </p>
          </div>
          
          <div className="features-grid features-grid--4col">
            <div className="feature-card">
              <div className="feature-card__icon" style={{ background: '#fee2e2', color: '#dc2626' }}>
                <AlertTriangle size={24} />
              </div>
              <h4 className="feature-card__title">Негатив</h4>
              <p className="feature-card__text">
                Клиент недоволен, конфликт назревает, тон сообщения резкий
              </p>
            </div>
            
            <div className="feature-card">
              <div className="feature-card__icon" style={{ background: '#fef3c7', color: '#d97706' }}>
                <MessageCircleQuestion size={24} />
              </div>
              <h4 className="feature-card__title">Неотвеченный вопрос</h4>
              <p className="feature-card__text">
                Клиент задал вопрос, прошло N часов, ответа нет
              </p>
            </div>
            
            <div className="feature-card">
              <div className="feature-card__icon" style={{ background: '#dbeafe', color: '#2563eb' }}>
                <Clock size={24} />
              </div>
              <h4 className="feature-card__title">SLA просрочен</h4>
              <p className="feature-card__text">
                Время ответа превысило норматив для этого проекта
              </p>
            </div>
            
            <div className="feature-card">
              <div className="feature-card__icon" style={{ background: '#f3e8ff', color: '#9333ea' }}>
                <TrendingDown size={24} />
              </div>
              <h4 className="feature-card__title">Тишина в чате</h4>
              <p className="feature-card__text">
                В группе не было сообщений N дней — проект «заглох»
              </p>
            </div>
          </div>
          
          {/* Screenshots: Settings (2/3) + Telegram Chat (1/3) */}
          <div className="screenshot-grid screenshot-grid--2-1">
            <BrowserFrame 
              src="/4.1notifications.png" 
              alt="Настройка уведомлений в Orbo"
              url="my.orbo.ru/notifications"
              width={900}
              height={520}
            />
            <div className="screenshot-center">
              <PhoneFrame 
                src="/4.2notifications.png" 
                alt="AI-уведомления в Telegram"
                width={375}
                height={750}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Tone Detection */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Технология</span>
            <h2 className="section-header__title">Детекция тональности</h2>
            <p className="section-header__subtitle">
              AI-модель OpenAI анализирует эмоциональный окрас сообщений
            </p>
          </div>
          
          <div style={{ maxWidth: '700px', margin: '0 auto' }}>
            <div className="audience-card">
              <h4 className="audience-card__title">Как это работает</h4>
              <ol style={{ paddingLeft: '1.5rem', marginTop: '1rem', lineHeight: 1.8 }}>
                <li>Сообщение поступает в группу</li>
                <li>AI анализирует текст на наличие негатива, претензий, срочности</li>
                <li>Определяется уровень: нейтральный → мягкий негатив → явный негатив → эскалация</li>
                <li>При обнаружении проблемы — мгновенный алерт ответственному</li>
              </ol>
              
              <div style={{ marginTop: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: '#dcfce7', borderRadius: '9999px', fontSize: '0.875rem' }}>
                  🟢 Нейтрально
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: '#fef3c7', borderRadius: '9999px', fontSize: '0.875rem' }}>
                  🟡 Мягкий негатив
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: '#fed7aa', borderRadius: '9999px', fontSize: '0.875rem' }}>
                  🟠 Явный негатив
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: '#fee2e2', borderRadius: '9999px', fontSize: '0.875rem' }}>
                  🔴 Эскалация
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Settings */}
      <section className="website-section">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Настройки</span>
            <h2 className="section-header__title">Гибкая конфигурация</h2>
          </div>
          
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-card__icon"><Filter size={24} /></div>
              <h4 className="feature-card__title">Фильтры по группам</h4>
              <p className="feature-card__text">
                Включите мониторинг только для нужных групп. VIP-клиенты — строже, внутренние чаты — мягче
              </p>
            </div>
            
            <div className="feature-card">
              <div className="feature-card__icon"><Clock size={24} /></div>
              <h4 className="feature-card__title">SLA-таймеры</h4>
              <p className="feature-card__text">
                Установите нормативы времени ответа для каждого проекта: 1 час, 4 часа, 24 часа
              </p>
            </div>
            
            <div className="feature-card">
              <div className="feature-card__icon"><Bell size={24} /></div>
              <h4 className="feature-card__title">Каналы доставки</h4>
              <p className="feature-card__text">
                Telegram-бот, Email, webhook в ваши системы (Slack, Discord, etc.)
              </p>
            </div>
            
            <div className="feature-card">
              <div className="feature-card__icon"><Settings size={24} /></div>
              <h4 className="feature-card__title">Чувствительность</h4>
              <p className="feature-card__text">
                Регулируйте порог срабатывания: только явный негатив или включая мягкие сигналы
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Кейсы</span>
            <h2 className="section-header__title">Кому особенно полезно</h2>
          </div>
          
          <div className="features-grid">
            <div className="audience-card">
              <div className="audience-card__icon">
                <Building2 size={28} />
              </div>
              <h3 className="audience-card__title">SMM-агентства</h3>
              <p className="audience-card__text">
                Ведёте соцсети для клиентов, общаетесь в рабочих чатах. Руководитель видит «светофор» всех проектов.
              </p>
            </div>
            
            <div className="audience-card">
              <div className="audience-card__icon">
                <Zap size={28} />
              </div>
              <h3 className="audience-card__title">Performance-команды</h3>
              <p className="audience-card__text">
                Клиенты требуют быстрых ответов. SLA-мониторинг показывает, кто «горит».
              </p>
            </div>
            
            <div className="audience-card">
              <div className="audience-card__icon">
                <Users size={28} />
              </div>
              <h3 className="audience-card__title">Production-студии</h3>
              <p className="audience-card__text">
                Длинные проекты, много согласований. «Сейф» договорённостей защитит при спорах.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <div className="website-container">
          <h2 className="cta-section__title">Не пропускайте важное</h2>
          <p className="cta-section__text">
            Подключите рабочие группы и настройте AI-мониторинг
          </p>
          <div className="cta-section__actions">
            <Link href="https://my.orbo.ru/signup" className="btn-pill btn-pill--white">
              Начать бесплатно
              <ArrowRight size={16} />
            </Link>
            <Link href="/product" className="btn-pill btn-pill--ghost-dark">
              Все возможности
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
