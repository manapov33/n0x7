export type RailMark = { label: string; progress: number };

/** Боковой индикатор прогресса: по кнопке на каждую работу и на контакты. */
export function createRail(
  root: HTMLElement,
  marks: RailMark[],
  onJump: (p: number) => void,
): { update(p: number): void; destroy(): void } {
  const nav = document.createElement('nav');
  nav.className = 'film-rail';
  nav.setAttribute('aria-label', 'Разделы фильма');
  const track = document.createElement('div');
  track.className = 'film-rail-track';
  const fill = document.createElement('span');
  fill.className = 'film-rail-fill';
  fill.setAttribute('aria-hidden', 'true');
  track.append(fill);
  const buttons = marks.map((m) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'film-rail-mark';
    b.style.top = `${m.progress * 100}%`;
    const text = document.createElement('span');
    text.className = 'film-rail-label';
    text.textContent = m.label;
    const dot = document.createElement('span');
    dot.className = 'film-rail-dot';
    dot.setAttribute('aria-hidden', 'true');
    b.append(text, dot);
    b.addEventListener('click', () => onJump(m.progress));
    track.append(b);
    return b;
  });
  nav.append(track);
  root.append(nav);

  return {
    update(p) {
      fill.style.height = `${Math.min(1, Math.max(0, p)) * 100}%`;
      let active = -1;
      marks.forEach((m, i) => {
        if (m.progress <= p + 1e-6) active = i;
      });
      buttons.forEach((b, i) => {
        if (i === active) b.setAttribute('aria-current', 'true');
        else b.removeAttribute('aria-current');
        b.classList.toggle('passed', i <= active);
      });
    },
    destroy() {
      nav.remove();
    },
  };
}
