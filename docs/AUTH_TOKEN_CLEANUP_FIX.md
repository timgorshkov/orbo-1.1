# Fix: Обработка невалидных auth токенов после очистки БД

**Дата:** 2025-01-20  
**Проблема:** После очистки БД (удаления всех пользователей) в логах появлялись ошибки `invalid claim: missing sub claim`

## Описание проблемы

После выполнения `CLEANUP_ALL_DATA.sql` (очистка всех данных, включая `auth.users`), в браузерах пользователей оставались старые JWT токены в cookies. При попытке доступа к сайту:

1. Supabase пытался проверить токен
2. Токен ссылался на несуществующего пользователя (ID удалён из БД)
3. Возвращалась ошибка `AuthApiError: invalid claim: missing sub claim`
4. В логах также появлялась "ошибка" `NEXT_REDIRECT`, хотя это нормальное поведение Next.js

## Реализованное решение

### 1. Улучшена обработка auth ошибок

**Файлы:** `app/page.tsx`, `app/orgs/page.tsx`

Добавлена проверка на типы auth ошибок:
- Если обнаружен невалидный токен (`missing sub claim`, `invalid claim`, status 403)
- Автоматически очищаются все Supabase cookies
- Пользователь редиректится на `/signin`

```typescript
if (error) {
  // Если токен невалидный - очищаем сессию
  if (error.message?.includes('missing sub claim') || 
      error.message?.includes('invalid claim') ||
      error.status === 403) {
    console.log('Invalid auth token detected, clearing session');
    
    // Очищаем все Supabase cookies
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    allCookies.forEach(cookie => {
      if (cookie.name.includes('supabase') || 
          cookie.name.includes('auth-token') ||
          cookie.name.includes('sb-')) {
        cookieStore.delete(cookie.name);
      }
    });
  }
  
  redirect('/signin');
}
```

### 2. Фильтрация NEXT_REDIRECT в catch блоках

`NEXT_REDIRECT` - это не реальная ошибка, а механизм Next.js для выполнения редиректов. Теперь она не логируется как ошибка:

```typescript
catch (error: any) {
  // NEXT_REDIRECT не является ошибкой - это нормальное поведение Next.js
  if (error?.digest?.startsWith('NEXT_REDIRECT')) {
    throw error; // Пробрасываем дальше
  }
  
  // Только реальные ошибки логируются
  console.error('Unexpected error:', error);
  redirect('/signin');
}
```

## Результат

✅ **Ошибки `missing sub claim` перестали показываться в логах**  
✅ **Невалидные токены автоматически очищаются**  
✅ **NEXT_REDIRECT больше не логируется как ошибка**  
✅ **Пользователи корректно редиректятся на страницу входа**

## Применимость

Это решение полезно:
- После очистки БД для тестирования
- При миграции пользователей между инстансами
- При смене Supabase проекта
- В любых ситуациях, когда JWT токены становятся невалидными

## Дополнительно

Если нужно **принудительно разлогинить всех пользователей**, можно:

1. **Изменить JWT Secret в Supabase** (Dashboard → Settings → API → JWT Settings)
2. **Использовать этот механизм** - все старые токены станут невалидными и будут автоматически очищены

---

**Статус:** ✅ Реализовано и протестировано  
**Файлы:** `app/page.tsx`, `app/orgs/page.tsx`

