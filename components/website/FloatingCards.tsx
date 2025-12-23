'use client';

import { AlertTriangle, MessageCircle, Clock, Sparkles, Check, Users, Calendar, BarChart3, Bell } from 'lucide-react';

// ============ Product Page Floating Cards ============
export function ProductFloatingCards() {
  return (
    <div className="floating-cards">
      {/* Left side */}
      <div className="floating-card floating-card--stat floating-card--pos-tl floating-card--delay-1">
        <BarChart3 size={20} className="floating-card__icon floating-card__icon--blue" />
        <div>
          <div className="floating-card__stat-value">+23%</div>
          <div className="floating-card__stat-label">активность</div>
        </div>
      </div>
      
      <div className="floating-card floating-card--alert floating-card--alert-red floating-card--pos-ml floating-card--alt floating-card--delay-3">
        <AlertTriangle size={18} className="floating-card__icon floating-card__icon--red" />
        <span style={{ color: '#dc2626', fontWeight: 500 }}>AI: Негатив</span>
      </div>
      
      <div className="floating-card floating-card--tag floating-card--tag-green floating-card--pos-bl floating-card--slow floating-card--delay-2">
        <Check size={14} style={{ marginRight: 4, display: 'inline' }} />
        Регистрация
      </div>
      
      {/* Right side */}
      <div className="floating-card floating-card--profile floating-card--pos-tr floating-card--delay-2">
        <div className="floating-card__avatar">ИП</div>
        <div className="floating-card__info">
          <span className="floating-card__name">Иван Петров</span>
          <span className="floating-card__meta">Ядро • AI-профиль</span>
        </div>
      </div>
      
      <div className="floating-card floating-card--stat floating-card--pos-mr floating-card--alt floating-card--delay-4">
        <Users size={20} className="floating-card__icon floating-card__icon--green" />
        <div>
          <div className="floating-card__stat-value">1.2K</div>
          <div className="floating-card__stat-label">участников</div>
        </div>
      </div>
      
      <div className="floating-card floating-card--event floating-card--pos-br floating-card--slow floating-card--delay-5" style={{ padding: '10px 12px' }}>
        <div className="floating-card__date" style={{ padding: '6px 8px', minWidth: '36px' }}>
          <span className="floating-card__date-day" style={{ fontSize: '14px' }}>12</span>
          <span className="floating-card__date-month" style={{ fontSize: '8px' }}>янв</span>
        </div>
        <div className="floating-card__event-info">
          <span className="floating-card__event-title" style={{ fontSize: '12px' }}>Встреча</span>
          <span className="floating-card__event-meta">8 участников</span>
        </div>
      </div>
    </div>
  );
}

// ============ CRM Page Floating Cards ============
export function CRMFloatingCards() {
  return (
    <div className="floating-cards">
      {/* Left side */}
      <div className="floating-card floating-card--profile floating-card--pos-tl floating-card--delay-1">
        <div className="floating-card__avatar">МБ</div>
        <div className="floating-card__info">
          <span className="floating-card__name">Мирон Бородеев</span>
          <span className="floating-card__meta">HRD • Ядро сообщества</span>
        </div>
      </div>
      
      <div className="floating-card floating-card--tag floating-card--pos-ml floating-card--alt floating-card--delay-3">
        <Sparkles size={14} style={{ marginRight: 6, display: 'inline' }} />
        Интересуется AI
      </div>
      
      <div className="floating-card floating-card--tag floating-card--tag-purple floating-card--pos-bl floating-card--slow floating-card--delay-2">
        Ищет разработчика
      </div>
      
      {/* Right side */}
      <div className="floating-card floating-card--stat floating-card--pos-tr floating-card--delay-2">
        <Users size={20} className="floating-card__icon floating-card__icon--blue" />
        <div>
          <div className="floating-card__stat-value">427</div>
          <div className="floating-card__stat-label">участников</div>
        </div>
      </div>
      
      <div className="floating-card floating-card--tag floating-card--tag-green floating-card--pos-mr floating-card--alt floating-card--delay-4">
        <Check size={14} style={{ marginRight: 4, display: 'inline' }} />
        Предлагает консалтинг
      </div>
      
      <div className="floating-card floating-card--profile floating-card--pos-br floating-card--slow floating-card--delay-5">
        <div className="floating-card__avatar" style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>АК</div>
        <div className="floating-card__info">
          <span className="floating-card__name">Анна Козлова</span>
          <span className="floating-card__meta">Product Manager</span>
        </div>
      </div>
    </div>
  );
}

// ============ Notifications Page Floating Cards ============
export function NotificationsFloatingCards() {
  return (
    <div className="floating-cards">
      {/* Left side */}
      <div className="floating-card floating-card--alert floating-card--alert-red floating-card--pos-tl floating-card--delay-1">
        <AlertTriangle size={18} className="floating-card__icon floating-card__icon--red" />
        <span style={{ color: '#dc2626', fontWeight: 500 }}>Негатив в чате</span>
      </div>
      
      <div className="floating-card floating-card--alert floating-card--alert-yellow floating-card--pos-ml floating-card--alt floating-card--delay-3">
        <MessageCircle size={18} className="floating-card__icon floating-card__icon--yellow" />
        <span style={{ color: '#b45309', fontWeight: 500 }}>Вопрос без ответа</span>
      </div>
      
      <div className="floating-card floating-card--alert floating-card--alert-blue floating-card--pos-bl floating-card--slow floating-card--delay-2">
        <Clock size={18} className="floating-card__icon floating-card__icon--blue" />
        <span style={{ color: '#1d4ed8', fontWeight: 500 }}>SLA: 2ч осталось</span>
      </div>
      
      {/* Right side */}
      <div className="floating-card floating-card--pos-tr floating-card--delay-2" style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#229ED9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>Orbo Assist</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Новое уведомление</div>
          </div>
        </div>
      </div>
      
      <div className="floating-card floating-card--stat floating-card--pos-mr floating-card--alt floating-card--delay-4">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="floating-card__stat-value" style={{ color: '#16a34a' }}>98%</div>
          <div className="floating-card__stat-label">SLA выполнен</div>
        </div>
      </div>
      
      <div className="floating-card floating-card--status floating-card--pos-br floating-card--slow floating-card--delay-5" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
        <span className="floating-card__status-dot floating-card__status-dot--green"></span>
        <span style={{ color: '#15803d' }}>Всё под контролем</span>
      </div>
    </div>
  );
}

// ============ Events Page Floating Cards ============
export function EventsFloatingCards() {
  return (
    <div className="floating-cards">
      {/* Left side */}
      <div className="floating-card floating-card--event floating-card--pos-tl floating-card--delay-1">
        <div className="floating-card__date">
          <span className="floating-card__date-day">26</span>
          <span className="floating-card__date-month">дек</span>
        </div>
        <div className="floating-card__event-info">
          <span className="floating-card__event-title">Бизнес-завтрак</span>
          <span className="floating-card__event-meta">19:00 • 12 участников</span>
        </div>
      </div>
      
      <div className="floating-card floating-card--status floating-card--pos-ml floating-card--alt floating-card--delay-3" style={{ background: '#dcfce7', border: '1px solid #bbf7d0' }}>
        <span className="floating-card__status-dot floating-card__status-dot--green"></span>
        <span style={{ color: '#15803d', fontWeight: 500 }}>Оплачено • 500 ₽</span>
      </div>
      
      <div className="floating-card floating-card--stat floating-card--pos-bl floating-card--slow floating-card--delay-2">
        <Calendar size={20} className="floating-card__icon floating-card__icon--blue" />
        <div>
          <div className="floating-card__stat-value">3/40</div>
          <div className="floating-card__stat-label">регистраций</div>
        </div>
      </div>
      
      {/* Right side */}
      <div className="floating-card floating-card--profile floating-card--pos-tr floating-card--delay-2">
        <div className="floating-card__avatar" style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
          <Check size={16} />
        </div>
        <div className="floating-card__info">
          <span className="floating-card__name">Тимур Голицын</span>
          <span className="floating-card__meta" style={{ color: '#16a34a' }}>Зарегистрирован</span>
        </div>
      </div>
      
      <div className="floating-card floating-card--status floating-card--pos-mr floating-card--alt floating-card--delay-4" style={{ background: '#fef3c7', border: '1px solid #fde68a' }}>
        <span className="floating-card__status-dot floating-card__status-dot--yellow"></span>
        <span style={{ color: '#b45309', fontWeight: 500 }}>Ожидает оплаты</span>
      </div>
      
      <div className="floating-card floating-card--pos-br floating-card--slow floating-card--delay-5" style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: 'linear-gradient(135deg, #2563eb, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>MiniApp</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Регистрация в 2 клика</div>
          </div>
        </div>
      </div>
    </div>
  );
}
