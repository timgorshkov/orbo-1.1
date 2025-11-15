import Link from 'next/link'

interface Member {
  id: string
  full_name: string
  username: string | null
  avatar_url: string | null
  joined_at: string
}

interface Props {
  members: Member[]
  orgId: string
}

export default function RecentMembersSection({ members, orgId }: Props) {
  if (members.length === 0) {
    return null
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <section className="mb-12">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              👥 Новые участники
            </h2>
            <Link
              href={`/p/${orgId}/members`}
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium text-sm"
            >
              Все участники →
            </Link>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-2">
            {members.map((member) => (
              <Link
                key={member.id}
                href={`/p/${orgId}/members/${member.id}`}
                className="flex-shrink-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow w-32"
              >
                <div className="flex flex-col items-center">
                  {member.avatar_url ? (
                    <img
                      src={member.avatar_url}
                      alt={member.full_name}
                      className="w-16 h-16 rounded-full object-cover mb-2"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-2">
                      <span className="text-blue-600 dark:text-blue-400 font-semibold">
                        {getInitials(member.full_name)}
                      </span>
                    </div>
                  )}
                  <p className="font-medium text-gray-900 dark:text-white text-sm text-center line-clamp-2">
                    {member.full_name}
                  </p>
                  {member.username && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      @{member.username}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

