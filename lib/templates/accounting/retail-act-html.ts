/**
 * HTML-шаблон «Акт об оказании услуг» (АУ-NNN) на сводное физлицо «Розничные покупатели».
 *
 * Документ ООО Орбо о собственной выручке от сервисного сбора с физлиц-участников
 * за период. Используется для учёта в КУДиР (УСН «доходы») и выгружается в Эльбу
 * через API. Реестр-расшифровка формируется отдельно (retail-act-registry-html.ts).
 *
 * Покупатель обезличен — «Розничные покупатели» (п. 1 ст. 492 ГК РФ о розничной
 * купле-продаже): услуга оказывается массово физлицам по офертно-конклюдентной
 * модели, без индивидуальных договоров.
 */

import { ORBO_ENTITY } from '@/lib/config/orbo-entity'

export type RetailActFeeType = 'base' | 'full' | 'unknown'

export interface RetailActLine {
  eventId: string | null
  eventTitle: string
  orgName: string | null
  paymentsCount: number
  totalAmount: number
  paymentIds: string[]
  /** Тип сервисного сбора: 'base' = 5% (юрлица), 'full' = 10% (физлица). */
  feeType: RetailActFeeType
}

export interface RetailActTemplateData {
  docNumber: string
  docDate: string
  periodStart: string
  periodEnd: string
  lines: RetailActLine[]
  totalAmount: number
  paymentsCount: number
  /** URL зарегистрированного документа в Эльбе (если акт уже отправлен). */
  elbaUrl?: string | null
}

const FACSIMILE_URL = '/docs/facsimile.png'
const STAMP_URL = '/docs/stamp.png'

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

function amountToWords(amount: number): string {
  const rubles = Math.floor(amount)
  const kopecks = Math.round((amount - rubles) * 100)
  return `${formatMoney(amount)} (${rubles} рублей ${kopecks.toString().padStart(2, '0')} копеек)`
}

function feeTypeLabelForTemplate(feeType: RetailActFeeType): string {
  if (feeType === 'base') return 'базовый (5%) '
  if (feeType === 'full') return 'полный (10%) '
  return ''
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

export function buildRetailActHtml(data: RetailActTemplateData): string {
  const { docNumber, docDate, periodStart, periodEnd, lines, totalAmount, paymentsCount, elbaUrl } = data

  const samePeriod = periodStart === periodEnd
  const periodLabel = samePeriod
    ? formatDate(periodStart)
    : `${formatDate(periodStart)} — ${formatDate(periodEnd)}`

  const rowsHtml = lines
    .map((line, idx) => {
      const feeLabel = feeTypeLabelForTemplate(line.feeType)
      const name = `Сервисный сбор ${feeLabel}за информационное обслуживание при приобретении билетов на мероприятие «${line.eventTitle}»${line.orgName ? ` (организатор: ${line.orgName})` : ''}`
      return `
      <tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(name)}</td>
        <td class="center">${line.paymentsCount}</td>
        <td class="amount-cell">${formatMoney(line.totalAmount)}</td>
      </tr>`
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(docNumber)} — Акт об оказании услуг</title>
  <style>
    @page { size: A4; margin: 1.5cm; }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 11pt;
      line-height: 1.35;
      color: #000;
      max-width: 190mm;
      margin: 0 auto;
      padding: 12px;
    }
    h1 {
      text-align: center;
      font-size: 13pt;
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
      margin-bottom: 20px;
      font-size: 11pt;
    }
    .parties {
      margin: 8px 0 16px;
      font-size: 10.5pt;
    }
    .parties .party { margin-bottom: 4px; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0;
      font-size: 10pt;
    }
    th, td {
      border: 1px solid #000;
      padding: 5px 6px;
      text-align: left;
      vertical-align: top;
    }
    th { background: #f0f0f0; font-size: 9.5pt; }
    .amount-cell { text-align: right; white-space: nowrap; }
    .center { text-align: center; }
    .total-row td { font-weight: bold; background: #fafafa; }
    .basis {
      margin: 14px 0;
      font-size: 10.5pt;
    }
    .signatures {
      display: flex;
      justify-content: flex-start;
      margin-top: 32px;
    }
    .signature-block { flex: 0 0 60%; }
    .signature-block h3 {
      font-size: 11pt;
      margin-bottom: 8px;
      text-transform: uppercase;
    }
    .signature-line {
      position: relative;
      border-bottom: 1px solid #000;
      height: 72px;
      margin: 16px 0 6px;
    }
    .signature-img {
      position: absolute;
      bottom: 2px;
      left: 36px;
      height: 50px;
    }
    .stamp-img {
      position: absolute;
      bottom: -10px;
      right: 16px;
      height: 80px;
      opacity: 0.85;
    }
    .signature-caption { font-size: 9.5pt; color: #555; }
    .footer {
      margin-top: 30px;
      font-size: 8.5pt;
      color: #888;
      text-align: center;
    }
    .elba-link {
      margin-top: 12px;
      font-size: 9.5pt;
      color: #555;
    }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>Акт об оказании услуг № ${escapeHtml(docNumber)}</h1>
  <p class="subtitle">Сервисный сбор платформы Orbo с физлиц-участников мероприятий</p>

  <div class="meta">
    <div><strong>Дата составления:</strong> ${formatDate(docDate)}</div>
    <div><strong>Период оказания услуг:</strong> ${periodLabel}</div>
    <div><strong>г. Москва</strong></div>
  </div>

  <div class="parties">
    <div class="party"><strong>Исполнитель:</strong> ${escapeHtml(ORBO_ENTITY.fullName)}, ИНН ${ORBO_ENTITY.inn}, КПП ${ORBO_ENTITY.kpp}, ОГРН ${ORBO_ENTITY.ogrn}, адрес: ${escapeHtml(ORBO_ENTITY.legalAddress)}.</div>
    <div class="party"><strong>Заказчик:</strong> Розничные покупатели (физические лица — участники мероприятий, акцептовавшие публичную оферту платформы Orbo, размещённую на ${escapeHtml(ORBO_ENTITY.website)}).</div>
    <div class="party"><strong>Предмет:</strong> информационно-технологические услуги по приобретению билетов на мероприятия через платформу Orbo (ст. 779 ГК РФ). Услуги оказаны в полном объёме, претензий к качеству и срокам не предъявлено.</div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 42px;">№ п/п</th>
        <th>Наименование услуги</th>
        <th style="width: 90px;" class="center">Кол-во оплат</th>
        <th style="width: 140px;">Сумма, руб.</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      <tr class="total-row">
        <td colspan="2">Итого</td>
        <td class="center">${paymentsCount}</td>
        <td class="amount-cell">${formatMoney(totalAmount)}</td>
      </tr>
    </tbody>
  </table>

  <p class="basis">
    Всего оказано услуг на сумму <strong>${amountToWords(totalAmount)}</strong>.
    Без НДС: ${escapeHtml(ORBO_ENTITY.taxation.vatExemptionReason)}.
  </p>

  <p class="basis">
    Детальный перечень платежей, вошедших в акт (идентификаторы платёжных сессий,
    даты и суммы), оформлен отдельным реестром-расшифровкой, прилагаемым к настоящему
    акту. Реестр хранится платформой в машиночитаемом виде и предоставляется по запросу.
  </p>

  <div class="signatures">
    <div class="signature-block">
      <h3>Исполнитель</h3>
      <p style="font-size: 10pt;">
        ${escapeHtml(ORBO_ENTITY.shortName)}<br>
        ОГРН: ${ORBO_ENTITY.ogrn}<br>
        ИНН / КПП: ${ORBO_ENTITY.inn} / ${ORBO_ENTITY.kpp}<br>
        Р/с: ${ORBO_ENTITY.bank.settlementAccount}<br>
        Банк: ${escapeHtml(ORBO_ENTITY.bank.name)}, БИК: ${ORBO_ENTITY.bank.bik}<br>
        К/с: ${ORBO_ENTITY.bank.correspondentAccount}
      </p>
      <p>${escapeHtml(ORBO_ENTITY.signatory.position)}</p>
      <div class="signature-line">
        <img src="${FACSIMILE_URL}" alt="" class="signature-img" onerror="this.style.display='none'">
        <img src="${STAMP_URL}" alt="" class="stamp-img" onerror="this.style.display='none'">
      </div>
      <div class="signature-caption">${escapeHtml(ORBO_ENTITY.signatory.shortName)} / ____________________ / М.П.</div>
    </div>
  </div>

  ${elbaUrl ? `<p class="elba-link">Документ зарегистрирован в Контур.Эльба: <a href="${escapeHtml(elbaUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(elbaUrl)}</a></p>` : ''}

  <p class="footer">
    Документ сформирован автоматически платформой Orbo.
    Номер: ${escapeHtml(docNumber)}. Подписан простой электронной подписью Исполнителя.
  </p>
</body>
</html>`
}
