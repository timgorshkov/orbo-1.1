/**
 * Resolve / create Elba контрагент for an organization.
 *
 * При отправке акта лицензии (АЛ) в Контур.Эльбу каждая организация-клиент
 * представлена отдельным контрагентом в аккаунте Orbo в Эльбе. Первый раз
 * контрагент создаётся через POST /v1/organizations/{orgId}/contractors, его id
 * сохраняется в `organizations.elba_contractor_id` и переиспользуется для всех
 * последующих актов данной организации.
 *
 * Для ретейл-актов (АУ) используется отдельный фиксированный контрагент
 * «Розничные покупатели» — эта функция к нему не относится.
 */

import { createAdminServer } from '@/lib/server/supabaseServer'
import { createServiceLogger } from '@/lib/logger'
import {
  createContractor,
  findContractorByInn,
  resolveOrganizationId,
  ElbaApiError,
  type ElbaCreateContractorRequest,
} from '@/lib/services/elbaApiClient'

const logger = createServiceLogger('ElbaContractorResolver')

export interface OrgContractorSnapshot {
  /** Наименование для Эльбы: для юрлица — «ООО …», для ИП — «ИП Иванов И.И.». */
  name: string
  /** ИНН (10 — юрлицо, 12 — ИП/физлицо, но физлицам АЛ не выставляем). */
  inn: string | null
  /** КПП — только для юрлиц, у ИП должен быть null. */
  kpp: string | null
  /** ОГРН / ОГРНИП. */
  ogrn: string | null
  legalAddress: string | null
  email: string | null
  phone: string | null
}

/**
 * Возвращает id контрагента в Эльбе для данной организации. Создаёт, если ещё нет.
 * Возвращает также organizationId аккаунта Orbo в Эльбе (один на всю установку).
 */
export async function ensureOrgElbaContractor(
  orgId: string,
  snapshot: OrgContractorSnapshot
): Promise<{ elbaOrganizationId: string; contractorId: string }> {
  const db = createAdminServer()

  const elbaOrganizationId = await resolveOrganizationId()

  // 1. Проверить сохранённый id
  const { data: existing } = await db
    .from('organizations')
    .select('elba_contractor_id')
    .eq('id', orgId)
    .maybeSingle()

  if (existing?.elba_contractor_id) {
    return { elbaOrganizationId, contractorId: existing.elba_contractor_id as string }
  }

  // 2. Создать нового контрагента в Эльбе.
  //    Если контрагент с таким ИНН уже существует (409 EntityAlreadyExists) —
  //    значит, его создали ранее: либо вручную в Эльбе, либо через другой
  //    инвойс этой же организации до того, как мы стали сохранять
  //    elba_contractor_id. В таком случае не пытаемся создать дубликат, а
  //    находим существующего по ИНН и используем его id.
  const payload: ElbaCreateContractorRequest = {
    name: snapshot.name,
    inn: snapshot.inn || null,
    kpp: snapshot.kpp || null,
    ogrn: snapshot.ogrn || null,
    address: snapshot.legalAddress || null,
    contacts:
      snapshot.email || snapshot.phone
        ? [
            {
              emails: snapshot.email ? [snapshot.email] : null,
              phone: snapshot.phone || null,
            },
          ]
        : null,
  }

  let contractorId: string
  try {
    const created = await createContractor(elbaOrganizationId, payload)
    contractorId = created.id
    logger.info(
      { org_id: orgId, elba_contractor_id: contractorId, name: snapshot.name },
      'Elba contractor created for organization'
    )
  } catch (err: unknown) {
    const isAlreadyExists =
      err instanceof ElbaApiError &&
      err.statusCode === 409 &&
      typeof err.body === 'object' &&
      err.body !== null &&
      (err.body as any).error?.code === 'EntityAlreadyExists'

    if (!isAlreadyExists || !snapshot.inn) {
      throw err
    }

    logger.info(
      { org_id: orgId, inn: snapshot.inn },
      'Elba contractor with this INN already exists — searching for existing id'
    )
    const existing = await findContractorByInn(elbaOrganizationId, snapshot.inn)
    if (!existing) {
      throw new Error(
        `Эльба сообщила что контрагент с ИНН ${snapshot.inn} существует, но поиск его не нашёл. Проверьте контрагента в кабинете Эльбы вручную.`
      )
    }
    contractorId = existing.id
    logger.info(
      { org_id: orgId, elba_contractor_id: contractorId, inn: snapshot.inn, name: existing.name },
      'Resolved existing Elba contractor by INN'
    )
  }

  // 3. Сохранить id (для нового и для найденного по ИНН)
  const { error: updErr } = await db
    .from('organizations')
    .update({ elba_contractor_id: contractorId })
    .eq('id', orgId)

  if (updErr) {
    logger.error(
      { org_id: orgId, elba_contractor_id: contractorId, error: updErr.message },
      'Failed to save elba_contractor_id on organization'
    )
  }

  return { elbaOrganizationId, contractorId }
}
