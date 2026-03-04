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

function getInitials(name: string) {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export default function RecentMembersSection({ members, orgId }: Props) {
  if (members.length === 0) return null

  return (
    <section className="max-w-5xl mx-auto px-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-neutral-900">Новые участники</h2>
        <Link href={`/p/${orgId}/members`} className="text-sm text-blue-600 hover:text-blue-700">
          Все участники →
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 p-4">
        <div className="flex flex-wrap gap-4">
          {members.map((member) => (
            <Link
              key={member.id}
              href={`/p/${orgId}/members/${member.id}`}
              className="flex flex-col items-center gap-1 w-20 hover:opacity-80 transition-opacity"
            >
              {member.avatar_url ? (
                <img
                  src={member.avatar_url}
                  alt={member.full_name}
                  className="w-14 h-14 rounded-full object-cover"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-blue-600 font-semibold text-sm">
                    {getInitials(member.full_name)}
                  </span>
                </div>
              )}
              <p className="text-xs text-neutral-900 text-center truncate w-full">
                {member.full_name}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
