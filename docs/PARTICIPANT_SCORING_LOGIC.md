# Автоматический скоринг участников

**Статус:** ✅ Реализовано (Migration 074)  
**Дата:** 1 ноября 2025

---

## 📊 Обзор

Система автоматически рассчитывает два скора для каждого участника:
- **`activity_score`** (0-999) — уровень активности
- **`risk_score`** (0-100) — риск оттока

Скоры обновляются **автоматически** через SQL триггер при изменении `last_activity_at`.

---

## 🎯 Activity Score (0-999)

### Что измеряет
Общий уровень активности участника с учетом:
- Количества сообщений
- Количества ответов (replies)
- Давности последней активности
- Стабильности участия

### Логика расчета

#### 1. Базовый скор (сообщения)
```
Базовый = (количество_сообщений × 5) + (количество_ответов × 3)
```
- Обычное сообщение: **5 баллов**
- Ответ (reply): **+3 дополнительных балла** (всего 8)
- Учитываются сообщения за последние **30 дней**

#### 2. Бонус за давность активности
| Последняя активность | Модификатор |
|----------------------|-------------|
| Сегодня/вчера (≤1 день) | **+20** баллов |
| На этой неделе (≤7 дней) | **+10** баллов |
| 8-14 дней назад | 0 (без изменений) |
| 15-30 дней назад | **-20** баллов |
| 30+ дней назад | **-50** баллов (минимум 0) |
| Никогда не был активен | **0** баллов |

#### 3. Бонус за стабильность
```
Бонус стабильности = min(30, (сообщений_за_30_дней × 30) / дней_с_присоединения)
```
Награждает участников с постоянной активностью (максимум +30 баллов).

#### 4. Нормализация
Итоговый скор ограничен диапазоном **0-999**.

### Интерпретация

| Activity Score | Уровень | Описание |
|----------------|---------|----------|
| 0-10 | 🔴 Неактивен | Нет активности или только присоединился |
| 11-50 | 🟡 Низкая | Редкие сообщения |
| 51-100 | 🟢 Средняя | Регулярные сообщения |
| 101-200 | 🟢 Высокая | Активный участник |
| 200+ | ⭐ Очень высокая | Суперактивный участник |

---

## ⚠️ Risk Score (0-100)

### Что измеряет
Риск оттока (churn) участника. Чем выше, тем больше вероятность, что участник покинет сообщество.

### Логика расчета

Основной фактор — **давность последней активности + история участия**.

#### Таблица рисков

| Сценарий | Risk Score | Описание |
|----------|------------|----------|
| **Активен 0-3 дня назад** | 5-15 | 🟢 Очень низкий риск |
| **Активен 4-7 дней назад** | 25 | 🟢 Низкий риск |
| **Активен 8-14 дней назад** | 40 | 🟡 Средний риск |
| **Активен 15-30 дней назад** | 50 | 🟡 Средний риск |
| **Молчит 30+ дней** (без истории) | 50 | 🟡 Средний риск |
| **Молчит 14+ дней** (3+ сообщения) | 65 | 🟠 Средне-высокий риск |
| **Молчит 21+ дней** (5+ сообщений) | 80 | 🔴 Высокий риск |
| **Молчит 30+ дней** (10+ сообщений) | **90-100** | 🔴 **Критический риск оттока** |
| **Никогда не был активен** (7+ дней) | 60 | 🟠 Высокий риск - не вовлечен |
| **Никогда не был активен** (<7 дней) | 30 | 🟡 Средний - дать время |

#### Корректировка по activity_score

Высокая историческая активность **снижает** риск:
- `activity_score > 100` → **-20** к риску
- `activity_score > 50` → **-10** к риску
- Минимум: **5** (участники с очень высоким скором не могут иметь риск < 5)

### Интерпретация

| Risk Score | Уровень | Действие |
|------------|---------|----------|
| 0-25 | 🟢 Низкий | Все хорошо |
| 26-50 | 🟡 Средний | Мониторинг |
| 51-70 | 🟠 Высокий | ⚠️ Рекомендуется вовлечение |
| 71-100 | 🔴 Критический | ⚠️⚠️ **Требуется срочное внимание** |

---

## 🔄 Автоматическое обновление

### Триггер

Скоры пересчитываются **автоматически** при:
- Вставке нового участника (`INSERT`)
- Обновлении `last_activity_at` (`UPDATE`)

```sql
CREATE TRIGGER trigger_update_participant_scores
  BEFORE INSERT OR UPDATE OF last_activity_at ON participants
  FOR EACH ROW
  EXECUTE FUNCTION update_participant_scores_trigger();
```

### Когда обновляются скоры

1. **При получении нового сообщения** → `last_activity_at` обновляется → триггер пересчитывает скоры
2. **При присоединении к группе** → создается participant → триггер рассчитывает начальные скоры
3. **При импорте истории** → `last_activity_at` обновляется → триггер пересчитывает

### Производительность

- Триггер срабатывает **только при изменении** `last_activity_at`
- Расчет быстрый (2-3 SQL запроса)
- Не влияет на обработку сообщений (выполняется в той же транзакции)

---

## 🎯 Использование в UI

### Dashboard: Зоны внимания

**`components/dashboard/attention-zones.tsx`**

Использует скоры для отображения участников, требующих внимания:

#### 1. Участники на грани оттока (Churning)
```sql
-- Функция: get_churning_participants()
WHERE activity_score > 10  -- Были активны раньше
  AND last_activity_at < NOW() - INTERVAL '14 days'
ORDER BY activity_score DESC
```

**Критерии:**
- `activity_score > 10` — были активны в прошлом
- Молчат 14+ дней
- Топ-10 по предыдущей активности

#### 2. Неактивные новички
```sql
-- Функция: get_inactive_newcomers()
WHERE created_at > NOW() - INTERVAL '30 days'
  AND activity_count <= 2
ORDER BY created_at DESC
```

**Критерии:**
- Присоединились менее 30 дней назад
- Менее 2 сообщений
- Молчат 14+ дней

### Analytics API

**`app/api/telegram/analytics/data/route.ts`**

Включает `activity_score` и `risk_score` в ответ для аналитики по участникам.

### Participants List

Участники могут быть отсортированы по:
- `activity_score` — самые активные сверху
- `risk_score` — в группе риска сверху

---

## 📝 Ручной пересчет

### Пересчитать все скоры

```sql
UPDATE participants
SET 
  activity_score = calculate_activity_score(id),
  risk_score = calculate_risk_score(id)
WHERE tg_user_id IS NOT NULL;
```

### Пересчитать для одного участника

```sql
UPDATE participants
SET 
  activity_score = calculate_activity_score(id),
  risk_score = calculate_risk_score(id)
WHERE id = 'participant-uuid';
```

### Проверить распределение скоров

```sql
-- Статистика по activity_score
SELECT 
  COUNT(*) FILTER (WHERE activity_score = 0) as inactive,
  COUNT(*) FILTER (WHERE activity_score BETWEEN 1 AND 50) as low,
  COUNT(*) FILTER (WHERE activity_score BETWEEN 51 AND 100) as medium,
  COUNT(*) FILTER (WHERE activity_score BETWEEN 101 AND 200) as high,
  COUNT(*) FILTER (WHERE activity_score > 200) as very_high,
  AVG(activity_score)::INTEGER as avg_score
FROM participants
WHERE tg_user_id IS NOT NULL;

-- Статистика по risk_score
SELECT 
  COUNT(*) FILTER (WHERE risk_score <= 25) as low_risk,
  COUNT(*) FILTER (WHERE risk_score BETWEEN 26 AND 50) as medium_risk,
  COUNT(*) FILTER (WHERE risk_score BETWEEN 51 AND 70) as high_risk,
  COUNT(*) FILTER (WHERE risk_score > 70) as critical_risk,
  AVG(risk_score)::INTEGER as avg_risk
FROM participants
WHERE tg_user_id IS NOT NULL;
```

---

## 🧪 Тестирование

### Тест 1: Новый активный участник

```sql
-- Создаем участника с недавней активностью
INSERT INTO participants (org_id, tg_user_id, full_name, last_activity_at, created_at)
VALUES ('org-uuid', 99999, 'Test Active User', NOW() - INTERVAL '1 day', NOW() - INTERVAL '7 days')
RETURNING id, activity_score, risk_score;

-- Ожидаем: activity_score > 0, risk_score < 20
```

### Тест 2: Участник в зоне риска

```sql
-- Создаем участника, молчащего 30 дней (но был активен)
INSERT INTO participants (org_id, tg_user_id, full_name, last_activity_at, created_at)
VALUES ('org-uuid', 88888, 'Test Churning User', NOW() - INTERVAL '30 days', NOW() - INTERVAL '60 days')
RETURNING id, activity_score, risk_score;

-- Добавляем историю активности
INSERT INTO activity_events (org_id, tg_user_id, tg_chat_id, event_type, created_at)
SELECT 'org-uuid', 88888, -123456, 'message', NOW() - INTERVAL '35 days' + (i || ' days')::INTERVAL
FROM generate_series(1, 15) i;

-- Пересчитываем
UPDATE participants 
SET last_activity_at = last_activity_at 
WHERE tg_user_id = 88888
RETURNING activity_score, risk_score;

-- Ожидаем: activity_score > 50 (был активен), risk_score > 80 (высокий риск)
```

### Тест 3: Триггер работает

```sql
-- Обновляем last_activity_at и проверяем автоматический пересчет
UPDATE participants
SET last_activity_at = NOW()
WHERE tg_user_id = 99999
RETURNING activity_score, risk_score;

-- Ожидаем: activity_score увеличился (бонус за свежесть), risk_score уменьшился
```

---

## 🔧 Настройка и оптимизация

### Изменить веса

Если нужно изменить логику расчета:

1. Отредактируйте функции `calculate_activity_score()` и `calculate_risk_score()`
2. Примените через новую миграцию:
   ```sql
   CREATE OR REPLACE FUNCTION calculate_activity_score(p_participant_id UUID)
   RETURNS INTEGER AS $$
   -- Новая логика
   END;
   $$ LANGUAGE plpgsql;
   ```
3. Пересчитайте существующие скоры

### Добавить дополнительные факторы

Возможные улучшения:
- Учет реакций (если таблица будет добавлена)
- Учет участия в событиях (регистрации)
- Учет доступа к материалам
- Время суток активности (утро/вечер)
- Длина сообщений (chars_count)

---

## 📚 Связанные файлы

**Миграции:**
- `db/migrations/09_participant_scores.sql` — добавление колонок
- `db/migrations/074_implement_participant_scoring.sql` — реализация логики

**UI компоненты:**
- `components/dashboard/attention-zones.tsx` — зоны внимания
- `app/app/[org]/members/page.tsx` — список участников

**API:**
- `app/api/telegram/analytics/data/route.ts` — аналитика

**SQL функции:**
- `calculate_activity_score(UUID)` — расчет activity_score
- `calculate_risk_score(UUID)` — расчет risk_score
- `update_participant_scores_trigger()` — триггер
- `get_churning_participants(UUID, INTEGER)` — участники на грани оттока
- `get_inactive_newcomers(UUID, INTEGER)` — неактивные новички

---

## 🎉 Результаты

После применения миграции 074:

✅ Dashboard "Зоны внимания" начинает работать  
✅ Участники автоматически получают скоры при активности  
✅ Аналитика показывает реальные данные  
✅ Сортировка по активности/риску работает  
✅ Нет ручного обслуживания (полностью автоматически)

---

**Последнее обновление:** 1 ноября 2025  
**Миграция:** 074  
**Статус:** Реализовано и протестировано

