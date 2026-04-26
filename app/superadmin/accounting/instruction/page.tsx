/**
 * Superadmin → Accounting → Instruction
 *
 * Renders docs/accounting-instruction.md as a static page so the bookkeeper
 * can read it directly in the admin without leaving the platform.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

async function loadInstruction(): Promise<string> {
  // Resolved relative to the running Next.js process. In production the docs
  // directory is bundled into the standalone output by the deploy archive.
  const filePath = path.join(process.cwd(), 'docs', 'accounting-instruction.md')
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch (err) {
    return `# Инструкция временно недоступна\n\nНе удалось загрузить файл по пути \`${filePath}\`. Обратитесь к администратору.`
  }
}

export default async function AccountingInstructionPage() {
  const md = await loadInstruction()

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

      <article className="prose prose-sm md:prose-base max-w-none bg-white rounded-xl border border-gray-200 p-6 prose-headings:scroll-mt-4 prose-table:text-sm prose-th:bg-gray-50 prose-th:font-semibold prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2 prose-table:border prose-table:border-collapse prose-th:border prose-td:border">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <ReactMarkdown remarkPlugins={[remarkGfm as any]}>{md}</ReactMarkdown>
      </article>
    </div>
  )
}
