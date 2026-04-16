/**
 * Contract Payment Verifier
 *
 * Сверяет загруженную 1С-выписку банка с реквизитами договора (counterparty +
 * bank_account). Ищет платёжное поручение по номеру договора в поле
 * «НазначениеПлатежа» и проверяет, что реквизиты плательщика и получателя
 * совпадают байт-в-байт (регистр и кавычки важны — по требованию бухгалтерии).
 */

import { createServiceLogger } from '@/lib/logger'
import { ORBO_ENTITY } from '@/lib/config/orbo-entity'
import { getContractById, type ContractFull } from '@/lib/services/contractService'
import type { ParsedPayment, ParsedStatement } from '@/lib/parsers/bankStatement1C'

const logger = createServiceLogger('ContractPaymentVerifier')

export interface PaymentDiscrepancy {
  field: string
  label: string
  expected: string
  actual: string
}

export interface PaymentVerificationResult {
  /** Было ли найдено платёжное поручение с номером договора в назначении. */
  paymentFound: boolean
  /** Найденное платёжное поручение (если paymentFound). */
  payment: ParsedPayment | null
  /** Все расхождения между выпиской и реквизитами договора. */
  discrepancies: PaymentDiscrepancy[]
  /** True, если платёжка найдена И расхождений нет. */
  matched: boolean
  /** Общее количество платежей в выписке — для диагностики. */
  paymentsInStatement: number
  /** Предупреждения парсера. */
  warnings: string[]
}

/**
 * Основная функция: принимает contractId и распарсенную выписку, возвращает
 * структурированный результат сверки. Ничего не меняет в БД — только читает.
 */
export async function verifyContractPayment(
  contractId: string,
  statement: ParsedStatement
): Promise<PaymentVerificationResult & { contract: ContractFull | null }> {
  const contract = await getContractById(contractId)
  if (!contract) {
    return {
      paymentFound: false,
      payment: null,
      discrepancies: [],
      matched: false,
      paymentsInStatement: statement.payments.length,
      warnings: statement.warnings,
      contract: null,
    }
  }

  // 1. Найти платёжку с contract_number в назначении (регистр важен)
  const contractNumber = contract.contract_number
  const candidates = statement.payments.filter((p) => p.purpose.includes(contractNumber))

  if (candidates.length === 0) {
    return {
      paymentFound: false,
      payment: null,
      discrepancies: [],
      matched: false,
      paymentsInStatement: statement.payments.length,
      warnings: statement.warnings,
      contract,
    }
  }

  // Берём первую подходящую (обычно она одна). Если их несколько — сверяем первую,
  // остальные игнорируем. Такой случай крайне редкий и требует ручного вмешательства.
  const payment = candidates[0]
  if (candidates.length > 1) {
    statement.warnings.push(
      `В выписке найдено ${candidates.length} платежей с упоминанием ${contractNumber}, ` +
        `сверяется первый (№${payment.number} от ${payment.date}).`
    )
  }

  const discrepancies = collectDiscrepancies(contract, payment)

  if (discrepancies.length === 0) {
    logger.info(
      {
        contract_id: contractId,
        contract_number: contractNumber,
        payment_number: payment.number,
        payment_date: payment.date,
        amount: payment.amount,
      },
      'Contract payment matched'
    )
  }

  return {
    paymentFound: true,
    payment,
    discrepancies,
    matched: discrepancies.length === 0,
    paymentsInStatement: statement.payments.length,
    warnings: statement.warnings,
    contract,
  }
}

function collectDiscrepancies(
  contract: ContractFull,
  payment: ParsedPayment
): PaymentDiscrepancy[] {
  const diffs: PaymentDiscrepancy[] = []
  const cp = contract.counterparty
  const ba = contract.bank_account
  const isIndividual = cp.type === 'individual'

  // ─── Получатель (должен быть ООО ОРБО) ─────────────────────────
  compareExact(diffs, 'receiver_inn', 'ИНН получателя', ORBO_ENTITY.inn, payment.receiver.inn)
  compareExact(
    diffs,
    'receiver_account',
    'Р/с получателя',
    ORBO_ENTITY.bank.settlementAccount,
    payment.receiver.account
  )

  // ─── Плательщик ─────────────────────────────────────────────────
  compareExact(diffs, 'payer_inn', 'ИНН плательщика', cp.inn || '', payment.payer.inn)
  compareExact(
    diffs,
    'payer_account',
    'Р/с плательщика',
    ba.settlement_account || '',
    payment.payer.account
  )
  compareExact(diffs, 'payer_bik', 'БИК плательщика', ba.bik || '', payment.payer.bankBik)

  if (isIndividual) {
    // Физлицо/ИП — сравниваем ФИО
    compareExact(
      diffs,
      'payer_name',
      'Наименование плательщика',
      cp.full_name || '',
      payment.payer.name
    )
    // КПП у физлиц нет — проверяем, что в выписке тоже пусто
    if (payment.payer.kpp) {
      diffs.push({
        field: 'payer_kpp',
        label: 'КПП плательщика',
        expected: '(пусто — физлицо)',
        actual: payment.payer.kpp,
      })
    }
  } else {
    // Юрлицо — сверяем наименование и КПП
    compareExact(diffs, 'payer_kpp', 'КПП плательщика', cp.kpp || '', payment.payer.kpp)
    compareExact(
      diffs,
      'payer_name',
      'Наименование плательщика',
      cp.org_name || '',
      payment.payer.name
    )
  }

  return diffs
}

function compareExact(
  diffs: PaymentDiscrepancy[],
  field: string,
  label: string,
  expected: string,
  actual: string
) {
  // Байт-точное сравнение: регистр и кавычки важны. Но невидимые «неразрывные пробелы»
  // и табуляции в начале/конце — нормализуем (trim), чтобы не споткнуться на технических
  // артефактах экспорта. Внутренние пробелы и кавычки — не трогаем.
  const e = (expected || '').trim()
  const a = (actual || '').trim()
  if (e !== a) {
    diffs.push({ field, label, expected: e, actual: a })
  }
}
