import { RegistrationMetaCapture } from '@/components/analytics/registration-meta-capture'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <RegistrationMetaCapture />
    </>
  )
}
