'use client'

/**
 * QR Scanner using html5-qrcode (lazy-loaded).
 *
 * Calls onScan once when a valid token URL is detected. Handles camera permission,
 * facing-camera selection, and start/stop lifecycle. Designed to be embedded in
 * the /checkin page so the registrator does not need to leave the same browser
 * context (which would lose their cookie).
 */

import { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, Loader2 } from 'lucide-react'

interface Props {
  onToken: (token: string) => void
  // Render small "scan again" hint after a successful scan, until parent decides what to do
  paused?: boolean
}

const SCANNER_ID = 'qr-scanner-container'

/**
 * Extract a qr_token from either:
 *   - a full URL like https://my.orbo.ru/checkin?token=XXX
 *   - or a bare token string (legacy QR codes encoded the token directly)
 */
function extractToken(raw: string): string | null {
  if (!raw) return null
  const trimmed = raw.trim()

  // Try to parse as URL
  try {
    const url = new URL(trimmed)
    const t = url.searchParams.get('token')
    if (t) return t
    // Some old codes might use the path
  } catch {
    // not a URL
  }

  // Bare UUID-like string (32 hex chars + dashes) is acceptable as fallback
  if (/^[0-9a-fA-F-]{32,}$/.test(trimmed)) return trimmed

  return null
}

export default function QrScanner({ onToken, paused }: Props) {
  const scannerRef = useRef<any>(null)
  const [status, setStatus] = useState<'idle' | 'starting' | 'running' | 'error' | 'stopped'>('idle')
  const [error, setError] = useState<string | null>(null)
  const lastScanRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let scanner: any = null

    async function start() {
      setStatus('starting')
      setError(null)

      try {
        // Lazy import — keeps the rest of the app slim
        const { Html5Qrcode } = await import('html5-qrcode')
        if (cancelled) return

        scanner = new Html5Qrcode(SCANNER_ID)
        scannerRef.current = scanner

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
          },
          (decodedText: string) => {
            // Debounce identical scans
            if (lastScanRef.current === decodedText) return
            lastScanRef.current = decodedText

            const token = extractToken(decodedText)
            if (token) {
              onToken(token)
            }
          },
          () => {
            // Per-frame failure — ignore (called many times per second)
          }
        )

        if (!cancelled) setStatus('running')
      } catch (err: any) {
        if (cancelled) return
        const msg = err?.message || String(err)
        // Distinguish permission denial from other errors for better UX
        if (
          msg.includes('NotAllowed') ||
          msg.includes('Permission') ||
          msg.includes('denied')
        ) {
          setError(
            'Доступ к камере отклонён. Разрешите доступ в настройках браузера и обновите страницу.'
          )
        } else if (msg.includes('NotFound') || msg.includes('no camera')) {
          setError('Камера не найдена на устройстве.')
        } else {
          setError('Не удалось запустить камеру. Попробуйте обновить страницу.')
        }
        setStatus('error')
      }
    }

    if (!paused) {
      start()
    } else {
      setStatus('stopped')
    }

    return () => {
      cancelled = true
      if (scanner) {
        try {
          scanner.stop().then(() => scanner.clear()).catch(() => {})
        } catch {}
      }
    }
  }, [paused, onToken])

  // Reset debounce when paused → resumed
  useEffect(() => {
    if (!paused) lastScanRef.current = null
  }, [paused])

  return (
    <div className="w-full">
      <div className="relative w-full max-w-sm mx-auto aspect-square rounded-2xl overflow-hidden bg-gray-900 shadow-md">
        <div id={SCANNER_ID} className="w-full h-full" />

        {status === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-gray-900/80">
            <Loader2 className="w-8 h-8 animate-spin mb-2" />
            <p className="text-sm">Запускаем камеру…</p>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-gray-900/90 p-6 text-center">
            <CameraOff className="w-10 h-10 mb-3 text-red-400" />
            <p className="text-sm leading-relaxed">{error}</p>
          </div>
        )}

        {status === 'stopped' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-gray-900/80">
            <Camera className="w-8 h-8 mb-2" />
            <p className="text-sm">Сканер остановлен</p>
          </div>
        )}
      </div>
    </div>
  )
}
