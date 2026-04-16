/**
 * HTML-шаблон «Реестр-расшифровка к Акту об оказании услуг» (АУ-NNN).
 *
 * Построчная детализация всех платежей физлиц-участников, вошедших в сводный акт
 * на «Розничные покупатели». Используется как приложение к акту — по требованию
 * налогового органа (при проверке) подтверждает состав выручки.
 *
 * Данные берутся из accounting_documents.metadata.payments (снапшот на момент
 * формирования акта), поэтому реестр формируется на лету при скачивании архива.
 */

import { ORBO_ENTITY } from '@/lib/config/orbo-entity'

export interface RetailActRegistryPayment {
  income_id: string
  payment_session_id: string | null
  event_registration_id: string | null
  event_id: string | null
  event_title: string | null
  org_id: string | null
  org_name: string | null
  amount: number
  created_at: string
}

export interface RetailActRegistryTemplateData {
  docNumber: string
  docDate: string
  periodStart: string
  periodEnd: string
  totalAmount: number
  paymentsCount: number
  payments: RetailActRegistryPayment[]
}

function formatMoney(v: number): string {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v)
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function escapeHtml(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildRetailActRegistryHtml(data: RetailActRegistryTemplateData): string {
  const { docNumber, docDate, periodStart, periodEnd, totalAmount, paymentsCount, payments } = data

  const samePeriod = periodStart === periodEnd
  const periodLabel = samePeriod
    ? formatDate(periodStart)
    : `${formatDate(periodStart)} — ${formatDate(periodEnd)}`

  const sortedPayments = [...payments].sort((a, b) =>
    (a.created_at || '').localeCompare(b.created_at || '')
  )

  const rowsHtml = sortedPayments
    .map((p, idx) => {
      const shortSession = p.payment_session_id ? p.payment_session_id.slice(0, 8) : '—'
      const shortRegistration = p.event_registration_id ? p.event_registration_id.slice(0, 8) : '—'
      return `
      <tr>
        <td class="center">${idx + 1}</td>
        <td>${escapeHtml(formatDateTime(p.created_at))}</td>
        <td>${escapeHtml(p.event_title || '—')}</td>
        <td>${escapeHtml(p.org_name || '—')}</td>
        <td class="mono">${escapeHtml(shortSession)}</td>
        <td class="mono">${escapeHtml(shortRegistration)}</td>
        <td class="amount-cell">${formatMoney(p.amount)}</td>
      </tr>`
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Реестр к акту ${escapeHtml(docNumber)}</title>
  <style>
    @page { size: A4 landscape; margin: 1.2cm; }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 10pt;
      line-height: 1.3;
      color: #000;
      max-width: 270mm;
      margin: 0 auto;
      padding: 12px;
    }
    h1 {
      text-align: center;
      font-size: 12pt;
      margin: 2px 0 2px;
      text-transform: uppercase;
    }
    .subtitle {
      text-align: center;
      font-size: 10pt;
      font-style: italic;
      margin-bottom: 14px;
    }
    .meta {
      display: flex;
      justify-content: space-between;
      margin-bottom: 16px;
      font-size: 10pt;
      flex-wrap: wrap;
      gap: 8px;
    }
    .parties {
      margin: 8px 0 14px;
      font-size: 10pt;
    }
    .parties .party { margin-bottom: 3px; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0;
      font-size: 9pt;
    }
    th, td {
      border: 1px solid #000;
      padding: 4px 5px;
      text-align: left;
      vertical-align: top;
    }
    th { background: #f0f0f0; font-size: 9pt; }
    .amount-cell { text-align: right; white-space: nowrap; }
    .center { text-align: center; }
    .mono { font-family: 'Courier New', monospace; font-size: 8.5pt; }
    .total-row td { font-weight: bold; background: #fafafa; }
    .basis {
      margin: 12px 0;
      font-size: 10pt;
    }
    .footer {
      margin-top: 20px;
      font-size: 8.5pt;
      color: #888;
      text-align: center;
    }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>Реестр платежей к акту № ${escapeHtml(docNumber)}</h1>
  <p class="subtitle">Расшифровка состава выручки по сервисному сбору за период</p>

  <div class="meta">
    <div><strong>Дата акта:</strong> ${formatDate(docDate)}</div>
    <div><strong>Период:</strong> ${periodLabel}</div>
    <div><strong>Всего платежей:</strong> ${paymentsCount}</div>
    <div><strong>Сумма акта:</strong> ${formatMoney(totalAmount)} ₽</div>
  </div>

  <div class="parties">
    <div class="party"><strong>Исполнитель:</strong> ${escapeHtml(ORBO_ENTITY.fullName)}, ИНН ${ORBO_ENTITY.inn}, КПП ${ORBO_ENTITY.kpp}, ОГРН ${ORBO_ENTITY.ogrn}.</div>
    <div class="party"><strong>Заказчик (обезличенно):</strong> Розничные покупатели — физические лица, участники мероприятий.</div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 36px;">№</th>
        <th style="width: 130px;">Дата и время оплаты</th>
        <th>Мероприятие</th>
        <th style="width: 180px;">Организатор</th>
        <th style="width: 90px;">Сессия</th>
        <th style="width: 90px;">Регистрация</th>
        <th style="width: 110px;">Сумма сбора, ₽</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      <tr class="total-row">
        <td colspan="6">Итого</td>
        <td class="amount-cell">${formatMoney(totalAmount)}</td>
      </tr>
    </tbody>
  </table>

  <p class="basis">
    Реестр сформирован на основании учётных записей платформы Orbo (таблица
    <code>platform_income</code>, <code>income_type = 'service_fee'</code>)
    за указанный период. Тестовые и отменённые платежи исключены. Идентификаторы
    платёжных сессий и регистраций приведены в сокращённом виде (первые 8 символов
    UUID); полные идентификаторы доступны в платформе по запросу.
  </p>

  <p class="footer">
    Документ сформирован автоматически платформой Orbo.
    Приложение к акту ${escapeHtml(docNumber)} от ${formatDate(docDate)}.
  </p>
</body>
</html>`
}
