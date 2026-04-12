/**
 * Subscription Licensing Act Service
 *
 * Формирует акт передачи неисключительных прав на ПО Orbo (лицензионный акт)
 * при оплате тарифа организацией.
 *
 * Ключевые правила:
 * - Акт датирован ДАТОЙ НАЧАЛА периода (не окончания, как для услуг)
 * - Нумерация: АЛ-{seq}, начиная с 1001 (сквозная, через sequence billing_act_seq)
 * - Формат: HTML (готов к печати / сохранению в PDF из браузера)
 * - Хранение: S3 bucket 'documents'
 * - Лицензиат: из contract.counterparty если есть, иначе из customer_* полей инвойса
 */

import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'
import { getContractByOrgId } from './contractService'

const logger = createServiceLogger('SubscriptionActService')

// ─── Orbo requisites ────────────────────────────────────────────────

const ORBO = {
  fullName: 'Общество с ограниченной ответственностью «ОРБО»',
  shortName: 'ООО «ОРБО»',
  inn: '9701327025',
  kpp: '770101001',
  ogrn: '1267700119037',
  legalAddress: '105094, г. Москва, вн.тер.г. муниципальный округ Басманный, ул. Госпитальный Вал, д. 3 к. 4, кв. 79',
  bankName: 'АО «ТБанк»',
  accountNumber: '40702810110002081803',
  correspondentAccount: '30101810145250000974',
  bik: '044525974',
  director: 'Горшков Тимофей Юрьевич',
  directorShort: 'Горшков Т.Ю.',
  taxationSystem: 'УСН (упрощённая система налогообложения, «доходы»)',
  website: 'https://orbo.ru',
  email: 'hello@orbo.ru',
}

// Placeholders для факсимиле и печати (PNG файлы будут в /public/docs/)
const FACSIMILE_URL = '/docs/facsimile.png'
const STAMP_URL = '/docs/stamp.png'

// ─── Types ──────────────────────────────────────────────────────────

export interface SubscriptionActData {
  invoiceId: string
  orgId: string
  orgName: string
  planCode: string
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
  paymentDate?: string  // date when payment was received
  paymentMethod?: string
}

// ─── Act number ─────────────────────────────────────────────────────

async function generateActNumber(): Promise<string> {
  const db = createAdminServer()
  const { data, error } = await db.raw(`SELECT next_billing_act_number() as number`, [])
  if (error) throw new Error(`Failed to generate act number: ${error.message}`)
  return data?.[0]?.number || 'АЛ-1001'
}

// ─── Main entry point ──────────────────────────────────────────────

/**
 * Генерирует акт для инвойса: формирует HTML, загружает в S3, сохраняет URL в инвойсе.
 * Если акт уже сгенерирован (есть act_document_url) — возвращает существующий URL.
 */
export async function generateSubscriptionAct(invoiceId: string): Promise<string> {
  const db = createAdminServer()

  // 1. Load invoice + related data
  const { data: invoiceRows } = await db.raw(`
    SELECT
      i.id, i.org_id, i.amount, i.period_start, i.period_end, i.paid_at,
      i.payment_method, i.gateway_code, i.customer_type, i.customer_name,
      i.customer_inn, i.customer_email, i.customer_phone,
      i.act_number, i.act_document_url,
      s.plan_code,
      o.name as org_name,
      bp.name as plan_name
    FROM org_invoices i
    LEFT JOIN org_subscriptions s ON s.id = i.subscription_id
    LEFT JOIN organizations o ON o.id = i.org_id
    LEFT JOIN billing_plans bp ON bp.code = s.plan_code
    WHERE i.id = $1
  `, [invoiceId])

  const invoice = invoiceRows?.[0]
  if (!invoice) throw new Error(`Invoice ${invoiceId} not found`)

  // Return existing act if already generated
  if (invoice.act_document_url && invoice.act_number) {
    return invoice.act_document_url
  }

  // 2. Determine customer data (from contract if available, else from invoice fields)
  let customer: SubscriptionActData['customer']
  const contract = await getContractByOrgId(invoice.org_id).catch(() => null)
  const cp = (contract as any)?.counterparty

  if (cp) {
    customer = {
      type: cp.type as any,
      name: cp.type === 'legal_entity' ? (cp.org_name || cp.full_name) : cp.full_name,
      inn: cp.inn,
      email: invoice.customer_email || null,
      phone: cp.phone || invoice.customer_phone,
      legalAddress: cp.legal_address,
    }
  } else {
    customer = {
      type: invoice.customer_type || 'individual',
      name: invoice.customer_name || invoice.org_name || '—',
      inn: invoice.customer_inn,
      email: invoice.customer_email,
      phone: invoice.customer_phone,
    }
  }

  // 3. Build act data
  const planName = invoice.plan_name || invoice.plan_code || 'Orbo'
  const actData: SubscriptionActData = {
    invoiceId: invoice.id,
    orgId: invoice.org_id,
    orgName: invoice.org_name,
    planCode: invoice.plan_code,
    planName,
    amount: parseFloat(invoice.amount) || 0,
    periodStart: invoice.period_start,
    periodEnd: invoice.period_end,
    customer,
    paymentDate: invoice.paid_at,
    paymentMethod: invoice.payment_method || invoice.gateway_code,
  }

  // 4. Generate act number (if not assigned yet)
  const actNumber = invoice.act_number || await generateActNumber()

  // 5. Build HTML
  const html = buildActHtml(actNumber, actData)

  // 6. Upload to S3
  const { createStorage, getBucket, getStoragePath } = await import('@/lib/storage')
  const storage = createStorage()
  const bucket = getBucket('documents')
  const filename = actNumber.replace(/[^a-zA-Zа-яА-ЯёЁ0-9-]/g, '_')
  const localPath = `subscription-acts/${invoice.org_id}/${filename}.html`
  const storagePath = getStoragePath('documents', localPath)

  await storage.upload(bucket, storagePath, Buffer.from(html, 'utf-8'), {
    contentType: 'text/html; charset=utf-8',
  })

  const url = storage.getPublicUrl(bucket, storagePath)

  // 7. Save to invoice
  await db
    .from('org_invoices')
    .update({
      act_number: actNumber,
      act_document_url: url,
      act_generated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)

  logger.info({
    invoice_id: invoiceId,
    org_id: invoice.org_id,
    act_number: actNumber,
    url,
  }, 'Subscription act generated')

  return url
}

// ─── HTML template ─────────────────────────────────────────────────

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
  // Simple rubles + kopecks words. Full number-to-words is complex;
  // use rubles formatted as digits + kopecks as digits.
  const rubles = Math.floor(amount)
  const kopecks = Math.round((amount - rubles) * 100)
  return `${formatMoney(amount)} (${rubles} рублей ${kopecks.toString().padStart(2, '0')} копеек)`
}

function customerTypeLabel(type: string): string {
  switch (type) {
    case 'legal_entity': return 'юридическое лицо'
    case 'self_employed': return 'самозанятый (плательщик НПД)'
    default: return 'физическое лицо'
  }
}

function buildActHtml(actNumber: string, data: SubscriptionActData): string {
  const { customer } = data
  const isLegalEntity = customer.type === 'legal_entity'

  // License period: act is dated by period_start (not end, per intellectual property law)
  const actDate = data.periodStart

  // Customer full details line
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
    .signature-block {
      flex: 1;
    }
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
    .text-right { text-align: right; }
    @media print {
      body { padding: 0; }
    }
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
    ${ORBO.fullName} (ОГРН ${ORBO.ogrn}, ИНН ${ORBO.inn}), именуемое в дальнейшем
    <strong>«Лицензиар»</strong>, в лице Генерального директора ${ORBO.director},
    действующего на основании Устава, с одной стороны, и
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
    по адресу ${ORBO.website}/terms, в соответствии со ст. 1235, 1236, 1286 ГК РФ.
  </p>

  <p>
    3. Стоимость предоставленной лицензии за указанный период составляет
    <strong>${amountToWords(data.amount)}</strong>.
    НДС не облагается на основании применения Лицензиаром ${ORBO.taxationSystem}.
  </p>

  <p>
    4. Период использования лицензии:
  </p>
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
        ${ORBO.fullName}<br>
        ОГРН: ${ORBO.ogrn}<br>
        ИНН / КПП: ${ORBO.inn} / ${ORBO.kpp}<br>
        Адрес: ${ORBO.legalAddress}<br>
        Р/с: ${ORBO.accountNumber}<br>
        Банк: ${ORBO.bankName}<br>
        К/с: ${ORBO.correspondentAccount}<br>
        БИК: ${ORBO.bik}
      </p>
      <p>Генеральный директор</p>
      <div class="signature-line">
        <img src="${FACSIMILE_URL}" alt="" class="signature-img" onerror="this.style.display='none'">
        <img src="${STAMP_URL}" alt="" class="stamp-img" onerror="this.style.display='none'">
      </div>
      <div class="signature-caption">${ORBO.directorShort} / ____________________ / М.П.</div>
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
