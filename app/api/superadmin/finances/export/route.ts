/**
 * GET /api/superadmin/finances/export
 *
 * Streams an XLSX workbook with one of the report types:
 *   ?type=income-ledger&from=YYYY-MM-DD&to=YYYY-MM-DD
 *     Daily income journal — Orbo's USN 6% taxable revenue, per day.
 *   ?type=transactions&from=...&to=...
 *     Full transaction registry from org_transactions (KUDIR-style).
 *   ?type=withdrawals&from=...&to=...
 *     Withdrawals registry — payouts to organizers.
 *   ?type=refunds&from=...&to=...
 *     Refunds registry — money returned to participants + commission reversals.
 *
 * Designed for manual upload to Контур.Эльба or for accountant review.
 */

import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { createAPILogger } from '@/lib/logger';
import { isSuperadmin } from '@/lib/server/superadminGuard';
import { createAdminServer } from '@/lib/server/supabaseServer';
import { getIncomeLedger, summariseLedger, type IncomeLedgerLine } from '@/lib/services/incomeLedgerService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const logger = createAPILogger(request, { endpoint: '/api/superadmin/finances/export' });

  if (!(await isSuperadmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const type = sp.get('type') || 'income-ledger';
  const from = sp.get('from');
  const to = sp.get('to');

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to (YYYY-MM-DD) required' }, { status: 400 });
  }

  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Orbo Platform';
    wb.created = new Date();

    let filename: string;

    const includeTest = sp.get('includeTest') === '1';

    switch (type) {
      case 'income-ledger': {
        await fillIncomeLedger(wb, from, to, includeTest);
        filename = `orbo-income-ledger_${from}_${to}.xlsx`;
        break;
      }
      case 'transactions': {
        await fillTransactions(wb, from, to);
        filename = `orbo-transactions_${from}_${to}.xlsx`;
        break;
      }
      case 'withdrawals': {
        await fillWithdrawals(wb, from, to);
        filename = `orbo-withdrawals_${from}_${to}.xlsx`;
        break;
      }
      case 'refunds': {
        await fillRefunds(wb, from, to);
        filename = `orbo-refunds_${from}_${to}.xlsx`;
        break;
      }
      default:
        return NextResponse.json({ error: 'Unknown export type' }, { status: 400 });
    }

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    logger.error({ error: err.message, type, from, to }, 'Finances export failed');
    return NextResponse.json({ error: err.message || 'Export failed' }, { status: 500 });
  }
}

// ─── Workbook builders ───────────────────────────────────────────────

async function fillIncomeLedger(wb: ExcelJS.Workbook, from: string, to: string, includeTest = false) {
  const lines = await getIncomeLedger(from, to, { includeTest });
  const summary = summariseLedger(from, to, lines);

  // Sheet 1 — Summary by day
  const s1 = wb.addWorksheet('Сводка по дням');
  s1.columns = [
    { header: 'Дата', key: 'date', width: 14 },
    { header: 'Сервисный сбор', key: 'service_fee', width: 18, style: { numFmt: '#,##0.00' } },
    { header: 'Агентское вознагр.', key: 'agent_commission', width: 22, style: { numFmt: '#,##0.00' } },
    { header: 'Подписки/тарифы', key: 'subscription', width: 20, style: { numFmt: '#,##0.00' } },
    { header: 'Возвраты сборов', key: 'service_fee_refund', width: 18, style: { numFmt: '#,##0.00' } },
    { header: 'Возвраты комиссии', key: 'agent_commission_refund', width: 20, style: { numFmt: '#,##0.00' } },
    { header: 'Итого за день', key: 'total', width: 16, style: { numFmt: '#,##0.00' } },
  ];
  s1.getRow(1).font = { bold: true };
  s1.views = [{ state: 'frozen', ySplit: 1 }];

  for (const day of summary.byDay) {
    s1.addRow({
      date: day.date,
      service_fee: day.byKind.service_fee || 0,
      agent_commission: day.byKind.agent_commission || 0,
      subscription: day.byKind.subscription || 0,
      service_fee_refund: day.byKind.service_fee_refund || 0,
      agent_commission_refund: day.byKind.agent_commission_refund || 0,
      total: day.total,
    });
  }
  // Totals row
  const totalsRow = s1.addRow({
    date: 'ИТОГО',
    service_fee: summary.byKind.service_fee,
    agent_commission: summary.byKind.agent_commission,
    subscription: summary.byKind.subscription,
    service_fee_refund: summary.byKind.service_fee_refund,
    agent_commission_refund: summary.byKind.agent_commission_refund,
    total: summary.totalAmount,
  });
  totalsRow.font = { bold: true };
  totalsRow.eachCell((cell) => { cell.border = { top: { style: 'thin' } }; });

  // Sheet 2 — Detailed list
  const s2 = wb.addWorksheet('Детализация');
  s2.columns = [
    { header: 'Дата', key: 'date', width: 12 },
    { header: 'Время', key: 'time', width: 9 },
    { header: 'Тип дохода', key: 'kindLabel', width: 28 },
    { header: 'Сумма ₽', key: 'amount', width: 12, style: { numFmt: '#,##0.00' } },
    { header: 'Контрагент в Эльбе', key: 'contractor', width: 32 },
    { header: 'Организатор (источник)', key: 'orgName', width: 28 },
    { header: 'Событие', key: 'eventTitle', width: 36 },
    { header: 'Документ', key: 'documentNumber', width: 16 },
    { header: 'Источник записи', key: 'sourceTable', width: 18 },
    { header: 'ID записи', key: 'sourceId', width: 38 },
  ];
  s2.getRow(1).font = { bold: true };
  s2.views = [{ state: 'frozen', ySplit: 1 }];

  for (const l of lines) {
    const dt = new Date(l.recognisedAt);
    s2.addRow({
      date: l.date,
      time: dt.toISOString().slice(11, 16),
      kindLabel: l.kindLabel,
      amount: l.amount,
      contractor: l.contractor,
      orgName: l.orgName || '',
      eventTitle: l.eventTitle || '',
      documentNumber: l.documentNumber || '',
      sourceTable: l.sourceTable,
      sourceId: l.sourceId,
    });
  }

  // Sheet 3 — Header / metadata for the period
  const s3 = wb.addWorksheet('О документе');
  s3.columns = [{ width: 32 }, { width: 60 }];
  const meta: Array<[string, string]> = [
    ['Документ', 'Книга доходов ООО «ОРБО»'],
    ['Период с', from],
    ['Период по', to],
    ['Всего записей', String(summary.lineCount)],
    ['Итого доходов, ₽', summary.totalAmount.toFixed(2)],
    ['Сформирован', new Date().toISOString().slice(0, 19).replace('T', ' ')],
    ['', ''],
    ['Назначение', 'Признание выручки УСН 6% (доходы) по кассовому методу.'],
    ['', 'Включает: сервисный сбор с участников событий, агентское вознаграждение,'],
    ['', 'лицензионные платежи за тарифы. Не включает средства принципалов'],
    ['', '(тело билета) и выводы средств на счета организаторов.'],
  ];
  meta.forEach((row) => s3.addRow(row));
  s3.getColumn(1).font = { bold: true };
}

async function fillTransactions(wb: ExcelJS.Workbook, from: string, to: string) {
  const db = createAdminServer();
  const fromTs = `${from}T00:00:00+03:00`;
  const toTs = `${to}T23:59:59.999+03:00`;

  const { data: rows } = await db.raw(
    `SELECT t.id, t.created_at, t.org_id, o.name AS org_name,
            t.type, t.amount, t.balance_after, t.event_id, e.title AS event_title,
            t.participant_id, p.full_name AS participant_name,
            t.payment_session_id, t.withdrawal_id, t.notes
       FROM org_transactions t
       LEFT JOIN organizations o ON o.id = t.org_id
       LEFT JOIN events e ON e.id = t.event_id
       LEFT JOIN participants p ON p.id = t.participant_id
      WHERE t.created_at >= $1 AND t.created_at <= $2
      ORDER BY t.created_at ASC`,
    [fromTs, toTs]
  );

  const ws = wb.addWorksheet('Транзакции');
  ws.columns = [
    { header: 'Дата', key: 'date', width: 18 },
    { header: 'Тип', key: 'type', width: 28 },
    { header: 'Сумма ₽', key: 'amount', width: 12, style: { numFmt: '#,##0.00' } },
    { header: 'Баланс после, ₽', key: 'balance', width: 16, style: { numFmt: '#,##0.00' } },
    { header: 'Организатор', key: 'org', width: 32 },
    { header: 'Событие', key: 'event', width: 36 },
    { header: 'Участник', key: 'participant', width: 28 },
    { header: 'Заметки', key: 'notes', width: 40 },
    { header: 'ID транзакции', key: 'id', width: 38 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  for (const r of (rows || []) as any[]) {
    ws.addRow({
      date: new Date(r.created_at).toISOString().replace('T', ' ').slice(0, 19),
      type: TRANSACTION_TYPE_LABELS[r.type] || r.type,
      amount: Number(r.amount),
      balance: Number(r.balance_after),
      org: r.org_name || '',
      event: r.event_title || '',
      participant: r.participant_name || '',
      notes: r.notes || '',
      id: r.id,
    });
  }
}

async function fillWithdrawals(wb: ExcelJS.Workbook, from: string, to: string) {
  const db = createAdminServer();
  const fromTs = `${from}T00:00:00+03:00`;
  const toTs = `${to}T23:59:59.999+03:00`;

  const { data: rows } = await db.raw(
    `SELECT w.id, w.requested_at, w.processed_at, w.completed_at, w.status,
            w.amount, w.commission_amount, w.net_amount, w.act_number, w.act_document_url,
            w.period_from, w.period_to, w.rejection_reason,
            o.name AS org_name,
            ba.bank_name, ba.account_number, ba.bik
       FROM org_withdrawals w
       LEFT JOIN organizations o ON o.id = w.org_id
       LEFT JOIN bank_accounts ba ON ba.id = w.bank_account_id
      WHERE w.requested_at >= $1 AND w.requested_at <= $2
      ORDER BY w.requested_at ASC`,
    [fromTs, toTs]
  );

  const ws = wb.addWorksheet('Заявки на вывод');
  ws.columns = [
    { header: 'Запрошено', key: 'requested', width: 18 },
    { header: 'Завершено', key: 'completed', width: 18 },
    { header: 'Статус', key: 'status', width: 14 },
    { header: 'Организатор', key: 'org', width: 32 },
    { header: 'Сумма gross, ₽', key: 'amount', width: 16, style: { numFmt: '#,##0.00' } },
    { header: 'К выплате, ₽', key: 'net', width: 14, style: { numFmt: '#,##0.00' } },
    { header: 'Период с', key: 'period_from', width: 12 },
    { header: 'Период по', key: 'period_to', width: 12 },
    { header: '№ акта', key: 'act_number', width: 18 },
    { header: 'Банк', key: 'bank', width: 24 },
    { header: 'Расч.счёт', key: 'account', width: 24 },
    { header: 'БИК', key: 'bik', width: 12 },
    { header: 'Причина отклонения', key: 'rejection', width: 32 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const STATUS_LABELS: Record<string, string> = {
    requested: 'Запрошен',
    processing: 'В обработке',
    completed: 'Выплачено',
    rejected: 'Отклонён',
  };

  for (const r of (rows || []) as any[]) {
    ws.addRow({
      requested: r.requested_at ? new Date(r.requested_at).toISOString().replace('T', ' ').slice(0, 19) : '',
      completed: r.completed_at ? new Date(r.completed_at).toISOString().replace('T', ' ').slice(0, 19) : '',
      status: STATUS_LABELS[r.status] || r.status,
      org: r.org_name || '',
      amount: Number(r.amount),
      net: Number(r.net_amount),
      period_from: r.period_from ? new Date(r.period_from).toISOString().slice(0, 10) : '',
      period_to: r.period_to ? new Date(r.period_to).toISOString().slice(0, 10) : '',
      act_number: r.act_number || '',
      bank: r.bank_name || '',
      account: r.account_number || '',
      bik: r.bik || '',
      rejection: r.rejection_reason || '',
    });
  }
}

async function fillRefunds(wb: ExcelJS.Workbook, from: string, to: string) {
  const db = createAdminServer();
  const fromTs = `${from}T00:00:00+03:00`;
  const toTs = `${to}T23:59:59.999+03:00`;

  // refund + agent_commission_reversal pairs are the canonical "money back" record
  const { data: rows } = await db.raw(
    `SELECT t.id, t.created_at, t.type, t.amount, t.org_id, o.name AS org_name,
            t.event_id, e.title AS event_title,
            t.participant_id, p.full_name AS participant_name,
            t.payment_session_id, t.notes
       FROM org_transactions t
       LEFT JOIN organizations o ON o.id = t.org_id
       LEFT JOIN events e ON e.id = t.event_id
       LEFT JOIN participants p ON p.id = t.participant_id
      WHERE t.type IN ('refund', 'agent_commission_reversal')
        AND t.created_at >= $1 AND t.created_at <= $2
      ORDER BY t.created_at ASC`,
    [fromTs, toTs]
  );

  const ws = wb.addWorksheet('Возвраты');
  ws.columns = [
    { header: 'Дата', key: 'date', width: 18 },
    { header: 'Тип', key: 'type', width: 28 },
    { header: 'Сумма ₽', key: 'amount', width: 12, style: { numFmt: '#,##0.00' } },
    { header: 'Организатор', key: 'org', width: 32 },
    { header: 'Событие', key: 'event', width: 36 },
    { header: 'Участник', key: 'participant', width: 28 },
    { header: 'Заметки', key: 'notes', width: 40 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  for (const r of (rows || []) as any[]) {
    ws.addRow({
      date: new Date(r.created_at).toISOString().replace('T', ' ').slice(0, 19),
      type: TRANSACTION_TYPE_LABELS[r.type] || r.type,
      amount: Number(r.amount),
      org: r.org_name || '',
      event: r.event_title || '',
      participant: r.participant_name || '',
      notes: r.notes || '',
    });
  }
}

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  payment_incoming: 'Входящий платёж',
  commission_deduction: 'Комиссия сервиса',
  agent_commission: 'Агентское вознаграждение',
  agent_commission_reversal: 'Возврат агентского вознаграждения',
  refund: 'Возврат',
  withdrawal_requested: 'Запрос на вывод',
  withdrawal_completed: 'Вывод выполнен',
  withdrawal_rejected: 'Вывод отклонён',
  manual_adjustment: 'Ручная корректировка',
};
