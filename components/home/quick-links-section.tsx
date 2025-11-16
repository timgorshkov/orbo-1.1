import Link from 'next/link'
import { User, Calendar, BookOpen, MessageCircle, Grid3x3 } from 'lucide-react'

interface Props {
  orgId: string
  isAdmin: boolean
}

export default function QuickLinksSection({ orgId, isAdmin }: Props) {
  const links = [
    {
      href: `/p/${orgId}/profile`,
      icon: User,
      title: 'Мой профиль',
      description: 'Настройки и информация'
    },
    {
      href: `/p/${orgId}/events`,
      icon: Calendar,
      title: 'Все события',
      description: 'Предстоящие и прошедшие'
    },
    {
      href: `/p/${orgId}/materials`,
      icon: BookOpen,
      title: 'Материалы',
      description: 'База знаний'
    },
    {
      href: `/p/${orgId}/apps`,
      icon: Grid3x3,
      title: 'Приложения',
      description: 'Полезные сервисы'
    }
  ]

  return (
    <section className="mb-12">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            🔗 Быстрые ссылки
          </h2>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md hover:scale-105 transition-all"
              >
                <div className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-3">
                    <link.icon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                    {link.title}
                  </h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {link.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

