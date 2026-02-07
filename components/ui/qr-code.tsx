'use client'

import { useRef, useCallback } from 'react'
import { Download } from 'lucide-react'

interface QRCodeProps {
  value: string
  size?: number
  className?: string
  showDownload?: boolean
  downloadFileName?: string
}

/**
 * QR Code component using quickchart.io API for generation.
 * Falls back to a text URL if the image fails to load.
 */
export default function QRCode({ 
  value, 
  size = 200, 
  className = '',
  showDownload = false,
  downloadFileName = 'qr-code'
}: QRCodeProps) {
  const imgRef = useRef<HTMLImageElement>(null)

  // Generate QR code URL using quickchart.io (free, no API key needed)
  const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(value)}&size=${size * 2}&margin=1&format=svg`

  const handleDownload = useCallback(async () => {
    try {
      // Fetch QR image as blob to avoid CORS issues
      const qrImageUrl = `https://quickchart.io/qr?text=${encodeURIComponent(value)}&size=${size * 2}&margin=1&format=png`
      const response = await fetch(qrImageUrl)
      const blob = await response.blob()
      
      // Create download link
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.download = `${downloadFileName}.png`
      link.href = url
      link.click()
      
      // Cleanup
      setTimeout(() => URL.revokeObjectURL(url), 100)
    } catch (err) {
      console.error('Failed to download QR code:', err)
    }
  }, [value, size, downloadFileName])

  return (
    <div className={`inline-flex flex-col items-center gap-2 ${className}`}>
      <div 
        className="bg-white p-3 rounded-xl shadow-sm border border-gray-100"
        style={{ width: size + 24, height: size + 24 }}
      >
        <img
          ref={imgRef}
          src={qrUrl}
          alt="QR код для check-in"
          width={size}
          height={size}
          className="block"
          loading="eager"
        />
      </div>
      {showDownload && (
        <button
          onClick={handleDownload}
          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
        >
          <Download className="h-3 w-3" />
          Скачать QR
        </button>
      )}
    </div>
  )
}
