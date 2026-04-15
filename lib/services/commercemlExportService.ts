/**
 * CommerceML 2.x Export Service
 *
 * Конвертирует записи accounting_documents (АЛ, АВ) в единый XML-документ формата
 * CommerceML 2.10 для импорта в 1С: Бухгалтерия, Моё дело, Контур.Бухгалтерия,
 * Эльба и другие учётные системы, поддерживающие стандарт.
 *
 * Ссылки на спецификацию:
 *   https://v8.1c.ru/tekhnologii/obmen-dannymi-i-integratsiya/standarty-i-formaty/commerceml/
 *
 * Особенности реализации:
 *   - Кодировка UTF-8 (большинство актуальных импортёров ок; при необходимости
 *     добавим опцию windows-1251).
 *   - Статус УПД без СФ: в CommerceML это обычный документ-акт с товарной частью
 *     и ставкой «Без налога (НДС)».
 *   - Наименования тегов — кириллица, как требует CommerceML. XML-совместимо
 *     (XML 1.0 допускает кириллицу в названиях элементов).
 */

// ─── Types ──────────────────────────────────────────────────────────

export interface AccountingDocumentRow {
  id: string
  doc_type: 'subscription_act' | 'agent_commission_upd'
  doc_number: string
  doc_date: string
  period_start: string | null
  period_end: string | null
  org_id: string
  supplier_requisites: any // JSONB — см. orbo-entity.ts:orboSupplierSnapshot()
  customer_requisites: any
  customer_type: 'individual' | 'legal_entity' | 'self_employed'
  lines: any // JSONB array
  total_amount: string | number
  currency: string
  html_url?: string | null
  metadata?: any
}

// ─── XML escaping ──────────────────────────────────────────────────

function escapeXml(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function formatAmount(v: number): string {
  return v.toFixed(2)
}

// ─── Counterparty XML ───────────────────────────────────────────────

interface CounterpartyKey {
  inn: string
  kpp: string
}

function supplierCounterpartyKey(req: any): CounterpartyKey {
  return { inn: String(req?.inn || ''), kpp: String(req?.kpp || '') }
}

function customerCounterpartyKey(req: any): CounterpartyKey {
  return { inn: String(req?.inn || ''), kpp: String(req?.kpp || '') }
}

function keyString(k: CounterpartyKey): string {
  return `${k.inn}_${k.kpp}`
}

function renderSupplierCounterparty(req: any): string {
  const fullName = req?.full_name || req?.name || ''
  const shortName = req?.name || ''
  return `
    <Контрагент>
      <Ид>${escapeXml(keyString(supplierCounterpartyKey(req)))}</Ид>
      <Роль>Продавец</Роль>
      <Наименование>${escapeXml(shortName)}</Наименование>
      <ПолноеНаименование>${escapeXml(fullName)}</ПолноеНаименование>
      <ОфициальноеНаименование>${escapeXml(fullName)}</ОфициальноеНаименование>
      <ЮридическийАдрес>
        <Представление>${escapeXml(req?.legal_address || '')}</Представление>
      </ЮридическийАдрес>
      <ИНН>${escapeXml(req?.inn || '')}</ИНН>
      <КПП>${escapeXml(req?.kpp || '')}</КПП>
      <ОГРН>${escapeXml(req?.ogrn || '')}</ОГРН>
      <СчетаУчета>
        <СчетУчета>
          <Номер>${escapeXml(req?.settlement_account || '')}</Номер>
          <Банк>
            <Наименование>${escapeXml(req?.bank_name || '')}</Наименование>
            <БИК>${escapeXml(req?.bik || '')}</БИК>
            <КоррСчет>${escapeXml(req?.correspondent_account || '')}</КоррСчет>
          </Банк>
        </СчетУчета>
      </СчетаУчета>
    </Контрагент>`
}

function renderCustomerCounterparty(req: any, customerType: string): string {
  const name = req?.name || ''
  const isLegal = customerType === 'legal_entity'
  const tags: string[] = []
  tags.push(`<Ид>${escapeXml(keyString(customerCounterpartyKey(req)))}</Ид>`)
  tags.push(`<Роль>Покупатель</Роль>`)
  tags.push(`<Наименование>${escapeXml(name)}</Наименование>`)
  if (isLegal) {
    tags.push(`<ПолноеНаименование>${escapeXml(name)}</ПолноеНаименование>`)
    tags.push(`<ОфициальноеНаименование>${escapeXml(name)}</ОфициальноеНаименование>`)
  }
  if (req?.legal_address) {
    tags.push(
      `<ЮридическийАдрес><Представление>${escapeXml(req.legal_address)}</Представление></ЮридическийАдрес>`
    )
  }
  if (req?.inn) tags.push(`<ИНН>${escapeXml(req.inn)}</ИНН>`)
  if (req?.kpp) tags.push(`<КПП>${escapeXml(req.kpp)}</КПП>`)
  if (req?.ogrn) tags.push(`<ОГРН>${escapeXml(req.ogrn)}</ОГРН>`)

  // Банковский счёт (если известен — для агентских контрагентов всегда)
  if (req?.settlement_account) {
    tags.push(`<СчетаУчета>
        <СчетУчета>
          <Номер>${escapeXml(req.settlement_account)}</Номер>
          <Банк>
            <Наименование>${escapeXml(req?.bank_name || '')}</Наименование>
            <БИК>${escapeXml(req?.bik || '')}</БИК>
            <КоррСчет>${escapeXml(req?.correspondent_account || '')}</КоррСчет>
          </Банк>
        </СчетУчета>
      </СчетаУчета>`)
  }

  return `
    <Контрагент>
      ${tags.join('\n      ')}
    </Контрагент>`
}

// ─── Document XML ──────────────────────────────────────────────────

function docHozOperation(doc: AccountingDocumentRow): string {
  return doc.doc_type === 'subscription_act' ? 'Акт на услуги' : 'Акт на услуги'
}

function renderLines(lines: any[]): string {
  if (!Array.isArray(lines) || lines.length === 0) return ''
  return lines
    .map((line, idx) => {
      const quantity = num(line.quantity) || 1
      const price = num(line.price) || 0
      const sum = num(line.sum) || price * quantity
      const unit = line.unit || 'усл. ед.'
      const unitCode = line.unit_code || '796'
      return `
      <Товар>
        <Ид>line_${idx + 1}</Ид>
        <Наименование>${escapeXml(line.name || '')}</Наименование>
        <БазоваяЕдиница Код="${escapeXml(unitCode)}" НаименованиеПолное="${escapeXml(unit)}">${escapeXml(unit)}</БазоваяЕдиница>
        <ЦенаЗаЕдиницу>${formatAmount(price)}</ЦенаЗаЕдиницу>
        <Количество>${formatAmount(quantity)}</Количество>
        <Сумма>${formatAmount(sum)}</Сумма>
        <СтавкиНалогов>
          <СтавкаНалога>
            <Наименование>НДС</Наименование>
            <Ставка>Без налога</Ставка>
          </СтавкаНалога>
        </СтавкиНалогов>
      </Товар>`
    })
    .join('')
}

function renderDocument(doc: AccountingDocumentRow): string {
  const lines = typeof doc.lines === 'string' ? JSON.parse(doc.lines) : (doc.lines || [])
  const total = num(doc.total_amount)

  return `
  <Документ>
    <Ид>${escapeXml(doc.id)}</Ид>
    <Номер>${escapeXml(doc.doc_number)}</Номер>
    <Дата>${escapeXml(doc.doc_date)}</Дата>
    <ХозОперация>${docHozOperation(doc)}</ХозОперация>
    <Роль>Продавец</Роль>
    <Валюта>${escapeXml(doc.currency || 'руб')}</Валюта>
    <Сумма>${formatAmount(total)}</Сумма>
    <Контрагенты>${renderSupplierCounterparty(doc.supplier_requisites)}${renderCustomerCounterparty(doc.customer_requisites, doc.customer_type)}
    </Контрагенты>
    <Товары>${renderLines(lines)}
    </Товары>
    <ЗначенияРеквизитов>
      <ЗначениеРеквизита>
        <Наименование>ТипДокумента</Наименование>
        <Значение>${doc.doc_type === 'subscription_act' ? 'АктНаПередачуПрав' : 'АктНаАгентскоеВознаграждение'}</Значение>
      </ЗначениеРеквизита>
      ${doc.period_start ? `<ЗначениеРеквизита><Наименование>ПериодС</Наименование><Значение>${escapeXml(doc.period_start)}</Значение></ЗначениеРеквизита>` : ''}
      ${doc.period_end ? `<ЗначениеРеквизита><Наименование>ПериодПо</Наименование><Значение>${escapeXml(doc.period_end)}</Значение></ЗначениеРеквизита>` : ''}
      <ЗначениеРеквизита>
        <Наименование>ОснованиеНеНДС</Наименование>
        <Значение>УСН, ст. 346.11 НК РФ</Значение>
      </ЗначениеРеквизита>
    </ЗначенияРеквизитов>
  </Документ>`
}

// ─── Root bundle ────────────────────────────────────────────────────

export interface BundleOptions {
  /** Дата формирования пакета; по умолчанию — сейчас */
  generatedAt?: Date
  /** Если true, в начале XML ставится BOM для совместимости с некоторыми старыми 1С */
  includeBom?: boolean
}

/**
 * Главный экспорт. Принимает записи accounting_documents, возвращает XML-строку.
 */
export function generateCommerceMLBundle(
  docs: AccountingDocumentRow[],
  options: BundleOptions = {}
): string {
  const generatedAt = options.generatedAt || new Date()

  // Собираем уникальных контрагентов: продавец (один — Орбо) + все покупатели
  const supplierKeys = new Set<string>()
  const customerKeys = new Set<string>()
  let supplierBlock = ''
  const customerBlocks: string[] = []

  for (const doc of docs) {
    const sKey = keyString(supplierCounterpartyKey(doc.supplier_requisites))
    if (!supplierKeys.has(sKey)) {
      supplierKeys.add(sKey)
      supplierBlock += renderSupplierCounterparty(doc.supplier_requisites)
    }
    const cKey = keyString(customerCounterpartyKey(doc.customer_requisites)) + `_${doc.customer_type}`
    if (!customerKeys.has(cKey)) {
      customerKeys.add(cKey)
      customerBlocks.push(renderCustomerCounterparty(doc.customer_requisites, doc.customer_type))
    }
  }

  const header = '<?xml version="1.0" encoding="UTF-8"?>\n'
  const bom = options.includeBom ? '\uFEFF' : ''

  const xml = `${bom}${header}<КоммерческаяИнформация ВерсияСхемы="2.10" ДатаФормирования="${escapeXml(
    generatedAt.toISOString()
  )}">
  <Контрагенты>${supplierBlock}${customerBlocks.join('')}
  </Контрагенты>
  <Документы>${docs.map(renderDocument).join('')}
  </Документы>
</КоммерческаяИнформация>
`

  return xml
}

/**
 * Утилита: сгенерировать XML и проверить, что он корректно разобрался
 * (грубая валидация структуры без полной XSD — её у CommerceML нет в публичном доступе).
 */
export function generateAndValidateBundle(
  docs: AccountingDocumentRow[],
  options: BundleOptions = {}
): { xml: string; issues: string[] } {
  const xml = generateCommerceMLBundle(docs, options)
  const issues: string[] = []

  // Sanity checks
  if (!xml.includes('<КоммерческаяИнформация')) {
    issues.push('Missing root element КоммерческаяИнформация')
  }
  if (!xml.includes('</КоммерческаяИнформация>')) {
    issues.push('Unclosed root element')
  }
  if (docs.length === 0) {
    issues.push('No documents in bundle')
  }

  // Каждый документ должен содержать ИНН продавца = ИНН покупателя нельзя (self-dealing)
  for (const doc of docs) {
    const supplierInn = doc.supplier_requisites?.inn
    const customerInn = doc.customer_requisites?.inn
    if (supplierInn && customerInn && supplierInn === customerInn) {
      issues.push(`Document ${doc.doc_number}: supplier INN equals customer INN (${supplierInn})`)
    }
    if (num(doc.total_amount) <= 0) {
      issues.push(`Document ${doc.doc_number}: non-positive total ${doc.total_amount}`)
    }
  }

  return { xml, issues }
}

// Экспорт внутренних функций для тестирования
export const _internal = {
  escapeXml,
  renderDocument,
  renderSupplierCounterparty,
  renderCustomerCounterparty,
}
