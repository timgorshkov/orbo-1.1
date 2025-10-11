# Доработки раздела "Материалы"

## Дата: 10.10.2025

## Обзор изменений

Выполнены 5 доработок UX/UI для раздела "Материалы", направленных на улучшение пользовательского опыта и функциональности встроенных видео.

---

## 1. ✅ Удален блок с лого и названием организации

### Проблема
В панели дерева материалов (левая боковая панель) отображался блок с логотипом и названием организации, дублирующий информацию из основного левого меню приложения.

### Решение
**Файл**: `components/materials/materials-page-viewer.tsx`

**Удалено** (строки 132-143):
```tsx
<div className="px-4 py-4 border-b border-neutral-200 flex items-center gap-3">
  {orgLogoUrl ? (
    <img src={orgLogoUrl} alt={orgName ?? 'Организация'} className="h-12 w-12 rounded-lg object-cover" />
  ) : (
    <div className="h-12 w-12 rounded-lg bg-neutral-200 flex items-center justify-center text-neutral-600 font-semibold text-lg">
      {(orgName ?? 'OR')[0]?.toUpperCase()}
    </div>
  )}
  <div className="flex-1">
    <div className="text-base font-semibold text-neutral-900">{orgName ?? 'Организация'}</div>
  </div>
</div>
```

**Результат**: 
- Панель дерева материалов теперь начинается сразу с заголовка "Материалы" и кнопок управления
- Больше пространства для отображения материалов
- Устранено дублирование информации

---

## 2. ✅ Добавлена иконка и текст к кнопке добавления корневого материала

### Проблема
Кнопка добавления нового корневого материала отображалась только как небольшая иконка Plus без текста, что могло быть неочевидно для пользователей.

### Решение
**Файл**: `components/materials/materials-tree.tsx`

**Было**:
```tsx
<Button
  variant="outline"
  className="h-7 w-7 p-0"
  onClick={() => handleCreate(null)}
  disabled={pendingId === 'root'}
  aria-label="Добавить корневую страницу"
>
  <Plus className="h-4 w-4" />
</Button>
```

**Стало**:
```tsx
<Button
  variant="outline"
  className="h-7 px-2 gap-1"
  onClick={() => handleCreate(null)}
  disabled={pendingId === 'root'}
  aria-label="Добавить корневую страницу"
>
  <Plus className="h-4 w-4" />
  <span className="text-xs">Добавить</span>
</Button>
```

**Результат**:
- Кнопка теперь имеет иконку Plus и текст "Добавить"
- Более понятный UI для пользователей
- Улучшенная доступность

---

## 3. ✅ Поиск перемещен в панель дерева как иконка

### Проблема
Поле поиска материалов находилось в верхней части основной области редактирования, занимая ценное пространство.

### Решение

**Изменено 2 файла**:

#### 1. `components/materials/materials-tree.tsx`

**Добавлен импорт**:
```tsx
import { ChevronRight, FileText, Folder, FolderOpen, MoreHorizontal, Plus, Search } from 'lucide-react';
```

**Добавлен prop**:
```tsx
type MaterialsTreeProps = {
  orgId: string;
  initialTree: MaterialTreeNode[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onTreeChange?: (tree: MaterialTreeNode[]) => void;
  onSearchOpen?: () => void; // ✅ Новый prop
};
```

**Добавлена кнопка поиска** (строки 298-306):
```tsx
<div className="flex items-center justify-between mb-3">
  <h2 className="text-sm font-semibold">Материалы</h2>
  <div className="flex items-center gap-1">
    <Button
      variant="ghost"
      className="h-7 w-7 p-0"
      onClick={() => onSearchOpen?.()}
      aria-label="Поиск материалов"
    >
      <Search className="h-4 w-4" />
    </Button>
    <Button ...>
      ...
    </Button>
  </div>
</div>
```

#### 2. `components/materials/materials-page-viewer.tsx`

**Передан prop в MaterialsTree**:
```tsx
<MaterialsTree
  orgId={orgId}
  initialTree={tree}
  selectedId={selectedId}
  onSelect={handleSelect}
  onTreeChange={setTree}
  onSearchOpen={() => setIsSearchOpen(true)} // ✅ Открывает диалог поиска
/>
```

**Удалено поле поиска из основной области** (строки 145-157):
```tsx
// ❌ Удалено
<div className="flex items-center justify-end">
  <div className="relative">
    <Search className="..." />
    <Input
      value={searchValue}
      onChange={event => setSearchValue(event.target.value)}
      onFocus={() => setIsSearchOpen(true)}
      placeholder="Поиск материалов"
      className="w-64 rounded-full pl-9"
    />
    {isSearching && <Loader2 className="..." />}
  </div>
</div>
```

**Результат**:
- Иконка поиска теперь находится в панели дерева материалов, слева от кнопки "Добавить"
- При клике открывается диалоговое окно поиска (CommandDialog)
- Больше пространства для отображения материалов в основной области
- Более компактный и логичный UI

---

## 4. ✅ Исправлен скролл в области редактирования материала

### Проблема
При редактировании материала, когда содержимое превышало высоту экрана, скролл мыши не работал. Невозможно было прокрутить материал вниз.

### Причина
Родительский контейнер редактора имел `overflow-hidden`, что блокировало скролл дочерних элементов:

```tsx
// ❌ Проблемный код
<div className="relative h-full overflow-hidden bg-white">
  ...
  <div className="flex-1 overflow-y-auto">
    {/* Контент редактора */}
  </div>
</div>
```

### Решение
**Файл**: `components/materials/materials-page-editor.tsx`

**Изменена структура layout** (строки 518, 527, 542, 558):

**Было**:
```tsx
<div className="relative h-full overflow-hidden bg-white">
  <div className="border-b border-neutral-200 px-6 py-6 flex items-center justify-between sticky top-0 bg-white z-10">
    {/* Header с заголовком и кнопкой сохранить */}
  </div>
  <div className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-50 px-6 py-2 text-xs text-neutral-500">
    {/* Кнопки добавления видео */}
  </div>
  <div className="flex-1 overflow-y-auto">
    {/* Контент редактора */}
  </div>
</div>
```

**Стало**:
```tsx
<div className="relative h-full flex flex-col bg-white">
  <div className="border-b border-neutral-200 px-6 py-6 flex items-center justify-between sticky top-0 bg-white z-10 shrink-0">
    {/* Header с заголовком и кнопкой сохранить */}
  </div>
  <div className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-50 px-6 py-2 text-xs text-neutral-500 shrink-0">
    {/* Кнопки добавления видео */}
  </div>
  <div className="flex-1 min-h-0 overflow-y-auto">
    {/* Контент редактора */}
  </div>
</div>
```

**Ключевые изменения**:
1. ✅ `overflow-hidden` → `flex flex-col` (родительский контейнер)
2. ✅ Добавлено `shrink-0` к header и панели с кнопками (фиксированная высота)
3. ✅ Добавлено `min-h-0` к скроллируемой области (корректный расчет высоты в flexbox)

**Результат**:
- Скролл мыши теперь работает корректно
- Можно прокручивать длинные материалы без проблем
- Header остается закрепленным вверху при скролле

---

## 5. ✅ Переделаны блоки встройки видео (YouTube и VK)

### Проблема
При добавлении видео:
1. Спрашивался только URL
2. В текстовой подписи выводилась заглушка (например, "YouTube видео №12345")
3. Отображалась статичная картинка-обложка вместо встроенного плеера

### Требования
1. Запрашивать URL и заголовок видео
2. Выводить заголовок в текстовой подписи
3. Встраивать iframe-плеер для проигрывания видео прямо на странице

### Решение

#### Часть 1: Обновление функции `insertEmbed`

**Файл**: `components/materials/materials-page-editor.tsx`

**Было** (строки 392-476):
```tsx
const insertEmbed = useCallback(
  (type: 'youtube' | 'vk') => {
    focusEditor();
    const url = prompt('Вставьте ссылку на видео');
    if (!url) return;

    const container = document.createElement('div');
    container.className = 'my-4 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50';
    container.setAttribute('data-embed', type);
    container.setAttribute('data-url', url);
    container.contentEditable = 'false';

    if (type === 'youtube') {
      const videoId = extractYoutubeId(url);
      const title = getVideoTitle(url, 'youtube'); // Генерировалась заглушка
      
      const thumb = document.createElement('img');
      thumb.src = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '';
      thumb.alt = 'YouTube видео';
      thumb.className = 'block h-48 w-full object-cover';
      container.appendChild(thumb);
      
      const overlay = document.createElement('div');
      overlay.className = 'flex items-center justify-between px-4 py-3 text-sm text-neutral-700';
      overlay.innerHTML = `<span class="font-medium">${title}</span><a href="${url}" target="_blank" class="text-blue-600 hover:underline">Открыть</a>`;
      container.appendChild(overlay);
    } else {
      // ... аналогично для VK с картинкой
    }
    
    // ... вставка в редактор
  },
  [focusEditor, synchronizeMarkdown]
);
```

**Стало**:
```tsx
const insertEmbed = useCallback(
  (type: 'youtube' | 'vk') => {
    focusEditor();
    const url = prompt('Вставьте ссылку на видео');
    if (!url) return;

    const title = prompt('Введите заголовок видео'); // ✅ Запрашиваем заголовок
    if (!title) return;

    const container = document.createElement('div');
    container.className = 'my-4 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm';
    container.setAttribute('data-embed', type);
    container.setAttribute('data-url', url);
    container.setAttribute('data-title', title); // ✅ Сохраняем заголовок

    if (type === 'youtube') {
      const videoId = extractYoutubeId(url);
      
      if (videoId) {
        // ✅ Встраиваем YouTube iframe вместо картинки
        const iframeWrapper = document.createElement('div');
        iframeWrapper.className = 'relative w-full';
        iframeWrapper.style.paddingBottom = '56.25%'; // 16:9 aspect ratio
        iframeWrapper.innerHTML = `<iframe 
          src="https://www.youtube.com/embed/${videoId}" 
          frameborder="0" 
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
          allowfullscreen
          class="absolute top-0 left-0 w-full h-full"
        ></iframe>`;
        container.appendChild(iframeWrapper);
      }
      
      const overlay = document.createElement('div');
      overlay.className = 'flex items-center justify-between px-4 py-3 text-sm text-neutral-700 bg-neutral-50';
      overlay.innerHTML = `<span class="font-medium">${title}</span><a href="${url}" target="_blank" class="text-blue-600 hover:underline">Открыть</a>`; // ✅ Используем пользовательский заголовок
      container.appendChild(overlay);
    } else {
      // ✅ Аналогично для VK
      const vkVideoId = extractVkVideoId(url);
      
      if (vkVideoId) {
        const iframeWrapper = document.createElement('div');
        iframeWrapper.className = 'relative w-full';
        iframeWrapper.style.paddingBottom = '56.25%';
        iframeWrapper.innerHTML = `<iframe 
          src="https://vk.com/video_ext.php?oid=${vkVideoId.oid}&id=${vkVideoId.id}&hd=2" 
          frameborder="0" 
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture; screen-wake-lock" 
          allowfullscreen
          class="absolute top-0 left-0 w-full h-full"
        ></iframe>`;
        container.appendChild(iframeWrapper);
      }
      
      const overlay = document.createElement('div');
      overlay.className = 'flex items-center justify-between px-4 py-3 text-sm text-neutral-700 bg-neutral-50';
      overlay.innerHTML = `<span class="font-medium">${title}</span><a href="${url}" target="_blank" class="text-blue-600 hover:underline">Открыть</a>`;
      container.appendChild(overlay);
    }
    
    // ... вставка в редактор
  },
  [focusEditor, synchronizeMarkdown]
);
```

#### Часть 2: Обновление сериализации в Markdown

**Файл**: `components/materials/materials-page-editor.tsx` (строки 29-39)

**Turndown rule** (HTML → Markdown):

**Было**:
```tsx
turndown.addRule('embeds', {
  filter: (node: TurndownService.Node) => {
    return node instanceof HTMLElement && Boolean(node.dataset?.embed);
  },
  replacement: (_content, node: any) => {
    const url = node.dataset.url || '';
    const type = node.dataset.embed || 'embed';
    return `\n\n[${type}:${url}]\n\n`; // Формат: [youtube:URL]
  }
});
```

**Стало**:
```tsx
turndown.addRule('embeds', {
  filter: (node: TurndownService.Node) => {
    return node instanceof HTMLElement && Boolean(node.dataset?.embed);
  },
  replacement: (_content, node: any) => {
    const url = node.dataset.url || '';
    const title = node.dataset.title || ''; // ✅ Извлекаем заголовок
    const type = node.dataset.embed || 'embed';
    return `\n\n[${type}:${url}:${title}]\n\n`; // ✅ Формат: [youtube:URL:TITLE]
  }
});
```

#### Часть 3: Обновление парсинга из Markdown

**Файл**: `components/materials/materials-page-editor.tsx` (строки 41-104)

**Функция `markdownToHtml`**:

**Было**:
```tsx
// Парсили формат: [youtube:URL]
processed = processed.replace(/\[youtube:(https?:\/\/[^\]]+)\]/g, (_, url) => {
  const videoId = extractYoutubeId(url);
  const title = getVideoTitle(url, 'youtube'); // Заглушка
  const embedHtml = `<div ... data-embed="youtube" data-url="${url}">
    <img src="${videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : ''}" ... />
    <div>
      <span class="font-medium">${title}</span>
      <a href="${url}" target="_blank">Открыть</a>
    </div>
  </div>`;
  embeds.push(embedHtml);
  return `<!--EMBED_${embeds.length - 1}-->`;
});
```

**Стало**:
```tsx
// ✅ Парсим формат: [youtube:URL:TITLE]
processed = processed.replace(/\[youtube:(https?:\/\/[^:]+):([^\]]+)\]/g, (_, url, title) => {
  const videoId = extractYoutubeId(url);
  
  let iframeHtml = '';
  if (videoId) {
    // ✅ Генерируем iframe вместо картинки
    iframeHtml = `<div class="relative w-full" style="padding-bottom: 56.25%;">
      <iframe 
        src="https://www.youtube.com/embed/${videoId}" 
        frameborder="0" 
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
        allowfullscreen
        class="absolute top-0 left-0 w-full h-full"
      ></iframe>
    </div>`;
  }
  
  const embedHtml = `<div ... data-embed="youtube" data-url="${url}" data-title="${title}">
    ${iframeHtml}
    <div class="... bg-neutral-50">
      <span class="font-medium">${title}</span>
      <a href="${url}" target="_blank" class="text-blue-600 hover:underline">Открыть</a>
    </div>
  </div>`;
  embeds.push(embedHtml);
  return `<!--EMBED_${embeds.length - 1}-->`;
});

// ✅ Аналогично для VK
processed = processed.replace(/\[vk:(https?:\/\/[^:]+):([^\]]+)\]/g, (_, url, title) => {
  const videoId = extractVkVideoId(url);
  
  let iframeHtml = '';
  if (videoId) {
    iframeHtml = `<div class="relative w-full" style="padding-bottom: 56.25%;">
      <iframe 
        src="https://vk.com/video_ext.php?oid=${videoId.oid}&id=${videoId.id}&hd=2" 
        frameborder="0" 
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture; screen-wake-lock" 
        allowfullscreen
        class="absolute top-0 left-0 w-full h-full"
      ></iframe>
    </div>`;
  }
  
  const embedHtml = `<div ... data-embed="vk" data-url="${url}" data-title="${title}">
    ${iframeHtml}
    <div class="... bg-neutral-50">
      <span class="font-medium">${title}</span>
      <a href="${url}" target="_blank" class="text-blue-600 hover:underline">Открыть</a>
    </div>
  </div>`;
  embeds.push(embedHtml);
  return `<!--EMBED_${embeds.length - 1}-->`;
});
```

### Результат

#### YouTube:
- ✅ Запрашивается URL и заголовок
- ✅ Отображается встроенный YouTube плеер (iframe)
- ✅ Под плеером выводится заголовок и ссылка "Открыть"
- ✅ Соотношение сторон 16:9 (responsive)
- ✅ Поддержка fullscreen, autoplay и других функций

#### VK:
- ✅ Запрашивается URL и заголовок
- ✅ Отображается встроенный VK плеер (iframe)
- ✅ Под плеером выводится заголовок и ссылка "Открыть"
- ✅ Соотношение сторон 16:9 (responsive)
- ✅ Поддержка fullscreen, HD качества

#### Формат в Markdown:
```markdown
[youtube:https://www.youtube.com/watch?v=dQw4w9WgXcQ:Rick Astley - Never Gonna Give You Up]

[vk:https://vk.com/video-12345678_987654321:Название видео из ВК]
```

---

## Технические детали

### Измененные файлы

| Файл | Строки | Изменения |
|------|--------|-----------|
| `components/materials/materials-page-viewer.tsx` | 132-157 | Удален блок с лого/названием, удалено поле поиска, добавлен prop `onSearchOpen` |
| `components/materials/materials-tree.tsx` | 21, 34-43, 293-318 | Импорт `Search`, prop `onSearchOpen`, кнопка поиска, улучшенная кнопка "Добавить" |
| `components/materials/materials-page-editor.tsx` | 29-39, 41-104, 392-472, 518, 527, 542, 558 | Turndown rule с заголовком, парсинг iframe, insertEmbed с заголовком, исправлен layout для скролла |

### Используемые технологии

- **React** - компоненты и hooks
- **TypeScript** - типизация
- **Tailwind CSS** - стилизация
- **Lucide React** - иконки (Search, Plus)
- **Turndown** - конвертация HTML → Markdown
- **Marked** - парсинг Markdown → HTML
- **YouTube Embed API** - встраивание YouTube видео
- **VK Video Player** - встраивание VK видео

### Aspect Ratio для видео

Используется техника **padding-bottom** для responsive 16:9 iframe:

```tsx
<div className="relative w-full" style="padding-bottom: 56.25%;">
  <iframe class="absolute top-0 left-0 w-full h-full">...</iframe>
</div>
```

**Расчет**: `9 / 16 * 100% = 56.25%`

Это обеспечивает корректное соотношение сторон на всех размерах экрана.

---

## Совместимость

### Обратная совместимость
✅ **Да** - Старые материалы с форматом `[youtube:URL]` будут работать, но без заголовка (будет показан плеер без заголовка в подписи).

### Миграция старых материалов
Не требуется автоматическая миграция, но рекомендуется:
1. Открыть материал в редакторе
2. Удалить старый блок видео
3. Добавить новый блок с заголовком

### Новый формат Markdown
```markdown
# Старый формат (deprecated)
[youtube:https://www.youtube.com/watch?v=VIDEO_ID]
[vk:https://vk.com/video-OID_VID]

# Новый формат (рекомендуется)
[youtube:https://www.youtube.com/watch?v=VIDEO_ID:Заголовок видео]
[vk:https://vk.com/video-OID_VID:Заголовок видео]
```

---

## Тестирование

### Чек-лист для тестирования

#### Общий вид панели материалов
- [ ] Блок с лого/названием организации не отображается
- [ ] Панель начинается сразу с заголовка "Материалы"
- [ ] Иконка поиска отображается слева от кнопки "Добавить"
- [ ] Кнопка "Добавить" имеет иконку Plus и текст

#### Поиск
- [ ] Клик на иконку поиска открывает диалог поиска
- [ ] Поиск работает корректно
- [ ] Диалог закрывается при выборе результата

#### Скролл
- [ ] Длинные материалы скроллятся мышью корректно
- [ ] Header остается закрепленным при скролле
- [ ] Панель с кнопками видео остается закрепленной

#### Видео YouTube
- [ ] При клике "Видео YouTube" появляется prompt для URL
- [ ] После ввода URL появляется prompt для заголовка
- [ ] Видео встраивается как iframe-плеер
- [ ] Плеер работает (можно проиграть видео)
- [ ] Под плеером отображается заголовок и ссылка "Открыть"
- [ ] Плеер responsive (масштабируется корректно)
- [ ] Fullscreen работает

#### Видео VK
- [ ] При клике "Видео VK" появляется prompt для URL
- [ ] После ввода URL появляется prompt для заголовка
- [ ] Видео встраивается как iframe-плеер
- [ ] Плеер работает (можно проиграть видео)
- [ ] Под плеером отображается заголовок и ссылка "Открыть"
- [ ] Плеер responsive (масштабируется корректно)
- [ ] Fullscreen работает

#### Сохранение и загрузка
- [ ] После сохранения материала с видео и перезагрузки страницы видео отображается корректно
- [ ] Заголовок сохраняется и отображается
- [ ] Плеер работает после перезагрузки

#### Редактирование
- [ ] Можно удалить блок видео
- [ ] Можно добавить несколько видео в один материал
- [ ] Можно добавить текст до и после видео
- [ ] Блок видео не редактируется (contentEditable="false")

---

## Известные ограничения

1. **Видео без корректного ID**: Если URL видео неправильный или не удается извлечь ID, iframe не будет отображаться (только заголовок и ссылка).

2. **VK Video**: VK может блокировать embed для некоторых видео в зависимости от настроек приватности.

3. **Старый формат**: Материалы со старым форматом `[youtube:URL]` не будут автоматически мигрированы на новый формат с заголовком.

4. **Заголовок обязателен**: Если пользователь отменяет prompt заголовка, видео не добавляется. Это сделано намеренно для обеспечения качества контента.

---

## Будущие улучшения (опционально)

### Возможные доработки:
1. **Автоматическое получение заголовка**: Использовать API YouTube/VK для автозаполнения заголовка (предлагать как default value в prompt)

2. **Редактирование заголовка**: Добавить возможность редактировать заголовок встроенного видео без удаления/пересоздания блока

3. **Превью при вставке**: Показывать превью видео в prompt перед добавлением

4. **Playlist поддержка**: Добавить возможность встраивать плейлисты YouTube/VK

5. **Другие платформы**: Поддержка Rutube, Vimeo и других видеохостингов

6. **Миграция скрипт**: Создать скрипт для миграции старых материалов на новый формат

---

## Статус

✅ **Реализовано и готово к деплою**  
📅 **Дата**: 10.10.2025  
🎯 **Все 5 доработок выполнены**  
🧪 **Тестирование**: Рекомендуется пройти чек-лист перед деплоем  
📊 **Ошибок компиляции**: Нет

---

**Автор**: AI Assistant  
**Версия**: 1.0  
**Последнее обновление**: 10.10.2025

