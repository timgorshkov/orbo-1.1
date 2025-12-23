import { Users, Building2, Calendar, BarChart3, Bell, UserCircle } from 'lucide-react';
import { Header, Footer, Orb } from '@/components/website';
import Link from 'next/link';

// Messenger logo SVGs
const TelegramLogo = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
);

const WhatsAppLogo = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

// Max messenger logo (simplified)
const MaxLogo = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
    <path d="M8 11.5l2.5 2.5L16 8.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export default function HomePage() {
  return (
    <>
      <Header />
      
      {/* ========== HERO с ORB эффектом ========== */}
      <section className="hero-orb-section">
        <Orb hue={0} hoverIntensity={0.11} rotateOnHover forceHoverState={false} />
        
        <div className="hero-orb-section__content">
          <h1 className="hero-orb-section__title">
            CRM для групп и сообществ<br />в мессенджерах
          </h1>
          
          <p className="hero-orb-section__subtitle">
            Аналитика, события, уведомления — всё в одном месте
          </p>
          
          <div className="hero-orb-section__actions">
            <Link href="https://my.orbo.ru/signup" className="btn-pill btn-pill--primary btn-pill--sm">
              Начать бесплатно
            </Link>
            <Link href="https://calendly.com/timgorshkov/30min" className="btn-pill btn-pill--ghost btn-pill--sm">
              Записаться на демо
            </Link>
          </div>
          
          {/* Поддерживаемые мессенджеры - внутри контента, выше */}
          <div className="messengers-section messengers-section--inline">
            <span className="messengers-section__label">Поддерживаемые мессенджеры</span>
            <div className="messengers-section__logos">
              <div className="messenger-logo" title="Telegram">
                <TelegramLogo />
              </div>
              <div className="messenger-logo" title="WhatsApp">
                <WhatsAppLogo />
              </div>
              <div className="messenger-logo" title="Max">
                <MaxLogo />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========== FOR WHO ========== */}
      <section className="website-section">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Для кого</span>
            <h2 className="section-header__title">Решаем боли разных команд</h2>
            <p className="section-header__subtitle">
              От владельцев сообществ до агентств с десятками клиентских чатов
            </p>
          </div>
          
          <div className="features-grid">
            <div className="audience-card">
              <div className="audience-card__icon">
                <Users size={28} />
              </div>
              <h3 className="audience-card__title">Владельцы сообществ</h3>
              <p className="audience-card__subtitle">IT-группы, клубы, профессиональные сообщества</p>
              <p className="audience-card__text">
                Telegram не даёт аналитику. Вы не видите, кто активен, кто уходит, какие темы волнуют участников.
              </p>
              <ul className="audience-card__features">
                <li>AI-профили с интересами участников</li>
                <li>Зоны внимания: новички, отток</li>
                <li>Аналитика активности</li>
              </ul>
            </div>
            
            <div className="audience-card">
              <div className="audience-card__icon">
                <Building2 size={28} />
              </div>
              <h3 className="audience-card__title">Агентства и команды</h3>
              <p className="audience-card__subtitle">SMM, performance, production-студии</p>
              <p className="audience-card__text">
                20–50 клиентских чатов — руководитель не успевает следить. О проблеме узнаёт, когда клиент уже кричит.
              </p>
              <ul className="audience-card__features">
                <li>AI-алерты о негативе</li>
                <li>Контроль времени ответа (SLA)</li>
                <li>«Сейф» договорённостей</li>
              </ul>
            </div>
            
            <div className="audience-card">
              <div className="audience-card__icon">
                <Calendar size={28} />
              </div>
              <h3 className="audience-card__title">Организаторы событий</h3>
              <p className="audience-card__subtitle">Мастермайнды, бизнес-завтраки, клубы</p>
              <p className="audience-card__text">
                Проверка скриншотов оплаты в личке — рутина. Анонс → Форма → Оплата → Чат — потеря конверсии.
              </p>
              <ul className="audience-card__features">
                <li>Регистрация прямо в Telegram</li>
                <li>Управление оплатами</li>
                <li>CRM участников событий</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ========== KEY FEATURES ========== */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Возможности</span>
            <h2 className="section-header__title">Всё для управления сообществом</h2>
          </div>
          
          <div className="features-grid features-grid--4col">
            <div className="feature-card">
              <div className="feature-card__icon">
                <BarChart3 size={24} />
              </div>
              <h4 className="feature-card__title">Аналитика</h4>
              <p className="feature-card__text">Метрики активности, тепловая карта, категории участников</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-card__icon">
                <Bell size={24} />
              </div>
              <h4 className="feature-card__title">AI-уведомления</h4>
              <p className="feature-card__text">Негатив, неотвеченные вопросы, тишина в группах</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-card__icon">
                <Calendar size={24} />
              </div>
              <h4 className="feature-card__title">События</h4>
              <p className="feature-card__text">Регистрация, оплаты, Telegram MiniApp</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-card__icon">
                <UserCircle size={24} />
              </div>
              <h4 className="feature-card__title">CRM</h4>
              <p className="feature-card__text">Профили, AI-интересы, импорт WhatsApp</p>
            </div>
          </div>
          
          <div className="text-center" style={{ marginTop: '3rem' }}>
            <Link href="/product" className="btn-pill btn-pill--outline">
              Подробнее о продукте
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ========== HOW IT WORKS ========== */}
      <section className="website-section">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Как начать</span>
            <h2 className="section-header__title">Три шага к порядку</h2>
          </div>
          
          <div className="steps-grid">
            <div className="step-card">
              <div className="step-card__number">1</div>
              <h4 className="step-card__title">Подключите группу</h4>
              <p className="step-card__text">
                Добавьте бота @orbo_community_bot в Telegram-группу как администратора
              </p>
            </div>
            <div className="step-card">
              <div className="step-card__number">2</div>
              <h4 className="step-card__title">Настройте уведомления</h4>
              <p className="step-card__text">
                Выберите, о чём получать алерты: негатив, вопросы, тишина
              </p>
            </div>
            <div className="step-card">
              <div className="step-card__number">3</div>
              <h4 className="step-card__title">Управляйте сообществом</h4>
              <p className="step-card__text">
                Изучайте аналитику, проводите события, знайте своих участников
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========== CTA ========== */}
      <section className="cta-section">
        <div className="website-container">
          <h2 className="cta-section__title">Готовы навести порядок?</h2>
          <p className="cta-section__text">
            Подключите первую группу бесплатно и оцените возможности Orbo
          </p>
          <div className="cta-section__actions">
            <Link href="https://my.orbo.ru/signup" className="btn-pill btn-pill--white">
              Начать бесплатно
            </Link>
            <Link href="https://calendly.com/timgorshkov/30min" className="btn-pill btn-pill--ghost-dark">
              Записаться на демо
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
