import { Users, Building2, Calendar, BarChart3, Bell, UserCircle } from 'lucide-react';
import { Header, Footer, Orb, BrowserFrame } from '@/components/website';
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

// Max messenger logo
const MaxLogo = () => (
  <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15.63 40.465c8.083 7.193 27.86-1.166 27.783-15.85C43.36 14.546 35.107 4.59 24.873 4.5c-9.538-.083-19.648 5.962-20.23 17.767c-.172 3.515 0 8.859 1.231 11.73c2.335 6.7.113 8.477 2.804 9.328q3.617.9 6.953-2.861"/>
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
            CRM участников и событий<br />для Telegram-сообществ
          </h1>
          
          <p className="hero-orb-section__subtitle">
            Повышайте доходимость на мероприятия, принимайте людей без хаоса и сохраняйте историю участия
          </p>
          
          <div className="hero-orb-section__actions">
            <Link href="https://my.orbo.ru/signup" className="btn-pill btn-pill--primary btn-pill--sm">
              Попробуйте бесплатно
            </Link>
            <Link href="https://calendly.com/timgorshkov/30min" className="btn-pill btn-pill--ghost btn-pill--sm" target="_blank" rel="noopener noreferrer">
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
            <h2 className="section-header__title">Знакомые ситуации?</h2>
            <p className="section-header__subtitle">
              Orbo помогает тем, кто строит и развивает сообщества в Telegram
            </p>
          </div>
          
          <div className="features-grid">
            <div className="audience-card">
              <div className="audience-card__icon">
                <Calendar size={28} />
              </div>
              <h3 className="audience-card__title">Клубы и сообщества с мероприятиями</h3>
              <p className="audience-card__subtitle">Бизнес-клубы, профессиональные комьюнити, нетворкинг-хабы</p>
              <p className="audience-card__text">
                Люди регистрируются, но не доходят. Теряете деньги и время на тех, кто не участвует.
              </p>
              <ul className="audience-card__features">
                <li>Напоминания повышают доходимость</li>
                <li>Карточка участника с историей посещений</li>
                <li>Видите, кто реально ходит и платит</li>
              </ul>
            </div>
            
            <div className="audience-card">
              <div className="audience-card__icon">
                <Users size={28} />
              </div>
              <h3 className="audience-card__title">Сообщества с заявками</h3>
              <p className="audience-card__subtitle">Закрытые группы, join-by-request, клиентские чаты</p>
              <p className="audience-card__text">
                Десятки заявок в день. Боты, спам, непонятные профили. Тратите время на ручную проверку.
              </p>
              <ul className="audience-card__features">
                <li>Заявки с анкетой через MiniApp</li>
                <li>Автоматический spam-score</li>
                <li>Воронка со статусами</li>
              </ul>
            </div>
            
            <div className="audience-card">
              <div className="audience-card__icon">
                <Building2 size={28} />
              </div>
              <h3 className="audience-card__title">Авторы каналов</h3>
              <p className="audience-card__subtitle">Эксперты, консультанты, личные бренды</p>
              <p className="audience-card__text">
                Комментаторы и участники событий — ваше ценное ядро. Но вы теряете с ними контакт.
              </p>
              <ul className="audience-card__features">
                <li>Карточки комментаторов и участников</li>
                <li>События для сбора контактов</li>
                <li>Работа с активной аудиторией</li>
              </ul>
            </div>
          </div>
          
          {/* Dashboard Screenshot */}
          <BrowserFrame 
            src="/1.main-obzorny.png" 
            alt="Дашборд Orbo — аналитика сообщества"
            url="my.orbo.ru/dashboard"
            width={1200}
            height={692}
          />
        </div>
      </section>

      {/* ========== KEY FEATURES ========== */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Что внутри</span>
            <h2 className="section-header__title">Участники, события, контроль</h2>
          </div>
          
          <div className="features-grid features-grid--4col">
            <div className="feature-card">
              <div className="feature-card__icon">
                <UserCircle size={24} />
              </div>
              <h4 className="feature-card__title">Карточки участников</h4>
              <p className="feature-card__text">История активности, интересы, посещения</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-card__icon">
                <Users size={24} />
              </div>
              <h4 className="feature-card__title">Заявки на вступление</h4>
              <p className="feature-card__text">Анкеты, spam-score, статусы</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-card__icon">
                <Calendar size={24} />
              </div>
              <h4 className="feature-card__title">События и регистрации</h4>
              <p className="feature-card__text">Оплаты, напоминания, чекин</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-card__icon">
                <Bell size={24} />
              </div>
              <h4 className="feature-card__title">Умные уведомления</h4>
              <p className="feature-card__text">Негатив, вопросы, тишина в чатах</p>
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
            <h2 className="section-header__title">Три шага — и вы в курсе</h2>
          </div>
          
          <div className="steps-grid">
            <div className="step-card">
              <div className="step-card__number">1</div>
              <h4 className="step-card__title">Подключите группу</h4>
              <p className="step-card__text">
                Добавьте бота в Telegram-группу — участники начнут появляться автоматически
              </p>
            </div>
            <div className="step-card">
              <div className="step-card__number">2</div>
              <h4 className="step-card__title">Создайте первое событие</h4>
              <p className="step-card__text">
                Регистрация через Telegram, напоминания, сбор оплат — всё в одном месте
              </p>
            </div>
            <div className="step-card">
              <div className="step-card__number">3</div>
              <h4 className="step-card__title">Знайте своих людей</h4>
              <p className="step-card__text">
                Карточки участников с историей посещений, активностью и контактами
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========== CTA ========== */}
      <section className="cta-section">
        <div className="website-container">
          <h2 className="cta-section__title">Повысьте доходимость на следующем событии</h2>
          <p className="cta-section__text">
            Создайте регистрацию, поделитесь ссылкой и соберите контакты участников
          </p>
          <div className="cta-section__actions">
            <Link href="https://my.orbo.ru/signup" className="btn-pill btn-pill--white">
              Попробуйте бесплатно
            </Link>
            <Link href="https://calendly.com/timgorshkov/30min" className="btn-pill btn-pill--ghost-dark" target="_blank" rel="noopener noreferrer">
              Записаться на демо
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
