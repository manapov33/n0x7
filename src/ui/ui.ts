import { esc } from '../fallback/render.ts';
import type { Site } from '../content/types.ts';

export type Ui = {
  /** Убрать интерфейс и снять слушатели. */
  destroy(): void;
};

/** Свет за курсором: только на устройствах с настоящим hover. Возвращает функцию снятия слушателя. */
export function attachLamp(
  win: Pick<Window, 'addEventListener' | 'removeEventListener' | 'innerWidth' | 'innerHeight'>,
  setLamp: (nx: number, ny: number) => void,
  hasHover: boolean,
): () => void {
  if (!hasHover) return () => {};
  const onMove = (e: Event) => {
    const { clientX, clientY } = e as PointerEvent;
    if (!(win.innerWidth > 0 && win.innerHeight > 0)) return;
    // Центр экрана — положение света по умолчанию; вверх экрана — вверх по столу.
    setLamp(clientX / win.innerWidth - 0.5, 0.5 - clientY / win.innerHeight);
  };
  win.addEventListener('pointermove', onMove);
  return () => win.removeEventListener('pointermove', onMove);
}

export function createUi(root: HTMLElement, site: Site): Ui {
  const ui = document.createElement('div');
  ui.id = 'ui-root';
  const phoneHref = 'tel:' + site.phone.replace(/[^\d+]/g, '');
  ui.innerHTML = `
    <header class="ui-brand">
      <span class="ui-logo">${esc(site.name)}</span>
      <span class="ui-tagline">${esc(site.tagline)}</span>
    </header>
    <button type="button" class="ui-cta" aria-controls="contact-panel" aria-expanded="false">Обсудить проект</button>
    <section id="contact-panel" role="dialog" aria-labelledby="contact-title" tabindex="-1" hidden>
      <h2 id="contact-title">Связаться</h2>
      <a class="ui-link" href="${esc(site.telegramUrl)}" target="_blank" rel="noopener">Написать в Telegram</a>
      <a class="ui-link" href="${esc(phoneHref)}">${esc(site.phone)}</a>
      <button type="button" class="ui-close" aria-label="Закрыть">×</button>
    </section>`;
  root.append(ui);

  const cta = ui.querySelector<HTMLButtonElement>('.ui-cta')!;
  const panel = ui.querySelector<HTMLElement>('#contact-panel')!;
  const close = ui.querySelector<HTMLButtonElement>('.ui-close')!;

  const open = () => {
    panel.hidden = false;
    cta.setAttribute('aria-expanded', 'true');
    panel.focus({ preventScroll: true });
  };
  const closePanel = () => {
    if (panel.hidden) return;
    const hadFocus = panel.contains(document.activeElement) || document.activeElement === document.body;
    panel.hidden = true;
    cta.setAttribute('aria-expanded', 'false');
    if (hadFocus) cta.focus();
  };

  cta.addEventListener('click', () => (panel.hidden ? open() : closePanel()));
  close.addEventListener('click', closePanel);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closePanel();
  };
  // Касание мимо открытой панели (по сцене) закрывает её.
  const onDown = (e: Event) => {
    const t = e.target as Node | null;
    if (!t || panel.contains(t) || cta.contains(t)) return;
    closePanel();
  };
  document.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', onDown);

  return {
    destroy() {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
      ui.remove();
    },
  };
}
