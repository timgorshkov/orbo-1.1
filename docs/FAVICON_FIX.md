# 🔧 Исправление ошибки favicon

## Проблема
```
Error: Image import "app/favicon.ico" is not a valid image file.
```

## Решение
❌ Удалён некорректный `app/favicon.ico`
✅ Используется только SVG-иконка из `public/icon.svg`

## Почему SVG достаточно?

1. **Современные браузеры** (Chrome, Firefox, Safari, Edge) прекрасно поддерживают SVG favicon
2. **Масштабируемость** — иконка идеально выглядит на любом разрешении
3. **Малый размер** — SVG весит меньше, чем .ico

## Если нужен .ico для старых браузеров

### Опция 1: Использовать онлайн-генератор
1. Откройте [https://realfavicongenerator.net/](https://realfavicongenerator.net/)
2. Загрузите `public/icon.svg`
3. Скачайте сгенерированный `favicon.ico`
4. Поместите в `public/favicon.ico`
5. Добавьте в `app/layout.tsx`:
   ```tsx
   <link rel="icon" href="/favicon.ico" sizes="any" />
   ```

### Опция 2: Использовать ImageMagick
```bash
# Если установлен ImageMagick
convert public/icon.svg -resize 32x32 public/favicon.ico
```

## Текущая конфигурация

В `app/layout.tsx`:
```tsx
icons: {
  icon: [
    { url: '/icon.svg', type: 'image/svg+xml' },
  ],
  apple: [
    { url: '/apple-touch-icon.png' },
  ],
}
```

## Поддержка браузеров

| Браузер | SVG favicon |
|---------|-------------|
| Chrome 80+ | ✅ |
| Firefox 41+ | ✅ |
| Safari 9+ | ✅ |
| Edge 79+ | ✅ |
| IE 11 | ❌ (но кого это волнует?) |

---

**Итог:** Приложение будет корректно работать в 99.9% современных браузеров с SVG favicon. 🎯

