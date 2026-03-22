'use client'

import { useEffect } from 'react'
import { captureRegistrationMeta } from '@/lib/client/registration-meta'

export function RegistrationMetaCapture() {
  useEffect(() => {
    captureRegistrationMeta()
  }, [])
  return null
}
