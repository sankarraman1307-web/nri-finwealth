import { describe, expect, it } from 'vitest';
import { runPlan, validateInput } from '../src/engine';
import {
  DEFAULT_MONTHS_IN_INDIA,
  EMPTY_PROFILE,
  QUICK_SAVINGS_CASH_SHARE,
  SAMPLE_PROFILE,
  STARTER_PROFILE,
  mortgageFreeSentence,
  mortgageSummary,
  newProperty,
  parseProfile,
  patchQuickMortgage,
  quickMortgageMode,
  savingsAnswered,
  setQuickMortgage,
  toPlanInput,
  withDestination,
  type Profile,
} from '../src/web/profile';
import { computeView } from '../src/web/compute';
import { accuracyLevel, boosters } from '../src/web/QuickQuestions';

const id = () => 'q1';
const plan = (p: Profile) => {
  const r = parseProfile(p);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return toPlanInput(r.value, 90, 2026);
};
const withSavings = (over: Partial<Profile> = {}): Profile => ({ ...STARTER_PROFILE, savingsQuick: '150000', ...over });

describe('the quick questions start with sensible answers and wait for savings', () => {
  it('the starter profile is complete except for savings', () => {
    const r = parseProfile(STARTER_PROFILE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors)).toEqual(['savingsQuick']);
  });
  it('is answered by a total, by detailed boxes, by India savings or by gold, and 0 counts as an answer', () => {
    expect(savingsAnswered(STARTER_PROFILE)).toBe(false);
    for (const over of [{ savingsQuick: '0' }, { nlCash: '0' }, { nlInvestments: '10' }, { inDeposits: '5 lakh' }, { goldGrams: '10' }]) {
      expect(savingsAnswered({ ...STARTER_PROFILE, ...over })).toBe(true);
    }
    expect(parseProfile({ ...STARTER_PROFILE, savingsQuick: '0' }).ok).toBe(true);
  });
  it('rejects a savings total that is not an amount', () => {
    const r = parseProfile({ ...STARTER_PROFILE, savingsQuick: 'lots' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.savingsQuick).toBeDefined();
  });
  it('splits a single total into cash and investments by the stated share', () => {
    const p = plan(withSavings());
    expect(p.eurCash).toBeCloseTo(150000 * QUICK_SAVINGS_CASH_SHARE, 6);
    expect(p.eurInvestments).toBeCloseTo(150000 * (1 - QUICK_SAVINGS_CASH_SHARE), 6);
    expect(p.eurCash + p.eurInvestments).toBeCloseTo(150000, 6);
  });
  it('ignores the quick total once the detailed boxes are used', () => {
    const p = plan(withSavings({ nlCash: '20000', nlInvestments: '80000' }));
    expect(p.eurCash).toBe(20000);
    expect(p.eurInvestments).toBe(80000);
  });
  it('a saved profile from before this step still loads and runs', () => {
    expect(parseProfile({ ...SAMPLE_PROFILE }).ok).toBe(true);
    const old: Partial<Profile> = { ...SAMPLE_PROFILE };
    delete old.savingsQuick;
    expect(parseProfile({ ...EMPTY_PROFILE, ...old }).ok).toBe(true);
  });
  it('choosing Both suggests an even split', () => {
    expect(DEFAULT_MONTHS_IN_INDIA).toBe(6);
    expect(withDestination(STARTER_PROFILE, 'both').monthsInIndia).toBe('6');
  });
});

describe('one mortgage record shared by the quick box and the Property group', () => {
  it('ticking the box adds the Dutch home with a loan, and the payment alone is enough to run', () => {
    let p = withSavings();
    expect(quickMortgageMode(p)).toBe('edit');
    p = setQuickMortgage(p, true, id);
    expect(p.properties).toHaveLength(1);
    expect(p.properties[0]).toMatchObject({ country: 'nl', use: 'home', hasLoan: true });
    // payment and years are still missing
    expect(parseProfile(p).ok).toBe(false);
    p = patchQuickMortgage(p, { loanPayment: '1600', loanYears: '18' });
    const input = plan(p);
    expect(input.properties?.[0]?.loan).toEqual({ balance: 0, paymentMonthly: 1600, yearsLeft: 18 });
    expect(validateInput(input).filter((i) => i.level === 'error')).toEqual([]);
  });
  it('the payment is counted once: ticking it lowers the odds compared with no mortgage', () => {
    const rich = { savingsQuick: '1200000', retireAge: '60' };
    const none = runPlan(plan(withSavings(rich)), { seed: 1, paths: 200 });
    const p = patchQuickMortgage(setQuickMortgage(withSavings(rich), true, id), { loanPayment: '2500', loanYears: '25' });
    const mortgage = runPlan(plan(p), { seed: 1, paths: 200 });
    expect(none.monteCarlo.successProbability).toBeGreaterThan(0);
    expect(mortgage.monteCarlo.successProbability).toBeLessThan(none.monteCarlo.successProbability);
    expect(mortgage.expected.corpusAtRetirement).toBeLessThan(none.expected.corpusAtRetirement);
  });
  it('a home you keep with only a payment behaves like the same home with a value, apart from the property reserve', () => {
    const quick = patchQuickMortgage(setQuickMortgage(withSavings(), true, id), { loanPayment: '1600', loanYears: '18' });
    const full: Profile = { ...quick, properties: quick.properties.map((r) => ({ ...r, value: '650000', loanBalance: '320000' })) };
    const a = runPlan(plan(quick), { seed: 7, paths: 200 });
    const b = runPlan(plan(full), { seed: 7, paths: 200 });
    expect(a.monteCarlo.successProbability).toBe(b.monteCarlo.successProbability);
    expect(a.expected.corpusAtRetirement).toBeCloseTo(b.expected.corpusAtRetirement, 4);
  });
  it('unticking removes a home that only existed for the loan, but keeps a home with a value', () => {
    const quick = setQuickMortgage(withSavings(), true, id);
    expect(setQuickMortgage(quick, false, id).properties).toEqual([]);
    const withHome: Profile = { ...quick, properties: quick.properties.map((r) => ({ ...r, value: '650000' })) };
    const off = setQuickMortgage(withHome, false, id);
    expect(off.properties).toHaveLength(1);
    expect(off.properties[0]?.hasLoan).toBe(false);
  });
  it('ticking when a home already exists reuses it instead of adding a second one', () => {
    const home = { ...newProperty('nl', 'h'), value: '500000' };
    const p = setQuickMortgage(withSavings({ properties: [home] }), true, id);
    expect(p.properties).toHaveLength(1);
    expect(p.properties[0]?.id).toBe('h');
    expect(p.properties[0]?.hasLoan).toBe(true);
  });
  it('turns into a read-only summary as soon as a second loan or a non-home loan exists, and never changes then', () => {
    const rented = { ...newProperty('nl', 'r'), use: 'rented' as const, value: '380000', rent: '1450', hasLoan: true, loanBalance: '210000', loanPayment: '950', loanYears: '12' };
    const base = withSavings({ properties: [rented] });
    expect(quickMortgageMode(base)).toBe('summary');
    expect(setQuickMortgage(base, true, id)).toBe(base);
    expect(setQuickMortgage(base, false, id)).toBe(base);
    expect(patchQuickMortgage(base, { loanPayment: '1' })).toBe(base);
  });
  it('the summary adds up every loan, converting rupees, and finds the last end age', () => {
    const home = { ...newProperty('nl', 'h'), value: '650000', hasLoan: true, loanBalance: '320000', loanPayment: '1600', loanYears: '18' };
    const flat = { ...newProperty('in', 'f'), value: '12000000', hasLoan: true, loanBalance: '3200000', loanPayment: '38000', loanYears: '9' };
    const s = mortgageSummary(withSavings({ properties: [home, flat] }), 90);
    expect(s.count).toBe(2);
    expect(s.hasRupeeLoan).toBe(true);
    expect(s.monthlyEur).toBeCloseTo(1600 + 38000 / 90, 6);
    expect(s.lastEndAge).toBe(42 + 18);
    expect(s.loans.map((l) => l.endAge).sort()).toEqual([51, 60]);
  });
  it('the summary copes with half-typed loans', () => {
    const home = { ...newProperty('nl', 'h'), hasLoan: true, loanPayment: '16', loanYears: '' };
    const s = mortgageSummary(withSavings({ properties: [home] }), 90);
    expect(s.count).toBe(1);
    expect(s.lastEndAge).toBeNull();
  });
  it('writes the mortgage-free sentence in the right direction', () => {
    expect(mortgageFreeSentence(60, 58)).toBe('You are mortgage-free at 60, two years after you stop working.');
    expect(mortgageFreeSentence(59, 58)).toBe('You are mortgage-free at 59, one year after you stop working.');
    expect(mortgageFreeSentence(58, 58)).toBe('You are mortgage-free at 58, the year you stop working.');
    expect(mortgageFreeSentence(54, 58)).toBe('You are mortgage-free at 54, four years before you stop working.');
    expect(mortgageFreeSentence(80, 58)).toBe('You are mortgage-free at 80, 22 years after you stop working.');
  });
  it('the engine still refuses a loan on a property with no value when it is to be sold', () => {
    const input = plan(withSavings({ properties: [{ ...newProperty('nl', 'h'), value: '650000', hasLoan: true, loanBalance: '1', loanPayment: '1', loanYears: '5', sell: true, sellAge: '65', rentAfterSale: '1800' }] }));
    const bad = { ...input, properties: input.properties?.map((x) => ({ ...x, value: 0 })) };
    expect(validateInput(bad).some((i) => i.level === 'error' && /needs a property with a value/.test(i.message))).toBe(true);
  });
});

describe('the first answer and the sentence under it', () => {
  it('reports the typical age the money runs out, only when some futures fail', () => {
    const risky = runPlan(plan(withSavings({ savingsQuick: '10000', living: '6000' })), { seed: 3, paths: 200 });
    expect(risky.monteCarlo.successProbability).toBeLessThan(0.5);
    const age = risky.monteCarlo.medianFailAge;
    expect(age).not.toBeNull();
    expect(age as number).toBeGreaterThanOrEqual(42);
    expect(age as number).toBeLessThanOrEqual(42 + risky.meta.horizonYears);
    const safe = runPlan(plan(withSavings({ savingsQuick: '3000000', living: '2000', retireAge: '70' })), { seed: 3, paths: 200 });
    expect(safe.monteCarlo.successProbability).toBe(1);
    expect(safe.monteCarlo.medianFailAge).toBeNull();
  });
  it('the median failure age is repeatable and does not move the success probability', () => {
    const a = runPlan(plan(withSavings({ savingsQuick: '40000' })), { seed: 11, paths: 200 });
    const b = runPlan(plan(withSavings({ savingsQuick: '40000' })), { seed: 11, paths: 200 });
    expect(a.monteCarlo.medianFailAge).toBe(b.monteCarlo.medianFailAge);
    expect(a.monteCarlo.successProbability).toBe(b.monteCarlo.successProbability);
  });
  it('the whole view computes from the starter answers plus savings', () => {
    const v = computeView(withSavings(), 90, 2026);
    expect(v).not.toBeNull();
    expect(v?.plan.monteCarlo.successProbability).toBeGreaterThanOrEqual(0);
    expect(computeView(STARTER_PROFILE, 90, 2026)).toBeNull();
  });
});

describe('the accuracy guide', () => {
  it('starts rough and improves as groups are filled in', () => {
    expect(accuracyLevel(STARTER_PROFILE).filled).toBe(1);
    expect(accuracyLevel(STARTER_PROFILE).label).toBe('Rough estimate');
    const withPension = { ...STARTER_PROFILE, pensions: [{ ...SAMPLE_PROFILE.pensions[0]! }] };
    const base = SAMPLE_PROFILE.pensions.length > 0 ? withPension : STARTER_PROFILE;
    expect(accuracyLevel(base).filled).toBeGreaterThanOrEqual(1);
    const everything = { ...SAMPLE_PROFILE };
    expect(accuracyLevel(everything).filled).toBeGreaterThanOrEqual(2);
    expect(boosters(everything).find((b) => b.id === 'property')?.done).toBe(true);
  });
});
