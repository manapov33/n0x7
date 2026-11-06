import type { Site, Spread } from '../content/types.ts';

export const esc = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function renderWork(w: Spread): string {
  return `<article class="work">
      <h3>${esc(w.title)}</h3>
      ${w.isConcept ? '<p class="badge">концепт</p>' : ''}
      ${w.task ? `<p>${esc(w.task)}</p>` : ''}
    </article>`;
}

export function renderFallback(s: Site): string {
  const works = s.spreads.filter((x) => x.kind === 'work').map(renderWork).join('\n    ');
  const services = s.services
    .map((x) => `<li><span>${esc(x.name)}</span><span class="price">от ${esc(x.priceFrom)}</span></li>`)
    .join('\n      ');
  return `<header class="fb-head">
    <h1>${esc(s.name)}</h1>
    <p class="tagline">${esc(s.tagline)}</p>
    <a class="btn" href="#contacts">Обсудить проект</a>
  </header>
  <section aria-labelledby="fb-works">
    <h2 id="fb-works">Работы</h2>
    ${works}
  </section>
  <section aria-labelledby="fb-services">
    <h2 id="fb-services">Услуги</h2>
    <ul class="services">
      ${services}
    </ul>
  </section>
  <section id="contacts" aria-labelledby="fb-contacts">
    <h2 id="fb-contacts">Контакты</h2>
    <p><a href="${esc(s.telegramUrl)}">Telegram</a></p>
    <p><a href="tel:${esc(s.phone)}">${esc(s.phone)}</a></p>
  </section>`;
}
