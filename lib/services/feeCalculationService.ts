/**
 * Fee Calculation Service
 *
 * Рассчитывает сервисный сбор и агентское вознаграждение на основе типа контрагента.
 *
 * Модель ценообразования:
 * - Организатор задаёт «стоимость для участника» (totalAmount) — это итоговая сумма
 * - Система выделяет из неё номинальную цену билета (ticketPrice) и сервисный сбор (serviceFee)
 * - Формула: ticketPrice = floor(totalAmount / (1 + rate) * 100) / 100
 *            serviceFee = totalAmount - ticketPrice (гарантирует точное совпадение)
 *
 * Ставки:
 * - Физлицо: сервисный сбор 10%, агентское вознаграждение 0%
 * - Юрлицо/ИП: сервисный сбор 5%, агентское вознаграждение 5%
 */

import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('FeeCalculationService')

// ─── Types ──────────────────────────────────────────────────────────

export type CounterpartyType = 'individual' | 'legal_entity'

export interface FeeCalculation {
  /** Стоимость для участника (то, что задал организатор) */
  totalAmount: number
  /** Номинальная цена билета (выделена из totalAmount) */
  ticketPrice: number
  /** Ставка сервисного сбора */
  serviceFeeRate: number
  /** Сумма сервисного сбора */
  serviceFeeAmount: number
  /** Ставка агентского вознаграждения */
  agentCommissionRate: number
  /** Сумма агентского вознаграждения (удерживается из баланса организатора) */
  agentCommissionAmount: number
  /** Чистая сумма, доступная организатору (ticketPrice - agentCommission) */
  organizerNetAmount: number
}

export interface OrgFeeConfig {
  counterpartyType: CounterpartyType
  serviceFeeRate: number
  agentCommissionRate: number
  hasActiveContract: boolean
}

// ─── Default Rates ─────────────────────────────────────────────────

const DEFAULT_RATES: Record<CounterpartyType, { serviceFeeRate: number; agentCommissionRate: number }> = {
  individual: { serviceFeeRate: 0.10, agentCommissionRate: 0 },
  legal_entity: { serviceFeeRate: 0.05, agentCommissionRate: 0.05 },
}

// ─── Core Calculation ──────────────────────────────────────────────

/**
 * Рассчитывает все суммы из стоимости для участника (totalAmount).
 *
 * Округление гарантирует, что ticketPrice + serviceFee === totalAmount с точностью до копейки.
 * ticketPrice округляется вниз (floor), serviceFee = остаток.
 * agentCommission рассчитывается от ticketPrice.
 */
export function calculateFees(
  totalAmount: number,
  serviceFeeRate: number,
  agentCommissionRate: number
): FeeCalculation {
  if (totalAmount <= 0) {
    return {
      totalAmount: 0,
      ticketPrice: 0,
      serviceFeeRate,
      serviceFeeAmount: 0,
      agentCommissionRate,
      agentCommissionAmount: 0,
      organizerNetAmount: 0,
    }
  }

  // ticketPrice = floor(totalAmount / (1 + rate) * 100) / 100
  const ticketPrice = Math.floor((totalAmount / (1 + serviceFeeRate)) * 100) / 100

  // serviceFee = totalAmount - ticketPrice → гарантирует точное совпадение суммы
  const serviceFeeAmount = Math.round((totalAmount - ticketPrice) * 100) / 100

  // agentCommission рассчитывается от номинальной цены билета
  const agentCommissionAmount = agentCommissionRate > 0
    ? Math.round(ticketPrice * agentCommissionRate * 100) / 100
    : 0

  const organizerNetAmount = Math.round((ticketPrice - agentCommissionAmount) * 100) / 100

  return {
    totalAmount,
    ticketPrice,
    serviceFeeRate,
    serviceFeeAmount,
    agentCommissionRate,
    agentCommissionAmount,
    organizerNetAmount,
  }
}

/**
 * Рассчитывает сборы по типу контрагента (дефолтные ставки).
 */
export function calculateFeesByCounterpartyType(
  totalAmount: number,
  counterpartyType: CounterpartyType
): FeeCalculation {
  const rates = DEFAULT_RATES[counterpartyType]
  return calculateFees(totalAmount, rates.serviceFeeRate, rates.agentCommissionRate)
}

// ─── Org Fee Config ────────────────────────────────────────────────

/**
 * Получает конфигурацию сборов для организации:
 * - Тип контрагента из активного контракта
 * - Ставки из org_accounts (или дефолтные)
 * - Наличие активного контракта
 */
export async function getOrgFeeConfig(orgId: string): Promise<OrgFeeConfig> {
  const db = createAdminServer()

  // Получаем контракт с типом контрагента
  const { data: contractData } = await db.raw(
    `SELECT cp.type AS counterparty_type, c.status AS contract_status
     FROM contracts c
     JOIN counterparties cp ON cp.id = c.counterparty_id
     WHERE c.org_id = $1 AND c.status != 'terminated'
     ORDER BY c.created_at DESC LIMIT 1`,
    [orgId]
  )

  const contract = contractData?.[0]
  const counterpartyType: CounterpartyType = contract?.counterparty_type || 'individual'
  const hasActiveContract = contract?.contract_status === 'verified' || contract?.contract_status === 'signed'

  // Получаем кастомные ставки из org_accounts (если суперадмин переопределил)
  const { data: accountData } = await db
    .from('org_accounts')
    .select('service_fee_rate, agent_commission_rate')
    .eq('org_id', orgId)
    .maybeSingle()

  const defaults = DEFAULT_RATES[counterpartyType]

  // Если есть кастомные ставки в org_accounts — используем их, иначе дефолтные
  const serviceFeeRate = accountData?.service_fee_rate != null
    ? parseFloat(accountData.service_fee_rate)
    : defaults.serviceFeeRate

  const agentCommissionRate = accountData?.agent_commission_rate != null
    ? parseFloat(accountData.agent_commission_rate)
    : defaults.agentCommissionRate

  return {
    counterpartyType,
    serviceFeeRate,
    agentCommissionRate,
    hasActiveContract,
  }
}

/**
 * Рассчитывает сборы для конкретной организации (с учётом кастомных ставок).
 */
export async function calculateFeesForOrg(
  orgId: string,
  totalAmount: number
): Promise<FeeCalculation & { counterpartyType: CounterpartyType }> {
  const config = await getOrgFeeConfig(orgId)
  const fees = calculateFees(totalAmount, config.serviceFeeRate, config.agentCommissionRate)
  return { ...fees, counterpartyType: config.counterpartyType }
}

/**
 * Вычисляет номинальную цену билета из стоимости для участника.
 * Используется для подсказки в форме создания события.
 */
export function getTicketPriceFromTotal(totalAmount: number, serviceFeeRate: number): number {
  if (totalAmount <= 0) return 0
  return Math.floor((totalAmount / (1 + serviceFeeRate)) * 100) / 100
}

/**
 * Возвращает дефолтные ставки для типа контрагента.
 */
export function getDefaultRates(counterpartyType: CounterpartyType) {
  return DEFAULT_RATES[counterpartyType]
}
