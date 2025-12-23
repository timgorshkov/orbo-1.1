import { Metadata } from 'next';
import Link from 'next/link';
import { 
  AlertTriangle, ArrowRight, CheckCircle, Download, 
  Upload, Users, MessageSquare, Database, Shield,
  Clock, Sparkles, ArrowRightCircle
} from 'lucide-react';
import { Header, Footer, BrowserFrame, PhoneFrame } from '@/components/website';

export const metadata: Metadata = {
  title: 'Миграция с WhatsApp — сохраните участников и переписку',
  description: 'Блокировки WhatsApp в России. Как сохранить контакты участников, историю сообщений и перенести общение в Telegram или Max.',
  keywords: ['whatsapp блокировка', 'миграция whatsapp', 'whatsapp в telegram', 'сохранить контакты whatsapp', 'перенос чата whatsapp'],
};

// WhatsApp logo
const WhatsAppLogo = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="whatsapp-logo">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

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

export default function WhatsAppMigrationPage() {
  return (
    <>
      <Header transparent={false} />
      
      {/* Hero - Urgent Alert Style */}
      <section className="migration-hero">
        <div className="website-container">
          <div className="migration-hero__badge">
            <AlertTriangle size={18} />
            <span>Срочно: блокировки WhatsApp в России</span>
          </div>
          
          <h1 className="migration-hero__title">
            Сохраните участников<br />и переписку из WhatsApp
          </h1>
          
          <p className="migration-hero__subtitle">
            WhatsApp блокируют в России. Успейте экспортировать контакты, историю сообщений 
            и интересы участников — и продолжите общение в Telegram или Max
          </p>
          
          <div className="migration-hero__actions">
            <Link href="https://my.orbo.ru/signup" className="btn-pill btn-pill--primary btn-pill--lg">
              Сохранить участников бесплатно
            </Link>
            <a href="#how-it-works" className="btn-pill btn-pill--outline btn-pill--lg">
              Как это работает
            </a>
          </div>
          
          <div className="migration-hero__messengers">
            <div className="migration-hero__from">
              <WhatsAppLogo />
              <span>WhatsApp</span>
            </div>
            <ArrowRight size={24} className="migration-hero__arrow" />
            <div className="migration-hero__to">
              <div className="migration-hero__to-item">
                <TelegramLogo />
                <span>Telegram</span>
              </div>
              <span className="migration-hero__or">или</span>
              <div className="migration-hero__to-item">
                <MaxLogo />
                <span>Max</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What You Lose */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Риски</span>
            <h2 className="section-header__title">Что теряется без миграции</h2>
          </div>
          
          <div className="migration-risks">
            <div className="migration-risk migration-risk--danger">
              <div className="migration-risk__icon">
                <Users size={24} />
              </div>
              <h3>Контакты участников</h3>
              <p>Телефоны и имена людей останутся недоступны. Собирать базу заново — месяцы работы</p>
            </div>
            
            <div className="migration-risk migration-risk--danger">
              <div className="migration-risk__icon">
                <MessageSquare size={24} />
              </div>
              <h3>История сообщений</h3>
              <p>Договорённости, обсуждения, принятые решения — всё исчезнет вместе с чатом</p>
            </div>
            
            <div className="migration-risk migration-risk--danger">
              <div className="migration-risk__icon">
                <Sparkles size={24} />
              </div>
              <h3>Контекст отношений</h3>
              <p>Кто чем интересовался, кто что искал, кому что обещали — память сообщества</p>
            </div>
            
            <div className="migration-risk migration-risk--danger">
              <div className="migration-risk__icon">
                <Clock size={24} />
              </div>
              <h3>Время на восстановление</h3>
              <p>Найти всех в новом мессенджере, снова собрать в группу — недели хаоса</p>
            </div>
          </div>
        </div>
      </section>

      {/* Solution */}
      <section className="website-section">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Решение</span>
            <h2 className="section-header__title">Orbo сохраняет всё</h2>
            <p className="section-header__subtitle">
              Импортируйте архив WhatsApp — и все данные участников будут в вашей CRM
            </p>
          </div>
          
          <div className="migration-benefits">
            <div className="migration-benefit">
              <div className="migration-benefit__icon migration-benefit__icon--green">
                <CheckCircle size={24} />
              </div>
              <div className="migration-benefit__content">
                <h3>Все контакты в одном месте</h3>
                <p>Телефоны, имена, аватарки участников — автоматически из архива</p>
              </div>
            </div>
            
            <div className="migration-benefit">
              <div className="migration-benefit__icon migration-benefit__icon--green">
                <CheckCircle size={24} />
              </div>
              <div className="migration-benefit__content">
                <h3>AI-анализ переписки</h3>
                <p>Orbo прочитает историю и определит интересы каждого участника</p>
              </div>
            </div>
            
            <div className="migration-benefit">
              <div className="migration-benefit__icon migration-benefit__icon--green">
                <CheckCircle size={24} />
              </div>
              <div className="migration-benefit__content">
                <h3>Экспорт для рассылки</h3>
                <p>Выгрузите контакты и пригласите всех в новую группу в Telegram или Max</p>
              </div>
            </div>
            
            <div className="migration-benefit">
              <div className="migration-benefit__icon migration-benefit__icon--green">
                <CheckCircle size={24} />
              </div>
              <div className="migration-benefit__content">
                <h3>Продолжение в новом мессенджере</h3>
                <p>Подключите новую группу к Orbo — аналитика и уведомления уже настроены</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works - Step by Step */}
      <section className="website-section website-section--alt" id="how-it-works">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Инструкция</span>
            <h2 className="section-header__title">Как перенести группу за 15 минут</h2>
          </div>
          
          <div className="migration-steps">
            {/* Step 1 */}
            <div className="migration-step">
              <div className="migration-step__number">1</div>
              <div className="migration-step__content">
                <h3 className="migration-step__title">Экспортируйте чат из WhatsApp</h3>
                <div className="migration-step__instructions">
                  <p><strong>На телефоне:</strong></p>
                  <ol>
                    <li>Откройте нужную группу в WhatsApp</li>
                    <li>Нажмите ⋮ (три точки) → <strong>Экспорт чата</strong></li>
                    <li>Выберите <strong>«Без файлов»</strong> (для скорости) или <strong>«Добавить файлы»</strong></li>
                    <li>Сохраните ZIP-файл в удобное место</li>
                  </ol>
                </div>
                <div className="migration-step__screenshots">
                  <PhoneFrame 
                    src="/whatsapp-export.png" 
                    alt="Меню экспорта чата в WhatsApp"
                    width={720}
                    height={1560}
                  />
                  <PhoneFrame 
                    src="/whatsapp-export-options.png" 
                    alt="Выбор экспорта с файлами или без"
                    width={720}
                    height={1560}
                  />
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="migration-step">
              <div className="migration-step__number">2</div>
              <div className="migration-step__content">
                <h3 className="migration-step__title">Загрузите архив в Orbo</h3>
                <div className="migration-step__instructions">
                  <ol>
                    <li>Зарегистрируйтесь на <a href="https://my.orbo.ru/signup">my.orbo.ru</a></li>
                    <li>Создайте организацию для вашего сообщества</li>
                    <li>Перейдите в <strong>Настройки</strong> → вкладка <strong>«WhatsApp»</strong></li>
                    <li>Загрузите ZIP-архив или TXT-файл с экспортом</li>
                    <li>Дождитесь обработки (1–5 минут в зависимости от размера)</li>
                  </ol>
                </div>
                <BrowserFrame 
                  src="/orbo-import.png" 
                  alt="Интерфейс импорта WhatsApp в Orbo"
                  url="my.orbo.ru/settings/messengers"
                  width={1500}
                  height={800}
                />
                <BrowserFrame 
                  src="/orbo-import-progress.png" 
                  alt="Загрузка файла для импорта"
                  url="my.orbo.ru/settings/messengers/whatsapp/import"
                  width={1130}
                  height={800}
                />
              </div>
            </div>

            {/* Step 3 */}
            <div className="migration-step">
              <div className="migration-step__number">3</div>
              <div className="migration-step__content">
                <h3 className="migration-step__title">Изучите профили участников</h3>
                <div className="migration-step__instructions">
                  <p>После импорта Orbo автоматически:</p>
                  <ul>
                    <li>Создаст профиль для каждого участника</li>
                    <li>Извлечёт контактные данные (телефон, имя)</li>
                    <li>Проанализирует сообщения с помощью AI</li>
                    <li>Определит интересы, роль в сообществе и обсуждаемые темы</li>
                  </ul>
                </div>
                <BrowserFrame 
                  src="/orbo-participant-profile.png" 
                  alt="Профиль участника с AI-анализом интересов"
                  url="my.orbo.ru/participants/profile"
                  width={1200}
                  height={850}
                />
              </div>
            </div>

            {/* Step 4 */}
            <div className="migration-step">
              <div className="migration-step__number">4</div>
              <div className="migration-step__content">
                <h3 className="migration-step__title">Пригласите участников в новый мессенджер</h3>
                <div className="migration-step__instructions">
                  <ol>
                    <li>Экспортируйте список контактов из Orbo</li>
                    <li>Создайте группу в Telegram или Max</li>
                    <li>Отправьте персональные приглашения участникам</li>
                    <li>Добавьте бота Orbo в новую группу для продолжения аналитики</li>
                  </ol>
                  <p className="migration-step__tip">
                    💡 <strong>Совет:</strong> Напишите участникам, почему переезжаете — люди охотнее присоединятся
                  </p>
                </div>
              </div>
            </div>

            {/* Step 5 */}
            <div className="migration-step">
              <div className="migration-step__number">5</div>
              <div className="migration-step__content">
                <h3 className="migration-step__title">Продолжайте управлять сообществом</h3>
                <div className="migration-step__instructions">
                  <p>Теперь у вас есть:</p>
                  <ul>
                    <li>✅ Полная база участников с историей из WhatsApp</li>
                    <li>✅ Новая группа в Telegram/Max с подключённым Orbo</li>
                    <li>✅ Единая CRM для старых и новых участников</li>
                    <li>✅ AI-аналитика и уведомления в новом чате</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Now */}
      <section className="website-section">
        <div className="website-container">
          <div className="migration-urgency">
            <div className="migration-urgency__icon">
              <AlertTriangle size={32} />
            </div>
            <div className="migration-urgency__content">
              <h2>Почему важно действовать сейчас</h2>
              <ul>
                <li><strong>Блокировки расширяются</strong> — сегодня работает, завтра может не работать</li>
                <li><strong>VPN — временное решение</strong> — не все участники готовы его использовать</li>
                <li><strong>Без архива — без данных</strong> — когда доступ пропадёт, экспорт будет невозможен</li>
              </ul>
              <p className="migration-urgency__cta-text">
                Экспортируйте архив, пока WhatsApp ещё доступен
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="website-section website-section--alt">
        <div className="website-container">
          <div className="section-header section-header--center">
            <span className="section-header__eyebrow">Вопросы</span>
            <h2 className="section-header__title">Частые вопросы</h2>
          </div>
          
          <div className="migration-faq">
            <div className="migration-faq__item">
              <h3>Это бесплатно?</h3>
              <p>Да, импорт WhatsApp и базовые функции CRM бесплатны. Платные тарифы — для продвинутой аналитики и больших команд.</p>
            </div>
            
            <div className="migration-faq__item">
              <h3>Мои данные в безопасности?</h3>
              <p>Orbo хранит данные на защищённых серверах в России. Мы не передаём информацию третьим лицам и не используем для рекламы.</p>
            </div>
            
            <div className="migration-faq__item">
              <h3>Можно импортировать несколько групп?</h3>
              <p>Да, вы можете импортировать любое количество групп. Каждая станет отдельной группой в Orbo.</p>
            </div>
            
            <div className="migration-faq__item">
              <h3>Что если у участника нет Telegram?</h3>
              <p>Контакты сохранятся в CRM. Вы сможете связаться с человеком по телефону и помочь зарегистрироваться в Telegram или Max.</p>
            </div>
            
            <div className="migration-faq__item">
              <h3>AI-анализ работает на русском?</h3>
              <p>Да, Orbo отлично понимает русский язык и определяет интересы, запросы и предложения из русскоязычной переписки.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <div className="website-container">
          <h2 className="cta-section__title">Не теряйте своё сообщество</h2>
          <p className="cta-section__text">
            Экспортируйте WhatsApp-чат сейчас, пока это возможно
          </p>
          <div className="cta-section__actions">
            <Link href="https://my.orbo.ru/signup" className="btn-pill btn-pill--white btn-pill--lg">
              Начать миграцию бесплатно
            </Link>
            <Link href="https://calendly.com/timgorshkov/30min" className="btn-pill btn-pill--ghost-dark">
              Нужна помощь? Запишитесь на консультацию
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
