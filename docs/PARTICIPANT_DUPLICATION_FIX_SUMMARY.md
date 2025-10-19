# Исправление дублирования участников - Итоговая сводка

## ✅ Что исправлено

### 1. **Регистрация на события** (Критическое исправление) ⭐⭐⭐

**Файл**: `app/api/events/[id]/register/route.ts`

**Проблема**: 
- Пользователь без подтвержденного Telegram создавал НОВОГО participant при каждой регистрации на событие
- Результат: 10 регистраций = 10 дублей

**Решение**:
1. ✅ Добавлен поиск participant по email (если не найден по telegram_user_id)
2. ✅ Автоматическая привязка telegram_user_id к существующему participant
3. ✅ Обработка race conditions с duplicate key constraint

**Новая логика**:
```
1. Ищем по telegram_user_id → найден? → используем
2. НЕ найден → ищем по email → найден? → используем + обновляем tg_user_id
3. НЕ найден ни по одному → создаем нового participant (первая регистрация)
```

**Ожидаемый результат**: 1 participant на пользователя в организации, независимо от количества регистраций

---

### 2. **Telegram-авторизация** (Критическое исправление) ⭐⭐⭐

**Файл**: `lib/services/telegramAuthService.ts`

**Проблема**:
- Код искал participant по несуществующей колонке `user_id`
- Каждая Telegram-авторизация создавала нового participant

**Решение**:
1. ✅ Исправлен поиск: теперь по `tg_user_id` + `org_id` + `merged_into IS NULL`
2. ✅ Удалена несуществующая колонка `user_id` из запросов
3. ✅ Добавлены дополнительные поля (first_name, last_name, status) при создании

**Новая логика**:
```sql
SELECT id FROM participants
WHERE org_id = 'xxx' 
  AND tg_user_id = 123456789
  AND merged_into IS NULL
```

**Ожидаемый результат**: Повторные Telegram-авторизации используют существующего participant

---

### 3. **Защита на уровне БД** (Предотвращение дублей) ⭐⭐

**Файл**: `db/migrations/39_prevent_duplicate_participants.sql`

**Что добавлено**:

#### 1. Unique Index для email
```sql
CREATE UNIQUE INDEX idx_participants_unique_email_per_org
ON participants (org_id, email)
WHERE email IS NOT NULL AND merged_into IS NULL;
```

**Эффект**: БД физически не позволит создать 2 participant с одним email в одной организации

#### 2. Функция поиска дублей
```sql
SELECT * FROM find_duplicate_participants('org-uuid');
```

**Возвращает**:
- Дубли по email (confidence: 1.0)
- Дубли по tg_user_id (confidence: 1.0)
- Детали для каждой пары

#### 3. Функция автоматического объединения
```sql
SELECT merge_duplicate_participants('canonical-uuid', 'duplicate-uuid');
```

**Что делает**:
1. Копирует недостающие данные из дубля в canonical
2. Переносит все регистрации на события
3. Переносит связи с группами
4. Помечает дубль как `merged_into = canonical_id`
5. Возвращает JSON с результатами

---

## 📋 Инструкция по применению

### Шаг 1: Применить миграцию в Supabase

Откройте Supabase SQL Editor и выполните:

```sql
-- Скопируйте и выполните весь файл:
-- db/migrations/39_prevent_duplicate_participants.sql
```

Проверьте успешное создание:
```sql
-- Проверка индекса
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'participants' 
  AND indexname = 'idx_participants_unique_email_per_org';

-- Проверка функций
SELECT proname 
FROM pg_proc 
WHERE proname IN ('find_duplicate_participants', 'merge_duplicate_participants');
```

---

### Шаг 2: Найти и очистить существующие дубли

#### 2.1. Найти дубли по email в организации

```sql
-- Замените 'your-org-uuid' на реальный UUID организации
SELECT 
  participant_id_1,
  participant_id_2,
  match_reason,
  confidence,
  details
FROM find_duplicate_participants('your-org-uuid')
WHERE match_reason = 'email_match'
ORDER BY confidence DESC;
```

#### 2.2. Просмотреть детали дублей

```sql
-- Для каждой пары из результата выше
SELECT 
  id,
  org_id,
  tg_user_id,
  email,
  full_name,
  created_at,
  source,
  merged_into,
  (SELECT COUNT(*) FROM event_registrations WHERE participant_id = p.id) as registrations_count
FROM participants p
WHERE id IN ('participant-uuid-1', 'participant-uuid-2')
ORDER BY created_at ASC;
```

#### 2.3. Объединить дубли

**Определите canonical participant**:
- Старший по created_at (был создан первым)
- Имеет tg_user_id (если один из них имеет, а другой нет)
- Имеет больше регистраций на события

```sql
-- Объединяем (canonical остается, duplicate помечается как merged)
SELECT merge_duplicate_participants(
  'canonical-uuid',  -- participant, который остается
  'duplicate-uuid'   -- participant, который помечается как merged
);

-- Проверяем результат
SELECT * FROM participants WHERE id IN ('canonical-uuid', 'duplicate-uuid');
```

#### 2.4. Массовое объединение дублей по email

```sql
-- Сначала найдем все пары дублей по email
WITH duplicates AS (
  SELECT 
    participant_id_1,
    participant_id_2,
    (details->>'p1_created_at')::timestamp as created_1,
    (details->>'p2_created_at')::timestamp as created_2
  FROM find_duplicate_participants('your-org-uuid')
  WHERE match_reason = 'email_match'
)
SELECT 
  CASE 
    WHEN created_1 < created_2 THEN participant_id_1
    ELSE participant_id_2
  END as canonical_id,
  CASE 
    WHEN created_1 < created_2 THEN participant_id_2
    ELSE participant_id_1
  END as duplicate_id,
  merge_duplicate_participants(
    CASE WHEN created_1 < created_2 THEN participant_id_1 ELSE participant_id_2 END,
    CASE WHEN created_1 < created_2 THEN participant_id_2 ELSE participant_id_1 END
  ) as result
FROM duplicates;
```

---

### Шаг 3: Верификация после исправлений

#### 3.1. Проверить, что дублей по email больше нет

```sql
SELECT 
  org_id,
  email,
  COUNT(*) as duplicate_count
FROM participants 
WHERE email IS NOT NULL 
  AND merged_into IS NULL
GROUP BY org_id, email 
HAVING COUNT(*) > 1;

-- Ожидаемый результат: 0 строк
```

#### 3.2. Проверить, что пользователи имеют одного participant

```sql
-- Для конкретного email
SELECT 
  id,
  org_id,
  tg_user_id,
  email,
  full_name,
  source,
  created_at,
  merged_into
FROM participants
WHERE email = 'user@example.com'
ORDER BY org_id, created_at;

-- Ожидается: 1 строка на организацию (где merged_into IS NULL)
```

#### 3.3. Проверить количество merged participants

```sql
SELECT 
  COUNT(*) as total_participants,
  COUNT(*) FILTER (WHERE merged_into IS NOT NULL) as merged_count,
  COUNT(*) FILTER (WHERE merged_into IS NULL) as active_count
FROM participants;
```

---

## 🧪 Тестирование новой логики

### Тест 1: Регистрация на события без Telegram

```
Сценарий:
1. Пользователь создает аккаунт по email (без Telegram)
2. Регистрируется на событие 1
3. Регистрируется на событие 2
4. Регистрируется на событие 3

Ожидаемый результат:
SELECT COUNT(*) FROM participants 
WHERE email = 'user@example.com' 
  AND merged_into IS NULL;
-- Должно вернуть: 1
```

### Тест 2: Привязка Telegram после регистрации

```
Сценарий:
1. Пользователь регистрируется на событие по email
   → создается participant #1 (email: user@example.com, tg_user_id: null)
2. Пользователь подтверждает Telegram аккаунт (tg_user_id: 123456789)
3. Пользователь регистрируется на другое событие

Ожидаемый результат:
SELECT * FROM participants 
WHERE email = 'user@example.com' 
  AND merged_into IS NULL;
  
-- Должен вернуть 1 participant с:
--   email: user@example.com
--   tg_user_id: 123456789
```

### Тест 3: Telegram-авторизация

```
Сценарий:
1. Новый пользователь авторизуется через Telegram (tg_user_id: 987654321)
2. Повторная авторизация через Telegram

Ожидаемый результат:
SELECT COUNT(*) FROM participants 
WHERE tg_user_id = 987654321 
  AND merged_into IS NULL;
-- Должно вернуть: 1
```

### Тест 4: Попытка создать дубль по email

```
Сценарий:
1. Существует participant с email: test@example.com
2. Попытка создать еще одного participant с тем же email

Ожидаемый результат:
-- Ошибка:
-- duplicate key value violates unique constraint "idx_participants_unique_email_per_org"
```

---

## 📊 Метрики для мониторинга

### 1. Темп роста participants

```sql
-- Количество participants по дням (должен замедлиться после исправлений)
SELECT 
  DATE(created_at) as date,
  COUNT(*) as new_participants
FROM participants 
WHERE created_at > NOW() - INTERVAL '30 days'
  AND merged_into IS NULL
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### 2. Соотношение merged к active

```sql
-- После очистки дублей merged должно быть > 0
SELECT 
  COUNT(*) FILTER (WHERE merged_into IS NULL) as active,
  COUNT(*) FILTER (WHERE merged_into IS NOT NULL) as merged,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE merged_into IS NOT NULL) / COUNT(*),
    2
  ) as merge_rate_percent
FROM participants;
```

### 3. Распределение participants по источникам

```sql
SELECT 
  source,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE merged_into IS NOT NULL) as merged_count
FROM participants
GROUP BY source
ORDER BY count DESC;
```

---

## ⚠️ Важные замечания

### 1. Один пользователь в разных организациях = НОРМА

```sql
-- Это НЕ дубли:
SELECT * FROM participants WHERE tg_user_id = 123456789;

id           | org_id    | tg_user_id
-------------|-----------|------------
participant1 | org-1     | 123456789
participant2 | org-2     | 123456789
participant3 | org-3     | 123456789
```

**Пояснение**: Один Telegram пользователь может быть участником нескольких организаций через разные группы. Это корректное поведение.

### 2. Merged participants сохраняются

Поле `merged_into` указывает на canonical participant. Старые ID сохраняются для трейсинга и возможного отката.

```sql
-- Посмотреть историю объединений
SELECT 
  p1.id as duplicate_id,
  p1.merged_into as canonical_id,
  p2.email as canonical_email,
  p1.created_at as duplicate_created,
  p2.created_at as canonical_created
FROM participants p1
JOIN participants p2 ON p2.id = p1.merged_into
WHERE p1.merged_into IS NOT NULL;
```

### 3. Unique index работает только для non-NULL email

Если email = NULL, могут быть несколько participant с одним tg_user_id в одной org (что нормально, если пользователь еще не указал email).

---

## 🔄 Rollback (если что-то пошло не так)

### Откатить объединение participant

```sql
-- "Размерджить" participant (восстановить как отдельного)
UPDATE participants
SET merged_into = NULL
WHERE id = 'participant-to-restore-uuid';

-- НО: регистрации и связи с группами останутся у canonical!
-- Для полного отката нужно вручную вернуть данные
```

### Удалить unique index

```sql
DROP INDEX IF EXISTS idx_participants_unique_email_per_org;
```

---

## 📈 Ожидаемые результаты

### До исправлений:
- 1 пользователь → 5-10+ participant-дублей
- Рост participants: ~50-100/день
- Merged participants: 0

### После исправлений:
- 1 пользователь → 1 participant в организации
- Рост participants: ~10-20/день (только уникальные)
- Merged participants: зависит от количества очищенных дублей

---

## ✅ Чек-лист внедрения

- [ ] Применена миграция 39 в Supabase
- [ ] Проверены функции find_duplicate_participants и merge_duplicate_participants
- [ ] Найдены существующие дубли в ключевых организациях
- [ ] Объединены дубли (вручную или массово)
- [ ] Проверено: дублей по email больше нет
- [ ] Проведены тесты регистрации на события
- [ ] Проведены тесты Telegram-авторизации
- [ ] Настроен мониторинг роста participants
- [ ] Документация обновлена

---

## 🆘 Troubleshooting

### Проблема: Миграция не применяется (ошибка unique constraint)

**Причина**: Уже есть дубли по email

**Решение**:
```sql
-- Сначала найдите и объедините дубли вручную (см. Шаг 2.3)
-- Потом повторите применение миграции
```

### Проблема: Пользователь все еще создает дубли

**Диагностика**:
```sql
-- Посмотрите логи создания participants
SELECT 
  id,
  email,
  tg_user_id,
  source,
  created_at
FROM participants
WHERE email = 'problem-user@example.com'
ORDER BY created_at DESC
LIMIT 10;
```

**Проверьте**:
1. Применен ли код из `app/api/events/[id]/register/route.ts`?
2. Применен ли код из `lib/services/telegramAuthService.ts`?
3. Есть ли ошибки в логах Vercel?

### Проблема: Не могу создать participant с NULL email

**Это нормально**: Unique index применяется только к non-NULL email. Можно создать много participants с email = NULL (но разными tg_user_id).

---

Готово к использованию! 🚀

