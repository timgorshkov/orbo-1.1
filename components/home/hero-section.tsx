interface Props {
  orgName: string
  orgLogo: string | null
  publicDescription: string | null
  coverUrl: string | null
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export default function HeroSection({
  orgName,
  orgLogo,
  publicDescription,
  coverUrl,
}: Props) {
  return (
    <div>
      {/* Cover */}
      {coverUrl ? (
        <div className="h-48 w-full overflow-hidden">
          <img
            src={coverUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="h-32 w-full bg-gradient-to-r from-neutral-100 to-neutral-200" />
      )}

      {/* Org info overlapping cover bottom */}
      <div className="max-w-5xl mx-auto px-6">
        <div className="flex items-end gap-4 -mt-8 pb-5 border-b border-neutral-100">
          {/* Circular logo */}
          <div className="w-16 h-16 rounded-full ring-4 ring-white shadow-md overflow-hidden flex-shrink-0 bg-neutral-200">
            {orgLogo ? (
              <img
                src={orgLogo}
                alt={orgName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-neutral-300">
                <span className="text-neutral-600 font-semibold text-sm">
                  {getInitials(orgName)}
                </span>
              </div>
            )}
          </div>
          <div className="pb-1">
            <h1 className="text-xl font-bold text-neutral-900">{orgName}</h1>
            {publicDescription && (
              <p className="text-sm text-neutral-500 mt-0.5">{publicDescription}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
