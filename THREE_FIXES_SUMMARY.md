# Исправление трех ошибок: характеристики, фото профиля и упрощение загрузки

## Ошибка 1: Характеристики не сохраняются ✅

### Проблема
Характеристики (`custom_attributes`), добавленные вручную, не сохранялись при редактировании профиля.

### Причина
В API endpoint `PUT /api/participants/[participantId]` поле `custom_attributes` не было включено в список `allowedFields`.

### Решение

**Файл**: `app/api/participants/[participantId]/route.ts`

**Было**:
```typescript
const allowedFields = [
  'full_name', 'first_name', 'last_name', 'username', 
  'email', 'phone', 'activity_score', 'risk_score', 
  'traits_cache', 'last_activity_at', 'source', 'status', 'notes'
];
```

**Стало**:
```typescript
const allowedFields = [
  'full_name', 'first_name', 'last_name', 'username', 
  'email', 'phone', 'activity_score', 'risk_score', 
  'traits_cache', 'last_activity_at', 'source', 'status', 'notes', 
  'custom_attributes' // ✅ Добавлено
];
```

**Результат**: Теперь `custom_attributes` корректно сохраняются в базу данных.

---

## Ошибка 2: Фото не отображается на странице профиля ✅

### Проблема
Фото профиля отображалось в списке участников (`MemberCard`), но не отображалось на странице детального профиля (`ParticipantProfileCard`).

### Причина
В `ParticipantProfileCard` использовался `currentPhotoUrl` state, который инициализировался из `participant.photo_url` только один раз при монтировании компонента. При обновлении `detail` (например, после загрузки фото) state не обновлялся.

### Решение

**Файл**: `components/members/participant-profile-card.tsx`

**Добавлено**:
```typescript
import { useState, useEffect } from 'react' // ✅ Добавлен useEffect

// ...

const [currentPhotoUrl, setCurrentPhotoUrl] = useState(participant.photo_url)

// ✅ Синхронизируем currentPhotoUrl с participant.photo_url при изменении
useEffect(() => {
  setCurrentPhotoUrl(participant.photo_url)
}, [participant.photo_url])
```

**Результат**: Фото автоматически обновляется при изменении `participant.photo_url`.

---

## Ошибка 3: Глючная обрезка фото ✅

### Проблема
Функция ручной обрезки фото работала нестабильно. Процесс был сложным и не интуитивным для пользователей.

### Решение
Полностью упростили процесс загрузки фото:

### 3.1. Упрощенный UI загрузки

**Файл**: `components/members/photo-upload-modal.tsx`

**Было**:
- Сложный компонент с canvas и mouse events
- Ручная обрезка через drag & drop
- ~300 строк кода

**Стало**:
- Простой выбор файла
- Автоматическая обработка на сервере
- Предпросмотр в круге
- ~220 строк кода

**Ключевые изменения**:

```typescript
// ❌ Удалено
const [crop, setCrop] = useState({ x: 0, y: 0, width: 0, height: 0 })
const [isDragging, setIsDragging] = useState(false)
const canvasRef = useRef<HTMLCanvasElement>(null)
const handleMouseDown, handleMouseMove, handleMouseUp
const getCroppedImage

// ✅ Добавлено
const [selectedFile, setSelectedFile] = useState<File | null>(null)

// Простая загрузка без обрезки
const handleUpload = async () => {
  const formData = new FormData()
  formData.append('file', selectedFile)
  formData.append('orgId', orgId)
  // Отправка на сервер - все остальное делает API
}
```

**UI предпросмотр**:
```tsx
<div className="relative w-48 h-48 overflow-hidden rounded-full border-4 border-gray-200">
  <img
    src={selectedImage}
    alt="Preview"
    className="w-full h-full object-cover" // ✅ CSS обрезка
  />
</div>
```

### 3.2. Автоматическая обработка на сервере

**Файл**: `app/api/participants/[participantId]/photo/route.ts`

**Было**:
```typescript
// Применение crop из формы
if (cropData) {
  const crop = JSON.parse(cropData)
  image = image.extract({
    left: Math.round(crop.x),
    top: Math.round(crop.y),
    width: Math.round(crop.width),
    height: Math.round(crop.height),
  })
}

const processedBuffer = await image
  .resize(400, 400, { fit: 'cover' })
  .webp({ quality: 85 })
  .toBuffer()
```

**Стало**:
```typescript
// ✅ Автоматическая обрезка по центру
const processedBuffer = await sharp(buffer)
  .resize(400, 400, { 
    fit: 'cover',      // Обрезает по центру, сохраняя пропорции
    position: 'center' // Центрирование
  })
  .webp({ quality: 90 }) // Увеличено качество
  .toBuffer()
```

**Преимущества**:
- `fit: 'cover'` - автоматически обрезает изображение до квадрата, сохраняя пропорции
- `position: 'center'` - центрирует изображение перед обрезкой
- Качество увеличено с 85 до 90 для лучшей четкости
- Удалены параметры `cropData` - больше не нужны

### 3.3. CSS-обрезка в профиле

**Файл**: `components/members/participant-profile-card.tsx`

Фото уже правильно отображается:
```tsx
<img
  src={currentPhotoUrl}
  alt={participant.full_name || 'User'}
  className="h-32 w-32 rounded-full border-4 border-white object-cover shadow-lg"
/>
```

**CSS классы**:
- `rounded-full` - делает изображение круглым
- `object-cover` - обрезает и центрирует содержимое
- `h-32 w-32` - фиксированный размер (128x128px)

**Как это работает**:
1. Изображение загружается как квадрат 400x400
2. CSS `rounded-full` делает его круглым
3. CSS `object-cover` автоматически центрирует и обрезает

---

## Визуальное сравнение

### Старый workflow (сложный):

```
1. Выбрать файл
2. Увидеть изображение
3. Вручную выделить область (drag & drop)
4. Если неправильно - повторить
5. Нажать "Сохранить"
6. На сервере: обрезать по координатам
7. Изменить размер
8. Сохранить

❌ Проблемы:
- Сложно выделить точную область
- Неудобно на мобильных устройствах
- Глючит при быстрых движениях мыши
```

### Новый workflow (простой):

```
1. Выбрать файл
2. Увидеть предпросмотр (уже в круге!)
3. Нажать "Сохранить"
4. На сервере: автоматическая обрезка по центру
5. Изменить размер
6. Сохранить

✅ Преимущества:
- Один клик
- Работает на всех устройствах
- Всегда предсказуемый результат
- Быстро и надежно
```

---

## Измененные файлы

### 1. Backend
- ✅ `app/api/participants/[participantId]/route.ts`
  - Добавлено `'custom_attributes'` в `allowedFields`

- ✅ `app/api/participants/[participantId]/photo/route.ts`
  - Удален параметр `cropData`
  - Упрощена обработка изображения
  - Автоматическая обрезка по центру через sharp

### 2. Frontend
- ✅ `components/members/photo-upload-modal.tsx`
  - Полностью переписан компонент
  - Удалена ручная обрезка
  - Добавлен предпросмотр в круге
  - Упрощена логика загрузки

- ✅ `components/members/participant-profile-card.tsx`
  - Добавлен `useEffect` для синхронизации `currentPhotoUrl`
  - Фото корректно отображается в круге через CSS

---

## Технические детали

### Sharp обработка изображений

```typescript
await sharp(buffer)
  .resize(400, 400, { 
    fit: 'cover',      // Варианты: contain, cover, fill, inside, outside
    position: 'center' // Варианты: center, top, bottom, left, right, ...
  })
  .webp({ quality: 90 })
  .toBuffer()
```

**`fit: 'cover'`**:
- Изображение масштабируется, чтобы полностью покрыть целевой размер
- Пропорции сохраняются
- Лишнее обрезается

**`position: 'center'`**:
- Изображение центрируется перед обрезкой
- Обрезка одинаковая со всех сторон

### CSS обрезка

```css
.rounded-full {
  border-radius: 9999px; /* Делает круг */
}

.object-cover {
  object-fit: cover; /* Обрезка и центрирование */
}
```

---

## Проверка исправлений

### Тест 1: Характеристики сохраняются

```
1. Открыть профиль участника
2. Нажать "Редактировать"
3. Добавить характеристику: "Должность" = "Менеджер"
4. Нажать "Сохранить"
5. Перейти на другую страницу
6. Вернуться в профиль
7. ✅ Характеристика отображается
```

### Тест 2: Фото отображается в профиле

```
1. Открыть профиль участника с фото
2. ✅ Фото отображается в профиле
3. Загрузить новое фото
4. ✅ Фото автоматически обновляется без перезагрузки страницы
```

### Тест 3: Упрощенная загрузка фото

```
1. Открыть профиль
2. Нажать кнопку загрузки фото (иконка камеры)
3. Выбрать изображение (любого размера/пропорции)
4. ✅ Предпросмотр показывает изображение в круге
5. Нажать "Сохранить"
6. ✅ Фото загружается и отображается
7. ✅ Фото обрезано по центру и отображается в круге
8. ✅ Размер оптимизирован (400x400 WebP)
```

### Тест 4: Различные форматы изображений

```
Протестировать загрузку:
- Квадратное изображение (1000x1000)
  ✅ Результат: полное изображение, без обрезки
  
- Горизонтальное (1920x1080)
  ✅ Результат: обрезаны левая и правая части
  
- Вертикальное (1080x1920)
  ✅ Результат: обрезаны верхняя и нижняя части
  
- Очень маленькое (100x100)
  ✅ Результат: увеличено до 400x400
  
- Очень большое (4000x4000)
  ✅ Результат: уменьшено до 400x400
```

---

## Преимущества после исправлений

### Характеристики
- ✅ Надежное сохранение
- ✅ Персистентность при навигации
- ✅ Нет потери данных

### Фото профиля
- ✅ Отображается везде (список + профиль)
- ✅ Автоматическое обновление UI
- ✅ Синхронизация state с props

### Загрузка фото
- ✅ Простой и интуитивный процесс
- ✅ Один клик вместо сложных действий
- ✅ Предсказуемый результат
- ✅ Работает на всех устройствах
- ✅ Автоматическая оптимизация (WebP, 400x400)
- ✅ Меньше кода, меньше багов

---

## Заключение

Все три ошибки исправлены:

1. ✅ **Характеристики сохраняются** - добавлено `custom_attributes` в allowed fields
2. ✅ **Фото отображается** - добавлен useEffect для синхронизации state
3. ✅ **Загрузка упрощена** - убрана ручная обрезка, добавлена автоматическая обработка

Код стал проще, надежнее и удобнее в использовании! 🎉

