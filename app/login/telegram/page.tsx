import { Suspense } from 'react'
import TelegramLoginClient from './client'

export default function TelegramLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    }>
      <TelegramLoginClient />
    </Suspense>
  )
}
