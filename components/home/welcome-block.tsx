'use client'

interface Props {
  html: string
}

export default function WelcomeBlock({ html }: Props) {
  return (
    <div className="max-w-5xl mx-auto px-6">
      <div
        className="rounded-xl bg-white border border-neutral-200 p-5 text-sm text-neutral-800 leading-relaxed prose prose-sm max-w-none [&_a]:text-blue-600 [&_a]:underline"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
