import Link from 'next/link'
import { AppWindow } from 'lucide-react'

interface App {
  id: string
  name: string
  description: string | null
  icon: string | null
}

interface Props {
  apps: App[]
  orgId: string
}

// icon field is either an emoji or a URL
function isUrl(value: string) {
  return value.startsWith('http://') || value.startsWith('https://')
}

export default function AppsSection({ apps, orgId }: Props) {
  if (apps.length === 0) return null

  return (
    <section className="max-w-5xl mx-auto px-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-neutral-900">Приложения</h2>
        <Link href={`/p/${orgId}/apps`} className="text-sm text-blue-600 hover:text-blue-700">
          Все приложения →
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {apps.map((app) => (
          <Link
            key={app.id}
            href={`/p/${orgId}/apps/${app.id}`}
            className="flex items-start gap-3 bg-white rounded-xl border border-neutral-200 p-4 hover:shadow-md transition-shadow"
          >
            {app.icon && isUrl(app.icon) ? (
              <img
                src={app.icon}
                alt={app.name}
                className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
              />
            ) : app.icon ? (
              <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center flex-shrink-0 text-2xl">
                {app.icon}
              </div>
            ) : (
              <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center flex-shrink-0">
                <AppWindow className="w-5 h-5 text-neutral-400" />
              </div>
            )}
            <div className="min-w-0">
              <p className="font-medium text-sm text-neutral-900">{app.name}</p>
              {app.description && (
                <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{app.description}</p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
