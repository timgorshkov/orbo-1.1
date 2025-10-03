'use client'

import type { ParticipantDetailResult, ParticipantAuditRecord } from '@/lib/types/participant';

interface ParticipantAuditPanelProps {
  detail: ParticipantDetailResult;
}

function formatSourceLabel(source: string): string {
  const normalized = source.toLowerCase();
  switch (normalized) {
    case 'manual':
      return 'Ручное обновление';
    case 'getcourse':
      return 'GetCourse';
    case 'telegram':
      return 'Telegram';
    case 'merge':
      return 'Слияние';
    default:
      return source;
  }
}

function AuditEntry({ entry }: { entry: ParticipantAuditRecord }) {
  const date = new Date(entry.created_at).toLocaleString('ru', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  const changes = entry.field_changes && Object.keys(entry.field_changes).length > 0
    ? entry.field_changes
    : null;

  return (
    <div className="rounded border border-neutral-200 px-4 py-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-neutral-800">{formatSourceLabel(entry.source)}</div>
          <div className="text-xs text-neutral-500">
            Действие: {entry.action}
            {entry.actor_type ? ` · Исполнитель: ${entry.actor_type}` : ''}
          </div>
          {entry.message && (
            <div className="mt-2 text-neutral-700 whitespace-pre-wrap">{entry.message}</div>
          )}
        </div>
        <div className="text-xs text-neutral-500 whitespace-nowrap">{date}</div>
      </div>
      {changes && (
        <div className="mt-2 text-xs text-neutral-500">
          <div className="font-medium text-neutral-600 mb-1">Изменённые поля</div>
          <div className="grid gap-1">
            {Object.entries(changes).map(([key, value]) => (
              <div key={key} className="flex items-start justify-between gap-3">
                <span className="text-neutral-600">{key}</span>
                <span className="text-neutral-800 break-all">{value === null ? '—' : String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {entry.integration_job_id && (
        <div className="mt-2 text-xs text-neutral-400">
          ID задачи синхронизации: {entry.integration_job_id}
        </div>
      )}
    </div>
  );
}

export default function ParticipantAuditPanel({ detail }: ParticipantAuditPanelProps) {
  const entries = detail.auditLog ?? [];

  if (entries.length === 0) {
    return (
      <div className="rounded border border-dashed border-neutral-200 px-4 py-6 text-sm text-neutral-500">
        История изменений пока пуста.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-medium text-neutral-800">История изменений</h2>
      <div className="space-y-2">
        {entries.slice(0, 10).map(entry => (
          <AuditEntry key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}


