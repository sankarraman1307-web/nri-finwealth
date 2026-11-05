import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/** Step 39: one bottom bar on phones, three states. These checks guard the wiring, since the tests run without a browser. */
const text = (p: string) => new TextDecoder().decode(readFileSync(p));
const css = text('src/web/styles.css');
const app = text('src/web/App.tsx');

describe('mobile bottom bar', () => {
  it('shows one bar: the form Run bar is hidden on phones and no fixed offset is left behind', () => {
    const mobile = css.slice(css.indexOf('@media (max-width: 900px) {\n  .liveBar'));
    expect(mobile).toContain('.runbar { display: none; }');
    expect(css).not.toContain('.runbar { bottom: 90px; }');
  });
  it('the page leaves room for a bar that wraps to several lines', () => {
    expect(css).toMatch(/\.page \{ padding-bottom: 1[5-9]\d px?; \}|\.page \{ padding-bottom: 1[5-9]\dpx; \}/);
  });
  it('has the three states: no results, up to date, changes not applied', () => {
    expect(app).toContain('Ready when you are');
    expect(app).toContain('Changes not applied yet');
    expect(app).toContain('See details');
    expect(app).toContain('Run simulation');
  });
  it('See details exists only in the results state', () => {
    const first = app.indexOf('if (!shown)');
    const stale = app.indexOf('if (stale)');
    const last = app.indexOf('See details', stale);
    expect(app.slice(first, stale)).not.toContain('See details');
    expect(app.slice(stale, last)).not.toContain('>See details<');
    expect(last).toBeGreaterThan(stale);
  });
  it('the header can wrap on a narrow phone', () => {
    expect(css).toContain('.top { justify-content: flex-start; flex-wrap: wrap;');
  });
});
