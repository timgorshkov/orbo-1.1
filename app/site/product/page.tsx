import { Metadata } from 'next';
import Link from 'next/link';
import { 
  Users, Building2, GraduationCap, Bell, Calendar, 
  UserCircle, ArrowRight, Bot, MessageSquare, Ticket 
} from 'lucide-react';
import { Header, Footer, BrowserFrame, ProductFloatingCards } from '@/components/website';

export const metadata: Metadata = {
  title: 'Продукт',
  description: 'Orbo — платформа для управления Telegram-сообществами. Аналитика, события, уведомления, CRM участников.',
};

export default function ProductPage() {
  return (
    <>
      <Header transparent />
      
      {/* Hero with Floating Cards */}
      <section className="hero-floating" style={{ minHeight: '60vh' }}>
        <ProductFloatingCards />
        
        <div className="hero-floating__content">
          <span className="hero-floating__eyebrow">Orbo</span>
          <h1 className="hero-floating__title">
            CRM участников<br />и событий
          </h1>
          <p className="hero-floating__subtitle">
            MiniApp для регистрации и оплаты прямо в Telegram. Напоминания в личку. Карточки участников с историей.
          </p>
          <div className="hero-floating__actions">
            <Link href="https://my.orbo.ru/signup" className="btn-pill btn-pill--primary">
              Начать бесплатно
            </Link>
            <Link href="https://calendly.com/timgorshkov/30min" className="btn-pill btn-pill--outline">
              Записаться на демо
            </Link>
          </div>
        </div>
      </section>
      
      {/* Product Screenshot */}
      <section className="website-section" style={{ paddingTop: 0 }}>
        <div className="website-container">
          <BrowserFrame 
            src="/2.product-overview.png" 
            alt="Обзор платформы Orbo — дашборд и аналитика"
            url="my.orbo.ru"
            width={1200}
            height={700}
          />
        </div>
      </section>

      {/* For Who */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Для кого</span>
            <h2 className="section-header__title">Знакомые ситуации?</h2>
          </div>
          
          <div className="features-grid">
            <div className="audience-card">
              <div className="audience-card__icon">
                <GraduationCap size={28} />
              </div>
              <h3 className="audience-card__title">Клубы и сообщества с мероприятиями</h3>
              <p className="audience-card__subtitle">Бизнес-клубы, профессиональные комьюнити, нетворкинг-хабы</p>
              <p className="audience-card__text">
                Люди регистрируются, но не доходят. Теряете деньги на тех, кто не участвует. Не видите, кто реально ценен.
              </p>
              <ul className="audience-card__features">
                <li>MiniApp для регистрации и оплаты — без выхода из Telegram</li>
                <li>Напоминания в личку повышают доходимость</li>
                <li>Карточка участника с историей посещений</li>
                <li>Видите, кто реально ходит и платит</li>
              </ul>
            </div>
            
            <div className="audience-card">
              <div className="audience-card__icon">
                <Users size={28} />
              </div>
              <h3 className="audience-card__title">Сообщества с заявками</h3>
              <p className="audience-card__subtitle">Закрытые группы, join-by-request, клиентские сообщества</p>
              <p className="audience-card__text">
                Десятки заявок в день. Боты и спам. Тратите время на проверку, не понимая, кто перед вами.
              </p>
              <ul className="audience-card__features">
                <li>Заявки со статусами и воронкой</li>
                <li>Анкета сохраняется в карточку участника</li>
                <li>Spam-score помогает фильтровать</li>
                <li>Вы принимаете решение, не автоматика</li>
              </ul>
            </div>
            
            <div className="audience-card">
              <div className="audience-card__icon">
                <Building2 size={28} />
              </div>
              <h3 className="audience-card__title">Авторы каналов</h3>
              <p className="audience-card__subtitle">Эксперты, консультанты, личные бренды</p>
              <p className="audience-card__text">
                Комментаторы и участники событий — ваше ценное ядро. Но контакт с ними теряется после первого касания.
              </p>
              <ul className="audience-card__features">
                <li>Карточки комментаторов канала</li>
                <li>События для сбора контактов</li>
                <li>История касаний и активности</li>
                <li>Работа с активной аудиторией</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="website-section">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Что внутри</span>
            <h2 className="section-header__title">Участники, события, контроль</h2>
          </div>
          
          <div className="features-grid features-grid--4col">
            <Link href="/crm" className="feature-card">
              <div className="feature-card__icon">
                <UserCircle size={24} />
              </div>
              <h4 className="feature-card__title">Карточки участников</h4>
              <p className="feature-card__text">
                Не знаете, кто перед вами? Карточка с историей участия, активностью и контактами
              </p>
            </Link>
            
            <div className="feature-card">
              <div className="feature-card__icon">
                <Users size={24} />
              </div>
              <h4 className="feature-card__title">Заявки на вступление</h4>
              <p className="feature-card__text">
                Устали от ботов и спама? Анкеты, spam-score и воронка со статусами
              </p>
            </div>
            
            <Link href="/events" className="feature-card">
              <div className="feature-card__icon">
                <Calendar size={24} />
              </div>
              <h4 className="feature-card__title">MiniApp для событий</h4>
              <p className="feature-card__text">
                Регистрация и оплата в Telegram — выше конверсия. Напоминания в личку — выше доходимость.
              </p>
            </Link>
            
            <Link href="/notifications" className="feature-card">
              <div className="feature-card__icon">
                <Bell size={24} />
              </div>
              <h4 className="feature-card__title">Умные уведомления</h4>
              <p className="feature-card__text">
                Пропускаете важное? AI находит негатив, вопросы и тишину в чатах
              </p>
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Начало работы</span>
            <h2 className="section-header__title">Как это работает</h2>
          </div>
          
          <div className="steps-grid">
            <div className="step-card">
              <div className="step-card__number">1</div>
              <h4 className="step-card__title">Создайте пространство</h4>
              <p className="step-card__text">
                Зарегистрируйтесь на my.orbo.ru и создайте организацию для вашего сообщества
              </p>
            </div>
            <div className="step-card">
              <div className="step-card__number">2</div>
              <h4 className="step-card__title">Подключите группы</h4>
              <p className="step-card__text">
                Добавьте бота @orbo_community_bot в ваши группы как администратора
              </p>
            </div>
            <div className="step-card">
              <div className="step-card__number">3</div>
              <h4 className="step-card__title">Настройте под себя</h4>
              <p className="step-card__text">
                Включите уведомления, создайте событие, пригласите команду
              </p>
            </div>
            <div className="step-card">
              <div className="step-card__number">4</div>
              <h4 className="step-card__title">Развивайте сообщество</h4>
              <p className="step-card__text">
                Используйте данные для решений. Растите вместе с аудиторией
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Bots */}
      <section className="website-section">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Инструменты</span>
            <h2 className="section-header__title">Три бота Orbo</h2>
          </div>
          
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-card__icon">
                <Bot size={24} />
              </div>
              <h4 className="feature-card__title">@orbo_community_bot</h4>
              <p className="feature-card__text">
                Основной бот. Добавляется в группы для сбора аналитики
              </p>
            </div>
            
            <div className="feature-card">
              <div className="feature-card__icon">
                <MessageSquare size={24} />
              </div>
              <h4 className="feature-card__title">@orbo_assistant_bot</h4>
              <p className="feature-card__text">
                Отправляет уведомления и коды авторизации
              </p>
            </div>
            
            <div className="feature-card">
              <div className="feature-card__icon">
                <Ticket size={24} />
              </div>
              <h4 className="feature-card__title">@orbo_event_bot</h4>
              <p className="feature-card__text">
                MiniApp для регистрации и оплаты. Нативный опыт в Telegram — участник не уходит на внешний сайт.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <div className="website-container">
          <h2 className="cta-section__title">Создайте MiniApp для вашего события</h2>
          <p className="cta-section__text">
            Регистрация, оплата и напоминания — за пару кликов, бесплатно
          </p>
          <div className="cta-section__actions">
            <Link href="https://my.orbo.ru/signup" className="btn-pill btn-pill--white">
              Создать аккаунт
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
