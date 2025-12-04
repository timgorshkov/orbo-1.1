/**
 * Конвертирует Telegram Markdown в HTML формат для Telegram API
 * Telegram API поддерживает HTML формат с тегами: <b>, <i>, <s>, <code>, <a>, <pre>
 * 
 * ВАЖНО: 
 * - Сохраняет уже существующие HTML теги в тексте
 * - Spoiler текст (||text||) НЕ поддерживается в HTML режиме, поэтому удаляется
 */
export function telegramMarkdownToHtml(text: string): string {
  if (!text) return ''

  let result = text

  // ВАЖНО: Сначала конвертируем Markdown в HTML, потом экранируем
  // Это позволяет сохранить уже существующие HTML теги в тексте

  // 1. Ссылки [text](url) -> <a href="url">text</a>
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

  // 2. Скрытый текст (spoiler) ||text|| -> <tg-spoiler>text</tg-spoiler>
  // Telegram HTML режим поддерживает специальный тег <tg-spoiler> для скрытого текста
  result = result.replace(/\|\|([^|]+)\|\|/g, '<tg-spoiler>$1</tg-spoiler>')

  // 3. Код `text` -> <code>text</code>
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>')

  // 4. Жирный текст **text** или __text__ -> <b>text</b>
  result = result.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  result = result.replace(/__([^_]+)__/g, '<b>$1</b>')

  // 5. Курсив *text* или _text_ -> <i>text</i>
  // Важно: делаем после жирного, чтобы не конфликтовать с **
  result = result.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<i>$1</i>')
  result = result.replace(/(?<!_)_([^_\n]+?)_(?!_)/g, '<i>$1</i>')

  // 6. Зачеркнутый текст ~~text~~ -> <s>text</s>
  result = result.replace(/~~([^~]+)~~/g, '<s>$1</s>')

  // Теперь экранируем HTML спецсимволы, но сохраняем разрешенные Telegram HTML теги
  // Разрешенные теги в Telegram HTML режиме: <b>, <strong>, <i>, <em>, <u>, <ins>, <s>, <strike>, <del>, <code>, <pre>, <a>, <blockquote>
  // Экранируем только те символы, которые не являются частью этих тегов
  
  // Временные маркеры для защиты разрешенных тегов
  const tagPlaceholders: Map<string, string> = new Map()
  let placeholderIndex = 0
  
  // Защищаем разрешенные HTML теги (включая атрибуты)
  // Telegram HTML режим поддерживает специальный тег <tg-spoiler> для скрытого текста
  const allowedTags = ['b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'code', 'pre', 'a', 'blockquote', 'tg-spoiler']
  const tagPattern = new RegExp(`<(/?)(${allowedTags.join('|')})(\\s[^>]*)?>`, 'gi')
  
  result = result.replace(tagPattern, (match) => {
    const placeholder = `__TAG_PLACEHOLDER_${placeholderIndex}__`
    tagPlaceholders.set(placeholder, match)
    placeholderIndex++
    return placeholder
  })

  // Экранируем оставшиеся HTML символы
  result = result.replace(/&/g, '&amp;')
  result = result.replace(/</g, '&lt;')
  result = result.replace(/>/g, '&gt;')

  // Восстанавливаем защищенные теги
  tagPlaceholders.forEach((tag, placeholder) => {
    result = result.replace(placeholder, tag)
  })

  return result
}

/**
 * Удаляет Telegram Markdown синтаксис из текста (для plain text отображения)
 */
export function stripTelegramMarkdown(text: string): string {
  if (!text) return ''

  let result = text

  // Удаляем ссылки, оставляя только текст: [text](url) -> text
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

  // Удаляем все markdown синтаксисы
  result = result.replace(/\*\*([^*]+)\*\*/g, '$1') // Жирный **text**
  result = result.replace(/__([^_]+)__/g, '$1') // Жирный __text__
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1') // Курсив *text*
  result = result.replace(/(?<!_)_([^_]+)_(?!_)/g, '$1') // Курсив _text_
  result = result.replace(/~~([^~]+)~~/g, '$1') // Зачеркнутый ~~text~~
  result = result.replace(/\|\|([^|]+)\|\|/g, '$1') // Скрытый ||text||
  result = result.replace(/`([^`]+)`/g, '$1') // Код `text`

  return result.trim()
}
