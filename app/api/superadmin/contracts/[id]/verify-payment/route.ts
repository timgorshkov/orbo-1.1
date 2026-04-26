import { NextRequest, NextResponse } from 'next/server'
import { createAPILogger } from '@/lib/logger'
import { requireSuperadmin } from '@/lib/server/superadminGuard'
import {
  decodeBankStatement,
  parseBankStatement1C,
} from '@/lib/parsers/bankStatement1C'
import { verifyContractPayment } from '@/lib/services/contractPaymentVerifier'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2 MB — запас для выписок за целый месяц

/**
 * POST /api/superadmin/contracts/[id]/verify-payment
 *
 * Multipart form-data с файлом `file` — банковская выписка в формате 1С
 * (1CClientBankExchange, обычно .txt в Windows-1251).
 *
 * Алгоритм:
 *  1. Распарсить выписку;
 *  2. Найти платёжку с `contract_number` в «НазначениеПлатежа»;
 *  3. Сверить реквизиты плательщика (ИНН, КПП, р/с, наименование) с contract.counterparty
 *     и contract.bank_account — байт-точно (регистр + кавычки важны).
 *
 * Возвращает JSON { matched, paymentFound, payment, discrepancies, warnings, ... }.
 * Никаких изменений в БД — суперадмин сам принимает решение и меняет статус договора.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createAPILogger(request, {
    endpoint: 'superadmin/contracts/[id]/verify-payment',
  })
  const { id } = await params

  try {
    await requireSuperadmin()

    const form = await request.formData().catch(() => null)
    if (!form) {
      return NextResponse.json(
        { error: 'Ожидается multipart/form-data с файлом в поле `file`.' },
        { status: 400 }
      )
    }
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Файл не найден в поле `file`.' },
        { status: 400 }
      )
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'Файл пустой.' }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Размер файла превышает ${MAX_FILE_SIZE / 1024 / 1024} МБ.` },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buf = Buffer.from(arrayBuffer)

    let text: string
    try {
      text = decodeBankStatement(buf)
    } catch (e: any) {
      return NextResponse.json(
        { error: `Не удалось декодировать файл: ${e.message || e}` },
        { status: 400 }
      )
    }

    let statement
    try {
      statement = parseBankStatement1C(text)
    } catch (e: any) {
      return NextResponse.json(
        { error: e.message || 'Не удалось разобрать выписку.' },
        { status: 400 }
      )
    }

    const result = await verifyContractPayment(id, statement)
    if (!result.contract) {
      return NextResponse.json({ error: 'Договор не найден.' }, { status: 404 })
    }

    logger.info(
      {
        contract_id: id,
        contract_number: result.contract.contract_number,
        payments_in_statement: result.paymentsInStatement,
        payment_found: result.paymentFound,
        matched: result.matched,
        discrepancies_count: result.discrepancies.length,
        file_name: file.name,
        file_size: file.size,
      },
      'Contract payment verification completed'
    )

    // If verification matched cleanly, record the fee as paid revenue and trigger
    // act (АЛ-N) generation + Elba sync. Idempotent — running this twice is a no-op.
    let bookkeeping: { invoiceId: string; actNumber: string | null; actUrl: string | null; alreadyExisted: boolean } | null = null
    if (result.matched && result.payment) {
      try {
        const { recordVerificationFeePayment } = await import('@/lib/services/contractVerificationFee')
        bookkeeping = await recordVerificationFeePayment({
          contractId: id,
          paidDate: result.payment.date,
          amount: result.payment.amount,
          paymentNumber: result.payment.number,
          confirmedBy: 'auto',
        })
      } catch (bkErr: any) {
        logger.error(
          { contract_id: id, error: bkErr.message },
          'Failed to record verification fee bookkeeping (verification itself succeeded)'
        )
      }
    }

    return NextResponse.json({
      contractNumber: result.contract.contract_number,
      paymentsInStatement: result.paymentsInStatement,
      paymentFound: result.paymentFound,
      matched: result.matched,
      payment: result.payment,
      discrepancies: result.discrepancies,
      warnings: result.warnings,
      bookkeeping,
    })
  } catch (error: any) {
    if (error?.message === 'NEXT_REDIRECT') throw error
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Error in verify-payment'
    )
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
