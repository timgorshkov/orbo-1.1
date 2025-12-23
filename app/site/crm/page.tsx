import { Metadata } from 'next';
import Link from 'next/link';
import { 
  UserCircle, Brain, MessageSquare, Search, Tag, 
  Upload, Download, Filter, ArrowRight, Users, 
  Sparkles, Database 
} from 'lucide-react';
import { Header, Footer, BrowserFrame } from '@/components/website';

export const metadata: Metadata = {
  title: 'CRM участников',
  description: 'Профили участников с AI-анализом интересов. Импорт истории из Telegram и WhatsApp.',
};

export default function CRMPage() {
  return (
    <>
      <Header />
      
      {/* Hero */}
      <section className="website-section" style={{ paddingTop: 'calc(80px + 4rem)' }}>
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Возможности</span>
            <h1 className="section-header__title" style={{ fontSize: 'clamp(2rem, 5vw, 3rem)' }}>
              CRM участников
            </h1>
            <p className="section-header__subtitle" style={{ maxWidth: '600px', margin: '1rem auto 0' }}>
              Профили с AI-анализом интересов. Импорт истории из Telegram и WhatsApp
            </p>
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
                <li><strong>Нет истории</strong> — человек написал год назад, вы не помните контекст</li>
                <li><strong>Telegram не даёт данных</strong> — ни аналитики, ни профилей, ни поиска</li>
                <li><strong>WhatsApp ещё хуже</strong> — переписка заперта в телефоне</li>
                <li><strong>Кто реально активен?</strong> — вы не знаете, кто ядро, а кто «мёртвая душа»</li>
              </ul>
            </div>
            
            <div className="audience-card" style={{ borderLeft: '4px solid #22c55e' }}>
              <h3 className="audience-card__title" style={{ color: '#16a34a' }}>✅ С Orbo</h3>
              <ul className="audience-card__features">
                <li><strong>Профиль каждого</strong> — фото, контакты, история активности</li>
                <li><strong>AI-интересы</strong> — автоматически: «ищет разработчика», «предлагает услуги»</li>
                <li><strong>Импорт истории</strong> — загрузите архив Telegram или WhatsApp</li>
                <li><strong>Поиск по базе</strong> — найдите нужного человека за секунду</li>
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
            <span className="section-header__eyebrow">Профили</span>
            <h2 className="section-header__title">Что хранится в профиле</h2>
          </div>
          
          <div className="features-grid features-grid--4col">
            <div className="feature-card">
              <div className="feature-card__icon"><UserCircle size={24} /></div>
              <h4 className="feature-card__title">Контактные данные</h4>
              <p className="feature-card__text">Имя, фото, username, телефон, email</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-card__icon"><MessageSquare size={24} /></div>
              <h4 className="feature-card__title">История активности</h4>
              <p className="feature-card__text">Когда вступил, сколько сообщений, в каких группах</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-card__icon"><Brain size={24} /></div>
              <h4 className="feature-card__title">AI-интересы</h4>
              <p className="feature-card__text">Запросы, предложения, темы — извлечены из сообщений</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-card__icon"><Tag size={24} /></div>
              <h4 className="feature-card__title">Метки и заметки</h4>
              <p className="feature-card__text">Добавляйте свои теги и комментарии</p>
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
            <span className="section-header__eyebrow">Применение</span>
            <h2 className="section-header__title">Как используют CRM</h2>
          </div>
          
          <div className="features-grid">
            <div className="audience-card">
              <div className="audience-card__icon">
                <Users size={28} />
              </div>
              <h3 className="audience-card__title">Нетворкинг-клубы</h3>
              <p className="audience-card__text">
                Знаете интересы каждого члена. Можете соединять людей с релевантными запросами.
              </p>
            </div>
            
            <div className="audience-card">
              <div className="audience-card__icon">
                <Sparkles size={28} />
              </div>
              <h3 className="audience-card__title">Профессиональные сообщества</h3>
              <p className="audience-card__text">
                Видите экспертизу участников. Находите спикеров, менторов, потенциальных партнёров.
              </p>
            </div>
            
            <div className="audience-card">
              <div className="audience-card__icon">
                <Database size={28} />
              </div>
              <h3 className="audience-card__title">Образовательные проекты</h3>
              <p className="audience-card__text">
                База выпускников с историей обучения. Понимаете, кто готов к следующему курсу.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <div className="website-container">
          <h2 className="cta-section__title">Знайте своих людей</h2>
          <p className="cta-section__text">
            Подключите группы и начните строить базу участников
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
