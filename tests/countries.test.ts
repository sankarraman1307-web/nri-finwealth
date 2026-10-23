import { describe, expect, it } from 'vitest';
import { COUNTRY_PACKS, DEFAULT_COUNTRY, countryPack, runPlan, SAMPLE_INPUT } from '../src/engine';
import { box3DeemedTax, nlPensionTax, nlWageTax } from '../src/engine/countries/nl/tax';
import { getNlRules } from '../src/engine/countries/nl/rules';

describe('country packs', () => {
  it('the Netherlands is the default and the only pack so far', () => {
    expect(DEFAULT_COUNTRY).toBe('nl');
    expect(Object.keys(COUNTRY_PACKS)).toEqual(['nl']);
    expect(countryPack(undefined).id).toBe('nl');
  });
  it('an unknown country falls back to the Netherlands instead of breaking', () => {
    expect(countryPack('xx').id).toBe('nl');
  });
  it('the pack describes its currency and the words the screens use', () => {
    const nl = countryPack('nl');
    expect(nl.currency).toEqual({ code: 'EUR', symbol: '€' });
    expect(nl.labels).toEqual({ statePension: 'AOW', wealthTax: 'Box 3', foreignWorkerRegime: '30% ruling' });
  });
  it('the pack functions are the Dutch tax functions', () => {
    const nl = countryPack('nl');
    const r = nl.rulesFor(2026);
    expect(r).toBe(getNlRules(2026));
    expect(nl.tax.wage(100_000, r, 1, { active: true, grandfathered: false }).tax).toBe(nlWageTax(100_000, r, 1, { active: true, grandfathered: false }).tax);
    expect(nl.tax.pension(30_000, r, 1)).toBe(nlPensionTax(30_000, r, 1));
    const pos = { savings: 100_000, other: 400_000, debts: 0, persons: 1 };
    expect(nl.tax.wealthCurrent(pos, r, 1)).toBe(box3DeemedTax(pos, r, 1));
    expect(nl.knownYears()).toEqual([2026, 2027]);
  });
  it('a plan gives exactly the same answer with country set to nl or left out', () => {
    const a = runPlan(SAMPLE_INPUT, { paths: 100, seed: 3 });
    const b = runPlan({ ...SAMPLE_INPUT, country: 'nl' }, { paths: 100, seed: 3 });
    expect(b.expected.corpusAtRetirement).toBe(a.expected.corpusAtRetirement);
    expect(b.monteCarlo.successProbability).toBe(a.monteCarlo.successProbability);
    expect(b.meta.rulesAsOf).toBe(countryPack('nl').rulesAsOf);
  });
});
