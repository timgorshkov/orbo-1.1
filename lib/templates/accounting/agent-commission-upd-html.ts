/**
 * HTML-шаблон УПД на агентское вознаграждение (АВ-NNN).
 *
 * Форма УПД (Универсальный Передаточный Документ) утверждена письмом ФНС
 * ММВ-20-3/96@ от 21.10.2013 и приложением № 1 к приказу ФНС ММВ-7-15/820@.
 *
 * Статус документа: «2» — только акт, без счёта-фактуры (для неплательщиков НДС).
 *
 * Документ выставляется ООО Орбо (агент) в адрес организатора мероприятий (принципал)
 * за период, обычно ежемесячно, на сумму удержанного агентского вознаграждения.
 */

import { ORBO_ENTITY } from '@/lib/config/orbo-entity'

export interface AgentCommissionUPDTemplateData {
  docNumber: string
  docDate: string // ISO date
  periodStart: string
  periodEnd: string
  contractNumber: string | null
  contractDate: string | null
  commissionRate: number // 0.05 = 5%
  totalSalesBase: number // сумма продаж, от которой считалась комиссия
  commissionAmount: number
  agentReportNumber: string | null
  principal: {
    type: 'individual' | 'legal_entity' | 'self_employed'
    name: string
    inn: string | null
    kpp?: string | null
    ogrn?: string | null
    legalAddress: string | null
    signatoryName?: string | null
    signatoryPosition?: string | null
    bankName?: string | null
    bik?: string | null
    correspondentAccount?: string | null
    settlementAccount?: string | null
  }
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

export function buildAgentCommissionUPDHtml(data: AgentCommissionUPDTemplateData): string {
  const {
    docNumber,
    docDate,
    periodStart,
    periodEnd,
    commissionRate,
    totalSalesBase,
    commissionAmount,
    contractNumber,
    contractDate,
    agentReportNumber,
    principal,
  } = data

  const ratePct = (commissionRate * 100).toFixed(2).replace(/\.?0+$/, '')
  const serviceLine = `Агентское вознаграждение за организацию приёма платежей участников мероприятий за период ${formatDate(periodStart)} — ${formatDate(periodEnd)} (${ratePct}% от принятой суммы ${formatMoney(totalSalesBase)} руб.)`

  const principalHeader = principal.type === 'legal_entity'
    ? `${principal.name}${principal.inn ? `, ИНН ${principal.inn}` : ''}${principal.kpp ? `, КПП ${principal.kpp}` : ''}`
    : `${principal.name}${principal.inn ? `, ИНН ${principal.inn}` : ''}`

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>${docNumber} — УПД на агентское вознаграждение</title>
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
    .status-box {
      float: right;
      border: 1px solid #000;
      padding: 6px 10px;
      font-size: 10pt;
      margin-bottom: 6px;
    }
    h1 {
      text-align: center;
      font-size: 13pt;
      margin: 2px 0 2px;
      text-transform: uppercase;
      clear: both;
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
    .total-row td { font-weight: bold; background: #fafafa; }
    .basis {
      margin: 14px 0;
      font-size: 10.5pt;
    }
    .signatures {
      display: flex;
      justify-content: space-between;
      margin-top: 32px;
      gap: 24px;
    }
    .signature-block { flex: 1; }
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
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="status-box">Статус: <strong>2</strong><br><span style="font-size:8.5pt; color:#555;">(только передаточный документ, без СФ)</span></div>
  <h1>Универсальный передаточный документ (УПД) № ${docNumber}</h1>
  <p class="subtitle">Агентское вознаграждение</p>

  <div class="meta">
    <div><strong>Дата составления:</strong> ${formatDate(docDate)}</div>
    <div><strong>г. Москва</strong></div>
  </div>

  <div class="parties">
    <div class="party"><strong>Агент (Продавец):</strong> ${ORBO_ENTITY.fullName}, ИНН ${ORBO_ENTITY.inn}, КПП ${ORBO_ENTITY.kpp}, ОГРН ${ORBO_ENTITY.ogrn}, адрес: ${ORBO_ENTITY.legalAddress}</div>
    <div class="party"><strong>Принципал (Покупатель):</strong> ${principalHeader}${principal.legalAddress ? `, адрес: ${principal.legalAddress}` : ''}</div>
    <div class="party"><strong>Основание:</strong> ${contractNumber ? `Агентский договор ${contractNumber}${contractDate ? ` от ${formatDate(contractDate)}` : ''}` : 'Агентский договор (оферта)'}${agentReportNumber ? `, отчёт агента ${agentReportNumber}` : ''}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 42px;">№ п/п</th>
        <th>Наименование работ, услуг</th>
        <th style="width: 70px;">Ед. изм.</th>
        <th style="width: 60px;">Кол-во</th>
        <th style="width: 110px;">Цена за ед., руб.</th>
        <th style="width: 70px;">Ставка НДС</th>
        <th style="width: 120px;">Стоимость, руб.</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td>
        <td>${serviceLine}</td>
        <td>усл. ед.</td>
        <td>1</td>
        <td class="amount-cell">${formatMoney(commissionAmount)}</td>
        <td>Без НДС</td>
        <td class="amount-cell">${formatMoney(commissionAmount)}</td>
      </tr>
      <tr class="total-row">
        <td colspan="6">Всего к оплате</td>
        <td class="amount-cell">${formatMoney(commissionAmount)}</td>
      </tr>
    </tbody>
  </table>

  <p class="basis">
    Всего наименований 1, на сумму <strong>${amountToWords(commissionAmount)}</strong>.
    Без НДС: ${ORBO_ENTITY.taxation.vatExemptionReason}.
  </p>

  <p class="basis">
    Настоящий документ подтверждает оказание Агентом услуг Принципалу по организации
    приёма платежей от участников мероприятий через платформу Orbo и удержание
    агентского вознаграждения за указанный период. Размер вознаграждения согласован
    в агентском договоре и составляет ${ratePct}% от суммы принятых платежей.
  </p>

  <div class="signatures">
    <div class="signature-block">
      <h3>Агент (Продавец)</h3>
      <p style="font-size: 10pt;">
        ${ORBO_ENTITY.shortName}<br>
        ОГРН: ${ORBO_ENTITY.ogrn}<br>
        ИНН / КПП: ${ORBO_ENTITY.inn} / ${ORBO_ENTITY.kpp}<br>
        Р/с: ${ORBO_ENTITY.bank.settlementAccount}<br>
        Банк: ${ORBO_ENTITY.bank.name}, БИК: ${ORBO_ENTITY.bank.bik}<br>
        К/с: ${ORBO_ENTITY.bank.correspondentAccount}
      </p>
      <p>${ORBO_ENTITY.signatory.position}</p>
      <div class="signature-line">
        <img src="${FACSIMILE_URL}" alt="" class="signature-img" onerror="this.style.display='none'">
        <img src="${STAMP_URL}" alt="" class="stamp-img" onerror="this.style.display='none'">
      </div>
      <div class="signature-caption">${ORBO_ENTITY.signatory.shortName} / ____________________ / М.П.</div>
    </div>

    <div class="signature-block">
      <h3>Принципал (Покупатель)</h3>
      <p style="font-size: 10pt;">
        ${principal.name}<br>
        ${principal.inn ? `ИНН: ${principal.inn}<br>` : ''}
        ${principal.kpp ? `КПП: ${principal.kpp}<br>` : ''}
        ${principal.ogrn ? `ОГРН: ${principal.ogrn}<br>` : ''}
        ${principal.legalAddress ? `Адрес: ${principal.legalAddress}<br>` : ''}
        ${principal.settlementAccount ? `Р/с: ${principal.settlementAccount}<br>` : ''}
        ${principal.bankName ? `Банк: ${principal.bankName}${principal.bik ? `, БИК: ${principal.bik}` : ''}<br>` : ''}
      </p>
      <p>${principal.signatoryPosition || 'Руководитель'}</p>
      <div class="signature-line"></div>
      <div class="signature-caption">${principal.signatoryName || '____________________'} / ____________________ / М.П.</div>
    </div>
  </div>

  <p class="footer">
    Документ сформирован автоматически платформой Orbo.
    Номер УПД: ${docNumber}. Статус «2» — без счёта-фактуры.
    Подписан простой электронной подписью Агента.
  </p>
</body>
</html>`
}
