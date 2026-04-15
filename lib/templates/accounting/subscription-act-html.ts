/**
 * HTML-шаблон акта передачи неисключительных прав на программу для ЭВМ (АЛ-NNN).
 *
 * Выделен из subscriptionActService.ts для чистоты. Не содержит I/O, работает
 * только с чистыми данными — удобно тестировать и переиспользовать.
 */

import { ORBO_ENTITY } from '@/lib/config/orbo-entity'

export interface SubscriptionActTemplateData {
  actNumber: string
  invoiceId: string
  orgName: string
  planName: string
  amount: number
  periodStart: string // ISO date
  periodEnd: string   // ISO date
  customer: {
    type: 'individual' | 'legal_entity' | 'self_employed'
    name: string
    inn?: string | null
    email?: string | null
    phone?: string | null
    legalAddress?: string | null
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

function customerTypeLabel(type: string): string {
  switch (type) {
    case 'legal_entity': return 'юридическое лицо'
    case 'self_employed': return 'индивидуальный предприниматель / самозанятый'
    default: return 'физическое лицо'
  }
}

export function buildSubscriptionActHtml(data: SubscriptionActTemplateData): string {
  const { actNumber, customer } = data
  const isLegalEntity = customer.type === 'legal_entity'

  // Акт датирован первым днём периода (ст. 1235-1286 ГК РФ, права передаются на начало лицензионного периода)
  const actDate = data.periodStart

  const customerInn = customer.inn ? `ИНН ${customer.inn}` : ''
  const customerAddr = customer.legalAddress || ''
  const customerContact = [customer.email, customer.phone].filter(Boolean).join(', ')

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>${actNumber} — Акт передачи неисключительных прав</title>
  <style>
    @page { size: A4; margin: 2cm 1.5cm; }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
      line-height: 1.4;
      color: #000;
      max-width: 180mm;
      margin: 0 auto;
      padding: 20px;
    }
    h1 {
      text-align: center;
      font-size: 14pt;
      margin-bottom: 4px;
      text-transform: uppercase;
    }
    .subtitle {
      text-align: center;
      font-size: 11pt;
      margin-bottom: 18px;
      font-style: italic;
    }
    .meta {
      display: flex;
      justify-content: space-between;
      margin-bottom: 24px;
    }
    p { margin: 8px 0; text-align: justify; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
    }
    th, td {
      border: 1px solid #000;
      padding: 6px 8px;
      text-align: left;
      vertical-align: top;
    }
    th { background: #f5f5f5; }
    .amount-cell { text-align: right; white-space: nowrap; }
    .signatures {
      display: flex;
      justify-content: space-between;
      margin-top: 40px;
      gap: 40px;
    }
    .signature-block { flex: 1; }
    .signature-block h3 {
      font-size: 12pt;
      margin-bottom: 12px;
      text-transform: uppercase;
    }
    .signature-line {
      position: relative;
      border-bottom: 1px solid #000;
      height: 80px;
      margin: 18px 0 6px;
    }
    .signature-img {
      position: absolute;
      bottom: 2px;
      left: 40px;
      height: 55px;
    }
    .stamp-img {
      position: absolute;
      bottom: -10px;
      right: 20px;
      height: 90px;
      opacity: 0.85;
    }
    .signature-caption {
      font-size: 10pt;
      color: #555;
    }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>Акт ${actNumber}</h1>
  <p class="subtitle">о передаче неисключительных прав на использование программы для ЭВМ</p>

  <div class="meta">
    <div><strong>г. Москва</strong></div>
    <div><strong>«${formatDate(actDate)}»</strong></div>
  </div>

  <p>
    ${ORBO_ENTITY.fullName} (ОГРН ${ORBO_ENTITY.ogrn}, ИНН ${ORBO_ENTITY.inn}), именуемое в дальнейшем
    <strong>«Лицензиар»</strong>, в лице ${ORBO_ENTITY.signatory.position} ${ORBO_ENTITY.signatory.fullName},
    действующего на основании ${ORBO_ENTITY.signatory.actingOn}, с одной стороны, и
    ${isLegalEntity ? customer.name : `гражданин ${customer.name}`}${customerInn ? `, ${customerInn}` : ''}${customerAddr ? `, адрес: ${customerAddr}` : ''},
    именуем${isLegalEntity ? 'ое' : 'ый'} в дальнейшем <strong>«Лицензиат»</strong>
    (${customerTypeLabel(customer.type)}), с другой стороны, совместно именуемые
    «Стороны», составили настоящий Акт о нижеследующем:
  </p>

  <p>
    1. Лицензиар передал, а Лицензиат принял простую (неисключительную) лицензию
    на использование программы для ЭВМ <strong>«Orbo»</strong> на условиях
    выбранного тарифного плана <strong>«${data.planName}»</strong> на период
    с <strong>${formatDate(data.periodStart)}</strong>
    по <strong>${formatDate(data.periodEnd)}</strong>.
  </p>

  <p>
    2. Передача неисключительных прав осуществляется на условиях присоединения
    к публичной оферте — Пользовательскому лицензионному соглашению, размещённому
    по адресу ${ORBO_ENTITY.website}/terms, в соответствии со ст. 1235, 1236, 1286 ГК РФ.
  </p>

  <p>
    3. Стоимость предоставленной лицензии за указанный период составляет
    <strong>${amountToWords(data.amount)}</strong>.
    НДС не облагается: ${ORBO_ENTITY.taxation.vatExemptionReason}.
  </p>

  <p>4. Период использования лицензии:</p>
  <table>
    <tr>
      <th>Наименование</th>
      <th>Период</th>
      <th class="amount-cell">Сумма, руб.</th>
    </tr>
    <tr>
      <td>Передача неисключительных прав на использование программы для ЭВМ «Orbo», тариф «${data.planName}»</td>
      <td>${formatDate(data.periodStart)} — ${formatDate(data.periodEnd)}</td>
      <td class="amount-cell">${formatMoney(data.amount)}</td>
    </tr>
    <tr>
      <td colspan="2"><strong>Итого</strong></td>
      <td class="amount-cell"><strong>${formatMoney(data.amount)}</strong></td>
    </tr>
  </table>

  <p>
    5. Лицензиат подтверждает, что права, указанные в п. 1 настоящего Акта, переданы
    в полном объёме. Лицензиат не имеет претензий к объёму и качеству переданных
    прав, а также к срокам предоставления лицензии.
  </p>

  <p>
    6. Настоящий Акт составлен в одном экземпляре в форме электронного документа,
    подписан Лицензиаром простой электронной подписью (факсимильным воспроизведением
    подписи) на условиях соглашения об использовании простой электронной подписи,
    являющегося частью публичной оферты. Стороны признают, что настоящий Акт,
    сформированный в электронном виде, имеет юридическую силу равную собственноручно
    подписанному документу.
  </p>

  <div class="signatures">
    <div class="signature-block">
      <h3>Лицензиар</h3>
      <p>
        ${ORBO_ENTITY.fullName}<br>
        ОГРН: ${ORBO_ENTITY.ogrn}<br>
        ИНН / КПП: ${ORBO_ENTITY.inn} / ${ORBO_ENTITY.kpp}<br>
        Адрес: ${ORBO_ENTITY.legalAddress}<br>
        Р/с: ${ORBO_ENTITY.bank.settlementAccount}<br>
        Банк: ${ORBO_ENTITY.bank.name}<br>
        К/с: ${ORBO_ENTITY.bank.correspondentAccount}<br>
        БИК: ${ORBO_ENTITY.bank.bik}
      </p>
      <p>${ORBO_ENTITY.signatory.position}</p>
      <div class="signature-line">
        <img src="${FACSIMILE_URL}" alt="" class="signature-img" onerror="this.style.display='none'">
        <img src="${STAMP_URL}" alt="" class="stamp-img" onerror="this.style.display='none'">
      </div>
      <div class="signature-caption">${ORBO_ENTITY.signatory.shortName} / ____________________ / М.П.</div>
    </div>

    <div class="signature-block">
      <h3>Лицензиат</h3>
      <p>
        ${customer.name}<br>
        ${customerInn ? `${customerInn}<br>` : ''}
        ${customerAddr ? `Адрес: ${customerAddr}<br>` : ''}
        ${customerContact ? `Контакт: ${customerContact}<br>` : ''}
        Организация в Orbo: ${data.orgName}
      </p>
      <p>&nbsp;</p>
      <div class="signature-line"></div>
      <div class="signature-caption">
        ${isLegalEntity ? 'Руководитель' : ''} / ____________________ / ${isLegalEntity ? 'М.П.' : ''}
      </div>
    </div>
  </div>

  <p style="margin-top: 40px; font-size: 9pt; color: #888; text-align: center;">
    Документ сформирован автоматически платформой Orbo.
    Номер акта: ${actNumber}. ID инвойса: ${data.invoiceId}.
    Подписан простой электронной подписью Лицензиара в соответствии с п. 6 настоящего Акта.
  </p>
</body>
</html>`
}
