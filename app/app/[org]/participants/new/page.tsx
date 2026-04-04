import AppShell from '@/components/app-shell';
import { notFound } from 'next/navigation';
import { NewParticipantForm } from './form';

export default async function NewParticipantPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params

  if (!org) {
    notFound();
  }

  return (
    <div className="p-6">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Добавить участника</h1>
          <p className="text-sm text-neutral-500">
            Заполните данные для нового участника. Перед созданием мы проверим возможные совпадения, чтобы избежать дублей.
          </p>
        </div>

        <NewParticipantForm orgId={org} />
      </div>
    </div>
  );
}

