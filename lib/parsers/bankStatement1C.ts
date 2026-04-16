/**
 * Parser for «1С:Предприятие — Обмен с банком» text format (`1CClientBankExchange`).
 *
 * Формат — плоский, с заголовком и множеством блоков `СекцияДокумент=... КонецДокумента`.
 * Обычно UTF-8 или Windows-1251 (указано в заголовке `Кодировка=Windows|UTF8|DOS`).
 *
 * Ссылка на спецификацию формата (СКБ Контур / 1С):
 *   https://v8.1c.ru/tekhnologii/obmen-dannymi-i-integratsiya/standarty-i-formaty/
 */

export interface ParsedPayment {
  /** Номер платёжного поручения (как в выписке, может быть строкой с ведущими нулями). */
  number: string
  /** Дата документа в формате YYYY-MM-DD. */
  date: string
  /** Сумма платежа (число). */
  amount: number
  /** Назначение платежа (как есть в выписке). */
  purpose: string

  payer: {
    /** Плательщик полностью (строка `Плательщик=...` или `Плательщик1=...`). */
    name: string
    inn: string
    kpp: string
    account: string
    /** Банк плательщика (наименование). */
    bankName: string
    bankBik: string
  }

  receiver: {
    name: string
    inn: string
    kpp: string
    account: string
    bankName: string
    bankBik: string
  }

  /** Тип документа из заголовка секции, обычно «Платежное поручение». */
  docType: string

  /** Сырые пары ключ=значение внутри секции — на случай отладки. */
  raw: Record<string, string>
}

export interface ParsedStatement {
  /** Банк, от которого пришла выписка (из заголовка `СекцияРасчСчет`). */
  bankName: string | null
  /** Расчётный счёт, для которого была сформирована выписка. */
  account: string | null
  /** Дата/период выписки (из заголовка). */
  dateFrom: string | null
  dateTo: string | null
  payments: ParsedPayment[]
  /** Предупреждения парсера (неизвестные поля, неожиданный формат). */
  warnings: string[]
}

/**
 * Декодирование Buffer → string с автодетектом кодировки.
 * Определяется по заголовку `Кодировка=` (Windows|UTF8|DOS) или по BOM.
 */
export function decodeBankStatement(buf: Buffer): string {
  // UTF-8 BOM
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.slice(3).toString('utf-8')
  }

  // Считываем первые 512 байт как latin1 (однобайтная, безопасно), ищем `Кодировка=`
  const probe = buf.slice(0, 512).toString('latin1')
  const encMatch = probe.match(/Кодировка\s*=\s*([^\r\n]+)/i)
  const raw = encMatch ? encMatch[1].trim().toLowerCase() : ''

  let encoding: string = 'windows-1251'
  if (/utf-?8/i.test(raw)) encoding = 'utf-8'
  else if (/dos/i.test(raw)) encoding = 'cp866'
  else if (/windows/i.test(raw) || /1251/.test(raw)) encoding = 'windows-1251'
  else {
    // Без явного указания — эвристика: если содержит валидный UTF-8 текст (кириллица),
    // используем utf-8. Иначе windows-1251.
    try {
      const asUtf8 = buf.toString('utf-8')
      // Проверяем наличие русских букв в ASCII-зоне 0x00-0x7F это маловероятно;
      // utf-8 русский занимает по 2 байта, поэтому если ~half of bytes are non-ASCII и
      // декодирование не выдало U+FFFD — считаем utf-8.
      if (!asUtf8.includes('\uFFFD')) {
        encoding = 'utf-8'
      }
    } catch {
      encoding = 'windows-1251'
    }
  }

  try {
    return new TextDecoder(encoding).decode(buf)
  } catch {
    // Фолбэк на windows-1251
    return new TextDecoder('windows-1251').decode(buf)
  }
}

/**
 * Парсит текст 1С-выписки в структуру. Бросает при отсутствии заголовка
 * `1CClientBankExchange`, иначе возвращает результат с warnings.
 */
export function parseBankStatement1C(text: string): ParsedStatement {
  const warnings: string[] = []

  // Нормализуем переводы строк
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')

  // Проверка заголовка
  const firstNonEmpty = lines.find((l) => l.trim().length > 0) || ''
  if (!/^1CClientBankExchange/i.test(firstNonEmpty)) {
    throw new Error(
      'Неверный формат файла: ожидается 1CClientBankExchange в первой строке.'
    )
  }

  const result: ParsedStatement = {
    bankName: null,
    account: null,
    dateFrom: null,
    dateTo: null,
    payments: [],
    warnings,
  }

  // Глобальный контекст (до первого СекцияДокумент)
  let inAccountSection = false
  let inDocSection = false
  let currentDocType = ''
  let currentDoc: Record<string, string> = {}

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Комментарии (маловероятно в 1С-формате, но на всякий)
    if (line.startsWith('//')) continue

    // Начало/конец блоков
    if (/^СекцияРасчСчет$/i.test(line) || /^СекцияРасчСчет\b/i.test(line)) {
      inAccountSection = true
      continue
    }
    if (/^КонецРасчСчет$/i.test(line) || /^КонецРасчСчет\b/i.test(line)) {
      inAccountSection = false
      continue
    }
    const sectionDoc = line.match(/^СекцияДокумент\s*=\s*(.*)$/i)
    if (sectionDoc) {
      inDocSection = true
      currentDocType = sectionDoc[1].trim()
      currentDoc = {}
      continue
    }
    if (/^КонецДокумента$/i.test(line)) {
      if (inDocSection) {
        const payment = buildPaymentFromRaw(currentDocType, currentDoc, warnings)
        if (payment) result.payments.push(payment)
      }
      inDocSection = false
      currentDoc = {}
      currentDocType = ''
      continue
    }
    if (/^КонецФайла$/i.test(line)) break

    // ключ=значение
    const kv = line.match(/^([^=]+)=(.*)$/)
    if (!kv) {
      // Нераспознанная строка — игнорируем
      continue
    }
    const key = kv[1].trim()
    const value = kv[2]

    if (inDocSection) {
      currentDoc[key] = value
    } else if (inAccountSection) {
      if (/^РасчСчет$/i.test(key)) result.account = value.trim()
      else if (/^Банк$/i.test(key) || /^НаименованиеБанка$/i.test(key))
        result.bankName = value.trim()
    } else {
      // Файловый заголовок
      if (/^ДатаНачала$/i.test(key)) result.dateFrom = parse1CDate(value) || null
      if (/^ДатаКонца$/i.test(key)) result.dateTo = parse1CDate(value) || null
    }
  }

  return result
}

function buildPaymentFromRaw(
  docType: string,
  raw: Record<string, string>,
  warnings: string[]
): ParsedPayment | null {
  const number = (raw['Номер'] || '').trim()
  const dateRaw = (raw['Дата'] || '').trim()
  const sumRaw = (raw['Сумма'] || '').trim()
  const purpose = (raw['НазначениеПлатежа'] || raw['НазначениеПлатежа1'] || '').trim()

  if (!number && !dateRaw && !sumRaw) {
    warnings.push(`Пропущен документ «${docType}»: нет ключевых полей.`)
    return null
  }

  const amount = parseAmount(sumRaw)
  if (isNaN(amount)) {
    warnings.push(`Документ №${number}: не удалось разобрать сумму «${sumRaw}».`)
  }

  return {
    number,
    date: parse1CDate(dateRaw) || dateRaw,
    amount: isNaN(amount) ? 0 : amount,
    purpose,
    payer: {
      name: (raw['Плательщик'] || raw['Плательщик1'] || '').trim(),
      inn: (raw['ПлательщикИНН'] || '').trim(),
      kpp: normalizeKpp(raw['ПлательщикКПП']),
      account: (raw['ПлательщикСчет'] || raw['ПлательщикРасчСчет'] || '').trim(),
      bankName: (raw['ПлательщикБанк1'] || raw['ПлательщикБанк'] || '').trim(),
      bankBik: (raw['ПлательщикБИК'] || '').trim(),
    },
    receiver: {
      name: (raw['Получатель'] || raw['Получатель1'] || '').trim(),
      inn: (raw['ПолучательИНН'] || '').trim(),
      kpp: normalizeKpp(raw['ПолучательКПП']),
      account: (raw['ПолучательСчет'] || raw['ПолучательРасчСчет'] || '').trim(),
      bankName: (raw['ПолучательБанк1'] || raw['ПолучательБанк'] || '').trim(),
      bankBik: (raw['ПолучательБИК'] || '').trim(),
    },
    docType,
    raw,
  }
}

/**
 * Многие банки ставят `ПлательщикКПП=0` для ИП и физлиц, у которых КПП
 * действительно нет. Приводим такие «заглушки» к пустой строке, чтобы сверка
 * с договором не срабатывала на фантомное расхождение.
 */
function normalizeKpp(v: string | undefined): string {
  const s = (v || '').trim()
  if (!s) return ''
  if (s === '0' || /^0+$/.test(s)) return ''
  return s
}

function parse1CDate(s: string): string | null {
  // Форматы: "DD.MM.YYYY", "YYYY-MM-DD"
  const trimmed = (s || '').trim()
  if (!trimmed) return null
  const ddmmyyyy = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (ddmmyyyy) {
    return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`
  }
  const yyyymmdd = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (yyyymmdd) {
    return `${yyyymmdd[1]}-${yyyymmdd[2]}-${yyyymmdd[3]}`
  }
  return null
}

function parseAmount(s: string): number {
  // Формат сумм в 1С: "200.00" или "1 200,00" или "200".
  const trimmed = (s || '').replace(/\s+/g, '').replace(',', '.')
  if (!trimmed) return NaN
  const n = parseFloat(trimmed)
  return n
}
