# Инструкция по диагностике TelegramHealthStatus Widget

## 🔍 Шаг 1: Автоматическая диагностика (РЕКОМЕНДУЕТСЯ)

### Вариант A: Через браузер
1. Откройте URL: `https://app.orbo.ru/api/debug/health-widget`
2. Вы увидите JSON с полной диагностикой
3. Скопируйте результат и отправьте мне

### Вариант B: Через curl
```bash
curl https://app.orbo.ru/api/debug/health-widget | jq
```

---

## 📊 Что покажет диагностика:

### `checks.total_events`
- **Что проверяет:** Сколько всего событий в таблице `telegram_health_events`
- **Ожидаемо:** >0 (если 0 → cron job не пишет события)

### `checks.recent_events`
- **Что проверяет:** События за последние 24 часа
- **Ожидаемо:** >0 (если 0 → все группы healthy, события не пишутся)

### `checks.events_by_status`
- **Что проверяет:** Разбивка событий по статусам (healthy/degraded/unhealthy)
- **Ожидаемо:** Должны быть события всех типов

### `checks.telegram_groups`
- **Что проверяет:** Все Telegram группы и их `last_sync_at`
- **Ожидаемо:** Группы с `minutes_since_sync < 15` = healthy

### `checks.rpc_test`
- **Что проверяет:** Работает ли RPC функция `get_telegram_health_status()`
- **Ожидаемо:** Должна вернуть объект со статусом, не NULL

### `checks.health_api`
- **Что проверяет:** Работает ли API `/api/telegram/health`
- **Ожидаемо:** `status: 200`, `ok: true`, `data` с summary

### `analysis.issues`
- **Что показывает:** Обнаруженные проблемы (critical, warning)
- **Действие:** Следовать рекомендациям из `analysis.recommendations`

---

## 🔧 Возможные проблемы и решения:

### Проблема 1: `total_events: 0` (НЕТ СОБЫТИЙ ВООБЩЕ)
**Причина:** Cron job `/api/cron/telegram-health-check` не запускается или не пишет в БД

**Решение:**
1. Проверить Vercel logs для cron job:
   - Открыть Vercel Dashboard → Logs
   - Найти запросы к `/api/cron/telegram-health-check`
   - Посмотреть на ошибки

2. Если cron job не запускается:
   - Проверить `vercel.json` → cron schedule должен быть `*/10 * * * *`
   - Проверить `CRON_SECRET` в Vercel Environment Variables

3. Если cron job запускается, но не пишет:
   - Проверить RPC функцию `log_telegram_health` в Supabase
   - Проверить permissions (GRANT EXECUTE)

---

### Проблема 2: `total_events > 0`, но `recent_events: 0` (СТАРЫЕ СОБЫТИЯ)
**Причина:** Все группы healthy (<15 мин), cron job НЕ пишет healthy события

**Решение:**
Изменить cron job, чтобы писать ВСЕ события (включая healthy):

```typescript
// В app/api/cron/telegram-health-check/route.ts
// БЫЛО (строка ~94):
if (status !== 'healthy') {
  const { error: healthLogError } = await supabaseServiceRole.rpc('log_telegram_health', ...);
}

// СТАЛО:
// ВСЕГДА записываем событие (для любого статуса)
const { error: healthLogError } = await supabaseServiceRole.rpc('log_telegram_health', {
  p_tg_chat_id: group.tg_chat_id,
  p_event_type: status === 'healthy' ? 'sync_success' : 'sync_failure',
  p_status: status,
  p_message: minutesSinceSync 
    ? `Last activity ${minutesSinceSync} minutes ago` 
    : 'No sync recorded',
  p_details: JSON.stringify({
    last_sync_at: group.last_sync_at,
    minutes_since_sync: minutesSinceSync
  }),
  p_org_id: orgId
});
```

---

### Проблема 3: RPC `get_telegram_health_status` возвращает NULL
**Причина:** Нет событий за последние 7 дней (retention + cleanup)

**Решение:**
1. Проверить, что cleanup НЕ удалил все события:
   ```sql
   SELECT COUNT(*) FROM telegram_health_events 
   WHERE created_at > NOW() - INTERVAL '7 days';
   ```

2. Если 0 → увеличить retention в `cleanup_health_events()`:
   ```sql
   -- БЫЛО: 7 days
   -- СТАЛО: 30 days
   DELETE FROM public.telegram_health_events
   WHERE created_at < NOW() - INTERVAL '30 days';
   ```

---

### Проблема 4: API `/api/telegram/health` падает с 500
**Причина:** Ошибка в коде или RLS блокирует доступ

**Решение:**
1. Проверить Vercel logs для `/api/telegram/health`
2. Проверить RLS политики для `telegram_health_events`:
   ```sql
   -- Для суперадминов
   CREATE POLICY telegram_health_superadmin ON public.telegram_health_events
   FOR SELECT USING (
     EXISTS (SELECT 1 FROM public.superadmins WHERE user_id = auth.uid())
   );
   ```

---

### Проблема 5: Frontend не показывает данные (но API работает)
**Причина:** Компонент не обрабатывает пустые данные

**Решение:**
Добавить fallback в `TelegramHealthStatus` component:

```typescript
// В components/superadmin/telegram-health-status.tsx
if (!health || !health.summary) {
  return (
    <Card className="border-yellow-200 bg-yellow-50">
      <CardHeader>
        <CardTitle>Статус Telegram Webhook</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-yellow-800">
          ⚠️ Нет данных для отображения. Возможно, cron job еще не запустился или все группы в отличном состоянии.
        </p>
        <Button onClick={fetchHealth} size="sm" className="mt-2">
          Обновить
        </Button>
      </CardContent>
    </Card>
  );
}
```

---

## 📝 После диагностики:

1. Скопируйте JSON из `/api/debug/health-widget`
2. Отправьте мне результат
3. Я проанализирую и предложу точный fix

---

## 🚀 Quick Fix (если все группы healthy):

Если диагностика покажет, что **все группы healthy** и **cron job не пишет события**, то:

### Шаг 1: Применить fix к cron job
```bash
# Внесите изменения в app/api/cron/telegram-health-check/route.ts
# (убрать if (status !== 'healthy'))
```

### Шаг 2: Deploy
```bash
git add app/api/cron/telegram-health-check/route.ts
git commit -m "Fix: Log all health events (including healthy) for widget visibility"
git push
```

### Шаг 3: Подождать 10 минут
Cron job запустится автоматически и запишет события для всех групп.

### Шаг 4: Проверить виджет
Открыть `/superadmin/telegram` → виджет должен показывать данные.

---

**Готовы к диагностике!** 🔍

