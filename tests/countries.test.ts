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
    const r = nl.rulesFor(2026) as ReturnType<typeof getNlRules>;
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

// ---- Step 38: groundwork for more countries -------------------------------------------------------------------
import { availableCountries, DRAFT_COUNTRY_PACKS, householdWageTax, homeCurrency, resolvePack, definePack } from '../src/engine';
import type { CountryPack, CountryRules } from '../src/engine';

interface FakeRules extends CountryRules {
  rate: number;
}
const fakeRules: FakeRules = {
  year: 2026,
  statePension: { singleMonthlyGross: 1000, partnerMonthlyGrossEach: 800, fullAccrualYears: 40 },
  unverified: ['everything'],
  sources: [],
  rate: 0.2,
};
function fake(over: Partial<CountryPack<FakeRules>> = {}): CountryPack {
  return definePack<FakeRules>({
    id: 'xx',
    name: 'Fakeland',
    status: 'draft',
    currency: { code: 'CHF', symbol: 'CHF' },
    rulesAsOf: '2026-11-04',
    labels: { statePension: 'Rente', wealthTax: 'Vermögen', foreignWorkerRegime: null },
    rulesFor: () => fakeRules,
    knownYears: () => [2026],
    tax: {
      wage: (gross, r, idx, ruling) => ({ taxableWage: gross, tax: gross * r.rate * (ruling.active ? 0.5 : 1) * idx }),
      pension: (g, r) => g * r.rate,
      wealthCurrent: () => 0,
      wealthProposed: () => 0,
    },
    ...over,
  });
}

describe('country groundwork', () => {
  it('the Netherlands is a live pack and exposes the common state pension', () => {
    const nl = countryPack('nl');
    expect(nl.status).toBe('live');
    expect(nl.rulesFor(2026).statePension).toBe((nl.rulesFor(2026) as ReturnType<typeof getNlRules>).aow);
    expect(nl.rulesFor(2026).statePension.fullAccrualYears).toBe(50);
  });
  it('no draft pack is registered yet, and none is reachable by default', () => {
    expect(Object.keys(DRAFT_COUNTRY_PACKS)).toEqual([]);
    expect(availableCountries().map((p) => p.id)).toEqual(['nl']);
    expect(availableCountries({ includeDrafts: true }).map((p) => p.id)).toEqual(['nl']);
  });
  it('a draft pack is hidden unless drafts are switched on', () => {
    const live = { nl: countryPack('nl') };
    const drafts = { xx: fake() };
    expect(resolvePack('xx', live, drafts).id).toBe('nl');
    expect(resolvePack('xx', live, drafts, { includeDrafts: true }).id).toBe('xx');
    expect(resolvePack('nl', live, drafts, { includeDrafts: true }).id).toBe('nl');
  });
  it('the home currency comes from the pack', () => {
    expect(homeCurrency('nl')).toEqual({ code: 'EUR', symbol: '€' });
    expect(homeCurrency(undefined).code).toBe('EUR');
    expect(fake().currency.code).toBe('CHF');
  });
  it('without a household hook, earners are taxed one by one and added up', () => {
    const p = fake({ labels: { statePension: 'Rente', wealthTax: 'x', foreignWorkerRegime: '30%' } });
    const earners = [
      { gross: 100_000, ruling: { active: false, grandfathered: false } },
      { gross: 50_000, ruling: { active: true, grandfathered: false } },
    ];
    expect(householdWageTax(p, earners, fakeRules, 1)).toBeCloseTo(100_000 * 0.2 + 50_000 * 0.2 * 0.5, 6);
  });
  it('a country with no foreign-worker regime never applies one', () => {
    const p = fake();
    const earners = [{ gross: 100_000, ruling: { active: true, grandfathered: true } }];
    expect(householdWageTax(p, earners, fakeRules, 1)).toBeCloseTo(20_000, 6);
  });
  it('a country that taxes the household together can supply its own total', () => {
    const base = fake();
    const joint = definePack<FakeRules>({
      ...(base as unknown as CountryPack<FakeRules>),
      tax: {
        ...(base.tax as unknown as CountryPack<FakeRules>['tax']),
        household: (earners, r) => (earners.reduce((s, e) => s + e.gross, 0) / 2) * r.rate * 2 * 0.9,
      },
    });
    const earners = [
      { gross: 150_000, ruling: { active: false, grandfathered: false } },
      { gross: 0, ruling: { active: false, grandfathered: false } },
    ];
    expect(householdWageTax(joint, earners, fakeRules, 1)).toBeCloseTo(27_000, 6);
  });
  it('for the Netherlands the household total equals the sum of the individual taxes', () => {
    const nl = countryPack('nl');
    const rules = nl.rulesFor(2026);
    const a = { gross: 120_000, ruling: { active: true, grandfathered: false } };
    const b = { gross: 70_000, ruling: { active: false, grandfathered: false } };
    const sum = nl.tax.wage(a.gross, rules, 1, a.ruling).tax + nl.tax.wage(b.gross, rules, 1, b.ruling).tax;
    expect(householdWageTax(nl, [a, b], rules, 1)).toBe(sum);
  });
});
