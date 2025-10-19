# Замена терминологии: Организация → Пространство

## ✅ Обновлённые файлы:

### Навигация и layout:
- [x] `components/navigation/collapsible-sidebar.tsx` - кнопки переключения
- [x] `app/app/page.tsx` - список организаций → пространств
- [x] `app/app/[org]/settings/page.tsx` - заголовок "Настройки пространства"
- [x] `app/app/[org]/members/page.tsx` - описание
- [x] `app/app/[org]/dashboard/page.tsx` - Welcome block
- [x] `components/events/events-list.tsx` - "Для участников пространства"

## 📋 Файлы, требующие обновления:

### Компоненты settings:
- [ ] `components/settings/organization-settings-form.tsx`
  - Заголовок "Настройки организации" → "Настройки пространства"
  - Placeholder "Название организации" → "Название пространства"
  
- [ ] `components/settings/organization-team.tsx`
  - "Команда организации" → "Команда пространства"
  - Описания и подсказки

### Dashboard компоненты:
- [ ] `components/dashboard/onboarding-checklist.tsx`
  - Текст онбординга
  
- [ ] `components/dashboard/welcome-block.tsx`
  - Приветственный текст

### Другие компоненты:
- [ ] `components/members/member-profile-modal.tsx`
  - Упоминания организации в профиле
  
- [ ] `components/events/event-detail.tsx`
  - Описания событий
  
- [ ] `components/materials/materials-page-viewer.tsx`
  - Заголовки и описания
  
- [ ] `components/organization-switcher.tsx`
  - Переключатель организаций → пространств

### Страницы:
- [ ] `app/p/[org]/events/[id]/page.tsx` - публичные события
- [ ] `components/events/public-event-detail.tsx` - текст для публики
- [ ] `app/join/[org]/[token]/client.tsx` - текст приглашений
- [ ] `app/login/telegram/client.tsx` - текст авторизации

### Документация:
- [ ] `README.md`
- [ ] `SETUP_GUIDE.md`
- [ ] `TELEGRAM_AUTH_COMPLETE.md`
- [ ] Другие `.md` файлы

## Рекомендации по дальнейшей замене:

### 1. UI тексты (высокий приоритет):
```bash
# Найти все упоминания для замены:
grep -ri "организаци" components/
grep -ri "организаци" app/app/
```

### 2. Варианты замены:
- "организация" → "пространство"
- "организации" → "пространства"
- "организацией" → "пространством"
- "организацию" → "пространство"
- "organization" → "workspace" (в переменных, если нужно)

### 3. Где НЕ менять:
- Названия таблиц в БД (`organizations`)
- Названия API endpoints (`/api/organizations/...`)
- Внутренние переменные кода (если не критично для UX)
- Комментарии в коде (опционально)

## Преимущества термина "пространство":

1. **Более понятно пользователям** - "пространство" ассоциируется с местом для работы
2. **Менее формально** - чем "организация"
3. **Гибче** - подходит для разных типов сообществ (не только формальных организаций)
4. **Соответствует современным трендам** - Slack uses "workspace", Notion uses "workspace"

## Следующие шаги:

1. Обновить оставшиеся компоненты settings и dashboard
2. Проверить все пользовательские сообщения и уведомления
3. Обновить документацию для пользователей
4. Протестировать UI на консистентность терминологии

---

**Дата:** 2025-10-10  
**Статус:** Основные экраны обновлены, детализация в процессе

