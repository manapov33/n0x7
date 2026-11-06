# Промпты: концепт «Лилея» (косметика)

Вымышленный бренд «Лилея», интернет-магазин натуральной косметики (название и строка о задаче из `src/content/site.ts`). Нужны три изображения для одного разворота журнала: они показывают макет сайта, но сами не должны содержать читаемого текста.

## Единое художественное решение (вставлять в каждый промпт)

Мягкий дневной свет из окна, бледные лепестки лилии, приглушённая тёплая палитра (сливочный, пудрово-розовый, тёплый беж, чуть шалфейной зелени), премиальный минимализм, много воздуха, спокойные тени, матовые поверхности. Упаковка гладкая, без надписей: допускается только абстрактный знак (простой контур лепестка). Никаких настоящих брендов, логотипов и читаемого текста.

## Общий negative prompt

```
text, letters, words, readable label, real brand, logo, watermark, barcode, people, face, hands, harsh flash, neon, oversaturated, cluttered, cheap plastic, stock photo look, distorted bottle, extra fingers
```

## 1. beauty-hero (первый экран сайта)

Файл: `assets/images/beauty-hero.png`. Соотношение 16:10, не меньше 2400×1500.

```
Premium minimal product hero photograph for a skincare website first screen: a frosted glass serum bottle with a matte cream-coloured cap and a slim cream tube standing on a pale stone surface, a few pale white lily petals and one soft lily flower resting beside them, soft natural window daylight from the left, gentle long shadows, muted warm palette of cream, blush and warm beige, a calm empty area on the right side of the frame for website text, packaging completely blank with only a tiny abstract petal outline mark, clean editorial composition, high resolution, photorealistic.
```

## 2. beauty-detail (деталь продукта)

Файл: `assets/images/beauty-detail.png`. Соотношение 4:5, не меньше 1600×2000.

```
Close-up detail photograph of a cream jar with a matte ceramic lid slightly open, held at a three-quarter top view on a soft linen cloth, a single pale lily petal lying across the edge, soft natural daylight, shallow depth of field, creamy blush and warm beige palette, premium minimal skincare aesthetic, blank packaging with only a tiny abstract petal outline mark, no text, high resolution, photorealistic.
```

## 3. beauty-texture (текстура крема)

Файл: `assets/images/beauty-texture.png`. Соотношение 1:1, не меньше 1600×1600.

```
Macro photograph of a swirl of smooth cream texture and a single soft swatch smear on a pale surface, thick glossy peaks catching soft daylight, warm cream and blush tones with a hint of pale sage, tiny pale lily petal fragment at the edge, abstract and premium, extreme close-up, shallow depth of field, no text, no packaging, high resolution, photorealistic.
```

## Что проверить при приёмке

Один свет и одна палитра на всех трёх; нигде нет читаемых букв, логотипов, лиц; в hero справа свободное место под текст. Если вышло разное по цвету, выбрать лучший кадр и переснять остальные с ним как референсом (image reference / style reference).
