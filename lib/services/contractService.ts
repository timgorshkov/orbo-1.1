import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('ContractService')

// Types

export interface CounterpartyIndividual {
  type: 'individual'
  full_name: string
  email: string
  phone: string
  inn: string
  passport_series_number: string
  passport_issued_by: string
  passport_issue_date: string
  registration_address: string
  passport_photo_1_url?: string
  passport_photo_2_url?: string
}

export interface CounterpartyLegalEntity {
  type: 'legal_entity'
  org_name: string
  inn: string
  kpp?: string
  ogrn: string
  legal_address: string
  signatory_name: string
  signatory_position: string
  vat_rate: 'none' | '5' | '7' | '22'
  email: string
  phone: string
}

export type CounterpartyInput = CounterpartyIndividual | CounterpartyLegalEntity

export interface BankAccountInput {
  bik: string
  bank_name: string
  correspondent_account: string
  settlement_account: string
  transfer_comment?: string
}

export interface ContractFull {
  id: string
  org_id: string
  contract_number: string
  contract_date: string
  status: string
  created_at: string
  updated_at: string
  counterparty: {
    id: string
    type: string
    inn: string | null
    email: string | null
    phone: string | null
    full_name: string | null
    passport_series_number: string | null
    passport_issued_by: string | null
    passport_issue_date: string | null
    registration_address: string | null
    passport_photo_1_url: string | null
    passport_photo_2_url: string | null
    org_name: string | null
    kpp: string | null
    ogrn: string | null
    legal_address: string | null
    signatory_name: string | null
    signatory_position: string | null
    vat_rate: string | null
  }
  bank_account: {
    id: string
    bik: string
    bank_name: string
    correspondent_account: string
    settlement_account: string
    transfer_comment: string | null
    status: string
  }
  org_name?: string
}

const CONTRACT_QUERY = `
  SELECT
    c.id, c.org_id, c.contract_number, c.contract_date, c.status,
    c.created_at, c.updated_at,
    cp.id as cp_id, cp.type as cp_type, cp.inn as cp_inn, cp.email as cp_email,
    cp.phone as cp_phone, cp.full_name as cp_full_name,
    cp.passport_series_number as cp_passport_series_number,
    cp.passport_issued_by as cp_passport_issued_by,
    cp.passport_issue_date as cp_passport_issue_date,
    cp.registration_address as cp_registration_address,
    cp.passport_photo_1_url as cp_passport_photo_1_url,
    cp.passport_photo_2_url as cp_passport_photo_2_url,
    cp.org_name as cp_org_name, cp.kpp as cp_kpp, cp.ogrn as cp_ogrn,
    cp.legal_address as cp_legal_address,
    cp.signatory_name as cp_signatory_name,
    cp.signatory_position as cp_signatory_position,
    cp.vat_rate as cp_vat_rate,
    ba.id as ba_id, ba.bik as ba_bik, ba.bank_name as ba_bank_name,
    ba.correspondent_account as ba_correspondent_account,
    ba.settlement_account as ba_settlement_account,
    ba.transfer_comment as ba_transfer_comment,
    ba.status as ba_status,
    o.name as org_name
  FROM contracts c
  JOIN counterparties cp ON cp.id = c.counterparty_id
  JOIN bank_accounts ba ON ba.id = c.bank_account_id
  JOIN organizations o ON o.id = c.org_id
`

function mapRow(row: any): ContractFull {
  return {
    id: row.id,
    org_id: row.org_id,
    contract_number: row.contract_number,
    contract_date: row.contract_date,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    org_name: row.org_name,
    counterparty: {
      id: row.cp_id,
      type: row.cp_type,
      inn: row.cp_inn,
      email: row.cp_email,
      phone: row.cp_phone,
      full_name: row.cp_full_name,
      passport_series_number: row.cp_passport_series_number,
      passport_issued_by: row.cp_passport_issued_by,
      passport_issue_date: row.cp_passport_issue_date,
      registration_address: row.cp_registration_address,
      passport_photo_1_url: row.cp_passport_photo_1_url,
      passport_photo_2_url: row.cp_passport_photo_2_url,
      org_name: row.cp_org_name,
      kpp: row.cp_kpp,
      ogrn: row.cp_ogrn,
      legal_address: row.cp_legal_address,
      signatory_name: row.cp_signatory_name,
      signatory_position: row.cp_signatory_position,
      vat_rate: row.cp_vat_rate,
    },
    bank_account: {
      id: row.ba_id,
      bik: row.ba_bik,
      bank_name: row.ba_bank_name,
      correspondent_account: row.ba_correspondent_account,
      settlement_account: row.ba_settlement_account,
      transfer_comment: row.ba_transfer_comment,
      status: row.ba_status,
    },
  }
}

export async function getContractByOrgId(orgId: string): Promise<ContractFull | null> {
  const db = createAdminServer()
  const { data, error } = await db.raw(
    `${CONTRACT_QUERY} WHERE c.org_id = $1 AND c.status != 'terminated' ORDER BY c.created_at DESC LIMIT 1`,
    [orgId]
  )

  if (error) {
    logger.error({ error: error.message, org_id: orgId }, 'Failed to get contract by org')
    return null
  }

  if (!data || data.length === 0) return null
  return mapRow(data[0])
}

export async function getContractById(contractId: string): Promise<ContractFull | null> {
  const db = createAdminServer()
  const { data, error } = await db.raw(
    `${CONTRACT_QUERY} WHERE c.id = $1`,
    [contractId]
  )

  if (error) {
    logger.error({ error: error.message, contract_id: contractId }, 'Failed to get contract by id')
    return null
  }

  if (!data || data.length === 0) return null
  return mapRow(data[0])
}

export async function createContract(
  orgId: string,
  counterparty: CounterpartyInput,
  bankAccount: BankAccountInput
): Promise<{ contract: ContractFull | null; error: string | null }> {
  const db = createAdminServer()

  // 1. Insert counterparty
  const cpFields: Record<string, any> = {
    org_id: orgId,
    type: counterparty.type,
    email: counterparty.email,
    phone: counterparty.phone,
    inn: counterparty.inn,
  }

  if (counterparty.type === 'individual') {
    cpFields.full_name = counterparty.full_name
    cpFields.passport_series_number = counterparty.passport_series_number
    cpFields.passport_issued_by = counterparty.passport_issued_by
    cpFields.passport_issue_date = counterparty.passport_issue_date
    cpFields.registration_address = counterparty.registration_address
    cpFields.passport_photo_1_url = counterparty.passport_photo_1_url || null
    cpFields.passport_photo_2_url = counterparty.passport_photo_2_url || null
  } else {
    cpFields.org_name = counterparty.org_name
    cpFields.kpp = counterparty.kpp || null
    cpFields.ogrn = counterparty.ogrn
    cpFields.legal_address = counterparty.legal_address
    cpFields.signatory_name = counterparty.signatory_name
    cpFields.signatory_position = counterparty.signatory_position
    cpFields.vat_rate = counterparty.vat_rate
  }

  const { data: cpData, error: cpError } = await db
    .from('counterparties')
    .insert(cpFields)
    .select('id')
    .single()

  if (cpError || !cpData) {
    logger.error({ error: cpError?.message, org_id: orgId }, 'Failed to create counterparty')
    return { contract: null, error: cpError?.message || 'Failed to create counterparty' }
  }

  // 2. Insert bank account
  const { data: baData, error: baError } = await db
    .from('bank_accounts')
    .insert({
      counterparty_id: cpData.id,
      bik: bankAccount.bik,
      bank_name: bankAccount.bank_name,
      correspondent_account: bankAccount.correspondent_account,
      settlement_account: bankAccount.settlement_account,
      transfer_comment: bankAccount.transfer_comment || null,
      status: 'filled_by_client',
    })
    .select('id')
    .single()

  if (baError || !baData) {
    logger.error({ error: baError?.message, counterparty_id: cpData.id }, 'Failed to create bank account')
    return { contract: null, error: baError?.message || 'Failed to create bank account' }
  }

  // 3. Generate contract number
  const { data: numData, error: numError } = await db.raw(
    `SELECT generate_contract_number() as contract_number`,
    []
  )

  if (numError || !numData || numData.length === 0) {
    logger.error({ error: numError?.message }, 'Failed to generate contract number')
    return { contract: null, error: 'Failed to generate contract number' }
  }

  const contractNumber = numData[0].contract_number

  // 4. Insert contract
  const { data: contractData, error: contractError } = await db
    .from('contracts')
    .insert({
      org_id: orgId,
      counterparty_id: cpData.id,
      bank_account_id: baData.id,
      contract_number: contractNumber,
      status: 'filled_by_client',
    })
    .select('id')
    .single()

  if (contractError || !contractData) {
    logger.error({ error: contractError?.message, org_id: orgId }, 'Failed to create contract')
    return { contract: null, error: contractError?.message || 'Failed to create contract' }
  }

  logger.info({ contract_id: contractData.id, contract_number: contractNumber, org_id: orgId }, 'Contract created')

  const contract = await getContractById(contractData.id)
  return { contract, error: null }
}

export async function updateContractStatus(
  contractId: string,
  status: string
): Promise<{ error: string | null }> {
  const db = createAdminServer()
  const { error } = await db
    .from('contracts')
    .update({ status })
    .eq('id', contractId)

  if (error) {
    logger.error({ error: error.message, contract_id: contractId }, 'Failed to update contract status')
    return { error: error.message }
  }

  logger.info({ contract_id: contractId, status }, 'Contract status updated')
  return { error: null }
}

export async function updateCounterparty(
  counterpartyId: string,
  fields: Record<string, any>
): Promise<{ error: string | null }> {
  const db = createAdminServer()
  const { error } = await db
    .from('counterparties')
    .update(fields)
    .eq('id', counterpartyId)

  if (error) {
    logger.error({ error: error.message, counterparty_id: counterpartyId }, 'Failed to update counterparty')
    return { error: error.message }
  }

  return { error: null }
}

export async function updateBankAccount(
  bankAccountId: string,
  fields: Record<string, any>
): Promise<{ error: string | null }> {
  const db = createAdminServer()
  const { error } = await db
    .from('bank_accounts')
    .update(fields)
    .eq('id', bankAccountId)

  if (error) {
    logger.error({ error: error.message, bank_account_id: bankAccountId }, 'Failed to update bank account')
    return { error: error.message }
  }

  return { error: null }
}

export async function listContracts(filters?: { status?: string }): Promise<ContractFull[]> {
  const db = createAdminServer()
  let sql = `${CONTRACT_QUERY}`
  const params: any[] = []

  if (filters?.status) {
    sql += ` WHERE c.status = $1`
    params.push(filters.status)
  }

  sql += ` ORDER BY c.created_at DESC`

  const { data, error } = await db.raw(sql, params)

  if (error) {
    logger.error({ error: error.message }, 'Failed to list contracts')
    return []
  }

  return (data || []).map(mapRow)
}
