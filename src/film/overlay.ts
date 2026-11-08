import { esc } from '../fallback/render.ts';
import type { Site } from '../content/types.ts';

export type Overlay = {
  /** Непрозрачность надписей по id (`hero`, `work-k`, `services`, `contacts`). Пишет в DOM только изменения. */
  update(o: Record<string, number>): void;
  destroy(): void;
};

/** Ниже этого значения надпись скрыта от читалок и фокуса. */
const SHOWN = 0.05;
/** Подъём надписи при появлении, px. */
const RISE = 28;
const RISE_PART = 14;
/** Части надписи работы проявляются по очереди: каждая занимает 0.4 общей шкалы, со сдвигом 0.3. */
const STAGGER = 0.3;
const STAGGER_SPAN = 0.4;
const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

export function createOverlay(root: HTMLElement, site: Site): Overlay {
  const phoneHref = 'tel:' + site.phone.replace(/[^\d+]/g, '');
  const works = site.spreads.filter((s) => s.kind === 'work');
  const layer = document.createElement('div');
  layer.id = 'film-overlay';

  const block = (id: string, cls: string, inner: string) =>
    `<section class="ov ${cls}" data-ov="${esc(id)}" aria-hidden="true" inert>${inner}</section>`;

  const html: string[] = [];
  html.push(
    block(
      'hero',
      'ov-hero',
      `<h1 class="ov-mark">${esc(site.name)}</h1>
       <p class="ov-lead">${esc(site.tagline)}</p>
       <p class="ov-hint"><span class="ov-hint-line" aria-hidden="true"></span>скролльте</p>`,
    ),
  );
  works.forEach((w, k) => {
    html.push(
      block(
        `work-${k}`,
        'ov-work',
        `<p class="ov-kicker"><span class="ov-no">${String(k + 1).padStart(2, '0')}</span>${w.isConcept ? '<span class="ov-badge">концепт</span>' : ''}</p>
         <h2 class="ov-title">${esc(w.title)}</h2>
         ${w.task ? `<p class="ov-task">${esc(w.task)}</p>` : ''}`,
      ),
    );
  });
  html.push(
    block(
      'services',
      'ov-services',
      `<h2 class="ov-h">Услуги</h2>
       <ul class="ov-list">${site.services
         .map(
           (s) =>
             `<li><span class="ov-svc">${esc(s.name)}</span><span class="ov-price">от ${esc(s.priceFrom)}</span></li>`,
         )
         .join('')}</ul>`,
    ),
  );
  html.push(
    block(
      'contacts',
      'ov-contacts',
      `<h2 class="ov-h">Обсудим ваш проект?</h2>
       <div class="ov-actions">
         <a class="ov-btn ov-btn-main" href="${esc(site.telegramUrl)}" target="_blank" rel="noopener">Написать в Telegram</a>
         <a class="ov-btn" href="${esc(phoneHref)}">Позвонить</a>
         <span class="ov-phone">${esc(site.phone)}</span>
       </div>`,
    ),
  );
  layer.innerHTML = html.join('');
  root.append(layer);

  const els = new Map<string, HTMLElement>();
  layer.querySelectorAll<HTMLElement>('[data-ov]').forEach((e) => els.set(e.dataset.ov!, e));
  const parts = new Map<string, HTMLElement[]>();
  for (const [id, el] of els)
    if (id.startsWith('work-')) parts.set(id, [...el.querySelectorAll<HTMLElement>('.ov-kicker, .ov-title, .ov-task')]);
  const last = new Map<string, number>();
  const doc = root.ownerDocument.documentElement;

  return {
    update(o) {
      for (const [id, el] of els) {
        const v = Math.min(1, Math.max(0, o[id] ?? 0));
        if (last.get(id) === v) continue;
        last.set(id, v);
        const shown = v >= SHOWN;
        el.style.opacity = String(v);
        el.style.transform = `translate3d(0, ${((1 - v) * RISE).toFixed(1)}px, 0)`;
        el.style.visibility = shown ? '' : 'hidden'; // у видимой наследуется от контейнера
        el.style.willChange = shown ? 'opacity, transform' : ''; // слой держим только у видимой
        el.inert = !shown;
        if (shown) el.removeAttribute('aria-hidden');
        else el.setAttribute('aria-hidden', 'true');
        parts.get(id)?.forEach((p, i) => {
          const c = smooth((v - i * STAGGER) / STAGGER_SPAN);
          p.style.opacity = String(c);
          p.style.transform = `translate3d(0, ${((1 - c) * RISE_PART).toFixed(1)}px, 0)`;
        });
        if (id === 'hero') doc.dataset.hero = shown ? '1' : '0';
      }
    },
    destroy() {
      layer.remove();
      delete doc.dataset.hero;
    },
  };
}
