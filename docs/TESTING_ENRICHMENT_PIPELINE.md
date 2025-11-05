# Testing Enrichment Pipeline

**Date:** November 5, 2025  
**Status:** Ready for testing  

---

## 🧪 Testing Instructions

### **1. Manual Cron Execution**

#### **Метод 1: Через curl (рекомендуется)**

```bash
# Замените YOUR_CRON_SECRET на реальный секрет из Vercel
curl https://orbo-1-1.vercel.app/api/cron/update-participant-roles \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -v
```

**Где взять CRON_SECRET:**
1. Перейди в Vercel Dashboard
2. Проект: orbo-1.1
3. Settings → Environment Variables
4. Найди `CRON_SECRET` (или создай новый, если его нет)

**Ожидаемый ответ:**
```json
{
  "ok": true,
  "updated": 5,
  "failed": 0,
  "duration_ms": 2341,
  "errors": []
}
```

#### **Метод 2: Через Vercel Dashboard**

1. Vercel Dashboard → orbo-1.1
2. Deployments → Latest
3. Functions → Cron Jobs
4. Найди `/api/cron/update-participant-roles`
5. Нажми "Run Now" (если доступно)

#### **Метод 3: Подождать до 3 ночи 😴**

Cron автоматически запустится в 3:00 AM по времени сервера.

---

### **2. Manual AI Enrichment (Button)**

AI-анализ уже реализован и доступен через UI. Вот как его найти:

#### **Шаг 1: Открой профиль участника**

1. Зайди в организацию: `https://orbo-1-1.vercel.app/app/[your-org-slug]`
2. Перейди в раздел "Участники" (или "Members")
3. Выбери любого активного участника (кликни на его имя)
4. Откроется страница профиля: `/app/[org]/members/[participantId]`

#### **Шаг 2: Найди кнопку "AI-анализ"**

**Расположение:** Правый верхний угол карточки профиля, рядом с кнопкой "Редактировать"

**Видимость:** Кнопка отображается ТОЛЬКО для админов и владельцев организации

**Внешний вид:** Кнопка с иконкой Sparkles (✨) и текстом "AI-анализ"

#### **Что делает кнопка:**

1. **При первом клике (GET):**
   - Показывает стоимость анализа (~$0.001)
   - Показывает что будет извлечено (интересы, запросы, город)
   - Просит подтверждение

2. **После подтверждения (POST):**
   - Запускает AI-анализ (OpenAI API)
   - Извлекает:
     - `interests_keywords` (ключевые интересы)
     - `recent_asks` (актуальные вопросы/запросы)
     - `city_inferred` (предполагаемый город)
     - `topics_discussed` (обсуждаемые темы)
   - ТАКЖЕ запускает rule-based (роли, реакции)
   - Сохраняет в `custom_attributes`
   - Время: ~2-5 секунд

---

## 📊 **Проверка результатов**

### **1. Проверить логи Cron**

**Vercel Logs:**
```
1. Vercel Dashboard → orbo-1.1
2. Logs (верхнее меню)
3. Filter: "Cron: Update Roles"
4. Ищи:
   - "[Cron: Update Roles] Found X participants to enrich"
   - "[Cron: Update Roles] ✅ Enriched participant ..."
   - "[Cron: Update Roles] Success: X, Failed: Y"
```

**Database:**
```sql
-- Последние cron логи
SELECT 
  created_at,
  level,
  message,
  context
FROM error_logs
WHERE message LIKE '%Daily role update%'
ORDER BY created_at DESC
LIMIT 10;
```

---

### **2. Проверить enrichment данные**

**Supabase SQL Editor:**

```sql
-- Участники с enrichment данными
SELECT 
  p.id,
  p.full_name,
  p.tg_user_id,
  p.custom_attributes->>'last_enriched_at' as last_enriched,
  p.custom_attributes->>'enrichment_source' as source,
  p.custom_attributes->>'behavioral_role' as role,
  p.custom_attributes->'reaction_patterns'->>'favorite_emojis' as fav_emojis,
  p.custom_attributes->'interests_keywords' as interests,
  p.custom_attributes->'recent_asks' as recent_asks,
  p.custom_attributes->>'city_inferred' as city
FROM participants p
WHERE p.custom_attributes IS NOT NULL
  AND p.custom_attributes->>'last_enriched_at' IS NOT NULL
ORDER BY p.custom_attributes->>'last_enriched_at' DESC
LIMIT 20;
```

**Ожидаемый результат (после cron):**
- `last_enriched_at`: сегодняшняя дата
- `enrichment_source`: "rule-based" (для cron)
- `behavioral_role`: "helper" / "bridge" / "observer" / "broadcaster"
- `favorite_emojis`: ["👍", "❤️", ...]

**Ожидаемый результат (после AI button):**
- `enrichment_source`: "ai"
- `interests_keywords`: ["python", "startup", ...]
- `recent_asks`: ["Где найти инвестора?", ...]
- `city_inferred`: "Москва" (или null)

---

### **3. Проверить webhook stats update**

**Тест:**
1. Отправь сообщение в тестовую группу
2. Проверь Vercel logs:
   ```
   [Webhook] Step 2c: EventProcessingService completed
   (должно НЕ быть) [Webhook] Failed to update participant activity
   ```
3. Проверь БД:
   ```sql
   SELECT 
     tg_user_id,
     last_activity_at,
     updated_at
   FROM participants
   WHERE tg_user_id = YOUR_TELEGRAM_USER_ID
   ORDER BY updated_at DESC
   LIMIT 1;
   ```
   `last_activity_at` должно обновиться до текущего времени.

---

## 🔍 **Troubleshooting**

### **Проблема 1: Cron возвращает 401 Unauthorized**

**Причина:** Неверный `CRON_SECRET`

**Решение:**
1. Проверь что `CRON_SECRET` установлен в Vercel
2. Используй правильный секрет в curl команде
3. Для теста на localhost: просто открой `http://localhost:3000/api/cron/update-participant-roles` в браузере

---

### **Проблема 2: Cron возвращает "No participants to enrich"**

**Причина:** Нет активных участников за последние 7 дней

**Решение:**
1. Отправь несколько сообщений в тестовую группу
2. Подожди минуту (чтобы webhook обработал)
3. Запусти cron снова

---

### **Проблема 3: Не вижу кнопку AI-анализа**

**Причина:** Кнопка не добавлена в UI участника

**Решение:** Скажи мне, и я добавлю кнопку на страницу профиля участника.

---

### **Проблема 4: AI-анализ возвращает ошибку**

**Возможные причины:**
1. `OPENAI_API_KEY` не установлен в Vercel
2. OpenAI API недоступен
3. Недостаточно сообщений для анализа (<5)

**Решение:**
1. Проверь `OPENAI_API_KEY` в Vercel Environment Variables
2. Проверь баланс OpenAI аккаунта
3. Проверь что у участника есть хотя бы 5 сообщений за последний месяц

---

## 📈 **Expected Performance**

| Operation | Time | Cost | Frequency |
|-----------|------|------|-----------|
| **Webhook stats update** | <100ms | $0 | Per message |
| **Cron role update** | ~5-10s for 100 participants | $0 | Daily at 3 AM |
| **Manual AI enrichment** | ~2-5s per participant | ~$0.001 | On demand |

---

## ✅ **Success Criteria**

Week 1 pipeline считается успешным если:

1. ✅ Webhook обновляет `last_activity_at` после каждого сообщения
2. ✅ Cron запускается (вручную или автоматически) и обогащает участников
3. ✅ AI-анализ работает через кнопку и показывает стоимость
4. ✅ Данные сохраняются в `custom_attributes`
5. ✅ Никаких ошибок в Vercel logs

---

## 🚀 **Next Steps**

После успешного тестирования:
1. Запиши результаты (сколько участников обогатилось, стоимость AI)
2. Переходи к Week 2: AI Weekly Digest + Enriched Profiles UI

**Вопросы по тестированию?** 🤔

