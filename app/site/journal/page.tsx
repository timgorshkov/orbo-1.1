import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen } from 'lucide-react';
import { Header, Footer } from '@/components/website';

export const metadata: Metadata = {
  title: 'Журнал',
  description: 'Статьи, кейсы и новости от команды Orbo. Всё о развитии сообществ в мессенджерах.',
};

export default function JournalPage() {
  return (
    <>
      <Header />
      
      {/* Hero */}
      <section className="website-section" style={{ paddingTop: 'calc(80px + 4rem)' }}>
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Блог</span>
            <h1 className="section-header__title" style={{ fontSize: 'clamp(2rem, 5vw, 3rem)' }}>
              Журнал Orbo
            </h1>
            <p className="section-header__subtitle" style={{ maxWidth: '600px', margin: '1rem auto 0' }}>
              Статьи, кейсы и новости о развитии сообществ в мессенджерах
            </p>
          </div>
        </div>
      </section>

      {/* Coming Soon */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div style={{ 
            textAlign: 'center', 
            padding: '4rem 2rem',
            maxWidth: '500px',
            margin: '0 auto'
          }}>
            <div style={{ 
              width: 80, 
              height: 80, 
              margin: '0 auto 1.5rem',
              background: 'var(--website-bg)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <BookOpen size={36} style={{ color: 'var(--website-primary)' }} />
            </div>
            <h2 style={{ 
              fontSize: '1.5rem', 
              fontWeight: 600, 
              marginBottom: '1rem',
              color: 'var(--website-text)'
            }}>
              Скоро здесь появятся статьи
            </h2>
            <p style={{ 
              color: 'var(--website-text-muted)',
              marginBottom: '2rem'
            }}>
              Мы готовим полезные материалы о развитии сообществ, проведении событий и работе с аудиторией.
            </p>
            <Link href="/product" className="btn-pill btn-pill--outline">
              Пока изучите продукт
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
