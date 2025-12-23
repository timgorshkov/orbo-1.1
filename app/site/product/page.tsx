import { Metadata } from 'next';
import Link from 'next/link';
import { 
  Users, Building2, GraduationCap, BarChart3, Bell, Calendar, 
  UserCircle, ArrowRight, Bot, MessageSquare, Ticket 
} from 'lucide-react';
import { Header, Footer, BrowserFrame } from '@/components/website';

export const metadata: Metadata = {
  title: 'Продукт',
  description: 'Orbo — платформа для управления Telegram-сообществами. Аналитика, события, уведомления, CRM участников.',
};

export default function ProductPage() {
  return (
    <>
      <Header />
      
      {/* Hero */}
      <section className="website-section" style={{ paddingTop: 'calc(80px + 4rem)' }}>
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Платформа</span>
            <h1 className="section-header__title" style={{ fontSize: 'clamp(2rem, 5vw, 3rem)' }}>
              Orbo — Платформа для управления<br />Telegram-сообществами
            </h1>
            <p className="section-header__subtitle" style={{ maxWidth: '600px', margin: '1rem auto 0' }}>
              Понимайте свою аудиторию, автоматизируйте рутину, развивайте сообщество
            </p>
          </div>
          
          {/* Product Overview Screenshot */}
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
            <h2 className="section-header__title">Три сценария использования</h2>
          </div>
          
          <div className="features-grid">
            <div className="audience-card">
              <div className="audience-card__icon">
                <Users size={28} />
              </div>
              <h3 className="audience-card__title">Владельцы онлайн-сообществ</h3>
              <p className="audience-card__subtitle">Тематические группы, профессиональные сообщества, фан-клубы</p>
              <p className="audience-card__text">
                Telegram не даёт аналитику по группе. Вы не видите, кто активен, кто уходит, какие темы волнуют участников.
              </p>
              <ul className="audience-card__features">
                <li>Аналитика активности: кто пишет, когда, на какие темы</li>
                <li>AI-профили участников с определением интересов</li>
                <li>Зоны внимания: новички, участники на грани оттока</li>
                <li>Единый дашборд для всех групп</li>
              </ul>
            </div>
            
            <div className="audience-card">
              <div className="audience-card__icon">
                <Building2 size={28} />
              </div>
              <h3 className="audience-card__title">Рабочие команды и агентства</h3>
              <p className="audience-card__subtitle">SMM-агентства, performance-команды, production-студии</p>
              <p className="audience-card__text">
                Руководитель ведёт 20–50 проектов и не успевает читать все чаты. О проблеме узнаёт, только когда клиент уже кричит.
              </p>
              <ul className="audience-card__features">
                <li>«Светофор» статусов проектов — зелёные и красные чаты</li>
                <li>AI-уведомления о негативе и неотвеченных вопросах</li>
                <li>Контроль SLA — как быстро отвечает команда</li>
                <li>«Сейф» договорённостей — история для защиты от претензий</li>
              </ul>
            </div>
            
            <div className="audience-card">
              <div className="audience-card__icon">
                <GraduationCap size={28} />
              </div>
              <h3 className="audience-card__title">Организаторы мероприятий</h3>
              <p className="audience-card__subtitle">Бизнес-завтраки, мастермайнды, нетворкинг, образование</p>
              <p className="audience-card__text">
                Проверка скриншотов оплаты в личке — рутина. Связка «анонс → форма → оплата → чат» теряет конверсию.
              </p>
              <ul className="audience-card__features">
                <li>Регистрация и оплата в 2 клика — прямо в Telegram</li>
                <li>Профессиональный вид — оплата через бот</li>
                <li>CRM участников — данные для следующих анонсов</li>
                <li>Аналитика «ядра» — кто реально ходит</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="website-section">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Возможности</span>
            <h2 className="section-header__title">Ключевые функции платформы</h2>
          </div>
          
          <div className="features-grid features-grid--4col">
            <Link href="/product/analytics" className="feature-card">
              <div className="feature-card__icon">
                <BarChart3 size={24} />
              </div>
              <h4 className="feature-card__title">Аналитика сообщества</h4>
              <p className="feature-card__text">
                Метрики активности, тепловая карта, категоризация участников, зоны внимания
              </p>
            </Link>
            
            <Link href="/notifications" className="feature-card">
              <div className="feature-card__icon">
                <Bell size={24} />
              </div>
              <h4 className="feature-card__title">Умные уведомления</h4>
              <p className="feature-card__text">
                AI-детекция негатива, неотвеченные вопросы, неактивность группы
              </p>
            </Link>
            
            <Link href="/events" className="feature-card">
              <div className="feature-card__icon">
                <Calendar size={24} />
              </div>
              <h4 className="feature-card__title">События и регистрации</h4>
              <p className="feature-card__text">
                Онлайн и офлайн события, гибкая форма, управление оплатами, MiniApp
              </p>
            </Link>
            
            <Link href="/crm" className="feature-card">
              <div className="feature-card__icon">
                <UserCircle size={24} />
              </div>
              <h4 className="feature-card__title">CRM участников</h4>
              <p className="feature-card__text">
                Профили, AI-анализ интересов, импорт истории, поиск и фильтрация
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
              <h4 className="feature-card__title">@orbo_assist_bot</h4>
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
                MiniApp для регистрации на события
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <div className="website-container">
          <h2 className="cta-section__title">Начните бесплатно</h2>
          <p className="cta-section__text">
            Подключите первую группу и оцените возможности Orbo
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
