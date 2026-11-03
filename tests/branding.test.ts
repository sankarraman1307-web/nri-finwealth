import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const text = (p: string) => new TextDecoder().decode(readFileSync(p));
const has = (p: string) => {
  try {
    return readFileSync(p).length > 0;
  } catch {
    return false;
  }
};

describe('branding files', () => {
  it('has every icon the pages point to', () => {
    for (const f of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'icon-512.png', 'og.png']) {
      expect(has(`public/${f}`), f).toBe(true);
    }
  });
  it('links the favicon from the home page', () => {
    const html = text('index.html');
    expect(html).toContain('href="/favicon.svg"');
    expect(html).toContain('href="/apple-touch-icon.png"');
  });
  it('shows the logo in the guide pages header and links the favicon', () => {
    const src = text('scripts/build-guides.mjs');
    expect(src).toContain('class="logoMark"');
    expect(src).toContain('rel="icon"');
  });
});
