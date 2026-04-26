'use client'

/**
 * QR Scanner using html5-qrcode (lazy-loaded).
 *
 * Mobile browsers (especially iOS Safari) require getUserMedia to be initiated
 * from a direct user gesture (button click). Auto-starting from useEffect on
 * mount works on desktop but fails silently on iOS — so we start in two phases:
 *
 *   1. On mount: render an idle "Start" button. No camera permission requested.
 *   2. On click: explicitly request camera (preserves the user-gesture chain),
 *      then hand off to html5-qrcode.
 *
 * This also surfaces the browser permission prompt at a moment the user expects
 * it, which is better UX than a silent permission failure.
 */

import { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, Loader2 } from 'lucide-react'

interface Props {
  onToken: (token: string) => void
  paused?: boolean
}

const SCANNER_ID = 'qr-scanner-container'

function extractToken(raw: string): string | null {
  if (!raw) return null
  const trimmed = raw.trim()

  try {
    const url = new URL(trimmed)
    const t = url.searchParams.get('token')
    if (t) return t
  } catch {
    // not a URL
  }

  // Bare UUID-like string (32 hex chars + dashes) is acceptable as fallback
  if (/^[0-9a-fA-F-]{32,}$/.test(trimmed)) return trimmed

  return null
}

interface ErrorInfo {
  user: string         // user-facing message
  detail: string | null // raw error text (for debugging)
  hint: string | null   // optional hint (e.g. retry button label)
}

function classifyError(err: any): ErrorInfo {
  const msg = err?.message || String(err || '')
  const name = err?.name || ''

  if (name === 'NotAllowedError' || msg.includes('NotAllowed') || msg.includes('Permission') || msg.includes('denied')) {
    return {
      user: 'Доступ к камере не разрешён',
      detail: msg,
      hint: 'В адресной строке нажмите 🔒 и разрешите Камеру для этого сайта',
    }
  }
  if (name === 'NotFoundError' || msg.includes('NotFound') || msg.includes('no camera') || msg.includes('Requested device not found')) {
    return {
      user: 'Камера не найдена',
      detail: msg,
      hint: 'Откройте сканер на телефоне с тыловой камерой',
    }
  }
  if (name === 'NotReadableError' || msg.includes('NotReadable') || msg.includes('Could not start')) {
    return {
      user: 'Камера занята другим приложением',
      detail: msg,
      hint: 'Закройте другие приложения, использующие камеру, и попробуйте снова',
    }
  }
  if (name === 'OverconstrainedError' || msg.includes('Overconstrained')) {
    return {
      user: 'Не удалось подобрать режим камеры',
      detail: msg,
      hint: 'Попробуйте обновить страницу',
    }
  }
  if (msg.includes('secure') || msg.includes('https')) {
    return {
      user: 'Камера работает только по HTTPS',
      detail: msg,
      hint: null,
    }
  }
  return {
    user: 'Не удалось запустить камеру',
    detail: msg,
    hint: null,
  }
}

export default function QrScanner({ onToken, paused }: Props) {
  const scannerRef = useRef<any>(null)
  const onTokenRef = useRef(onToken)
  const [status, setStatus] = useState<'idle' | 'starting' | 'running' | 'error' | 'stopped'>('idle')
  const [error, setError] = useState<ErrorInfo | null>(null)
  const lastScanRef = useRef<string | null>(null)

  // Keep latest onToken in ref so we don't recreate the scanner on every render
  useEffect(() => { onTokenRef.current = onToken }, [onToken])

  async function start() {
    setStatus('starting')
    setError(null)

    try {
      const { Html5Qrcode } = await import('html5-qrcode')

      // Try to enumerate cameras first — gives more reliable selection than facingMode
      // alone, especially on devices with multiple back cameras.
      let cameraId: string | { facingMode: string } = { facingMode: 'environment' }
      try {
        const cams = await Html5Qrcode.getCameras()
        if (cams && cams.length > 0) {
          // Pick a back-facing camera if labelled, else the last one (often back on phones)
          const back = cams.find((c: any) =>
            /back|rear|environment/i.test(c.label || '')
          )
          cameraId = (back || cams[cams.length - 1]).id
        }
      } catch {
        // Permission may not be granted yet — fall back to facingMode constraint
      }

      const scanner = new Html5Qrcode(SCANNER_ID, /* verbose */ false)
      scannerRef.current = scanner

      await scanner.start(
        cameraId as any,
        {
          fps: 10,
          qrbox: { width: 220, height: 220 },
          aspectRatio: 1,
        },
        (decodedText: string) => {
          if (lastScanRef.current === decodedText) return
          lastScanRef.current = decodedText
          const token = extractToken(decodedText)
          if (token) {
            onTokenRef.current(token)
          }
        },
        () => {
          /* per-frame parse errors — noisy, ignore */
        }
      )

      setStatus('running')
    } catch (err: any) {
      setError(classifyError(err))
      setStatus('error')
    }
  }

  // Stop scanner on unmount or when paused
  useEffect(() => {
    if (paused && scannerRef.current && status === 'running') {
      try {
        scannerRef.current.stop().then(() => scannerRef.current?.clear?.()).catch(() => {})
      } catch {}
      setStatus('stopped')
    }

    return () => {
      const s = scannerRef.current
      if (s) {
        try {
          s.stop().then(() => s.clear?.()).catch(() => {})
        } catch {}
        scannerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused])

  // Reset scan-debounce when paused→resumed
  useEffect(() => {
    if (!paused) lastScanRef.current = null
  }, [paused])

  return (
    <div className="w-full max-w-[280px] mx-auto">
      <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-gray-900 shadow-md">
        <div id={SCANNER_ID} className="w-full h-full" />

        {status === 'idle' && (
          <button
            type="button"
            onClick={start}
            className="absolute inset-0 flex flex-col items-center justify-center text-white bg-gray-900/85 active:bg-gray-900 transition-colors"
          >
            <Camera className="w-10 h-10 mb-2" />
            <span className="text-sm font-medium">Запустить сканер</span>
            <span className="text-xs text-gray-300 mt-1">Нажмите, чтобы разрешить камеру</span>
          </button>
        )}

        {status === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-gray-900/85">
            <Loader2 className="w-8 h-8 animate-spin mb-2" />
            <p className="text-sm">Запускаем камеру…</p>
          </div>
        )}

        {status === 'error' && error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-gray-900/95 p-5 text-center">
            <CameraOff className="w-10 h-10 mb-3 text-red-400" />
            <p className="text-sm font-medium leading-snug mb-1">{error.user}</p>
            {error.hint && (
              <p className="text-xs text-gray-300 leading-relaxed mb-3">{error.hint}</p>
            )}
            <button
              type="button"
              onClick={start}
              className="mt-2 px-4 py-2 text-xs bg-white/10 hover:bg-white/20 rounded-lg font-medium"
            >
              Попробовать снова
            </button>
            {error.detail && (
              <details className="mt-3 text-[10px] text-gray-400">
                <summary className="cursor-pointer">Техническая информация</summary>
                <p className="mt-1 break-all font-mono">{error.detail}</p>
              </details>
            )}
          </div>
        )}

        {status === 'stopped' && (
          <button
            type="button"
            onClick={start}
            className="absolute inset-0 flex flex-col items-center justify-center text-white bg-gray-900/85"
          >
            <Camera className="w-8 h-8 mb-2" />
            <span className="text-sm">Возобновить сканер</span>
          </button>
        )}
      </div>
    </div>
  )
}
