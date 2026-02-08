import React from 'react'

/**
 * Компонент для скрытого текста (spoiler)
 * Использует data-атрибут для отслеживания состояния без hooks
 */
function SpoilerText({ content }: { content: React.ReactNode }) {
  return (
    <span
      className="spoiler-text bg-neutral-800 text-neutral-800 rounded px-1 cursor-pointer hover:bg-neutral-600 transition-colors select-none"
      title="Нажмите, чтобы показать"
      onClick={(e) => {
        const target = e.currentTarget
        target.classList.remove('bg-neutral-800', 'text-neutral-800')
        target.classList.add('bg-transparent', 'text-current')
        target.style.cursor = 'default'
      }}
    >
      {content}
    </span>
  )
}

/**
 * Утилиты для работы с Telegram Markdown форматированием
 * Поддерживает: жирный, курсив, зачеркнутый, скрытый текст (spoiler), код, ссылки
 */

export interface TelegramMarkdownNode {
  type: 'text' | 'bold' | 'italic' | 'strikethrough' | 'spoiler' | 'code' | 'link'
  content: string
  url?: string
  children?: TelegramMarkdownNode[]
}

/**
 * Парсит Telegram Markdown текст в AST (Abstract Syntax Tree)
 */
export function parseTelegramMarkdown(text: string): TelegramMarkdownNode[] {
  if (!text) return []

  const nodes: TelegramMarkdownNode[] = []
  let i = 0

  while (i < text.length) {
    // Проверяем различные форматы
    if (text[i] === '*') {
      // Telegram: *text* = жирный текст (bold)
      // Also support **text** as bold for backward compatibility
      if (text[i + 1] === '*') {
        // **text** — bold (backward compat with standard markdown)
        const endIndex = text.indexOf('**', i + 2)
        if (endIndex !== -1) {
          const content = text.substring(i + 2, endIndex)
          nodes.push({
            type: 'bold',
            content,
            children: parseTelegramMarkdown(content)
          })
          i = endIndex + 2
          continue
        }
      } else {
        // *text* — bold (Telegram standard)
        const endIndex = findUnescaped(text, '*', i + 1)
        if (endIndex !== -1 && endIndex > i + 1) {
          const content = text.substring(i + 1, endIndex)
          nodes.push({
            type: 'bold',
            content,
            children: parseTelegramMarkdown(content)
          })
          i = endIndex + 1
          continue
        }
      }
    } else if (text[i] === '_') {
      // Telegram: _text_ = курсив (italic), __text__ = подчёркивание (underline, displayed as italic)
      if (text[i + 1] === '_') {
        // __text__ — underline in Telegram (render as italic for web)
        const endIndex = text.indexOf('__', i + 2)
        if (endIndex !== -1) {
          const content = text.substring(i + 2, endIndex)
          nodes.push({
            type: 'italic',
            content,
            children: parseTelegramMarkdown(content)
          })
          i = endIndex + 2
          continue
        }
      } else {
        // _text_ — italic (Telegram standard)
        const endIndex = findUnescaped(text, '_', i + 1)
        if (endIndex !== -1 && endIndex > i + 1) {
          const content = text.substring(i + 1, endIndex)
          nodes.push({
            type: 'italic',
            content,
            children: parseTelegramMarkdown(content)
          })
          i = endIndex + 1
          continue
        }
      }
    } else if (text.substring(i, i + 2) === '~~') {
      // Зачеркнутый текст ~~text~~
      const endIndex = text.indexOf('~~', i + 2)
      if (endIndex !== -1) {
        const content = text.substring(i + 2, endIndex)
        nodes.push({
          type: 'strikethrough',
          content,
          children: parseTelegramMarkdown(content)
        })
        i = endIndex + 2
        continue
      }
    } else if (text.substring(i, i + 2) === '||') {
      // Скрытый текст (spoiler) ||text||
      const endIndex = text.indexOf('||', i + 2)
      if (endIndex !== -1) {
        const content = text.substring(i + 2, endIndex)
        nodes.push({
          type: 'spoiler',
          content,
          children: parseTelegramMarkdown(content)
        })
        i = endIndex + 2
        continue
      }
    } else if (text[i] === '`') {
      // Код `text`
      const endIndex = findUnescaped(text, '`', i + 1)
      if (endIndex !== -1) {
        const content = text.substring(i + 1, endIndex)
        nodes.push({
          type: 'code',
          content
        })
        i = endIndex + 1
        continue
      }
    } else if (text[i] === '[') {
      // Ссылка [text](url)
      const linkEnd = text.indexOf(']', i + 1)
      if (linkEnd !== -1 && text.substring(linkEnd + 1, linkEnd + 2) === '(') {
        const urlEnd = text.indexOf(')', linkEnd + 2)
        if (urlEnd !== -1) {
          const linkText = text.substring(i + 1, linkEnd)
          const url = text.substring(linkEnd + 2, urlEnd)
          nodes.push({
            type: 'link',
            content: linkText,
            url
          })
          i = urlEnd + 1
          continue
        }
      }
    }

    // Обычный текст
    let textEnd = i
    while (textEnd < text.length) {
      const char = text[textEnd]
      if (
        char === '*' || char === '_' || char === '~' || char === '`' || char === '[' ||
        (textEnd < text.length - 1 && (
          text.substring(textEnd, textEnd + 2) === '**' ||
          text.substring(textEnd, textEnd + 2) === '__' ||
          text.substring(textEnd, textEnd + 2) === '~~' ||
          text.substring(textEnd, textEnd + 2) === '||'
        ))
      ) {
        break
      }
      textEnd++
    }

    if (textEnd > i) {
      const content = text.substring(i, textEnd)
      nodes.push({
        type: 'text',
        content
      })
      i = textEnd
    } else {
      // Если не удалось распарсить, добавляем символ как текст
      nodes.push({
        type: 'text',
        content: text[i]
      })
      i++
    }
  }

  return nodes
}

/**
 * Находит незаэкранированный символ в тексте
 */
function findUnescaped(text: string, char: string, startIndex: number): number {
  for (let i = startIndex; i < text.length; i++) {
    if (text[i] === char && (i === 0 || text[i - 1] !== '\\')) {
      return i
    }
  }
  return -1
}

/**
 * Рендерит Telegram Markdown AST в React элементы
 */
export function renderTelegramMarkdown(nodes: TelegramMarkdownNode[]): React.ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.type) {
      case 'bold':
        return (
          <strong key={index} className="font-bold">
            {node.children ? renderTelegramMarkdown(node.children) : node.content}
          </strong>
        )
      case 'italic':
        return (
          <em key={index} className="italic">
            {node.children ? renderTelegramMarkdown(node.children) : node.content}
          </em>
        )
      case 'strikethrough':
        return (
          <span key={index} className="line-through">
            {node.children ? renderTelegramMarkdown(node.children) : node.content}
          </span>
        )
      case 'spoiler':
        return (
          <SpoilerText key={index} content={node.children ? renderTelegramMarkdown(node.children) : node.content} />
        )
      case 'code':
        return (
          <code key={index} className="bg-neutral-100 px-1.5 py-0.5 rounded text-sm font-mono">
            {node.content}
          </code>
        )
      case 'link':
        return (
          <a
            key={index}
            href={node.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            {node.content}
          </a>
        )
      case 'text':
      default:
        return <span key={index}>{node.content}</span>
    }
  })
}

/**
 * Простая функция для рендеринга Telegram Markdown текста
 */
export function renderTelegramMarkdownText(text: string): React.ReactNode {
  if (!text) return null
  const nodes = parseTelegramMarkdown(text)
  return <>{renderTelegramMarkdown(nodes)}</>
}

