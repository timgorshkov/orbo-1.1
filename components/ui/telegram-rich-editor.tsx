'use client'

import { useEditor, EditorContent, Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { Mark, mergeAttributes } from '@tiptap/react'
import { useEffect, useCallback, useState, useRef } from 'react'
import { telegramMarkdownToHtml } from '@/lib/utils/telegramMarkdownToHtml'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Code, Link as LinkIcon, Eye, EyeOff
} from 'lucide-react'

// ─── Custom Tiptap extension: <tg-spoiler> ───────────────────────────

const TelegramSpoiler = Mark.create({
  name: 'telegramSpoiler',
  parseHTML() {
    return [{ tag: 'tg-spoiler' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['tg-spoiler', mergeAttributes(HTMLAttributes), 0]
  },
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-p': () => this.editor.commands.toggleMark(this.name),
    }
  },
})

// ─── HTML conversion helpers ─────────────────────────────────────────

/**
 * Detect whether a string is Telegram Markdown (as opposed to HTML).
 * If it contains typical HTML tags we already know, treat as HTML.
 */
function looksLikeHtml(text: string): boolean {
  return /<(b|i|u|s|a |code|tg-spoiler|strong|em|pre)\b/i.test(text)
}

/**
 * Convert stored Telegram HTML (newlines, inline tags) → Tiptap-compatible
 * HTML (wrapped in <p> tags).
 */
export function telegramHtmlToTiptap(telegramHtml: string): string {
  if (!telegramHtml) return '<p></p>'

  // Split on double newlines (paragraphs), fallback to single newlines
  const paragraphs = telegramHtml.split(/\n\n/).map(para => {
    // Within each paragraph, convert single newlines to <br>
    return para.replace(/\n/g, '<br>')
  })

  return paragraphs.map(p => `<p>${p}</p>`).join('')
}

/**
 * Convert Tiptap HTML (<p> tags) → Telegram HTML (newlines, inline tags only).
 */
export function tiptapHtmlToTelegram(tiptapHtml: string): string {
  if (!tiptapHtml) return ''

  let result = tiptapHtml

  // 1. Remove empty paragraphs (user pressed Enter for spacing).
  //    These are absorbed into the paragraph break — no extra newlines.
  //    <p><br></p> or <p><br/></p> or <p></p> between other paragraphs
  result = result.replace(/<p><br\s*\/?><\/p>/gi, '')
  result = result.replace(/<p>\s*<\/p>/gi, '')

  // 2. Replace <br> within paragraphs with newline (Shift+Enter)
  result = result.replace(/<br\s*\/?>/gi, '\n')

  // 3. Replace paragraph boundaries with double newline
  result = result.replace(/<\/p>\s*<p>/gi, '\n\n')

  // 4. Remove remaining <p> and </p> tags
  result = result.replace(/<\/?p>/gi, '')

  // 5. Collapse excessive newlines (3+ → 2, i.e. max one blank line)
  result = result.replace(/\n{3,}/g, '\n\n')

  // 6. Trim leading/trailing newlines
  result = result.trim()

  return result
}

/**
 * Prepare value for the editor: auto-detect Markdown vs HTML, convert if needed.
 */
export function prepareContentForEditor(value: string): string {
  if (!value) return '<p></p>'

  if (looksLikeHtml(value)) {
    return telegramHtmlToTiptap(value)
  }

  // Old Markdown content — convert to HTML first
  const html = telegramMarkdownToHtml(value)
  return telegramHtmlToTiptap(html)
}

// ─── Toolbar ─────────────────────────────────────────────────────────

interface ToolbarProps {
  editor: Editor | null
}

function Toolbar({ editor }: ToolbarProps) {
  const [linkInput, setLinkInput] = useState('')
  const [showLinkPopover, setShowLinkPopover] = useState(false)
  const linkInputRef = useRef<HTMLInputElement>(null)

  if (!editor) return null

  const btnBase =
    'p-1.5 rounded-md transition-colors hover:bg-neutral-100 disabled:opacity-30'
  const btnActive = 'bg-neutral-200 text-black'

  const handleLinkSubmit = () => {
    if (linkInput) {
      const url = linkInput.startsWith('http') ? linkInput : `https://${linkInput}`
      editor
        .chain()
        .focus()
        .extendMarkRange('link')
        .setLink({ href: url })
        .run()
    } else {
      editor.chain().focus().unsetLink().run()
    }
    setShowLinkPopover(false)
    setLinkInput('')
  }

  const handleLinkClick = () => {
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run()
      return
    }
    const previousUrl = editor.getAttributes('link').href || ''
    setLinkInput(previousUrl)
    setShowLinkPopover(true)
    setTimeout(() => linkInputRef.current?.focus(), 50)
  }

  return (
    <div className="flex items-center gap-0.5 border-b border-neutral-200 px-2 py-1.5 flex-wrap">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`${btnBase} ${editor.isActive('bold') ? btnActive : 'text-neutral-600'}`}
        title="Жирный (Ctrl+B)"
      >
        <Bold className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`${btnBase} ${editor.isActive('italic') ? btnActive : 'text-neutral-600'}`}
        title="Курсив (Ctrl+I)"
      >
        <Italic className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={`${btnBase} ${editor.isActive('underline') ? btnActive : 'text-neutral-600'}`}
        title="Подчёркнутый (Ctrl+U)"
      >
        <UnderlineIcon className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={`${btnBase} ${editor.isActive('strike') ? btnActive : 'text-neutral-600'}`}
        title="Зачёркнутый (Ctrl+Shift+X)"
      >
        <Strikethrough className="w-4 h-4" />
      </button>

      <div className="w-px h-5 bg-neutral-200 mx-1" />

      <button
        type="button"
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={`${btnBase} ${editor.isActive('code') ? btnActive : 'text-neutral-600'}`}
        title="Код (Ctrl+E)"
      >
        <Code className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={handleLinkClick}
        className={`${btnBase} ${editor.isActive('link') ? btnActive : 'text-neutral-600'}`}
        title="Ссылка (Ctrl+K)"
      >
        <LinkIcon className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={() => editor.chain().focus().toggleMark('telegramSpoiler').run()}
        className={`${btnBase} ${editor.isActive('telegramSpoiler') ? btnActive : 'text-neutral-600'}`}
        title="Скрытый текст (Ctrl+Shift+P)"
      >
        {editor.isActive('telegramSpoiler') ? (
          <Eye className="w-4 h-4" />
        ) : (
          <EyeOff className="w-4 h-4" />
        )}
      </button>

      {showLinkPopover && (
        <div className="flex items-center gap-1.5 ml-2 bg-white border border-neutral-200 rounded-lg px-2 py-1 shadow-sm">
          <input
            ref={linkInputRef}
            type="url"
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleLinkSubmit()
              }
              if (e.key === 'Escape') {
                setShowLinkPopover(false)
                setLinkInput('')
                editor.commands.focus()
              }
            }}
            placeholder="https://..."
            className="text-sm border-none outline-none bg-transparent w-48"
          />
          <button
            type="button"
            onClick={handleLinkSubmit}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 px-1"
          >
            OK
          </button>
          <button
            type="button"
            onClick={() => {
              setShowLinkPopover(false)
              setLinkInput('')
              editor.commands.focus()
            }}
            className="text-xs text-neutral-400 hover:text-neutral-600 px-1"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main editor component ───────────────────────────────────────────

interface TelegramRichEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export default function TelegramRichEditor({
  value,
  onChange,
  placeholder = 'Расскажите о событии...',
  className = '',
}: TelegramRichEditorProps) {
  // Track whether the content was set externally (to avoid infinite loops)
  const isExternalUpdate = useRef(false)
  const lastEmittedHtml = useRef('')

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable features Telegram doesn't support
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        codeBlock: false,
        horizontalRule: false,
        listItem: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 underline cursor-pointer',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      TelegramSpoiler,
    ],
    content: prepareContentForEditor(value),
    onUpdate: ({ editor: ed }) => {
      if (isExternalUpdate.current) return
      const tiptapHtml = ed.getHTML()
      const telegramHtml = tiptapHtmlToTelegram(tiptapHtml)
      lastEmittedHtml.current = telegramHtml
      onChange(telegramHtml)
    },
    editorProps: {
      attributes: {
        class:
          'prose prose-sm max-w-none focus:outline-none min-h-[180px] px-3 py-2',
      },
    },
  })

  // Sync external value changes into the editor
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    // Only update if the value differs from what we last emitted
    if (value === lastEmittedHtml.current) return

    isExternalUpdate.current = true
    const newContent = prepareContentForEditor(value)
    editor.commands.setContent(newContent, false)
    isExternalUpdate.current = false
  }, [value, editor])

  return (
    <div
      className={`border border-neutral-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent bg-white ${className}`}
    >
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
      <style jsx global>{`
        .tiptap p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #adb5bd;
          pointer-events: none;
          height: 0;
        }
        .tiptap tg-spoiler {
          background-color: #e5e5e5;
          border-radius: 2px;
          padding: 0 2px;
        }
        .tiptap a {
          color: #2563eb;
          text-decoration: underline;
          cursor: pointer;
        }
      `}</style>
    </div>
  )
}
