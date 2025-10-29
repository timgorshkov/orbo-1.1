# 📋 План полной очистки проекта

## 🎯 Цель
Навести порядок в проекте: переместить документацию, удалить debug endpoints, архивировать одноразовые скрипты.

---

## 📁 Пункт 1: Перенос .md файлов в docs/

### Файлы для переноса из корня → docs/

✅ **БЕЗОПАСНО переносить:**
1. `SUMMARY_BIO_LEAKAGE.md`
2. `BIO_CUSTOM_ATTRIBUTES_LEAKAGE_FIX.md`
3. `BIO_LEAKAGE_QUICK.md`
4. `TELEGRAM_UI_IMPROVEMENTS.md`
5. `TELEGRAM_UI_FIXED.md`
6. `AVAILABLE_GROUPS_FIX_QUICK.md`
7. `AVAILABLE_GROUPS_FILTER_FIX.md`
8. `BOT_FILTER_FIX.md`
9. `PERMANENT_FIX_APPLIED.md`
10. `OWNER_VS_CREATOR_FIXED.md`
11. `DONE_QUICK_CHECK.md`
12. `FIX_TEAM_SETTINGS_INSTRUCTIONS.md`
13. `OWNER_ROLE_FIX.md`
14. `AUTH_CALLBACK_FIX.md`

❌ **НЕ ТРОГАТЬ:**
- `README.md` - основной readme проекта
- `prd.md` - основной PRD

### Файлы для переноса из db/ → docs/db/

✅ **БЕЗОПАСНО переносить:**
1. `FIX_SQL_SUBQUERY_ERROR.md`
2. `PERMANENT_FIX_SYNC_ADMINS.md`
3. `FIX_OWNER_VS_CREATOR_CONFUSION.md`
4. `COMPLETE_FIX_SUMMARY.md`
5. `SYSTEMATIC_FIX_INSTRUCTIONS.md`
6. `SYSTEMATIC_FIX_PLAN.md`
7. `TEAM_DUPLICATION_SUMMARY.md`
8. `FIX_TEAM_DUPLICATION_PERMANENT.md`
9. `TEAM_DUPLICATION_ROOT_CAUSE_ANALYSIS.md`
10. `FIX_TEAM_DUPLICATES_README.md`
11. `TEAM_DUPLICATION_ANALYSIS.md`
12. `FIX_SYNTAX_ERROR.md`
13. `NEXT_STEPS.md`
14. `FIX_EVENT_REGISTRATIONS_COLUMN.md`
15. `DELETE_DUPLICATE_USER_GUIDE.md`

**Риски:** ❌ НЕТ - это просто документация

---

## 🐛 Пункт 2: Debug endpoints

### 🔴 КРИТИЧНО! Публичные debug endpoints

#### ⚠️ УДАЛИТЬ (высокий риск безопасности):

1. **`app/debug/auth/page.tsx`** + **`app/api/debug/auth/route.ts`**
   - ❌ Показывает: session, user ID, email, все организации, все memberships
   - ❌ Публично доступен: `/debug/auth`
   - ❌ **ВЫСОКИЙ РИСК**: утечка данных пользователей

2. **`app/debug/telegram-groups/page.tsx`** + **`app/api/debug/telegram-groups/route.ts`**
   - ❌ Показывает: все Telegram группы, chat IDs, статусы
   - ❌ Публично доступен: `/debug/telegram-groups`
   - ❌ **СРЕДНИЙ РИСК**: утечка информации о группах

3. **`app/api/debug/check-telegram-user/route.ts`**
   - ❌ Показывает: данные о Telegram пользователе по ID
   - ❌ Публично доступен: `/api/debug/check-telegram-user?telegramId=...`
   - ❌ **ВЫСОКИЙ РИСК**: можно получить данные любого пользователя

4. **`app/api/debug/check-group-admins/route.ts`**
   - ❌ Показывает: список админов группы, их права
   - ❌ Публично доступен: `/api/debug/check-group-admins?chatId=...`
   - ❌ **СРЕДНИЙ РИСК**: утечка информации об админах

5. **`app/api/debug/create-test-org/route.ts`** (если существует)
   - ❌ Создаёт организации
   - ❌ **ВЫСОКИЙ РИСК**: DoS атака, спам организаций

#### ✅ ОСТАВИТЬ (полезные для мониторинга):

1. **`app/api/healthz/route.ts`**
   - ✅ Health check endpoint
   - ✅ Не показывает чувствительных данных
   - ✅ Нужен для uptime monitoring

2. **`app/api/health/route.ts`**
   - ✅ Базовый health check
   - ✅ Безопасен

3. **`app/api/telegram/admin/monitor-webhooks/route.ts`**
   - ⚠️ **РИСК**: Может показывать webhook конфигурацию
   - 💡 **РЕКОМЕНДАЦИЯ**: Добавить проверку прав (только owner организации)
   - ✅ Полезен для диагностики

**Риски удаления debug endpoints:** ❌ НЕТ - они не используются в продакшене

---

## 📂 Пункт 3: Одноразовые SQL скрипты в db/

### 🗑️ МОЖНО УДАЛИТЬ (использовались для конкретных случаев):

#### Группа 1: Диагностика (diagnose_*)
1. `diagnose_bio_leakage.sql` - диагностика утечки bio (одноразово)
2. `diagnose_duplicate_users.sql` - поиск дублей пользователей
3. `diagnose_group_-4962287234.sql` - для конкретной группы
4. `diagnose_new_org_quick.sql` - для новой организации
5. `diagnose_new_org_team.sql` - для команды новой организации
6. `diagnose_team_display_issue.sql` - для проблем отображения команды
7. `diagnose_team_for_sql_editor.sql` - адаптация для SQL editor
8. `diagnose_team_simple.sql` - упрощённая диагностика команды
9. `diagnose_tim_gorshkov.sql` - для конкретного пользователя

#### Группа 2: Проверки (check_*)
1. `check_available_groups_timur.sql` - для конкретного пользователя
2. `check_what_remains.sql` - проверка остатков после удаления
3. `check_group_metrics.sql` - проверка метрик группы
4. `check_material_tables.sql` - проверка таблиц материалов
5. `check_participants_schema.sql` - проверка схемы участников
6. `CHECK_ACTIVITY_EVENTS_STRUCTURE.sql` - структура событий
7. `CHECK_ADMIN_STATUS.sql` - статус админа
8. `CHECK_EVENTS_AFTER_DEPLOY.sql` - проверка после деплоя
9. `CHECK_OWNER_PARTICIPANT.sql` - проверка владельца
10. `CHECK_PARTICIPANT_GROUPS_SIMPLE.sql` - связи участников
11. `CHECK_PARTICIPANTS_CONSTRAINTS.sql` - ограничения
12. `CHECK_PARTICIPANTS_STATE.sql` - состояние участников
13. `CHECK_SPECIFIC_USER_PARTICIPANT.sql` - конкретный пользователь
14. `CHECK_TELEGRAM_GROUPS.sql` - Telegram группы
15. `CHECK_TIMUR_ADMIN_STATUS.sql` - статус конкретного админа

#### Группа 3: Исправления (fix_* - одноразовые)
1. `fix_owner_admin_duplicates.sql` - исправление дублей owner/admin
2. `fix_team_duplicates.sql` - для первой организации
3. `fix_team_duplicates_org2.sql` - для второй организации
4. `fix_tim_in_new_org.sql` - для конкретного пользователя
5. `force_delete_duplicate_user.sql` - удаление дубликата
6. `merge_duplicate_telegram_users.sql` - слияние дублей

#### Группа 4: Тесты и временные (test_*, quick_*)
1. `test_migration_065.sql` - тест миграции
2. `quick_diagnose_team.sql` - быстрая диагностика
3. `quick_fix_org2_now.sql` - быстрое исправление

#### Группа 5: Очистка (cleanup_* - одноразовые)
1. `cleanup_bot_admins.sql` - очистка ботов из админов (уже применено)
2. `CLEANUP_ALL_DATA.sql` - полная очистка данных
3. `CLEANUP_AUTH_COMPLETELY.sql` - полная очистка auth
4. `QUICK_CLEANUP_AUTH.sql` - быстрая очистка auth

#### Группа 6: Диагностика signup
1. `DIAGNOSE_SIGNUP_ISSUE.sql` - диагностика проблем регистрации

#### Группа 7: Reset-скрипты
1. `RESET_TELEGRAM_GROUPS_ASSIGNMENT.sql` - сброс привязки групп

#### Группа 8: Специфичные исправления
1. `FIX_ALL_DUPLICATES_BEFORE_INDEXES.sql` - перед созданием индексов
2. `FIX_DUPLICATE_PARTICIPANTS_BEFORE_MIGRATION.sql` - перед миграцией
3. `FIX_EMPTY_EMAIL_DUPLICATES.sql` - пустые email дубли

**Итого к удалению:** ~45 файлов

### ✅ ОСТАВИТЬ (могут пригодиться):

#### Системные скрипты
1. `bucket_policies.sql` - политики для storage
2. `create_tables_now.sql` - создание таблиц
3. `deploy.sql` - деплой скрипт
4. `init.js` - инициализация
5. `init_storage.js` - инициализация storage

#### Функции и процедуры
1. `create_counter_functions.sql` - функции счётчиков
2. `create_participants_functions.sql` - функции участников
3. `exec_sql_function.sql` - выполнение SQL

#### Системы и обновления
1. `telegram_ownership_system.sql` - система владения Telegram
2. `update_activity_events.sql` - обновление событий
3. `update_participant_counts.sql` - обновление счётчиков
4. `update_participants_system.sql` - обновление системы участников

#### Добавление функциональности
1. `add_advanced_metrics.sql` - расширенные метрики
2. `add_missing_participants.sql` - добавление недостающих участников
3. `add_timezone_support.sql` - поддержка часовых поясов
4. `demo_data.sql` - демо данные

#### Проверки (полезные)
1. `real_data_check.sql` - проверка реальных данных
2. `verify_fixes.sql` - проверка исправлений

#### Исправления политик (системные)
1. `fix_analytics_metrics.sql` - исправление метрик
2. `fix_group_metrics.sql` - исправление метрик группы
3. `fix_members_duplicates_and_metrics.sql` - исправление дублей
4. `fix_members_issues.sql` - исправление проблем участников
5. `fix_memberships_policy_v2.sql` - политики memberships
6. `fix_memberships_policy.sql` - политики memberships
7. `fix_organizations_rls.sql` - RLS организаций
8. `fix_rls_policies.sql` - политики RLS
9. `fix_telegram_group_admins.sql` - исправление админов Telegram

#### Debug утилита
1. `debug_organization_team.sql` - может пригодиться для диагностики

#### Миграции
- `migrations/` - ВСЕ ОСТАВИТЬ (критично!)

#### JavaScript утилиты
1. `delete_user_via_api.js` - может пригодиться для удаления пользователей

**Риски удаления скриптов:** 
- ✅ НИЗКИЙ - все скрипты одноразовые, уже применены
- 💡 РЕКОМЕНДАЦИЯ: Создать архивную папку `db/archive/` вместо удаления

---

## 📝 Пункт 4: Очистка документации со ссылками

### Документы, которые ссылаются на удаляемые файлы:

После удаления debug endpoints и скриптов нужно:

1. **Проверить README.md** - удалить ссылки на debug endpoints
2. **Проверить docs/** - удалить ссылки на удалённые скрипты
3. **Обновить документацию** - удалить упоминания одноразовых исправлений

**Риски:** ❌ НЕТ - улучшит читаемость документации

---

## 🎯 Итоговый план действий

### Шаг 1: Создать структуру папок
```bash
mkdir -p docs/db
mkdir -p db/archive/diagnose
mkdir -p db/archive/check
mkdir -p db/archive/fix
mkdir -p db/archive/test
mkdir -p db/archive/cleanup
```

### Шаг 2: Перенести документацию (14 файлов из корня + 15 из db/)
- Безопасно, без рисков

### Шаг 3: Удалить debug endpoints (5-6 файлов)
- **КРИТИЧНО ДЛЯ БЕЗОПАСНОСТИ**
- Высокий приоритет

### Шаг 4: Архивировать SQL скрипты (~45 файлов)
- Переместить в `db/archive/` вместо удаления
- Можно вернуть при необходимости

### Шаг 5: Очистить документацию
- Удалить неактуальные ссылки
- Обновить README.md

---

## ⚠️ Оценка рисков

| Действие | Риск | Приоритет | Можно откатить? |
|----------|------|-----------|-----------------|
| Перенос .md | ❌ НЕТ | Средний | ✅ Да |
| Удаление debug endpoints | 🔴 ВЫСОКИЙ (если не удалить) | 🔥 ВЫСОКИЙ | ✅ Да (git) |
| Архивирование SQL | ❌ НЕТ | Низкий | ✅ Да |
| Очистка документации | ❌ НЕТ | Низкий | ✅ Да (git) |

---

## 💡 Рекомендации

1. **ОБЯЗАТЕЛЬНО удалить debug endpoints** - это дыра в безопасности
2. **Архивировать, не удалять** SQL скрипты - могут пригодиться для reference
3. **Перенести документацию** - улучшит структуру проекта
4. **Сделать коммит после каждого шага** - легче откатить при необходимости

---

## 🚀 Готов начать?

Жду подтверждения для начала очистки!

