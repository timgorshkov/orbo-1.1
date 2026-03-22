import { Metadata } from 'next';
import Link from 'next/link';
import {
  AlertTriangle, ArrowRight, CheckCircle, Shield,
  Users, MessageSquare, Database, Clock, Download,
  Smartphone, ArrowRightCircle, Lock
} from 'lucide-react';
import { Header, Footer } from '@/components/website';

export const metadata: Metadata = {
  title: 'Сохраните базу Telegram-сообщества — переезд в Max за 15 минут',
  description: 'Telegram могут заблокировать. Сохраните участников, историю сообщений и контакты вашего сообщества. Подключите Max как резервный канал за 7 шагов.',
  keywords: ['telegram блокировка', 'сохранить участников telegram', 'telegram в max', 'миграция telegram', 'блокировка telegram россия', 'backup telegram группы'],
  alternates: { canonical: '/telegram-backup' },
};

const TelegramLogo = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="telegram-logo">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
);

const MaxLogo = () => (
  <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className="max-logo">
    <path d="M15.63 40.465c8.083 7.193 27.86-1.166 27.783-15.85C43.36 14.546 35.107 4.59 24.873 4.5c-9.538-.083-19.648 5.962-20.23 17.767c-.172 3.515 0 8.859 1.231 11.73c2.335 6.7.113 8.477 2.804 9.328q3.617.9 6.953-2.861"/>
  </svg>
);

export default function TelegramBackupPage() {
  return (
    <>
      <Header transparent={false} />

      {/* ====== HERO ====== */}
      <section className="migration-hero">
        <div className="website-container">
          <div className="migration-hero__badge">
            <AlertTriangle size={18} />
            <span>Возможная блокировка Telegram в России</span>
          </div>

          <h1 className="migration-hero__title">
            База вашего сообщества<br />не должна исчезнуть
          </h1>

          <p className="migration-hero__subtitle">
            Если Telegram заблокируют — вы потеряете не мессенджер, а людей. Контакты, историю,
            договорённости. Сохраните базу участников сейчас и&nbsp;подключите Max как резервный канал.
          </p>

          <div className="migration-hero__actions">
            <Link href="https://my.orbo.ru/signup?from=telegram-backup" className="btn-pill btn-pill--primary btn-pill--lg">
              Сохранить базу бесплатно
            </Link>
            <a href="#max-steps" className="btn-pill btn-pill--outline btn-pill--lg">
              Как подключить Max
            </a>
          </div>

          <div className="migration-hero__messengers">
            <div className="migration-hero__from">
              <TelegramLogo />
              <span>Telegram</span>
            </div>
            <ArrowRight size={24} className="migration-hero__arrow" />
            <div className="migration-hero__to">
              <div className="migration-hero__to-item">
                <Database size={22} />
                <span>Orbo CRM</span>
              </div>
              <span className="migration-hero__or">+</span>
              <div className="migration-hero__to-item">
                <MaxLogo />
                <span>Max</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ====== ЧТО ТЕРЯЕТСЯ ====== */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Без подготовки</span>
            <h2 className="section-header__title">Что теряет сообщество при блокировке</h2>
          </div>

          <div className="migration-risks">
            <div className="migration-risk migration-risk--danger">
              <div className="migration-risk__icon"><Users size={24} /></div>
              <h3>Контакты участников</h3>
              <p>Username&rsquo;ы, телефоны, имена — разбросаны по чатам. Без CRM вы не свяжетесь с&nbsp;людьми вне Telegram</p>
            </div>
            <div className="migration-risk migration-risk--danger">
              <div className="migration-risk__icon"><MessageSquare size={24} /></div>
              <h3>История переписки</h3>
              <p>Обсуждения, решения, договорённости — всё остаётся внутри заблокированного мессенджера</p>
            </div>
            <div className="migration-risk migration-risk--danger">
              <div className="migration-risk__icon"><Clock size={24} /></div>
              <h3>Месяцы на восстановление</h3>
              <p>Найти всех в другом мессенджере, пересобрать группу, вернуть доверие — от 2 до 6 месяцев</p>
            </div>
            <div className="migration-risk migration-risk--danger">
              <div className="migration-risk__icon"><Lock size={24} /></div>
              <h3>Потеря доходов</h3>
              <p>Мероприятия, подписки, заявки — всё завязано на группу. Нет группы — нет бизнеса сообщества</p>
            </div>
          </div>
        </div>
      </section>

      {/* ====== ЧТО ДЕЛАЕТ ORBO ====== */}
      <section className="website-section">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Что делать прямо сейчас</span>
            <h2 className="section-header__title">Подключите Orbo — сохраните базу</h2>
            <p className="section-header__subtitle">
              Orbo подключается к вашей Telegram-группе, собирает данные участников и хранит их независимо от мессенджера
            </p>
          </div>

          <div className="migration-benefits">
            <div className="migration-benefit">
              <div className="migration-benefit__icon migration-benefit__icon--green">
                <CheckCircle size={24} />
              </div>
              <div className="migration-benefit__content">
                <h3>Карточки всех участников</h3>
                <p>Имена, username&rsquo;ы, телефоны (если доступны), аватарки. Собираются автоматически из&nbsp;группы</p>
              </div>
            </div>

            <div className="migration-benefit">
              <div className="migration-benefit__icon migration-benefit__icon--green">
                <CheckCircle size={24} />
              </div>
              <div className="migration-benefit__content">
                <h3>История активности и сообщений</h3>
                <p>Кто что писал, кто реагировал, кто участвовал в&nbsp;событиях — всё в&nbsp;вашей CRM на&nbsp;российских серверах</p>
              </div>
            </div>

            <div className="migration-benefit">
              <div className="migration-benefit__icon migration-benefit__icon--green">
                <CheckCircle size={24} />
              </div>
              <div className="migration-benefit__content">
                <h3>Работает и без Telegram</h3>
                <p>Даже после блокировки данные сохранены. Вы сможете связаться с&nbsp;участниками через другие каналы</p>
              </div>
            </div>

            <div className="migration-benefit">
              <div className="migration-benefit__icon migration-benefit__icon--green">
                <CheckCircle size={24} />
              </div>
              <div className="migration-benefit__content">
                <h3>Max подключается за минуты</h3>
                <p>Orbo уже поддерживает Max. Создайте группу-дубль и подключите её к&nbsp;той же организации</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ====== 3 ШАГА ORBO ====== */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Сохранение базы</span>
            <h2 className="section-header__title">Как подключить Orbo к Telegram-группе</h2>
          </div>

          <div className="migration-steps">
            <div className="migration-step">
              <div className="migration-step__number">1</div>
              <div className="migration-step__content">
                <h3 className="migration-step__title">Зарегистрируйтесь в Orbo</h3>
                <div className="migration-step__instructions">
                  <ol>
                    <li>Перейдите на <a href="https://my.orbo.ru/signup?from=telegram-backup">my.orbo.ru</a></li>
                    <li>Создайте организацию (пространство) для вашего сообщества</li>
                  </ol>
                  <p className="migration-step__tip">
                    Бесплатно для сообществ до 500 участников
                  </p>
                </div>
              </div>
            </div>

            <div className="migration-step">
              <div className="migration-step__number">2</div>
              <div className="migration-step__content">
                <h3 className="migration-step__title">Добавьте бота в Telegram-группу</h3>
                <div className="migration-step__instructions">
                  <ol>
                    <li>В настройках Orbo нажмите «Подключить Telegram-группу»</li>
                    <li>Добавьте бота <strong>@orbo_community_bot</strong> в вашу группу</li>
                    <li>Дайте боту права администратора</li>
                  </ol>
                  <p className="migration-step__tip">
                    Бот начнёт собирать участников и активность автоматически
                  </p>
                </div>
              </div>
            </div>

            <div className="migration-step">
              <div className="migration-step__number">3</div>
              <div className="migration-step__content">
                <h3 className="migration-step__title">Дождитесь сбора данных</h3>
                <div className="migration-step__instructions">
                  <p>Orbo начнёт накапливать базу:</p>
                  <ul>
                    <li>Каждый, кто напишет в группу, получит карточку участника</li>
                    <li>Активность, реакции, участие в событиях — фиксируются</li>
                    <li>Данные хранятся на серверах в России и доступны в любой момент</li>
                  </ul>
                  <p className="migration-step__tip">
                    Чем раньше подключите — тем больше данных сохранится до возможной блокировки
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ====== MAX — 7 ШАГОВ ====== */}
      <section className="website-section" id="max-steps">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Резервный канал</span>
            <h2 className="section-header__title">Как продублировать сообщество в Max</h2>
            <p className="section-header__subtitle">
              Max (бывший VK Teams) — российский мессенджер, которому не грозит блокировка.
              Подключите его как запасной канал, пока Telegram ещё работает.
            </p>
          </div>

          <div className="migration-steps">
            <div className="migration-step">
              <div className="migration-step__number">1</div>
              <div className="migration-step__content">
                <h3 className="migration-step__title">Установите Max</h3>
                <div className="migration-step__instructions">
                  <p>
                    Скачайте приложение на <a href="https://max.ru" target="_blank" rel="noopener noreferrer">max.ru</a> — доступно для iOS, Android, Windows и macOS.
                    Зарегистрируйтесь по номеру телефона.
                  </p>
                </div>
              </div>
            </div>

            <div className="migration-step">
              <div className="migration-step__number">2</div>
              <div className="migration-step__content">
                <h3 className="migration-step__title">Создайте группу-дубль</h3>
                <div className="migration-step__instructions">
                  <p>
                    Создайте группу с тем же названием, что и в Telegram. Добавьте описание и аватарку,
                    чтобы участники сразу узнали сообщество.
                  </p>
                </div>
              </div>
            </div>

            <div className="migration-step">
              <div className="migration-step__number">3</div>
              <div className="migration-step__content">
                <h3 className="migration-step__title">Пригласите участников</h3>
                <div className="migration-step__instructions">
                  <p>
                    Создайте ссылку-приглашение в Max. Разошлите её участникам
                    в Telegram-группу с коротким объяснением: <em>«Дублируем на случай блокировки»</em>.
                  </p>
                  <p className="migration-step__tip">
                    Не нужно уходить из Telegram — достаточно, чтобы участники были в обоих местах
                  </p>
                </div>
              </div>
            </div>

            <div className="migration-step">
              <div className="migration-step__number">4</div>
              <div className="migration-step__content">
                <h3 className="migration-step__title">Подключите Max-группу к Orbo</h3>
                <div className="migration-step__instructions">
                  <p>
                    В настройках Orbo выберите «Подключить Max». Добавьте бота в&nbsp;Max-группу —
                    так участники из обоих мессенджеров окажутся в одной CRM.
                  </p>
                </div>
              </div>
            </div>

            <div className="migration-step">
              <div className="migration-step__number">5</div>
              <div className="migration-step__content">
                <h3 className="migration-step__title">Дублируйте ключевые анонсы</h3>
                <div className="migration-step__instructions">
                  <p>
                    Публикуйте важные анонсы и в Telegram, и в Max.
                    Orbo позволяет отправлять анонсы в подключённые группы из&nbsp;одного интерфейса.
                  </p>
                </div>
              </div>
            </div>

            <div className="migration-step">
              <div className="migration-step__number">6</div>
              <div className="migration-step__content">
                <h3 className="migration-step__title">Ведите события через Orbo</h3>
                <div className="migration-step__instructions">
                  <p>
                    Создавайте события в Orbo — участники регистрируются через веб-форму,
                    а напоминания уходят в оба мессенджера. Доходимость не пострадает при переходе.
                  </p>
                </div>
              </div>
            </div>

            <div className="migration-step">
              <div className="migration-step__number">7</div>
              <div className="migration-step__content">
                <h3 className="migration-step__title">Готово. Контакты в безопасности</h3>
                <div className="migration-step__instructions">
                  <p>Теперь у вас:</p>
                  <ul>
                    <li>Единая база участников в Orbo, независимая от мессенджера</li>
                    <li>Telegram-группа работает, пока доступна</li>
                    <li>Max-группа готова принять людей в любой момент</li>
                    <li>Все карточки, история событий и контакты — на российских серверах</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ====== ПОЧЕМУ СЕЙЧАС ====== */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div className="migration-urgency">
            <div className="migration-urgency__icon">
              <AlertTriangle size={32} />
            </div>
            <div className="migration-urgency__content">
              <h2>Почему не стоит ждать</h2>
              <ul>
                <li><strong>Замедление уже идёт</strong> — Telegram работает с перебоями, MiniApp-ы грузятся дольше</li>
                <li><strong>VPN спасёт не всех</strong> — часть участников просто перестанет пользоваться</li>
                <li><strong>После блокировки поздно</strong> — собрать базу участников без доступа к группе невозможно</li>
                <li><strong>Чем раньше — тем больше данных</strong> — Orbo фиксирует только новую активность, прошлое не восстановить</li>
              </ul>
              <p className="migration-urgency__cta-text">
                Подключите Orbo, пока Telegram ещё работает. Это занимает 5 минут.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ====== FAQ ====== */}
      <section className="website-section">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Вопросы</span>
            <h2 className="section-header__title">Частые вопросы</h2>
          </div>

          <div className="migration-faq">
            <div className="migration-faq__item">
              <h3>Это бесплатно?</h3>
              <p>Да. Подключение Telegram-группы, сбор участников и хранение данных — бесплатно для сообществ до 500 человек.</p>
            </div>

            <div className="migration-faq__item">
              <h3>Orbo видит переписку?</h3>
              <p>Бот фиксирует факт сообщений (кто, когда, реакции), но не хранит полные тексты переписки. Это CRM, а не архиватор чатов.</p>
            </div>

            <div className="migration-faq__item">
              <h3>Где хранятся данные?</h3>
              <p>На защищённых серверах в России (Selectel). Данные не передаются третьим лицам.</p>
            </div>

            <div className="migration-faq__item">
              <h3>Что если Telegram не заблокируют?</h3>
              <p>Вы получите CRM участников, событий и заявок. Orbo полезен независимо от блокировок — это инструмент для управления сообществом.</p>
            </div>

            <div className="migration-faq__item">
              <h3>Max обязателен?</h3>
              <p>Нет. Max — опциональный резервный канал. Если ваше сообщество останется в Telegram с VPN, Orbo продолжит работать.</p>
            </div>

            <div className="migration-faq__item">
              <h3>Можно подключить несколько групп?</h3>
              <p>Да. Telegram-группа, Telegram-канал, Max-группа — всё в одном пространстве Orbo.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ====== SEO TEXT ====== */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Подробнее</span>
            <h2 className="section-header__title">Как сохранить базу Telegram-сообщества</h2>
          </div>

          <div className="migration-faq">
            <div className="migration-faq__item">
              <h3>Что именно сохраняет Orbo из Telegram-группы?</h3>
              <p>
                Бот фиксирует каждого участника, который проявляет активность в&nbsp;группе:
                пишет сообщения, ставит реакции, участвует в&nbsp;событиях. Для каждого
                создаётся карточка с&nbsp;именем, username, аватаркой и&nbsp;историей
                активности. Если участник регистрировался на&nbsp;событие — в&nbsp;карточке
                сохранится email и&nbsp;телефон. Это не&nbsp;бэкап переписки,
                а&nbsp;структурированная CRM-база вашего сообщества.
              </p>
            </div>

            <div className="migration-faq__item">
              <h3>Как подготовить сообщество к&nbsp;блокировке Telegram?</h3>
              <p>
                Три действия, которые нужно сделать до&nbsp;блокировки:
                (1)&nbsp;подключить бота Orbo к&nbsp;Telegram-группе, чтобы он&nbsp;начал
                собирать базу участников; (2)&nbsp;создать группу-дубль в&nbsp;Max и&nbsp;разослать
                ссылку-приглашение; (3)&nbsp;перевести регистрации на&nbsp;события
                через Orbo — веб-форма работает без привязки к&nbsp;мессенджеру.
                После этого даже при полной блокировке у&nbsp;вас остаются контакты
                и&nbsp;рабочий канал коммуникации.
              </p>
            </div>

            <div className="migration-faq__item">
              <h3>Переезд из Telegram в Max: что нужно знать</h3>
              <p>
                Max (бывший VK&nbsp;Teams) — российский мессенджер от VK, который не&nbsp;подпадает
                под риски блокировки. В&nbsp;Max есть группы, каналы и&nbsp;боты — функционал
                достаточен для ведения сообщества. Orbo поддерживает Max: вы&nbsp;можете
                подключить Max-группу к&nbsp;той&nbsp;же организации, и&nbsp;участники
                из&nbsp;обоих мессенджеров окажутся в&nbsp;единой базе. Не&nbsp;нужно
                выбирать один мессенджер — Orbo работает с&nbsp;обоими параллельно.
              </p>
            </div>

            <div className="migration-faq__item">
              <h3>Что делать, если Telegram уже заблокирован?</h3>
              <p>
                Если вы&nbsp;подключили Orbo до&nbsp;блокировки — база участников сохранена.
                Зайдите в Orbo через браузер (my.orbo.ru), экспортируйте контакты и&nbsp;пригласите
                людей в&nbsp;Max-группу. Если бот не&nbsp;был подключен — попробуйте
                импорт через архив. Orbo умеет обрабатывать экспортированную переписку
                из&nbsp;Telegram: загрузите JSON-архив, и&nbsp;система извлечёт имена,
                username&rsquo;ы и&nbsp;статистику сообщений.
              </p>
            </div>

            <div className="migration-faq__item">
              <h3>Где хранятся данные участников?</h3>
              <p>
                Все данные хранятся на&nbsp;серверах Selectel в&nbsp;России. Это&nbsp;соответствует
                требованиям 152-ФЗ о&nbsp;хранении персональных данных на&nbsp;территории РФ.
                Orbo не&nbsp;использует зарубежные облака для хранения базы участников.
                Доступ к&nbsp;данным есть только у&nbsp;владельца организации
                и&nbsp;назначенных им&nbsp;администраторов.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ====== CTA ====== */}
      <section className="cta-section">
        <div className="website-container">
          <h2 className="cta-section__title">Ваше сообщество — это люди, а не мессенджер</h2>
          <p className="cta-section__text">
            Сохраните базу участников. Подготовьте запасной канал. Действуйте до блокировки.
          </p>
          <div className="cta-section__actions">
            <Link href="https://my.orbo.ru/signup?from=telegram-backup" className="btn-pill btn-pill--white btn-pill--lg">
              Подключить Orbo бесплатно
            </Link>
            <Link href="https://calendly.com/timgorshkov/30min" className="btn-pill btn-pill--ghost-dark" target="_blank" rel="noopener noreferrer">
              Нужна помощь с переездом?
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
