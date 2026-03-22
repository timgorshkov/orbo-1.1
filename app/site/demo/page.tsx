import { Metadata } from 'next';
import Link from 'next/link';
import { Play, Users, Zap, Calendar, ArrowRight } from 'lucide-react';
import { Header, Footer } from '@/components/website';

const VIDEO_URL = 'https://40947234-09c7-4a09-8966-33bd3fb30a20.selstorage.ru/public/demo-orbo-1.mp4';

export const metadata: Metadata = {
  title: 'Демо Orbo — CRM для групп и сообществ',
  description: 'Посмотрите 6-минутное демо: как Orbo помогает владельцам сообществ собирать базу участников, проводить мероприятия через MiniApp и анализировать интересы с помощью AI.',
  keywords: ['orbo демо', 'crm для сообществ', 'telegram crm демо', 'miniapp мероприятия'],
  alternates: { canonical: '/demo' },
  openGraph: {
    title: 'Демо Orbo — CRM для групп и сообществ',
    description: 'Посмотрите 6-минутное демо: база участников, мероприятия через MiniApp, AI-анализ профилей.',
    type: 'website',
    url: 'https://orbo.ru/demo',
    videos: [
      {
        url: VIDEO_URL,
        type: 'video/mp4',
        width: 1920,
        height: 1080,
      },
    ],
  },
};

export default function DemoPage() {
  return (
    <>
      <Header transparent={false} />

      {/* ====== VIDEO SECTION ====== */}
      <section className="demo-hero">
        <div className="website-container">
          <div className="demo-hero__header">
            <span className="demo-hero__eyebrow">Демо · 6 минут</span>
            <h1 className="demo-hero__title">
              Как работает Orbo
            </h1>
            <p className="demo-hero__subtitle">
              Посмотрите, как владельцы сообществ используют Orbo для работы с&nbsp;участниками, проведения мероприятий и&nbsp;обработки заявок.
            </p>
          </div>

          <div className="demo-video">
            <div className="demo-video__wrapper">
              <video
                controls
                preload="metadata"
                playsInline
                poster=""
                className="demo-video__player"
              >
                <source src={VIDEO_URL} type="video/mp4" />
                Ваш браузер не поддерживает воспроизведение видео.
              </video>
            </div>
          </div>
        </div>
      </section>

      {/* ====== KEY POINTS ====== */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div className="section-header section-header--center">
            <h2 className="section-header__title">Что вы увидите в демо</h2>
          </div>

          <div className="demo-highlights">
            <div className="demo-highlight">
              <div className="demo-highlight__icon">
                <Users size={24} />
              </div>
              <h3>База участников</h3>
              <p>Карточки с контактами, историей активности и AI-анализом интересов каждого участника сообщества.</p>
            </div>

            <div className="demo-highlight">
              <div className="demo-highlight__icon">
                <Calendar size={24} />
              </div>
              <h3>MiniApp для мероприятий</h3>
              <p>Регистрация и оплата прямо в Telegram за два нажатия. Автоматические напоминания повышают доходимость.</p>
            </div>

            <div className="demo-highlight">
              <div className="demo-highlight__icon">
                <Zap size={24} />
              </div>
              <h3>Заявки и воронка</h3>
              <p>Анкеты на вступление через MiniApp, обработка заявок в канбан-доске, spam-score для фильтрации ботов.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ====== CTA ====== */}
      <section className="website-section">
        <div className="website-container">
          <div className="demo-cta">
            <h2>Попробуйте сами</h2>
            <p>Бесплатно для сообществ до 500 участников. Подключите группу за&nbsp;2&nbsp;минуты.</p>
            <div className="demo-cta__actions">
              <Link href="https://my.orbo.ru/signup?from=demo" className="btn-pill btn-pill--primary btn-pill--lg">
                Попробуйте бесплатно
              </Link>
              <Link
                href="https://calendly.com/timgorshkov/30min"
                className="btn-pill btn-pill--outline btn-pill--lg"
                target="_blank"
                rel="noopener noreferrer"
              >
                Записаться на демо-звонок
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
