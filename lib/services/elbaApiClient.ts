/**
 * Kontur.Elba Public API Client
 *
 * Клиент для работы с публичным API Контур.Эльбы (аутентификация через
 * заголовок X-Kontur-ApiKey). Используется для автоматической выгрузки
 * актов об оказании услуг на сводное физлицо «Розничные покупатели».
 *
 * Документация: docs/elba.public.api-api.json (OpenAPI 3.0.1).
 *
 * Конфигурация через env:
 *   - ELBA_API_KEY         — API-ключ из Эльбы («Настройки сервиса» → «API»)
 *   - ELBA_API_BASE_URL    — базовый URL API (default: https://api-elba.kontur.ru)
 *   - ELBA_API_VERSION     — версия API (default: v1)
 *
 * Идентификаторы, получаемые один раз и сохраняемые в env или accounting_settings:
 *   - ELBA_ORGANIZATION_ID — UUID организации ОРБО в Эльбе
 *   - ELBA_RETAIL_CONTRACTOR_ID — UUID контрагента «Розничные покупатели»
 */

import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('ElbaApiClient')

// ─── Config ─────────────────────────────────────────────────────────

function getConfig() {
  const apiKey = process.env.ELBA_API_KEY
  if (!apiKey) {
    throw new Error('ELBA_API_KEY is not set. Configure the API key from Эльба → Настройки → API.')
  }
  const baseUrl = (process.env.ELBA_API_BASE_URL || 'https://api-elba.kontur.ru').replace(/\/+$/, '')
  const version = process.env.ELBA_API_VERSION || 'v1'
  return { apiKey, baseUrl, version }
}

// ─── Types (мирроры из OpenAPI) ─────────────────────────────────────

export interface ElbaOrganization {
  id: string
  inn: string
  kpp: string
}

export interface ElbaOrganizationsList {
  organizations: ElbaOrganization[]
}

export type ElbaNdsRate =
  | 'withoutNds'
  | 'nds0'
  | 'nds5'
  | 'nds10'
  | 'nds20'
  | 'nds22'

export interface ElbaActItem {
  productName: string
  quantity: number
  unitName: string
  price?: number
  ndsRate?: ElbaNdsRate | null
  discount?: number | null
}

export interface ElbaCreateActRequest {
  date: string // YYYY-MM-DD
  number?: string | null
  withNDS?: boolean | null
  reasonName?: string | null
  reasonNumber?: string | null
  reasonDate?: string | null
  comment?: string | null
  bankAccountId?: string | null
  contractorId?: string | null
  sumsWithNDS?: boolean | null
  withDiscount?: boolean | null
  warehouseItems?: ElbaActItem[] | null
}

export interface ElbaCreateActResponse {
  id: string
}

export interface ElbaContractorContact {
  name?: string | null
  post?: string | null
  phone?: string | null
  emails?: string[] | null
  comment?: string | null
}

export interface ElbaCreateContractorRequest {
  name: string
  inn?: string | null
  kpp?: string | null
  shortName?: string | null
  address?: string | null
  postAddress?: string | null
  okpo?: string | null
  ogrn?: string | null
  contacts?: ElbaContractorContact[] | null
}

export interface ElbaCreateContractorResponse {
  id: string
}

export interface ElbaCreateDocumentLinkRequest {
  documentId: string
  published: boolean
  withSignatures: boolean
  isQrCodeEnabled: boolean
}

export interface ElbaCreateDocumentLinkResponse {
  id: string
  url: string
}

export interface ElbaApiErrorDetail {
  code?: string
  message?: string
  target?: string
  details?: ElbaApiErrorDetail[]
  context?: Record<string, unknown>
  innerError?: ElbaApiErrorDetail
}

export interface ElbaApiErrorBody {
  statusCode?: number
  error?: ElbaApiErrorDetail
  traceId?: string
}

export class ElbaApiError extends Error {
  readonly statusCode: number
  readonly body: ElbaApiErrorBody | string | null
  readonly traceId: string | null

  constructor(message: string, statusCode: number, body: ElbaApiErrorBody | string | null, traceId: string | null) {
    super(message)
    this.name = 'ElbaApiError'
    this.statusCode = statusCode
    this.body = body
    this.traceId = traceId
  }
}

// ─── HTTP core ──────────────────────────────────────────────────────

async function request<T>(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: unknown,
  opts: { timeoutMs?: number } = {}
): Promise<T> {
  const { apiKey, baseUrl, version } = getConfig()
  // Replace {version} placeholder in path with configured version
  const resolvedPath = path.replace(/\{version\}/g, version)
  const url = `${baseUrl}${resolvedPath}`
  const timeoutMs = opts.timeoutMs ?? 30_000

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: {
        'X-Kontur-ApiKey': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err: any) {
    clearTimeout(timer)
    throw new ElbaApiError(
      err?.name === 'AbortError'
        ? `Elba API timeout after ${timeoutMs}ms (${method} ${resolvedPath})`
        : `Elba API network error: ${err?.message || 'unknown'} (${method} ${resolvedPath})`,
      0,
      null,
      null
    )
  } finally {
    clearTimeout(timer)
  }

  const traceId = res.headers.get('x-trace-id') || res.headers.get('traceparent') || null
  const ctype = res.headers.get('content-type') || ''

  // 204 No Content / пустой ответ
  if (res.status === 204) {
    return undefined as unknown as T
  }

  const text = await res.text()
  let parsed: unknown = null
  if (text && ctype.includes('application/json')) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  } else if (text) {
    parsed = text
  }

  if (!res.ok) {
    const errBody = (parsed && typeof parsed === 'object' ? (parsed as ElbaApiErrorBody) : null) as
      | ElbaApiErrorBody
      | null
    const msg =
      errBody?.error?.message ||
      errBody?.error?.code ||
      (typeof parsed === 'string' ? parsed : `Elba API ${res.status}`)
    logger.error(
      {
        status: res.status,
        method,
        path: resolvedPath,
        traceId: errBody?.traceId || traceId,
        error: msg,
      },
      'Elba API error response'
    )
    throw new ElbaApiError(
      `Elba API ${res.status}: ${msg}`,
      res.status,
      (parsed as ElbaApiErrorBody | string | null) ?? null,
      errBody?.traceId || traceId
    )
  }

  return parsed as T
}

// ─── Public endpoints ───────────────────────────────────────────────

/**
 * GET /{version}/organizations — список организаций, доступных по ключу.
 */
export async function listOrganizations(
  params: { offset?: number; limit?: number } = {}
): Promise<ElbaOrganizationsList> {
  const qs = new URLSearchParams()
  if (typeof params.offset === 'number') qs.set('offset', String(params.offset))
  if (typeof params.limit === 'number') qs.set('limit', String(params.limit))
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return request<ElbaOrganizationsList>('GET', `/{version}/organizations${suffix}`)
}

/**
 * POST /{version}/organizations/{organizationId}/contractors — создать контрагента.
 * Для «Розничные покупатели» достаточно только `name` (ИНН/КПП можно опустить).
 */
export async function createContractor(
  organizationId: string,
  payload: ElbaCreateContractorRequest
): Promise<ElbaCreateContractorResponse> {
  return request<ElbaCreateContractorResponse>(
    'POST',
    `/{version}/organizations/${encodeURIComponent(organizationId)}/contractors`,
    payload
  )
}

/**
 * POST /{version}/organizations/{organizationId}/acts — создать акт об оказании услуг.
 * Возвращает UUID документа в Эльбе.
 */
export async function createAct(
  organizationId: string,
  payload: ElbaCreateActRequest
): Promise<ElbaCreateActResponse> {
  return request<ElbaCreateActResponse>(
    'POST',
    `/{version}/organizations/${encodeURIComponent(organizationId)}/acts`,
    payload
  )
}

/**
 * POST /{version}/organizations/{organizationId}/document-links — создать
 * публичную ссылку на документ в Эльбе (HTML-просмотр, PDF-печать).
 */
export async function createDocumentLink(
  organizationId: string,
  payload: ElbaCreateDocumentLinkRequest
): Promise<ElbaCreateDocumentLinkResponse> {
  return request<ElbaCreateDocumentLinkResponse>(
    'POST',
    `/{version}/organizations/${encodeURIComponent(organizationId)}/document-links`,
    payload
  )
}

// ─── High-level helper ─────────────────────────────────────────────

export interface ElbaActSubmission {
  organizationId: string
  contractorId: string
  docNumber: string
  docDate: string // YYYY-MM-DD
  items: ElbaActItem[]
  comment?: string
}

export interface ElbaActSubmissionResult {
  elbaDocumentId: string
  elbaUrl: string | null
}

/**
 * Отправить готовый акт в Эльбу: создать акт + получить публичную ссылку.
 * Бросает ElbaApiError при ошибке на любом из шагов.
 */
export async function submitActToElba(
  input: ElbaActSubmission
): Promise<ElbaActSubmissionResult> {
  const act = await createAct(input.organizationId, {
    date: input.docDate,
    number: input.docNumber,
    withNDS: false,
    contractorId: input.contractorId,
    comment: input.comment ?? null,
    warehouseItems: input.items,
  })

  let elbaUrl: string | null = null
  try {
    const link = await createDocumentLink(input.organizationId, {
      documentId: act.id,
      published: true,
      withSignatures: true,
      isQrCodeEnabled: false,
    })
    elbaUrl = link.url
  } catch (err) {
    logger.warn(
      { elbaDocumentId: act.id, error: (err as Error).message },
      'Failed to create document link in Elba (act itself was created)'
    )
  }

  return { elbaDocumentId: act.id, elbaUrl }
}

/**
 * Идемпотентное разрешение organizationId: если задан в env — отдаём его,
 * иначе подтягиваем первую организацию из списка (для одноразовой инициализации).
 */
export async function resolveOrganizationId(): Promise<string> {
  const fromEnv = process.env.ELBA_ORGANIZATION_ID
  if (fromEnv) return fromEnv
  const list = await listOrganizations({ limit: 100 })
  const first = list.organizations?.[0]
  if (!first) {
    throw new Error('No organizations available for the configured ELBA_API_KEY.')
  }
  return first.id
}

/**
 * Идемпотентное разрешение contractorId для «Розничные покупатели»: если задан
 * в env — отдаём его; если нет — создаём в Эльбе контрагента и возвращаем новый id.
 * (Сохранение id в env/config — ответственность вызывающего кода).
 */
export async function ensureRetailContractorId(organizationId: string): Promise<string> {
  const fromEnv = process.env.ELBA_RETAIL_CONTRACTOR_ID
  if (fromEnv) return fromEnv
  const created = await createContractor(organizationId, {
    name: 'Розничные покупатели',
  })
  logger.info(
    { contractorId: created.id, organizationId },
    'Created retail contractor in Elba (сохраните id в ELBA_RETAIL_CONTRACTOR_ID)'
  )
  return created.id
}
