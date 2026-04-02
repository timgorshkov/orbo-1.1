import { requireSuperadmin } from '@/lib/server/superadminGuard'
import ContractDetailForm from '@/components/superadmin/contract-detail-form'

export default async function SuperadminContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireSuperadmin()
  const { id } = await params

  return (
    <div>
      <ContractDetailForm contractId={id} />
    </div>
  )
}
