'use client';

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';

interface SessionProviderProps {
  children: ReactNode;
}

/**
 * NextAuth SessionProvider для клиентских компонентов.
 * 
 * Оборачивает приложение для доступа к useSession хуку.
 * Использует JWT стратегию - сессия хранится в cookie.
 */
export function SessionProvider({ children }: SessionProviderProps) {
  return (
    <NextAuthSessionProvider 
      refetchInterval={5 * 60} // Обновление сессии каждые 5 минут
      refetchOnWindowFocus={true} // Обновление при фокусе окна
    >
      {children}
    </NextAuthSessionProvider>
  );
}

