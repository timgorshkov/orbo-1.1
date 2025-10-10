# Функционал загрузки фотографий участников

## Обзор

Реализован полный функционал загрузки, обрезки и управления фотографиями профилей участников.

---

## Возможности

✅ **Загрузка фото**
- Поддержка форматов: JPG, PNG, WebP
- Автоматическая оптимизация (конвертация в WebP, сжатие)
- Финальный размер: 400x400px

✅ **Обрезка фото**
- Интерактивный выбор области обрезки
- Квадратная область (для круглых аватаров)
- Превью в реальном времени

✅ **Управление**
- Загрузка новой фотографии
- Замена текущей фотографии
- Удаление фотографии

✅ **Безопасность**
- Проверка прав доступа (админ или свой профиль)
- Хранение в Supabase Storage
- Публичный доступ на чтение

---

## Архитектура

### 1. База данных

**Таблица:** `participants`
- Новая колонка: `photo_url TEXT`
- Индекс для оптимизации запросов

**Storage Bucket:** `participant-photos`
- Публичный доступ на чтение
- Ограничение размера: 5MB
- Разрешенные форматы: image/jpeg, image/png, image/webp

### 2. API Endpoint

**`POST /api/participants/[participantId]/photo`**

**Параметры (FormData):**
```typescript
{
  file: File,           // Файл изображения
  orgId: string,        // ID организации
  crop: string          // JSON с координатами обрезки (optional)
}
```

**Процесс обработки:**
1. Проверка авторизации и прав доступа
2. Получение файла из FormData
3. Обрезка изображения (если указаны координаты)
4. Конвертация в WebP 400x400
5. Удаление старой фотографии (если есть)
6. Загрузка в Storage
7. Обновление `photo_url` в базе данных

**Ответ:**
```json
{
  "photo_url": "https://..."
}
```

**`DELETE /api/participants/[participantId]/photo`**

**Параметры (JSON):**
```json
{
  "orgId": "uuid"
}
```

**Процесс:**
1. Проверка прав доступа
2. Удаление файла из Storage
3. Установка `photo_url = null`

---

### 3. Frontend Components

#### `components/members/photo-upload-modal.tsx`

**Функционал:**
- Выбор файла
- Интерактивная обрезка (drag to select area)
- Превью выбранной области
- Canvas API для клиентской обрезки
- Загрузка на сервер
- Удаление текущего фото

**Интерфейс:**
```typescript
interface PhotoUploadModalProps {
  isOpen: boolean
  onClose: () => void
  currentPhotoUrl: string | null
  participantId: string
  orgId: string
  onPhotoUpdate: (photoUrl: string | null) => void
}
```

**Процесс обрезки:**
1. Пользователь выбирает файл
2. Файл загружается как Data URL и отображается
3. Пользователь выделяет квадратную область (drag)
4. Canvas API обрезает изображение на клиенте
5. Обрезанное изображение отправляется на сервер

#### `components/members/participant-profile-card-new.tsx`

**Интеграция:**
- Кнопка с иконкой камеры на фото профиля
- Отображается только для пользователей с правом редактирования
- Открывает `PhotoUploadModal`
- Обновляет UI после загрузки

---

## Установка

### Шаг 1: Применить миграцию

```bash
# В Supabase SQL Editor выполните:
```

```sql
-- Файл: db/migrations/24_participant_photos.sql

-- 1. Добавить колонку
ALTER TABLE participants 
ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- 2. Создать storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('participant-photos', 'participant-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Применить политики (смотрите полный файл)
```

### Шаг 2: Установить зависимости

```bash
npm install sharp
# sharp используется для обработки изображений на сервере
```

### Шаг 3: Настроить Storage в Supabase Dashboard

1. Откройте Supabase Dashboard → Storage
2. Проверьте, что bucket `participant-photos` создан
3. Настройте параметры:
   - **Public:** Yes
   - **File size limit:** 5MB
   - **Allowed MIME types:** image/jpeg, image/png, image/webp

### Шаг 4: Проверить переменные окружения

Убедитесь, что в `.env` есть:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

---

## Использование

### Для пользователей

#### 1. Загрузить фото

1. Откройте профиль участника (`/app/[org]/members/[id]`)
2. Наведите на фото профиля
3. Нажмите кнопку с иконкой камеры
4. В модальном окне:
   - Нажмите "Выберите изображение"
   - Выберите файл (JPG, PNG, WebP)
   - **Выделите квадратную область** для обрезки (нажмите и перетащите)
   - Нажмите "Сохранить"

#### 2. Заменить фото

1. Откройте профиль
2. Нажмите кнопку камеры
3. Выберите новое изображение
4. Выделите область и сохраните
5. Старое фото будет автоматически удалено

#### 3. Удалить фото

1. Откройте профиль
2. Нажмите кнопку камеры
3. В модальном окне нажмите "Удалить текущее фото"
4. Подтвердите удаление

---

## Права доступа

| Действие | Owner | Admin | Member (свой профиль) | Member (чужой) |
|----------|-------|-------|-----------------------|----------------|
| Просмотр фото | ✅ | ✅ | ✅ | ✅ |
| Загрузка фото | ✅ | ✅ | ✅ | ❌ |
| Замена фото | ✅ | ✅ | ✅ | ❌ |
| Удаление фото | ✅ | ✅ | ✅ | ❌ |

**Логика проверки:**
```typescript
// Админ или свой профиль через Telegram
const isAdmin = role === 'owner' || role === 'admin'
const isOwnProfile = telegramAccount?.user_id === user.id
const canEdit = isAdmin || isOwnProfile
```

---

## Технические детали

### Обработка изображений (Sharp)

**Параметры:**
```typescript
await sharp(buffer)
  .resize(400, 400, { fit: 'cover' })  // Квадрат 400x400
  .webp({ quality: 85 })                // WebP сжатие
  .toBuffer()
```

**Преимущества WebP:**
- Меньший размер файла (на 25-35% меньше JPEG)
- Хорошее качество
- Широкая поддержка браузеров

### Canvas API для обрезки на клиенте

```typescript
const canvas = document.createElement('canvas')
const ctx = canvas.getContext('2d')

// Масштабирование координат
const scaleX = image.naturalWidth / image.width
const scaleY = image.naturalHeight / image.height

// Обрезка
ctx.drawImage(
  image,
  crop.x * scaleX, crop.y * scaleY,
  crop.width * scaleX, crop.height * scaleY,
  0, 0,
  canvas.width, canvas.height
)

// Конвертация в Blob
canvas.toBlob((blob) => {
  // Отправить на сервер
}, 'image/jpeg', 0.95)
```

### Именование файлов

```typescript
const fileName = `${participantId}-${Date.now()}.webp`
const filePath = `${orgId}/${fileName}`
```

**Формат:** `[orgId]/[participantId]-[timestamp].webp`

**Пример:** `11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222-1696435200000.webp`

---

## Troubleshooting

### Проблема: "Failed to upload photo"

**Причина:** Недостаточно прав или bucket не создан

**Решение:**
1. Проверьте, что bucket `participant-photos` существует
2. Проверьте RLS политики в Storage
3. Проверьте `SUPABASE_SERVICE_ROLE_KEY` в `.env`

### Проблема: Фото не отображается

**Причина:** Неправильный URL или bucket не публичный

**Решение:**
1. Откройте URL фото в браузере напрямую
2. Проверьте настройки bucket (должен быть Public)
3. Проверьте политику "Public read access"

### Проблема: "sharp is not defined"

**Причина:** Библиотека sharp не установлена

**Решение:**
```bash
npm install sharp
```

### Проблема: Обрезка работает неправильно

**Причина:** Не выделена область перед сохранением

**Решение:**
1. После выбора файла **обязательно выделите квадратную область**
2. Нажмите мышкой и перетащите для выделения
3. Кнопка "Сохранить" активируется только после выделения

---

## Best Practices

### 1. Размер файлов
- Рекомендуемый размер оригинала: до 2MB
- Финальный размер: ~30-50KB (WebP)

### 2. Форматы
- Загружайте: JPG, PNG, WebP
- Храним: WebP (оптимизация)

### 3. Безопасность
- Всегда проверяем права доступа
- Используем Service Role Key для Storage операций
- Валидируем MIME types

### 4. UX
- Показываем превью перед загрузкой
- Индикатор загрузки ("Загрузка...")
- Подтверждение удаления
- Понятные сообщения об ошибках

---

## Roadmap

### Планируется:
- [ ] Поддержка drag'n'drop для загрузки
- [ ] Автоматическое определение лиц (face detection)
- [ ] Фильтры и эффекты
- [ ] Загрузка фото с камеры (мобильные устройства)
- [ ] История фотографий профиля
- [ ] Модерация загружаемых изображений

---

## API Reference

### POST /api/participants/[participantId]/photo

**Request:**
```typescript
Content-Type: multipart/form-data

file: File
orgId: string
crop?: string  // JSON: { x, y, width, height }
```

**Response:**
```json
{
  "photo_url": "https://[project].supabase.co/storage/v1/object/public/participant-photos/[orgId]/[filename].webp"
}
```

**Errors:**
- `401` - Unauthorized
- `403` - Forbidden (no access)
- `404` - Participant not found
- `500` - Server error

### DELETE /api/participants/[participantId]/photo

**Request:**
```json
{
  "orgId": "uuid"
}
```

**Response:**
```json
{
  "success": true
}
```

---

**Дата:** 10.10.2025  
**Статус:** ✅ Реализовано  
**Версия:** 1.0

