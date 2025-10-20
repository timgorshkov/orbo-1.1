# Profile Page Display Fix - Исправление отображения данных

## Проблема
После внедрения shadow профилей страница профиля работала некорректно:
1. **При первой загрузке** все поля пустые
2. **При переходе в редактирование** поля тоже пустые
3. **После сохранения** данные появляются
4. **После перезагрузки страницы** снова все поля пустые
5. НО данные в базе сохраняются корректно

## Причина
Блоки отображения данных были обёрнуты в условия, которые проверяли наличие специфичных полей:
- `{profile.participant?.bio && (...)}`
- `{(profile.participant?.email || profile.participant?.phone || profile.participant?.username) && (...)}`
- `{(profile.participant?.first_name || profile.participant?.last_name) && (...)}`

**Если у участника были только `full_name` и `tg_user_id`, то не отображался ни один блок!**

## Решение

### 1. Обновлена структура отображения данных
**Файл:** `app/app/[org]/profile/page.tsx`

**Изменения:**
- Добавлен блок "Основная информация", который **ВСЕГДА** отображается, если есть `profile.participant`
- Блок показывает:
  - Полное имя (`full_name`)
  - Telegram username (`@username`)
  - Telegram ID (`tg_user_id`)
  - Имя и Фамилия из Telegram (если есть)
  - Источник
  - Последняя активность

```tsx
{/* Основная информация - ВСЕГДА показываем */}
{profile.participant && (
  <div>
    <h3 className="text-sm font-semibold text-gray-700 mb-3">Основная информация</h3>
    <div className="space-y-2">
      {/* Полное имя */}
      {profile.participant.full_name && (
        <div className="flex items-center gap-2 text-sm">
          <User className="h-4 w-4 text-gray-400" />
          <span className="text-gray-600">Имя:</span>
          <span className="font-medium text-gray-900">{profile.participant.full_name}</span>
        </div>
      )}
      
      {/* Telegram username */}
      {profile.participant.username && (
        <div className="flex items-center gap-2 text-sm">
          <MessageSquare className="h-4 w-4 text-gray-400" />
          <span className="text-gray-600">Telegram:</span>
          <span className="font-medium text-gray-900">@{profile.participant.username}</span>
        </div>
      )}
      
      {/* Telegram ID */}
      {profile.participant.tg_user_id && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-600">Telegram ID:</span>
          <span className="font-medium text-gray-900">{profile.participant.tg_user_id}</span>
        </div>
      )}
      
      {/* ... остальные поля */}
    </div>
  </div>
)}
```

### 2. Улучшена инициализация формы редактирования
**Файл:** `app/app/[org]/profile/page.tsx`

**Изменения:**
- При нажатии кнопки "Редактировать" форма теперь **явно инициализируется** данными из `profile.participant`
- Добавлено логирование для отладки

```tsx
<Button
  onClick={() => {
    // Инициализируем форму при переходе в режим редактирования
    if (profile.participant) {
      setEditForm({
        full_name: profile.participant.full_name || '',
        bio: profile.participant.bio || ''
      })
      console.log('[Profile Page] Edit mode activated, form initialized:', {
        full_name: profile.participant.full_name || '',
        bio: profile.participant.bio || ''
      })
    }
    setIsEditing(true)
  }}
  variant="outline"
  size="sm"
>
  <Edit2 className="h-4 w-4 mr-2" />
  Редактировать
</Button>
```

### 3. Добавлено логирование в API профиля
**Файл:** `app/api/user/profile/route.ts`

**Изменения:**
- Добавлены логи при поиске `participant` по `tg_user_id`
- Добавлены логи при поиске `participant` по `user_id` (для shadow профилей)
- Логи показывают, какие данные найдены и возвращены

```typescript
console.log(`[Profile API] Looking for participant by user_id: ${user.id}`);
const { data: participantData, error: participantError } = await adminSupabase
  .from('participants')
  .select('...')
  .eq('org_id', orgId)
  .eq('user_id', user.id)
  .is('merged_into', null)
  .maybeSingle();

if (participantError) {
  console.error('[Profile API] Error fetching participant by user_id:', participantError);
} else {
  console.log(`[Profile API] Participant found by user_id:`, !!participantData);
  if (participantData) {
    console.log('[Profile API] Participant data:', {
      id: participantData.id,
      full_name: participantData.full_name,
      username: participantData.username,
      tg_user_id: participantData.tg_user_id
    });
  }
}
```

### 4. Добавлено логирование на странице профиля
**Файл:** `app/app/[org]/profile/page.tsx`

**Изменения:**
- Добавлены логи при загрузке профиля
- Логи показывают, найден ли `participant` и какие данные пришли

```typescript
console.log('[Profile Page] Profile loaded:', {
  hasParticipant: !!data.profile.participant,
  participantData: data.profile.participant
})

if (data.profile.participant) {
  setEditForm({
    full_name: data.profile.participant.full_name || '',
    bio: data.profile.participant.bio || ''
  })
  console.log('[Profile Page] Edit form initialized:', {
    full_name: data.profile.participant.full_name || '',
    bio: data.profile.participant.bio || ''
  })
} else {
  console.warn('[Profile Page] No participant data found in profile')
}
```

## Деплой

### 1. Закоммитьте и задеплойте изменения:
```bash
git add -A
git commit -m "fix: profile page display and form initialization"
git push
```

### 2. После деплоя проверьте:
1. Откройте страницу профиля
2. Проверьте, что блок "Основная информация" отображается
3. Проверьте браузерную консоль (F12) на наличие логов:
   - `[Profile API] Looking for participant by user_id`
   - `[Profile API] Participant found by user_id`
   - `[Profile Page] Profile loaded`
   - `[Profile Page] Edit form initialized`

### 3. Если проблема сохраняется:
Отправьте логи из браузерной консоли и Vercel logs. Это поможет понять:
- Возвращает ли API `participant`
- Какие данные приходят на страницу
- Инициализируется ли форма редактирования

## Ожидаемое поведение после исправления

✅ **При первой загрузке:**
- Отображается блок "Основная информация"
- Показывается полное имя, username или Telegram ID
- Показывается источник и последняя активность (если есть)

✅ **При переходе в редактирование:**
- Поля "Полное имя" и "Описание" заполнены текущими данными
- Можно редактировать и сохранять изменения

✅ **После сохранения:**
- Данные обновляются в базе
- Страница показывает обновлённые данные
- Можно перезагрузить страницу, и данные останутся

✅ **Для shadow профилей:**
- Кнопка "Редактировать" не отображается
- Показывается предупреждение о необходимости подтвердить email

## Связанные файлы
- `app/app/[org]/profile/page.tsx` - страница профиля
- `app/api/user/profile/route.ts` - API профиля
- `docs/SHADOW_ADMIN_PROFILE_FIX.md` - предыдущее исправление для shadow админов

## Дата
2025-10-19

## Автор
AI Assistant (Claude Sonnet 4.5)

