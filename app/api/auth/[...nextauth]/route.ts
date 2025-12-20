/**
 * NextAuth.js API Route Handler
 * 
 * Обрабатывает все auth-related запросы:
 * - GET /api/auth/signin - страница входа
 * - POST /api/auth/signin/:provider - OAuth редирект
 * - GET /api/auth/callback/:provider - OAuth callback
 * - GET /api/auth/signout - выход
 * - GET /api/auth/session - получение сессии
 * - GET /api/auth/csrf - CSRF токен
 * - GET /api/auth/providers - список провайдеров
 */

import { handlers } from '@/auth';

export const { GET, POST } = handlers;

