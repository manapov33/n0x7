import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

describe('шрифты', () => {
  const imports = read('src/fallback/fonts.css');
  const ui = read('src/ui/ui.css');

  it('ui.css просит насыщенность 500 у Manrope и JetBrains Mono', () => {
    expect(ui).toMatch(/font:\s*500[^;]*'Manrope'/);
    expect(ui).toMatch(/font:\s*500[^;]*'JetBrains Mono'/);
  });

  it('для каждой используемой насыщенности подключён файл шрифта (с кириллицей)', () => {
    expect(imports).toContain("@fontsource/manrope/500.css");
    expect(imports).toContain("@fontsource/jetbrains-mono/500.css");
    for (const f of ['manrope', 'jetbrains-mono']) {
      const css = read(`node_modules/@fontsource/${f}/500.css`);
      expect(css).toContain('cyrillic');
    }
  });
});
