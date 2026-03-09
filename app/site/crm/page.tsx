import { Metadata } from 'next';
import Link from 'next/link';
import { 
  UserCircle, Brain, MessageSquare, Search, Tag, 
  Upload, Download, Filter, ArrowRight, Users, 
  Sparkles, Database 
} from 'lucide-react';
import { Header, Footer, BrowserFrame, CRMFloatingCards } from '@/components/website';

export const metadata: Metadata = {
  title: 'CRM участников Telegram-сообщества',
  description: 'Карточки участников с историей активности, посещённых событий и сообщений. AI-анализ профилей. Импорт из Telegram и WhatsApp.',
  alternates: { canonical: '/crm' },
};

export default function CRMPage() {
  return (
    <>
      <Header transparent />
      
      {/* Hero with Floating Cards */}
      <section className="hero-floating">
        <CRMFloatingCards />
        
        <div className="hero-floating__content">
          <span className="hero-floating__eyebrow">Участники</span>
          <h1 className="hero-floating__title">
            Знайте своих<br />людей
          </h1>
          <p className="hero-floating__subtitle">
            Карточки участников с историей посещений, активностью и контактами. Не теряйте людей после первого касания.
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
            <span className="section-header__eyebrow">Для владельцев сообществ</span>
            <h2 className="section-header__title">Знакомая ситуация?</h2>
          </div>
          
          <div className="features-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))' }}>
            <div className="audience-card" style={{ borderLeft: '4px solid #ef4444' }}>
              <h3 className="audience-card__title" style={{ color: '#dc2626' }}>❌ Типичные проблемы</h3>
              <ul className="audience-card__features">
                <li><strong>«Кто все эти люди?»</strong> — 500 участников в группе, вы не знаете никого</li>
                <li><strong>Заявки без контекста</strong> — человек подал заявку, а вы не знаете, кто он</li>
                <li><strong>Комментаторы — незнакомцы</strong> — активная аудитория канала, но без профилей</li>
                <li><strong>Нет истории</strong> — человек был на событии год назад, вы не помните</li>
                <li><strong>Кто реально активен?</strong> — вы не знаете, кто ядро, а кто «мёртвая душа»</li>
              </ul>
            </div>
            
            <div className="audience-card" style={{ borderLeft: '4px solid #22c55e' }}>
              <h3 className="audience-card__title" style={{ color: '#16a34a' }}>✅ С Orbo</h3>
              <ul className="audience-card__features">
                <li><strong>Единый профиль</strong> — сообщения, заявки, события, комментарии</li>
                <li><strong>AI-интересы</strong> — автоматически: «ищет разработчика», «предлагает услуги»</li>
                <li><strong>Связка с заявками</strong> — данные анкеты сохраняются в профиль</li>
                <li><strong>Комментаторы канала</strong> — профили тех, кто взаимодействует</li>
                <li><strong>Категоризация</strong> — ядро, новички, опытные, молчуны</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Profile Features */}
      <section className="website-section">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Карточка участника</span>
            <h2 className="section-header__title">Что внутри карточки</h2>
          </div>
          
          <div className="features-grid features-grid--4col">
            <div className="feature-card">
              <div className="feature-card__icon"><UserCircle size={24} /></div>
              <h4 className="feature-card__title">Контакты</h4>
              <p className="feature-card__text">Имя, фото, username, телефон, email</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-card__icon"><MessageSquare size={24} /></div>
              <h4 className="feature-card__title">История участия</h4>
              <p className="feature-card__text">Посещённые события, группы, активность</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-card__icon"><Brain size={24} /></div>
              <h4 className="feature-card__title">AI-интересы</h4>
              <p className="feature-card__text">Что ищет, что предлагает, о чём пишет</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-card__icon"><Tag size={24} /></div>
              <h4 className="feature-card__title">Заметки и теги</h4>
              <p className="feature-card__text">Ваши пометки для работы с участником</p>
            </div>
          </div>
        </div>
      </section>

      {/* AI Analysis with Profile Screenshot */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Технология</span>
            <h2 className="section-header__title">AI-анализ сообщений</h2>
            <p className="section-header__subtitle">
              OpenAI извлекает смысл из переписки и формирует профиль
            </p>
          </div>
          
          <div className="content-screenshot-row content-screenshot-row--narrow-img">
            <div className="audience-card">
              <h4 className="audience-card__title">Что определяет AI</h4>
              <div style={{ marginTop: '1rem' }}>
                <div style={{ marginBottom: '1.5rem' }}>
                  <h5 style={{ color: 'var(--website-primary)', marginBottom: '0.5rem' }}>🔍 Запросы</h5>
                  <p style={{ color: 'var(--website-text-muted)', margin: 0 }}>
                    «Ищет CTO в стартап», «Нужен дизайнер на проект», «Ищет инвестора»
                  </p>
                </div>
                
                <div style={{ marginBottom: '1.5rem' }}>
                  <h5 style={{ color: 'var(--website-primary)', marginBottom: '0.5rem' }}>💡 Предложения</h5>
                  <p style={{ color: 'var(--website-text-muted)', margin: 0 }}>
                    «Предлагает услуги разработки», «Консультирует по маркетингу»
                  </p>
                </div>
                
                <div>
                  <h5 style={{ color: 'var(--website-primary)', marginBottom: '0.5rem' }}>📌 Интересы</h5>
                  <p style={{ color: 'var(--website-text-muted)', margin: 0 }}>
                    «Интересуется AI», «Активно обсуждает Web3», «Следит за продуктовым менеджментом»
                  </p>
                </div>
              </div>
            </div>
            
            {/* Profile Screenshot */}
            <BrowserFrame 
              src="/3.1profile.png" 
              alt="Профиль участника с AI-анализом интересов"
              url="my.orbo.ru/participants/profile"
              width={856}
              height={950}
            />
          </div>
        </div>
      </section>

      {/* Import */}
      <section className="website-section">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Импорт</span>
            <h2 className="section-header__title">Загрузите историю</h2>
            <p className="section-header__subtitle">
              Orbo понимает архивы Telegram и WhatsApp
            </p>
          </div>
          
          <div className="features-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))' }}>
            <div className="audience-card">
              <div className="audience-card__icon">
                <Upload size={28} />
              </div>
              <h3 className="audience-card__title">Telegram</h3>
              <p className="audience-card__text">
                Экспортируйте историю группы через Telegram Desktop → Загрузите JSON в Orbo → Профили обогатятся автоматически
              </p>
            </div>
            
            <div className="audience-card">
              <div className="audience-card__icon">
                <Download size={28} />
              </div>
              <h3 className="audience-card__title">WhatsApp</h3>
              <p className="audience-card__text">
                Экспортируйте чат из WhatsApp → Загрузите TXT-файл → Orbo распарсит и создаст профили участников
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Search & Filter */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Поиск</span>
            <h2 className="section-header__title">Находите нужных людей</h2>
          </div>
          
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-card__icon"><Search size={24} /></div>
              <h4 className="feature-card__title">Полнотекстовый поиск</h4>
              <p className="feature-card__text">
                По имени, username, интересам, заметкам
              </p>
            </div>
            
            <div className="feature-card">
              <div className="feature-card__icon"><Filter size={24} /></div>
              <h4 className="feature-card__title">Фильтры</h4>
              <p className="feature-card__text">
                По группам, активности, дате вступления, меткам
              </p>
            </div>
            
            <div className="feature-card">
              <div className="feature-card__icon"><Database size={24} /></div>
              <h4 className="feature-card__title">Сегменты</h4>
              <p className="feature-card__text">
                Сохраняйте фильтры: «Активные новички», «VIP-участники»
              </p>
            </div>
          </div>
          
          {/* Participants List Screenshot */}
          <BrowserFrame 
            src="/3.2participants.png" 
            alt="Список участников с фильтрами"
            url="my.orbo.ru/participants"
            width={1200}
            height={700}
          />
        </div>
      </section>

      {/* Categories */}
      <section className="website-section">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Категоризация</span>
            <h2 className="section-header__title">Понимайте свою аудиторию</h2>
          </div>
          
          <div className="features-grid features-grid--4col">
            <div className="feature-card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🌟</div>
              <h4 className="feature-card__title">Ядро</h4>
              <p className="feature-card__text">Активные участники, регулярно пишут</p>
            </div>
            
            <div className="feature-card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🆕</div>
              <h4 className="feature-card__title">Новички</h4>
              <p className="feature-card__text">Недавно вступили, нужно внимание</p>
            </div>
            
            <div className="feature-card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👴</div>
              <h4 className="feature-card__title">Опытные</h4>
              <p className="feature-card__text">Давно в группе, средняя активность</p>
            </div>
            
            <div className="feature-card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔇</div>
              <h4 className="feature-card__title">Молчуны</h4>
              <p className="feature-card__text">Читают, но не пишут</p>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Как это работает</span>
            <h2 className="section-header__title">Результат для сообщества</h2>
          </div>
          
          <div className="features-grid">
            <div className="audience-card">
              <div className="audience-card__icon">
                <Users size={28} />
              </div>
              <h3 className="audience-card__title">Клубы с мероприятиями</h3>
              <p className="audience-card__text">
                Карточка участника с историей посещений. Видите, кто реально ходит и приносит ценность.
              </p>
            </div>
            
            <div className="audience-card">
              <div className="audience-card__icon">
                <Sparkles size={28} />
              </div>
              <h3 className="audience-card__title">Сообщества с заявками</h3>
              <p className="audience-card__text">
                Данные анкеты сохраняются в карточку. Принимаете решения, понимая кто перед вами.
              </p>
            </div>
            
            <div className="audience-card">
              <div className="audience-card__icon">
                <Database size={28} />
              </div>
              <h3 className="audience-card__title">Авторы каналов</h3>
              <p className="audience-card__text">
                Карточки комментаторов и участников событий. Работа с активной аудиторией.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <div className="website-container">
          <h2 className="cta-section__title">Не теряйте своих людей</h2>
          <p className="cta-section__text">
            Подключите группы — карточки участников появятся автоматически
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
