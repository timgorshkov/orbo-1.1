'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Users, Zap, Calendar, Code, Megaphone, GraduationCap, MessageCircle, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Header, Footer } from '@/components/website';

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="partners-faq__item" onClick={() => setOpen(!open)}>
      <div className="partners-faq__q">
        <span>{q}</span>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </div>
      {open && <p className="partners-faq__a">{a}</p>}
    </div>
  );
}

export default function PartnersPage() {
  const [form, setForm] = useState({ name: '', email: '', messenger: '', segment: '', comment: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/partners/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setSent(true);
      } else {
        const data = await res.json();
        setError(data.error || 'Не удалось отправить заявку');
      }
    } catch {
      setError('Ошибка сети. Попробуйте позже.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Header transparent={false} />

      {/* ===== HERO ===== */}
      <section className="partners-hero">
        <div className="website-container">
          <div className="partners-hero__content">
            <span className="partners-hero__eyebrow">Партнёрская программа</span>
            <h1 className="partners-hero__title">
              Зарабатывайте на&nbsp;каждом сообществе ваших клиентов
            </h1>
            <p className="partners-hero__subtitle">
              50% от подписки клиента или 4 000 ₽ разово за внедрение.
              <br />Orbo — CRM участников и событий для Telegram и Max.
            </p>
            <div className="partners-hero__bullets">
              <div className="partners-hero__bullet">
                <Check size={18} />
                <span><b>50%</b> от подписки — регулярный доход</span>
              </div>
              <div className="partners-hero__bullet">
                <Check size={18} />
                <span><b>4 000 ₽</b> разово за оплату на 3 месяца</span>
              </div>
              <div className="partners-hero__bullet">
                <Check size={18} />
                <span><b>100%</b> дохода от внедрения — остаётся вам</span>
              </div>
            </div>
            <div className="partners-hero__cta">
              <a href="#apply" className="btn-pill btn-pill--primary btn-pill--lg">Стать партнёром</a>
            </div>
          </div>
        </div>
      </section>

      {/* ===== SEGMENTS ===== */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div className="section-header section-header--center">
            <h2 className="section-header__title">Для кого партнёрство</h2>
          </div>
          <div className="partners-segments">
            <div className="partners-segment">
              <div className="partners-segment__icon"><Code size={24} /></div>
              <h3>Telegram-студии</h3>
              <p>Делаете ботов для клиентов — добавьте CRM и recurring revenue к каждому проекту</p>
            </div>
            <div className="partners-segment">
              <div className="partners-segment__icon"><Zap size={24} /></div>
              <h3>Техспециалисты запусков</h3>
              <p>Настраиваете воронки и автоматизации — дополните их управлением клуба и событиями</p>
            </div>
            <div className="partners-segment">
              <div className="partners-segment__icon"><GraduationCap size={24} /></div>
              <h3>Продюсеры онлайн-школ</h3>
              <p>Ведёте комьюнити учеников — уберите хаос в чатах, добавьте CRM и мероприятия</p>
            </div>
            <div className="partners-segment">
              <div className="partners-segment__icon"><MessageCircle size={24} /></div>
              <h3>Комьюнити-менеджеры</h3>
              <p>Управляете клубом или сообществом — автоматизируйте рутину и зарабатывайте на внедрении</p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== ECONOMICS ===== */}
      <section className="website-section">
        <div className="website-container">
          <div className="section-header section-header--center">
            <h2 className="section-header__title">Экономика партнёра</h2>
            <p className="section-header__subtitle">Два варианта дохода — выбирайте подходящий</p>
          </div>
          <div className="partners-economics">
            <div className="partners-econ-card partners-econ-card--accent">
              <div className="partners-econ-card__badge">Рекомендуем</div>
              <h3>Реферальный процент</h3>
              <div className="partners-econ-card__number">50%</div>
              <p className="partners-econ-card__desc">от подписки каждого приведённого клиента — каждый месяц</p>
              <div className="partners-econ-card__example">
                <span>5 клиентов на Pro</span>
                <span className="partners-econ-card__sum">~7 500 ₽/мес</span>
              </div>
            </div>
            <div className="partners-econ-card">
              <h3>Фиксированная выплата</h3>
              <div className="partners-econ-card__number">4 000 ₽</div>
              <p className="partners-econ-card__desc">разово за каждого клиента, оплатившего тариф на 3 месяца</p>
              <div className="partners-econ-card__example">
                <span>5 клиентов</span>
                <span className="partners-econ-card__sum">20 000 ₽ сразу</span>
              </div>
            </div>
          </div>
          <div className="partners-econ-note">
            <Megaphone size={18} />
            <span>Доход от внедрения (настройка, обучение) — 100% ваш. Мы не участвуем и не берём комиссию.</span>
          </div>
        </div>
      </section>

      {/* ===== WHAT YOU SELL ===== */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div className="section-header section-header--center">
            <h2 className="section-header__title">Что продаёте клиенту</h2>
            <p className="section-header__subtitle">Готовый инструмент, понятный владельцу сообщества</p>
          </div>
          <div className="partners-features">
            <div className="partners-feature">
              <Users size={20} />
              <div>
                <h4>CRM участников</h4>
                <p>Карточки с именами, контактами, активностью и AI-анализом интересов</p>
              </div>
            </div>
            <div className="partners-feature">
              <Calendar size={20} />
              <div>
                <h4>События через MiniApp</h4>
                <p>Регистрация в один тап прямо в Telegram. Автонапоминания в личку</p>
              </div>
            </div>
            <div className="partners-feature">
              <Megaphone size={20} />
              <div>
                <h4>Анонсы и заявки</h4>
                <p>Автоматические анонсы в группы. Заявки на вступление с воронкой</p>
              </div>
            </div>
            <div className="partners-feature">
              <Zap size={20} />
              <div>
                <h4>Быстрый старт</h4>
                <p>Freemium до 500 участников. Подключение группы за 2 минуты</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== WHY EASY ===== */}
      <section className="website-section">
        <div className="website-container">
          <div className="section-header section-header--center">
            <h2 className="section-header__title">Почему это легко продавать</h2>
          </div>
          <div className="partners-easy">
            <div className="partners-easy__item"><Check size={16} /> Продукт понятный — это Telegram, клиент уже там</div>
            <div className="partners-easy__item"><Check size={16} /> Подключение группы за 2 минуты, без программирования</div>
            <div className="partners-easy__item"><Check size={16} /> Видимый результат: участники и регистрации появляются сразу</div>
            <div className="partners-easy__item"><Check size={16} /> Бесплатный тариф — легко зайти, потом перевести на платный</div>
            <div className="partners-easy__item"><Check size={16} /> Нет конкуренции с вами — вы контролируете внедрение</div>
          </div>
        </div>
      </section>

      {/* ===== STEPS ===== */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div className="section-header section-header--center">
            <h2 className="section-header__title">Как начать</h2>
          </div>
          <div className="partners-steps">
            <div className="partners-step">
              <div className="partners-step__num">1</div>
              <h4>Оставляете заявку</h4>
              <p>Заполните форму ниже — мы свяжемся в течение дня</p>
            </div>
            <div className="partners-step__arrow"><ArrowRight size={20} /></div>
            <div className="partners-step">
              <div className="partners-step__num">2</div>
              <h4>Получаете доступ</h4>
              <p>Демо-аккаунт, материалы для продажи и поддержку</p>
            </div>
            <div className="partners-step__arrow"><ArrowRight size={20} /></div>
            <div className="partners-step">
              <div className="partners-step__num">3</div>
              <h4>Внедряете клиентам</h4>
              <p>Подключаете Orbo и получаете доход</p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section className="website-section">
        <div className="website-container">
          <div className="section-header section-header--center">
            <h2 className="section-header__title">Частые вопросы</h2>
          </div>
          <div className="partners-faq">
            <FAQItem q="Нужно ли уметь программировать?" a="Нет. Подключение Orbo — это добавление бота в группу и настройка через веб-панель. Справится любой, кто работает с Telegram." />
            <FAQItem q="Сколько можно заработать?" a="Зависит от числа клиентов. 5 клиентов на Pro-тарифе = ~7 500 ₽/мес регулярного дохода или 20 000 ₽ разовой выплаты. Плюс доход от внедрения." />
            <FAQItem q="Кто делает внедрение?" a="Вы. Мы даём инструменты, документацию и поддержку. Внедрение — это подключение бота + настройка событий. Обычно 1–2 часа." />
            <FAQItem q="Что если клиент уйдёт?" a="Реферальный процент начисляется, пока клиент платит. Фиксированная выплата — разово, без возвратов." />
            <FAQItem q="Есть ли поддержка партнёров?" a="Да. Быстрый саппорт в Telegram, помощь в продажах, демо-доступ и готовые материалы для клиентов." />
          </div>
        </div>
      </section>

      {/* ===== APPLY FORM ===== */}
      <section className="website-section website-section--alt" id="apply">
        <div className="website-container">
          <div className="section-header section-header--center">
            <h2 className="section-header__title">Стать партнёром</h2>
            <p className="section-header__subtitle">Оставьте заявку — мы свяжемся в течение дня</p>
          </div>
          <div className="partners-form-wrap">
            {sent ? (
              <div className="partners-form-success">
                <Check size={48} />
                <h3>Заявка отправлена!</h3>
                <p>Мы свяжемся с вами в ближайшее время.</p>
              </div>
            ) : (
              <form className="partners-form" onSubmit={handleSubmit}>
                <div className="partners-form__row">
                  <div className="partners-form__field">
                    <label>Имя *</label>
                    <input
                      type="text"
                      required
                      placeholder="Как к вам обращаться"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div className="partners-form__field">
                    <label>Email *</label>
                    <input
                      type="email"
                      required
                      placeholder="you@company.com"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="partners-form__row">
                  <div className="partners-form__field">
                    <label>Telegram / мессенджер</label>
                    <input
                      type="text"
                      placeholder="@username или ссылка"
                      value={form.messenger}
                      onChange={e => setForm(f => ({ ...f, messenger: e.target.value }))}
                    />
                  </div>
                  <div className="partners-form__field">
                    <label>Чем занимаетесь</label>
                    <select
                      value={form.segment}
                      onChange={e => setForm(f => ({ ...f, segment: e.target.value }))}
                    >
                      <option value="">Выберите</option>
                      <option value="telegram_studio">Telegram-студия / разработка ботов</option>
                      <option value="tech_specialist">Техспециалист запусков</option>
                      <option value="producer">Продюсер онлайн-школы</option>
                      <option value="community_manager">Комьюнити-менеджер</option>
                      <option value="agency">Агентство / маркетинг</option>
                      <option value="other">Другое</option>
                    </select>
                  </div>
                </div>
                <div className="partners-form__field partners-form__field--full">
                  <label>Комментарий</label>
                  <textarea
                    rows={3}
                    placeholder="Расскажите о вашем бизнесе или клиентах"
                    value={form.comment}
                    onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
                  />
                </div>
                {error && <p className="partners-form__error">{error}</p>}
                <button type="submit" className="btn-pill btn-pill--primary btn-pill--lg" disabled={sending}>
                  {sending ? 'Отправка...' : 'Отправить заявку'}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
