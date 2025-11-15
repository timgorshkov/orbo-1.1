interface Props {
  orgName: string
  orgLogo: string | null
  orgDescription: string | null
  memberCount: number
  eventCount: number
  materialCount: number
}

export default function HeroSection({
  orgName,
  orgLogo,
  orgDescription,
  memberCount,
  eventCount,
  materialCount
}: Props) {
  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 border-b border-gray-200 dark:border-gray-700">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start gap-4">
            {orgLogo && (
              <img
                src={orgLogo}
                alt={orgName}
                className="w-16 h-16 rounded-lg object-cover"
              />
            )}
            <div className="flex-1">
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-2">
                {orgName}
              </h1>
              {orgDescription && (
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  {orgDescription}
                </p>
              )}
              <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
                <span>👥 {memberCount} участников</span>
                <span>·</span>
                <span>📅 {eventCount} событий</span>
                <span>·</span>
                <span>📚 {materialCount} материалов</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

