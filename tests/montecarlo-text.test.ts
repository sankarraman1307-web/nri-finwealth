import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/** Steps 40 and 41: "Monte Carlo" is explained once, in the single "How to read this" note of the verdict card. */
const text = (p: string) => new TextDecoder().decode(readFileSync(p));
const app = text('src/web/App.tsx');
const css = text('src/web/styles.css');
const pdf = text('src/web/report/render.ts');

describe('Monte Carlo wording', () => {
  it('the verdict card has exactly one "How to read this" note and no second explainer', () => {
    expect(app.split('<summary>How to read this</summary>').length - 1).toBe(1);
    expect(app).not.toContain('className="mcNote"');
    expect(app).not.toContain('What does this mean?');
    expect(css).not.toContain('.mcNote');
  });
  it('one plain line under the meter names the method and opens the note', () => {
    const meter = app.indexOf('className="meterScale"');
    const line = app.indexOf('className="mcLine"');
    expect(line).toBeGreaterThan(meter);
    expect(line).toBeLessThan(app.indexOf('className="placeTiles"'));
    expect(app).toContain('Based on {plan.meta.paths} Monte Carlo simulations.');
    expect(app).toContain('onClick={openHowto}');
    expect(app).toContain('howtoRef.current.open = true');
  });
  it('the note names the method and says how it works', () => {
    expect(app).toContain('This result comes from a Monte Carlo simulation. We replay your plan {plan.meta.paths} times');
    expect(app).toContain('It is a stress test, not a prediction');
    expect(app).toContain('Inflation is the same in every run');
  });
  it('the note makes no false or confusing claims', () => {
    expect(app).not.toContain('100 different versions');
    expect(app).not.toContain('different inflation');
    expect(app).not.toContain('so you are covered if you live long');
  });
  it('the headline keeps its plain words', () => {
    expect(app).toContain('of 100 possible future scenarios.</h2>');
  });
  it('the footer names the method', () => {
    expect(app).toContain('Monte Carlo simulations.');
  });
  it('the PDF explains the method in the assumptions section', () => {
    expect(pdf).toContain('a Monte Carlo simulation replays your plan through ${m.paths} random');
  });
  it('the phone bar stays free of jargon', () => {
    const bar = app.slice(app.indexOf('const stale = dirty'), app.indexOf('<footer>'));
    expect(bar).not.toContain('Monte Carlo');
  });
});
