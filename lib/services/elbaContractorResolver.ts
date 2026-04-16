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
  resolveOrganizationId,
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

  // 2. Создать нового контрагента в Эльбе
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

  const created = await createContractor(elbaOrganizationId, payload)

  // 3. Сохранить id
  const { error: updErr } = await db
    .from('organizations')
    .update({ elba_contractor_id: created.id })
    .eq('id', orgId)

  if (updErr) {
    // Контрагент в Эльбе создан, но в БД id не сохранился — попадёт в логи,
    // при следующем resend мы создадим дубликат (Эльба, к сожалению, это допускает).
    logger.error(
      { org_id: orgId, elba_contractor_id: created.id, error: updErr.message },
      'Failed to save elba_contractor_id on organization'
    )
  } else {
    logger.info(
      { org_id: orgId, elba_contractor_id: created.id, name: snapshot.name },
      'Elba contractor created for organization'
    )
  }

  return { elbaOrganizationId, contractorId: created.id }
}
