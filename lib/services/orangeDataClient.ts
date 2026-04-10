/**
 * OrangeData API Client
 *
 * Облачная ККТ (онлайн-касса) для фискализации чеков по 54-ФЗ.
 * Документация: https://github.com/orangedata-official/API
 *
 * Аутентификация двухуровневая:
 * 1. Mutual TLS (mTLS) — клиентский сертификат + ключ
 * 2. X-Signature — SHA256-RSA подпись тела запроса отдельным ключом
 *
 * Env:
 *   ORANGEDATA_API_URL — базовый URL (тест: https://apip.orangedata.ru:2443/api/v2, прод: https://api.orangedata.ru:12003/api/v2)
 *   ORANGEDATA_INN — ИНН организации-владельца кассы
 *   ORANGEDATA_CERT / ORANGEDATA_CERT_PATH — клиентский сертификат (base64 или путь)
 *   ORANGEDATA_KEY / ORANGEDATA_KEY_PATH — ключ клиентского сертификата
 *   ORANGEDATA_SIGN_KEY / ORANGEDATA_SIGN_KEY_PATH — ключ для подписи X-Signature
 *   ORANGEDATA_CA / ORANGEDATA_CA_PATH — CA-сертификат сервера OrangeData
 *   ORANGEDATA_PASSPHRASE — пароль ключа (необязательно)
 */

import { createServiceLogger } from '@/lib/logger'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as https from 'https'

const logger = createServiceLogger('OrangeData')

// ─── Configuration ──────────────────────────────────────────────────

const API_URL = process.env.ORANGEDATA_API_URL || ''
const INN = process.env.ORANGEDATA_INN || ''
const PASSPHRASE = process.env.ORANGEDATA_PASSPHRASE || ''

function loadPem(envBase64: string | undefined, envPath: string | undefined): Buffer | null {
  if (envBase64) return Buffer.from(envBase64, 'base64')
  if (envPath) {
    try { return fs.readFileSync(envPath) } catch { return null }
  }
  return null
}

let _cert: Buffer | null = null
let _key: Buffer | null = null
let _signKey: Buffer | null = null
let _ca: Buffer | null = null

function getCert() { return _cert ??= loadPem(process.env.ORANGEDATA_CERT, process.env.ORANGEDATA_CERT_PATH) }
function getKey() { return _key ??= loadPem(process.env.ORANGEDATA_KEY, process.env.ORANGEDATA_KEY_PATH) }
function getSignKey() { return _signKey ??= loadPem(process.env.ORANGEDATA_SIGN_KEY, process.env.ORANGEDATA_SIGN_KEY_PATH) }
function getCa() { return _ca ??= loadPem(process.env.ORANGEDATA_CA, process.env.ORANGEDATA_CA_PATH) }

/**
 * Проверяет, настроен ли OrangeData (все необходимые env-переменные).
 */
export function isConfigured(): boolean {
  return !!(API_URL && INN && getCert() && getKey() && getSignKey())
}

/**
 * Возвращает ИНН, зарегистрированный в OrangeData.
 */
export function getInn(): string {
  return INN
}

// ─── Request Signing ────────────────────────────────────────────────

function signBody(body: string): string {
  const key = getSignKey()
  if (!key) throw new Error('OrangeData sign key not configured')

  const sign = crypto.createSign('SHA256')
  sign.update(body)
  sign.end()
  return sign.sign({ key, passphrase: PASSPHRASE || undefined }, 'base64')
}

// ─── HTTPS Agent with mTLS ──────────────────────────────────────────

let _agent: https.Agent | null = null

function getAgent(): https.Agent {
  if (_agent) return _agent

  const cert = getCert()
  const key = getKey()
  const ca = getCa()

  if (!cert || !key) throw new Error('OrangeData client certificate not configured')

  _agent = new https.Agent({
    cert,
    key,
    passphrase: PASSPHRASE || undefined,
    ca: ca ? [ca] : undefined,
    rejectUnauthorized: !!ca, // если нет CA — не проверяем (для теста)
  })

  return _agent
}

// ─── API Types ──────────────────────────────────────────────────────

/** Позиция в чеке OrangeData */
export interface OrangeDataPosition {
  /** Название (до 128 символов) */
  text: string
  /** Количество */
  quantity: number
  /** Цена за единицу (рубли, до 2 знаков) */
  price: number
  /** НДС: 1=20%, 2=10%, 3=20/120, 4=10/110, 5=0%, 6=без НДС */
  tax: number
  /** Способ расчёта: 1=предоплата 100%, 2=предоплата, 3=аванс, 4=полный расчёт */
  paymentMethodType: number
  /** Предмет расчёта: 1=товар, 3=работа, 4=услуга */
  paymentSubjectType: number
  /** Тип агента (тег 1222): 64=иной агент */
  agentType?: number
  /** ИНН поставщика (тег 1226) */
  supplierINN?: string
  /** Данные поставщика */
  supplierInfo?: {
    name?: string
    phoneNumbers?: string[]
  }
}

/** Документ (чек) OrangeData */
export interface OrangeDataDocument {
  /** Уникальный ID (до 64 символов) */
  id: string
  /** ИНН организации */
  inn: string
  /** Группа ККТ */
  group?: string
  /** Содержимое чека */
  content: {
    /** Версия ФФД: 2=1.05, 4=1.2 */
    ffdVersion: number
    /** Тип: 1=приход, 2=возврат прихода, 3=расход, 4=возврат расхода */
    type: number
    /** Email или телефон покупателя */
    customerContact: string
    /** Позиции чека */
    positions: OrangeDataPosition[]
    /** Закрытие чека */
    checkClose: {
      /** Оплаты */
      payments: Array<{
        /** 1=наличные, 2=электронные (карта/онлайн) */
        type: number
        /** Сумма */
        amount: number
      }>
      /** Система налогообложения: 0=ОСН, 1=УСН доходы, 2=УСН доходы-расходы */
      taxationSystem: number
    }
  }
}

/** Результат проверки статуса */
export interface OrangeDataStatus {
  /** Успешно ли обработан */
  success: boolean
  /** Номер ФД */
  fiscalDocumentNumber?: string
  /** Фискальный признак */
  fiscalSign?: string
  /** Номер чека */
  receiptNumber?: number
  /** Номер смены */
  shiftNumber?: number
  /** Номер ФН */
  fnNumber?: string
  /** Рег. номер ККТ */
  kktRegNumber?: string
  /** URL чека на сайте ОФД */
  ofdReceiptUrl?: string
  /** Полный ответ */
  rawResponse?: any
  /** Ошибка */
  error?: string
}

// ─── API Methods ────────────────────────────────────────────────────

/**
 * Отправить чек в OrangeData.
 * Возвращает true если чек принят в обработку (HTTP 201).
 */
export async function createDocument(doc: OrangeDataDocument): Promise<{ success: boolean; error?: string }> {
  if (!isConfigured()) {
    logger.warn({ doc_id: doc.id }, 'OrangeData not configured, skipping receipt')
    return { success: false, error: 'OrangeData not configured' }
  }

  const body = JSON.stringify(doc)
  const signature = signBody(body)

  try {
    const response = await fetch(`${API_URL}/documents/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Signature': signature,
      },
      body,
      // @ts-ignore — Node.js fetch supports agent option
      agent: getAgent(),
    })

    if (response.status === 201) {
      logger.info({ doc_id: doc.id, inn: doc.inn }, 'Receipt accepted by OrangeData')
      return { success: true }
    }

    if (response.status === 409) {
      logger.info({ doc_id: doc.id }, 'Receipt already exists in OrangeData (duplicate)')
      return { success: true } // idempotent
    }

    const errorText = await response.text().catch(() => '')
    logger.error({ doc_id: doc.id, status: response.status, body: errorText }, 'OrangeData createDocument failed')
    return { success: false, error: `HTTP ${response.status}: ${errorText}` }
  } catch (err: any) {
    logger.error({ doc_id: doc.id, error: err.message }, 'OrangeData createDocument exception')
    return { success: false, error: err.message }
  }
}

/**
 * Проверить статус чека в OrangeData.
 */
export async function getDocumentStatus(documentId: string): Promise<OrangeDataStatus> {
  if (!isConfigured()) {
    return { success: false, error: 'OrangeData not configured' }
  }

  try {
    const response = await fetch(`${API_URL}/documents/${INN}/status/${documentId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      // @ts-ignore
      agent: getAgent(),
    })

    if (response.status === 200 || response.status === 202) {
      const data = await response.json()

      // HTTP 200 = обработан, данные готовы
      if (response.status === 200 && data) {
        return {
          success: true,
          fiscalDocumentNumber: data.fp?.toString(),
          fiscalSign: data.fs?.toString(),
          receiptNumber: data.documentNumber,
          shiftNumber: data.shiftNumber,
          fnNumber: data.fsNumber,
          kktRegNumber: data.oKKTNumber,
          ofdReceiptUrl: data.qr || undefined,
          rawResponse: data,
        }
      }

      // HTTP 202 = ещё обрабатывается
      return { success: false, error: 'still_processing' }
    }

    if (response.status === 404) {
      return { success: false, error: 'Document not found' }
    }

    const errorText = await response.text().catch(() => '')
    return { success: false, error: `HTTP ${response.status}: ${errorText}` }
  } catch (err: any) {
    logger.error({ doc_id: documentId, error: err.message }, 'OrangeData getStatus exception')
    return { success: false, error: err.message }
  }
}
