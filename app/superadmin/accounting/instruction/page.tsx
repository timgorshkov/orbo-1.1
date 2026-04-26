/**
 * Superadmin → Accounting → Instruction
 *
 * Renders docs/accounting-instruction.md as a static page so the bookkeeper
 * can read it directly in the admin without leaving the platform.
 *
 * Uses `marked` (server-side, no client component required) since the markdown
 * is internal/trusted (committed to the repo) — XSS risk is nil.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { marked } from 'marked'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

async function loadInstructionHtml(): Promise<{ html: string; loadError: string | null }> {
  // Resolved relative to the running Next.js process. In production the docs
  // directory is bundled into the standalone output via outputFileTracingIncludes.
  const filePath = path.join(process.cwd(), 'docs', 'accounting-instruction.md')
  try {
    const md = await fs.readFile(filePath, 'utf-8')
    const html = await marked.parse(md, { async: true, gfm: true, breaks: false })
    return { html, loadError: null }
  } catch (err: any) {
    return {
      html: '',
      loadError: err?.message || `Не удалось загрузить ${filePath}`,
    }
  }
}

export default async function AccountingInstructionPage() {
  const { html, loadError } = await loadInstructionHtml()

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/superadmin/accounting"
          className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          К бухгалтерским документам
        </Link>
      </div>

      {loadError ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          <strong>Ошибка загрузки инструкции.</strong>
          <div className="mt-2 font-mono text-xs">{loadError}</div>
        </div>
      ) : (
        <article
          className="instruction-prose bg-white rounded-xl border border-gray-200 p-6"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  )
}
