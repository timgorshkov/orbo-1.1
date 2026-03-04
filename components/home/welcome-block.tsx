'use client'

interface Props {
  html: string
}

export default function WelcomeBlock({ html }: Props) {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 mb-6">
      <div
        className="rounded-xl bg-white border border-gray-200 p-5 text-sm text-gray-800 leading-relaxed prose prose-sm max-w-none [&_a]:text-blue-600 [&_a]:underline"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
