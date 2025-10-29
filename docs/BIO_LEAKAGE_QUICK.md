# ✅ ИСПРАВЛЕНА утечка bio и custom_attributes

## 🔴 Проблема (подтверждена)
При добавлении группы в новую организацию система копировала "Краткое описание" и "Дополнительные поля" из другой организации.

**Это системная ошибка**, которая нарушает изоляцию данных между организациями.

---

## ✅ Что исправлено

### 1. Код (готово к деплою)
**Файл:** `app/api/telegram/groups/add-to-org/route.ts`

**Было:**
```typescript
custom_attributes: participant.custom_attributes || {},
bio: participant.bio
```

**Стало:**
```typescript
// ✅ НЕ копируем bio и custom_attributes из другой организации
custom_attributes: {},
bio: null
```

---

### 2. Миграция для очистки существующих дублей
**Файл:** `db/migrations/066_fix_bio_custom_attributes_leakage.sql`

**Логика:**
1. Находит участников в нескольких организациях
2. Оставляет данные только в **самой старой** организации
3. Очищает дубли **только если они идентичны** (не были отредактированы)

---

## 🧪 Проверка

### Шаг 1: Диагностика (опционально)
```bash
# Запустите в Supabase SQL Editor:
db/diagnose_bio_leakage.sql
```

Покажет масштаб проблемы.

---

### Шаг 2: Применить миграцию
```bash
# Запустите в Supabase SQL Editor:
db/migrations/066_fix_bio_custom_attributes_leakage.sql
```

Очистит скопированные данные.

---

### Шаг 3: Деплой кода
```bash
git add app/api/telegram/groups/add-to-org/route.ts
git commit -m "fix: prevent bio/custom_attributes leakage between orgs"
git push
```

---

## 🎯 Результат

✅ **Новые группы:** участники добавляются с пустыми bio/custom_attributes  
✅ **Существующие дубли:** очищены (если были идентичны)  
✅ **Редактирование:** работает независимо в каждой организации  
✅ **Изоляция данных:** восстановлена! 🔒

---

**Полная документация:** `BIO_CUSTOM_ATTRIBUTES_LEAKAGE_FIX.md`

**Готово к применению!** 🚀

