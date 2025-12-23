import { Metadata } from 'next';
import Link from 'next/link';
import { 
  Calendar, Clock, MapPin, Image, Users as UsersIcon, 
  CreditCard, Send, Smartphone, CalendarCheck, CheckCircle2, 
  XCircle, AlertCircle, ArrowRight, Bot 
} from 'lucide-react';
import { Header, Footer, BrowserFrame, PhoneFrame, EventsFloatingCards } from '@/components/website';

export const metadata: Metadata = {
  title: 'События и регистрации',
  description: 'Организуйте мероприятия профессионально: от анонса до сбора оплат. Регистрация и оплата прямо в Telegram.',
};

export default function EventsPage() {
  return (
    <>
      <Header transparent />
      
      {/* Hero with Floating Cards */}
      <section className="hero-floating">
        <EventsFloatingCards />
        
        <div className="hero-floating__content">
          <span className="hero-floating__eyebrow">События</span>
          <h1 className="hero-floating__title">
            Мероприятия<br />без хаоса
          </h1>
          <p className="hero-floating__subtitle">
            Регистрация, оплата и напоминания — всё прямо в Telegram
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

      {/* Problem / Solution */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Зачем это нужно</span>
            <h2 className="section-header__title">Было — Стало</h2>
          </div>
          
          <div className="features-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))' }}>
            <div className="audience-card" style={{ borderLeft: '4px solid #ef4444' }}>
              <h3 className="audience-card__title" style={{ color: '#dc2626' }}>❌ Как было</h3>
              <ul className="audience-card__features">
                <li><strong>Регистрационный ад</strong> — анонс → сайт → форма → оплата → чат. Конверсия теряется на каждом шаге</li>
                <li><strong>Ручная сверка</strong> — «скинь скрин оплаты в личку», часы на проверку</li>
                <li><strong>Потеря статуса</strong> — «скинь на Сбер» снижает уровень мероприятия</li>
                <li><strong>Низкая доходимость</strong> — зарегистрировался и забыл, письмо в спаме</li>
                <li><strong>«Кто все эти люди?»</strong> — 20 незнакомцев, 40 минут на знакомство</li>
              </ul>
            </div>
            
            <div className="audience-card" style={{ borderLeft: '4px solid #22c55e' }}>
              <h3 className="audience-card__title" style={{ color: '#16a34a' }}>✅ С Orbo</h3>
              <ul className="audience-card__features">
                <li><strong>Регистрация в 2 клика</strong> — прямо в Telegram, без переходов</li>
                <li><strong>Оплата через бот</strong> — профессиональный вид</li>
                <li><strong>Напоминания там, где человек</strong> — в Telegram 24/7</li>
                <li><strong>Профили заранее</strong> — знаете, кто придёт</li>
                <li><strong>CRM участников</strong> — данные сохраняются для следующих событий</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Creating Event */}
      <section className="website-section">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Шаг 1</span>
            <h2 className="section-header__title">Создание события</h2>
            <p className="section-header__subtitle">Настройте все параметры мероприятия</p>
          </div>
          
          <div className="features-grid features-grid--4col">
            <div className="feature-card">
              <div className="feature-card__icon"><Calendar size={24} /></div>
              <h4 className="feature-card__title">Название и описание</h4>
              <p className="feature-card__text">С поддержкой Telegram-разметки: жирный, курсив, спойлеры</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-card__icon"><Clock size={24} /></div>
              <h4 className="feature-card__title">Дата и время</h4>
              <p className="feature-card__text">Начало и окончание, многодневные события</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-card__icon"><MapPin size={24} /></div>
              <h4 className="feature-card__title">Формат и место</h4>
              <p className="feature-card__text">Онлайн или офлайн, адрес или ссылка на трансляцию</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-card__icon"><Image size={24} /></div>
              <h4 className="feature-card__title">Обложка</h4>
              <p className="feature-card__text">Загрузите картинку для анонса</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-card__icon"><UsersIcon size={24} /></div>
              <h4 className="feature-card__title">Лимит участников</h4>
              <p className="feature-card__text">Ограничьте количество мест</p>
            </div>
          </div>
          
          {/* Event Page Screenshot */}
          <BrowserFrame 
            src="/5.1event.png" 
            alt="Страница события в Orbo"
            url="my.orbo.ru/events/event-id"
            width={1200}
            height={700}
          />
        </div>
      </section>

      {/* Registration Form with MiniApp Screenshot */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Шаг 2</span>
            <h2 className="section-header__title">Форма регистрации</h2>
            <p className="section-header__subtitle">Собирайте нужные данные от участников</p>
          </div>
          
          <div className="content-screenshot-row content-screenshot-row--narrow-phone">
            <div className="audience-card">
              <p className="audience-card__text">
                Настройте обязательность каждого поля:
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {['Имя', 'Email', 'Телефон', 'Кратко о себе'].map((field) => (
                    <tr key={field} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '0.75rem 0', fontWeight: 500 }}>{field}</td>
                      <td style={{ padding: '0.75rem 0', textAlign: 'right', color: 'var(--website-text-muted)' }}>
                        Обязательное / опциональное
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="audience-card__text" style={{ marginTop: '1rem', marginBottom: 0 }}>
                Данные автоматически подтягиваются из Telegram-профиля — минимум ввода для участников.
              </p>
            </div>
            
            {/* MiniApp Screenshot */}
            <div className="screenshot-center">
              <PhoneFrame 
                src="/5.2event-miniapp.png" 
                alt="Telegram MiniApp для регистрации на событие"
                width={375}
                height={812}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Paid Events */}
      <section className="website-section">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Шаг 3</span>
            <h2 className="section-header__title">Платные события</h2>
            <p className="section-header__subtitle">Для мероприятий со сбором оплаты</p>
          </div>
          
          <div className="features-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            <div className="feature-card">
              <div className="feature-card__icon"><CreditCard size={24} /></div>
              <h4 className="feature-card__title">Укажите цену</h4>
              <p className="feature-card__text">В рублях или другой валюте</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-card__icon"><Send size={24} /></div>
              <h4 className="feature-card__title">Ссылка на оплату</h4>
              <p className="feature-card__text">ЮKassa, Tinkoff, Stripe — любой сервис</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-card__icon"><CheckCircle2 size={24} /></div>
              <h4 className="feature-card__title">Двухшаговая регистрация</h4>
              <p className="feature-card__text">Сначала данные, потом оплата</p>
            </div>
          </div>
          
          <div style={{ maxWidth: '600px', margin: '2rem auto 0' }}>
            <div className="audience-card">
              <h4 className="audience-card__title">Статусы оплаты</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1rem' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: '#fef3c7', borderRadius: '9999px', fontSize: '0.875rem' }}>
                  <span style={{ width: 8, height: 8, background: '#f59e0b', borderRadius: '50%' }}></span>
                  Ожидает оплаты
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: '#dcfce7', borderRadius: '9999px', fontSize: '0.875rem' }}>
                  <span style={{ width: 8, height: 8, background: '#22c55e', borderRadius: '50%' }}></span>
                  Оплачено
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: '#dbeafe', borderRadius: '9999px', fontSize: '0.875rem' }}>
                  <span style={{ width: 8, height: 8, background: '#3b82f6', borderRadius: '50%' }}></span>
                  Частично
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: '#fee2e2', borderRadius: '9999px', fontSize: '0.875rem' }}>
                  <span style={{ width: 8, height: 8, background: '#ef4444', borderRadius: '50%' }}></span>
                  Просрочено
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Telegram Integration */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Интеграция</span>
            <h2 className="section-header__title">Публикация в Telegram</h2>
          </div>
          
          <div className="features-grid">
            <div className="audience-card">
              <div className="audience-card__icon">
                <Send size={28} />
              </div>
              <h3 className="audience-card__title">Анонс в группах</h3>
              <p className="audience-card__text">
                Выберите группы для публикации. Бот отправит красивый анонс с обложкой и кнопкой «Зарегистрироваться».
              </p>
            </div>
            
            <div className="audience-card">
              <div className="audience-card__icon">
                <Smartphone size={28} />
              </div>
              <h3 className="audience-card__title">Telegram MiniApp</h3>
              <p className="audience-card__text">
                Регистрация без выхода из Telegram. Данные подставляются автоматически. Бот: @orbo_event_bot
              </p>
              <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--website-bg-alt)', borderRadius: 'var(--website-radius-md)', fontFamily: 'monospace', fontSize: '0.875rem' }}>
                t.me/orbo_event_bot?startapp=e-ID
              </div>
            </div>
            
            <div className="audience-card">
              <div className="audience-card__icon">
                <CalendarCheck size={28} />
              </div>
              <h3 className="audience-card__title">Календарь событий</h3>
              <p className="audience-card__text">
                Участники могут добавить событие в свой календарь или подписаться на календарь организации.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Payments Section */}
      <section className="website-section">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Оплаты</span>
            <h2 className="section-header__title">Управление платежами</h2>
            <p className="section-header__subtitle">
              Отслеживайте статусы оплат и собирайте деньги профессионально
            </p>
          </div>
          
          <BrowserFrame 
            src="/5.3payments.png" 
            alt="Список участников и оплат события"
            url="my.orbo.ru/events/payments"
            width={1200}
            height={550}
          />
        </div>
      </section>

      {/* Use Cases */}
      <section className="website-section">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Примеры</span>
            <h2 className="section-header__title">Какие события проводят</h2>
          </div>
          
          <div className="features-grid features-grid--4col">
            {[
              'Бизнес-завтраки',
              'Мастермайнды',
              'Вебинары и воркшопы',
              'Конференции',
              'Нетворкинг-встречи',
              'Клубные мероприятия',
              'Совместные посещения (бани, рестораны)',
              'Образовательные курсы'
            ].map((item) => (
              <div key={item} className="feature-card" style={{ textAlign: 'center' }}>
                <p className="feature-card__title" style={{ margin: 0 }}>{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <div className="website-container">
          <h2 className="cta-section__title">Проведите первое событие</h2>
          <p className="cta-section__text">
            Создайте аккаунт и запустите регистрацию за 5 минут
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
