import { createAdminServer } from '@/lib/server/supabaseServer'
import { notFound } from 'next/navigation'
import DOMPurify from 'isomorphic-dompurify'

export default async function PrivacyPolicyPage({
  params,
}: {
  params: Promise<{ org: string }>
}) {
  const { org: orgId } = await params

  const supabase = createAdminServer()
  const { data: org } = await supabase
    .from('organizations')
    .select('name, privacy_policy_html')
    .eq('id', orgId)
    .single()

  if (!org?.privacy_policy_html) {
    notFound()
  }

  const safeHtml = DOMPurify.sanitize(org.privacy_policy_html, {
    ALLOWED_TAGS: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'span', 'div'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
  })

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      <h1 className="text-xl font-bold text-gray-900 mb-6">
        Политика обработки персональных данных
      </h1>
      <div className="text-sm text-gray-500 mb-6">{org.name}</div>
      <div
        className="prose prose-sm max-w-none text-gray-800 whitespace-pre-line [&_p]:mb-3 [&_br]:block"
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    </div>
  )
}
