'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

const WIDGET_SCRIPT = 'https://widget.cloudpayments.ru/bundles/cloudpayments'

interface CloudPaymentsWidgetProps {
  /** publicId from CloudPayments (process.env.NEXT_PUBLIC_CLOUDPAYMENTS_PUBLIC_ID) */
  publicId: string
  /** payment_session.id — passed as InvoiceId to CP and used by the webhook to find the session */
  invoiceId: string
  amount: number
  currency: string
  description: string
  /** Identifier for the payer (email or tg_user_id), passed as accountId to CP */
  accountId?: string
  /** Email for the receipt (optional but recommended) */
  email?: string
  /** Extra fields propagated to CP (Pay/Fail webhooks include them in `Data`) */
  data?: Record<string, any>
  /** Fired when the widget reports a successful charge — UI should poll
   *  /api/pay/status/[id] (or refresh) to confirm via webhook. */
  onSuccess: () => void
  /** Fired when the widget reports a failure or the user cancels. */
  onFail: (reason?: string) => void
}

declare global {
  interface Window {
    cp?: {
      CloudPayments: new (config?: any) => {
        pay: (
          method: 'auth' | 'charge',
          params: Record<string, any>,
          callbacks?: {
            onSuccess?: (options: any) => void
            onFail?: (reason: string, options: any) => void
            onComplete?: (paymentResult: any, options: any) => void
          }
        ) => void
      }
    }
  }
}

/**
 * Loads the CloudPayments widget script once per page and exposes a button
 * that opens the modal. We render this only when gateway_code === 'cloudpayments'.
 *
 * The widget is fully client-side: card data goes straight to cp.ru; we get
 * a Pay/Fail webhook on success or failure. No server-side createPayment is
 * needed — the payment_session is already created by /api/pay before this
 * component mounts.
 */
export default function CloudPaymentsWidget(props: CloudPaymentsWidgetProps) {
  const [scriptLoaded, setScriptLoaded] = useState<boolean>(typeof window !== 'undefined' && !!window.cp?.CloudPayments)
  const [opening, setOpening] = useState(false)
  const openedOnce = useRef(false)

  useEffect(() => {
    if (scriptLoaded) return
    // Reuse if already in the page
    const existing = document.querySelector(`script[src="${WIDGET_SCRIPT}"]`) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => setScriptLoaded(true), { once: true })
      if ((existing as any).readyState === 'complete') setScriptLoaded(true)
      return
    }
    const s = document.createElement('script')
    s.src = WIDGET_SCRIPT
    s.async = true
    s.onload = () => setScriptLoaded(true)
    s.onerror = () => {
      // surface an explicit error in the parent component via onFail
      props.onFail('Не удалось загрузить виджет CloudPayments')
    }
    document.head.appendChild(s)
  }, [scriptLoaded, props])

  const openWidget = () => {
    if (!scriptLoaded || opening || !window.cp) return
    setOpening(true)
    try {
      const widget = new window.cp.CloudPayments()
      widget.pay(
        'charge',
        {
          publicId: props.publicId,
          description: props.description,
          amount: props.amount,
          currency: props.currency || 'RUB',
          invoiceId: props.invoiceId,
          accountId: props.accountId,
          email: props.email,
          skin: 'mini',
          data: props.data || {},
        },
        {
          onSuccess: () => {
            setOpening(false)
            props.onSuccess()
          },
          onFail: (reason: string) => {
            setOpening(false)
            props.onFail(reason)
          },
          onComplete: () => {
            // fires after onSuccess/onFail in some widget versions; clean up local state
            setOpening(false)
          },
        }
      )
    } catch (err: any) {
      setOpening(false)
      props.onFail(err?.message || 'Не удалось открыть виджет')
    }
  }

  // Open the widget automatically on mount the first time it's ready, so users
  // don't need an extra click after redirecting onto the pay-page.
  useEffect(() => {
    if (scriptLoaded && !openedOnce.current) {
      openedOnce.current = true
      openWidget()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptLoaded])

  if (!scriptLoaded) {
    return (
      <div className="flex items-center justify-center gap-2 py-4 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Загружаем виджет оплаты…</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={openWidget}
        disabled={opening}
        className="w-full h-12 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-60"
      >
        {opening ? 'Открываем форму оплаты…' : 'Оплатить картой'}
      </button>
      <p className="text-xs text-gray-500 text-center">
        Платёж проводится через защищённую форму CloudPayments. Если окно не открылось — нажмите кнопку выше ещё раз.
      </p>
    </div>
  )
}
