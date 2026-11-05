import type { BookModel } from '../book/model.ts';
import { isPhone } from '../controls/viewport.ts';
import type { Site } from '../content/types.ts';

export type Ui = {
  /** Модель появляется позже интерфейса: до этого кнопка только открывает панель. */
  setModel(model: BookModel): void;
  /** Перечитать номер разворота из модели и обновить счётчик и подсказку. */
  update(): void;
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
  const total = site.spreads.length;
  const last = total - 1;
  let model: BookModel | undefined;

  const ui = document.createElement('div');
  ui.id = 'ui-root';
  const phoneHref = 'tel:' + site.phone.replace(/[^\d+]/g, '');
  ui.innerHTML = `
    <header class="ui-brand">
      <span class="ui-logo">${site.name}</span>
      <span class="ui-tagline">${site.tagline}</span>
    </header>
    <div class="ui-hint" id="ui-hint">листайте</div>
    <div id="counter" data-spread="0" aria-live="off"></div>
    <button type="button" class="ui-cta" aria-controls="contact-panel" aria-expanded="false">Обсудить проект</button>
    <section id="contact-panel" role="dialog" aria-labelledby="contact-title" tabindex="-1" hidden>
      <h2 id="contact-title">Связаться</h2>
      <a class="ui-link" href="${site.telegramUrl}" target="_blank" rel="noopener">Написать в Telegram</a>
      <a class="ui-link" href="${phoneHref}">${site.phone}</a>
      <button type="button" class="ui-close" aria-label="Закрыть">×</button>
    </section>`;
  root.append(ui);

  const counter = ui.querySelector<HTMLElement>('#counter')!;
  const hint = ui.querySelector<HTMLElement>('#ui-hint')!;
  const cta = ui.querySelector<HTMLButtonElement>('.ui-cta')!;
  const panel = ui.querySelector<HTMLElement>('#contact-panel')!;
  const close = ui.querySelector<HTMLButtonElement>('.ui-close')!;

  // Последний разворот сам открывает панель один раз; закрытая посетителем, она молчит до ухода с него.
  let seen = 0;
  let dismissed = false;
  const show = () => {
    panel.hidden = false;
    cta.setAttribute('aria-expanded', 'true');
  };

  const update = () => {
    const s = model?.spread ?? 0;
    if (s !== last) dismissed = false;
    if (s === last && seen !== last && !dismissed) show();
    seen = s;
    counter.dataset.spread = String(s);
    counter.textContent = `${s + 1} / ${total}`;
    // На телефоне подсказка живёт на каждой странице (там листают по странице), на десктопе — только на обложке.
    hint.hidden = s !== 0 && !isPhone(window.innerWidth);
  };

  const open = () => {
    show();
    panel.focus({ preventScroll: true });
  };
  const closePanel = () => {
    if (panel.hidden) return;
    if (model?.spread === last) dismissed = true;
    const hadFocus = panel.contains(document.activeElement) || document.activeElement === document.body;
    panel.hidden = true;
    cta.setAttribute('aria-expanded', 'false');
    if (hadFocus) cta.focus();
  };

  cta.addEventListener('click', () => {
    open();
    model?.goTo(last);
  });
  close.addEventListener('click', closePanel);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closePanel();
  };
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', update);

  update();
  return {
    setModel(m) {
      model = m;
      update();
    },
    update,
    destroy() {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', update);
      ui.remove();
    },
  };
}
