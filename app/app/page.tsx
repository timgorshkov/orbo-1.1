import { redirect } from 'next/navigation'

export default function AppRoot() {
  // Редиректим на страницу выбора организаций
  redirect('/orgs')
}
