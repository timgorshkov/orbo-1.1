# Quick Test Guide: Enrichment Pipeline

**Status:** Ready to test after deployment  
**Date:** November 5, 2025

---

## 🧪 **1. Тест Cron Job (Daily Role Update)**

### **Запуск через curl:**

```bash
# Замени YOUR_CRON_SECRET на реальный секрет из Vercel Environment Variables
curl https://orbo-1-1.vercel.app/api/cron/update-participant-roles \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -v
```

### **Где взять CRON_SECRET:**
1. Vercel Dashboard → orbo-1.1
2. Settings → Environment Variables
3. Найди `CRON_SECRET` (или создай: любая случайная строка длиной 32+ символа)

### **Ожидаемый ответ:**
```json
{
  "ok": true,
  "updated": 5,
  "failed": 0,
  "duration_ms": 2341,
  "errors": []
}
```

### **Проверка результата в БД:**

```sql
-- Последний cron лог
SELECT 
  created_at,
  level,
  message,
  context
FROM error_logs
WHERE message LIKE '%Daily role update%'
ORDER BY created_at DESC
LIMIT 1;

-- Участники с обогащением за последний час
SELECT 
  id,
  full_name,
  custom_attributes->>'last_enriched_at' as enriched,
  custom_attributes->>'enrichment_source' as source,
  custom_attributes->>'behavioral_role' as role
FROM participants
WHERE custom_attributes->>'last_enriched_at' > NOW() - INTERVAL '1 hour'
ORDER BY custom_attributes->>'last_enriched_at' DESC
LIMIT 10;
```

---

## 🧪 **2. Тест AI-анализа (Manual Button)**

### **Шаг 1: Открой профиль участника**

```
https://orbo-1-1.vercel.app/app/[your-org]/members/[participant-id]
```

### **Шаг 2: Найди кнопку "AI-анализ"**

**Расположение:** Правый верхний угол, рядом с кнопкой "Редактировать"  
**Видимость:** ТОЛЬКО для админов/владельцев  
**Иконка:** ✨ Sparkles

### **Шаг 3: Кликни на кнопку**

1. **Первый клик:** Показывает cost estimation (~$0.001)
2. **Подтверждение:** Кликни "Запустить анализ"
3. **Ожидание:** ~2-5 секунд (прогресс-бар)
4. **Результат:** Успешное сообщение или ошибка

### **Проверка результата в БД:**

```sql
-- Участник после AI-анализа
SELECT 
  id,
  full_name,
  custom_attributes->'interests_keywords' as interests,
  custom_attributes->'recent_asks' as recent_asks,
  custom_attributes->>'city_inferred' as city,
  custom_attributes->>'behavioral_role' as role,
  custom_attributes->'reaction_patterns'->>'favorite_emojis' as fav_emojis,
  custom_attributes->>'enrichment_source' as source,
  custom_attributes->>'last_enriched_at' as enriched_at
FROM participants
WHERE id = 'PARTICIPANT_ID';
```

---

## 🧪 **3. Тест Webhook Stats Update**

### **Шаг 1: Отправь сообщение**

Отправь любое сообщение в тестовую Telegram-группу, привязанную к организации.

### **Шаг 2: Проверь Vercel Logs**

```
Vercel Dashboard → orbo-1.1 → Logs
Фильтр: "Webhook"

Ищи:
✅ [Webhook] Step 2c: EventProcessingService completed
❌ НЕ должно быть: [Webhook] Failed to update participant activity
```

### **Шаг 3: Проверь БД**

```sql
-- Проверь обновление last_activity_at
SELECT 
  id,
  full_name,
  tg_user_id,
  last_activity_at,
  updated_at
FROM participants
WHERE tg_user_id = YOUR_TELEGRAM_USER_ID
ORDER BY updated_at DESC
LIMIT 1;
```

`last_activity_at` должно быть равно текущему времени (±1 минута).

---

## ✅ **Success Criteria**

Pipeline работает корректно если:

1. ✅ Cron возвращает `{"ok": true, "updated": N}`
2. ✅ AI-анализ показывает cost estimation перед запуском
3. ✅ AI-анализ завершается за 2-5 секунд
4. ✅ Данные сохраняются в `custom_attributes`
5. ✅ Webhook обновляет `last_activity_at` после сообщения
6. ✅ Нет ошибок в Vercel logs

---

## 🚨 **Common Issues**

### **Проблема 1: Cron возвращает 401**
- **Причина:** Неверный `CRON_SECRET`
- **Решение:** Проверь переменную в Vercel, используй правильный секрет

### **Проблема 2: "No participants to enrich"**
- **Причина:** Нет активных участников за последние 7 дней
- **Решение:** Отправь несколько сообщений в группу, подожди минуту, запусти cron снова

### **Проблема 3: AI-анализ не работает**
- **Причина 1:** `OPENAI_API_KEY` не установлен в Vercel
- **Причина 2:** Недостаточно сообщений (<5 за последний месяц)
- **Причина 3:** Баланс OpenAI исчерпан

### **Проблема 4: Кнопка AI не видна**
- **Причина:** Ты не админ/владелец организации
- **Решение:** Залогинься как админ или владелец

---

## 📊 **Expected Performance**

| Операция | Время | Стоимость | Частота |
|----------|-------|-----------|---------|
| **Webhook stats update** | <100ms | $0 | Per message |
| **Cron role update** | ~5-10s (100 уч.) | $0 | Daily 3 AM |
| **Manual AI enrichment** | ~2-5s | ~$0.001 | On demand |

---

## 🚀 **After Testing**

После успешного тестирования:
1. ✅ Запиши результаты (сколько участников обогатилось)
2. ✅ Проверь стоимость AI-анализа в OpenAI Dashboard
3. ✅ Переходи к Week 2: AI Weekly Digest + Enriched Profiles UI

---

**Questions?** See full docs: `docs/TESTING_ENRICHMENT_PIPELINE.md`

