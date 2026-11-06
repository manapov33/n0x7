# Изображения, которые генерирует заказчик

Положить сюда готовые файлы с точно такими именами. Промпты лежат в `assets/prompts/`.

| Файл | Размер | Пропорция | Промпт |
|---|---|---|---|
| `table.png` (или `.jpg`, `.webp`) | 3840×2400 | 16:10 | `assets/prompts/table.md` |
| `beauty-hero.png` | от 2400×1500 | 16:10 | `assets/prompts/beauty.md` |
| `beauty-detail.png` | от 1600×2000 | 4:5 | `assets/prompts/beauty.md` |
| `beauty-texture.png` | от 1600×1600 | 1:1 | `assets/prompts/beauty.md` |

`table.*` обрабатывает `npm run pages`: делает `public/scene/table.webp` (3840×2400) и `public/scene/table-2048.webp` (для телефонов). Без файла используется заглушка.
