interface Props {
  orgName: string
  orgLogo: string | null
  publicDescription: string | null
}

export default function HeroSection({
  orgName,
  orgLogo,
  publicDescription
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
              {publicDescription && (
                <p className="text-gray-600 dark:text-gray-400">
                  {publicDescription}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

