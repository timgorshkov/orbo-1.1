import Link from 'next/link'
import { FileText } from 'lucide-react'

interface Material {
  id: string
  title: string
  updated_at: string
}

interface Props {
  materials: Material[]
  orgId: string
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'сегодня'
  if (days === 1) return 'вчера'
  if (days < 7) return `${days} дн. назад`
  if (days < 30) return `${Math.floor(days / 7)} нед. назад`
  return `${Math.floor(days / 30)} мес. назад`
}

export default function RecentMaterialsSection({ materials, orgId }: Props) {
  if (materials.length === 0) return null

  return (
    <section className="max-w-5xl mx-auto px-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-neutral-900">Материалы</h2>
        <Link href={`/p/${orgId}/materials`} className="text-sm text-blue-600 hover:text-blue-700">
          Все материалы →
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 px-4 py-1">
        {materials.map((material) => (
          <Link
            key={material.id}
            href={`/p/${orgId}/materials?page=${material.id}`}
            className="flex items-center gap-3 py-2.5 border-b border-neutral-100 last:border-0 hover:bg-neutral-50 -mx-4 px-4 transition-colors"
          >
            <FileText className="w-4 h-4 text-neutral-400 flex-shrink-0" />
            <span className="flex-1 text-sm text-neutral-900 line-clamp-1">{material.title}</span>
            <span className="text-xs text-neutral-400 flex-shrink-0">{timeAgo(material.updated_at)}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
