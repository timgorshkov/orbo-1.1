/**
 * Реквизиты ООО «ОРБО» — единая точка правды для всех бухгалтерских документов,
 * актов, УПД, счетов, чеков, выгрузок в 1С и публичной страницы реквизитов.
 *
 * Изменять здесь. Никаких захардкоженных копий в других местах.
 */

export interface OrboRequisites {
  /** Полное наименование: «Общество с ограниченной...» */
  fullName: string
  /** Краткое наименование: «ООО "ОРБО"» */
  shortName: string
  inn: string
  kpp: string
  ogrn: string
  /** Юридический адрес одной строкой */
  legalAddress: string
  /** Фактический адрес (если отличается от юридического) */
  actualAddress?: string
  /** Банковские реквизиты для безналичной оплаты */
  bank: {
    name: string
    bik: string
    correspondentAccount: string
    settlementAccount: string
  }
  /** Подписант (обычно ген. директор) */
  signatory: {
    fullName: string
    /** Сокращение: «Горшков Т.Ю.» */
    shortName: string
    position: string
    /** Основание полномочий, пишется в документах: «Устав», «Доверенность №...» */
    actingOn: string
  }
  /** Система налогообложения с правовым основанием для УПД/актов */
  taxation: {
    /** Человекочитаемое название, попадает в бланк документа */
    label: string
    /** Основание освобождения от НДС (для УПД без СФ) */
    vatExemptionReason: string
    /**
     * Числовой код для OrangeData ФФД 1.2 (`checkClose.taxationSystem`):
     *   0 = ОСН
     *   1 = УСН доходы
     *   2 = УСН доходы минус расходы
     *   4 = ЕСХН
     *   5 = ПСН
     * Должен совпадать с СНО, под которой касса фискализирована в кабинете
     * OrangeData / ФНС. Иначе OrangeData возвращает ошибку «В данной группе
     * нет ККТ фискализированных на СНО указанную в чеке».
     */
    orangeDataCode: number
  }
  /** Контакты */
  website: string
  email: string
  phone?: string
}

export const ORBO_ENTITY: OrboRequisites = {
  fullName: 'Общество с ограниченной ответственностью «ОРБО»',
  shortName: 'ООО «ОРБО»',
  inn: '9701327025',
  kpp: '770101001',
  ogrn: '1267700119037',
  legalAddress:
    '105094, г. Москва, вн.тер.г. муниципальный округ Басманный, ул. Госпитальный Вал, д. 3 к. 4, кв. 79',
  bank: {
    name: 'АО «ТБанк»',
    bik: '044525974',
    correspondentAccount: '30101810145250000974',
    settlementAccount: '40702810110002081803',
  },
  signatory: {
    fullName: 'Горшков Тимофей Юрьевич',
    shortName: 'Горшков Т.Ю.',
    position: 'Генеральный директор',
    actingOn: 'Устав',
  },
  taxation: {
    label: 'УСН (упрощённая система налогообложения, «доходы»)',
    vatExemptionReason:
      'Организация применяет УСН и не признаётся плательщиком НДС (п. 2 ст. 346.11 НК РФ)',
    // Per OrangeData ФФД 1.2 spec: 1 = УСН доходы. Was incorrectly set to 2
    // (УСН доходы-расходы), which made OrangeData reject every receipt with
    // «нет ККТ фискализированных на СНО указанную в чеке» since the cassa
    // is registered under sno=1.
    orangeDataCode: 1,
  },
  website: 'https://orbo.ru',
  email: 'hello@orbo.ru',
}

/**
 * Снапшот реквизитов в виде, пригодном для сохранения в JSONB
 * поле `accounting_documents.supplier_requisites`.
 */
export function orboSupplierSnapshot() {
  return {
    name: ORBO_ENTITY.shortName,
    full_name: ORBO_ENTITY.fullName,
    inn: ORBO_ENTITY.inn,
    kpp: ORBO_ENTITY.kpp,
    ogrn: ORBO_ENTITY.ogrn,
    legal_address: ORBO_ENTITY.legalAddress,
    bank_name: ORBO_ENTITY.bank.name,
    bik: ORBO_ENTITY.bank.bik,
    correspondent_account: ORBO_ENTITY.bank.correspondentAccount,
    settlement_account: ORBO_ENTITY.bank.settlementAccount,
    signatory_name: ORBO_ENTITY.signatory.fullName,
    signatory_position: ORBO_ENTITY.signatory.position,
    signatory_acting_on: ORBO_ENTITY.signatory.actingOn,
    tax_system: ORBO_ENTITY.taxation.label,
    vat_exemption_reason: ORBO_ENTITY.taxation.vatExemptionReason,
  }
}
