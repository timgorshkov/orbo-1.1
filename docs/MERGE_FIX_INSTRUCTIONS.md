# Инструкция по применению исправлений объединения участников

## Быстрый старт

### Шаг 1: Применить SQL миграцию

```bash
# Откройте Supabase SQL Editor
# Скопируйте и выполните содержимое файла:
db/migrations/26_fix_merge_smart_reload.sql
```

**Что исправляет**: Перезагрузку данных target участника при обработке нескольких дубликатов.

### Шаг 2: Задеплоить изменения кода

Все изменения уже внесены в следующие файлы:
- ✅ `app/app/[org]/members/page.tsx` - фильтр объединенных в списке
- ✅ `components/members/participant-profile-card.tsx` - отображение traits
- ✅ `lib/services/participants/matcher.ts` - исключение объединенных из поиска
- ✅ `app/api/participants/[participantId]/route.ts` - улучшенное логирование

**Действие**: Просто задеплойте код на Vercel.

### Шаг 3: Проверка

1. **Список участников**:
   ```
   - Откройте /app/[org]/members
   - Убедитесь что объединенные участники не отображаются
   - Количество участников должно уменьшиться
   ```

2. **Объединение дубликатов**:
   ```
   - Откройте профиль любого участника
   - Перейдите на вкладку "Дубликаты"
   - Нажмите "Обновить список"
   - Объедините с выбранным дубликатом
   - Проверьте всплывающее окно с результатами
   ```

3. **Характеристики в профиле**:
   ```
   - После объединения откроется профиль
   - В разделе "Дополнительная информация" должны быть:
     * Заполненные поля (если были пустые)
     * Характеристики из базы данных
     * Конфликты с янтарным фоном и меткой "Из объединения"
   ```

---

## Что исправлено

### ✅ Проблема 1: Дубли не исчезают из списка

**До**: После объединения в списке все еще висят оба профиля  
**После**: Объединенный профиль автоматически скрывается

### ✅ Проблема 2: Поля не заполняются

**До**: Всплывающее окно говорит "заполнено", но профиль пустой  
**После**: Все поля корректно заполняются и отображаются

### ✅ Проблема 3: Характеристики не видны

**До**: Конфликты "сохранены", но их нигде нет  
**После**: Конфликты отображаются в профиле с подробностями

---

## Визуальные индикаторы

После объединения в профиле вы увидите:

```
┌─────────────────────────────────────────────────────┐
│ Дополнительная информация                           │
├─────────────────────────────────────────────────────┤
│ Характеристики из базы данных                       │
│                                                     │
│ ┌─────────────────────────────────────────────┐    │
│ │ EMAIL_MERGED            [Из объединения] 🟡 │    │
│ │ old.email@example.com                       │    │
│ │ Конфликт с: new.email@example.com           │    │
│ └─────────────────────────────────────────────┘    │
│                                                     │
│ ┌─────────────────────────────────────────────┐    │
│ │ PHONE_MERGED            [Из объединения] 🟡 │    │
│ │ +79991234567                                │    │
│ │ Конфликт с: +79995554433                    │    │
│ └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

🟡 = Янтарный фон (bg-amber-50 border-amber-200)

---

## Troubleshooting

### Проблема: Миграция не применилась

```sql
-- Проверить версию функции
SELECT routine_name, routine_definition
FROM information_schema.routines
WHERE routine_name = 'merge_participants_smart';

-- Должен быть комментарий: "Версия 26: перезагружает target record"
```

### Проблема: Дубли все еще в списке

```sql
-- Проверить что merged_into установлен
SELECT id, full_name, merged_into
FROM participants
WHERE org_id = 'your-org-id'
ORDER BY merged_into NULLS FIRST;

-- Если merged_into NULL, но участник должен быть объединен:
-- Попробуйте объединить заново
```

### Проблема: Характеристики не отображаются

1. Проверьте в SQL что traits созданы:
```sql
SELECT * FROM participant_traits
WHERE participant_id = 'target-participant-id'
AND source = 'merge';
```

2. Проверьте в браузере DevTools → Network:
```
GET /app/[org]/members/[id]
→ Response должен содержать traits: [...]
```

3. Очистите кеш браузера и перезагрузите страницу

---

## Логи для отладки

После деплоя в консоли браузера (DevTools → Console) вы увидите:

```
Finding matches for: { orgId: "...", email: "...", ... }
Exact matches found: 2
Fuzzy matches found: 1
Total matches returned: 3
```

В логах Vercel (для API запросов):

```
Merge check - Current participant: {
  id: "uuid-a",
  merged_into: null,
  status: "participant",
  canonicalId: "uuid-a"
}
Merge check - Target participant: {
  id: "uuid-b",
  merged_into: null,
  status: "participant",
  targetCanonical: "uuid-b"
}
```

---

## Rollback (если нужно)

### Откатить SQL миграцию:

```sql
-- Восстановить старую версию функции
-- (Скопируйте из db/migrations/25_merge_participants_smart.sql)
```

### Откатить код:

```bash
git revert HEAD
git push
```

---

## Контакты

Если возникли проблемы:
1. Проверьте логи Vercel
2. Проверьте Supabase Database Logs
3. Посмотрите `MERGE_FULL_FIX.md` для детального описания
4. Проверьте `MERGE_ERROR_FIX.md` для информации о других ошибках

---

## Полезные SQL запросы

### Статистика объединений

```sql
SELECT 
  COUNT(*) FILTER (WHERE merged_into IS NULL) as active_participants,
  COUNT(*) FILTER (WHERE merged_into IS NOT NULL) as merged_participants,
  COUNT(DISTINCT merged_into) FILTER (WHERE merged_into IS NOT NULL) as canonical_participants
FROM participants
WHERE org_id = 'your-org-id';
```

### Последние объединения

```sql
SELECT 
  p.id,
  p.full_name,
  p.merged_into,
  p.updated_at,
  c.full_name as canonical_name
FROM participants p
LEFT JOIN participants c ON c.id = p.merged_into
WHERE p.org_id = 'your-org-id'
  AND p.merged_into IS NOT NULL
ORDER BY p.updated_at DESC
LIMIT 10;
```

### Traits из объединений

```sql
SELECT 
  t.participant_id,
  p.full_name,
  t.trait_key,
  t.trait_value,
  t.metadata,
  t.created_at
FROM participant_traits t
JOIN participants p ON p.id = t.participant_id
WHERE p.org_id = 'your-org-id'
  AND t.source = 'merge'
ORDER BY t.created_at DESC
LIMIT 20;
```

---

## Следующие шаги

После успешного применения исправлений:

1. ✅ Проверьте что все работает на продакшене
2. ✅ Объедините несколько тестовых дубликатов
3. ✅ Убедитесь что данные не теряются
4. ✅ Проверьте что характеристики отображаются
5. ✅ Удалите тестовых участников (если создавали)

**Готово! Система объединения участников теперь работает корректно.** 🎉

