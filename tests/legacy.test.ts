import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSUMPTIONS, runPlan } from '../src/engine';
import { computeView } from '../src/web/compute';
import { drawdownSeries, planEvents } from '../src/web/chartData';
import { parseProfile, SAMPLE_PROFILE, toPlanInput, type Profile } from '../src/web/profile';

const inputOf = (over: Partial<Profile>) => {
  const r = parseProfile({ ...SAMPLE_PROFILE, ...over });
  if (!r.ok) throw new Error(`should parse: ${JSON.stringify(r.errors)}`);
  return { input: toPlanInput(r.value, 90, 2026), overrides: r.value.overrides };
};
const run = (over: Partial<Profile>, opts: { paths?: number; requiredCurve?: boolean } = {}) => {
  const { input, overrides } = inputOf(over);
  return runPlan(input, { paths: opts.paths ?? 200, seed: 11, assumptions: overrides, ...(opts.requiredCurve ? { requiredCurve: true } : {}) });
};

describe('partner state pension starts at the partner\'s own age', () => {
  it('a couple of the same age gives the same result as not stating the partner age', () => {
    const same = run({ pAge: '45' });
    const unstated = run({ pAge: '' });
    expect(same.expected.requiredCorpus).toBeCloseTo(unstated.expected.requiredCorpus, 4);
    expect(same.monteCarlo.successProbability).toBe(unstated.monteCarlo.successProbability);
    expect(same.expected.rows.map((r) => Math.round(r.pensionGross))).toEqual(unstated.expected.rows.map((r) => Math.round(r.pensionGross)));
  });
  it('a younger partner needs a bigger pot, an older partner a smaller one', () => {
    const young = run({ pAge: '38' }).expected.requiredCorpus;
    const same = run({ pAge: '45' }).expected.requiredCorpus;
    const old = run({ pAge: '52' }).expected.requiredCorpus;
    expect(young).toBeGreaterThan(same);
    expect(old).toBeLessThan(same);
  });
  it('the partner\'s pension arrives years after yours when the partner is younger', () => {
    const a = DEFAULT_ASSUMPTIONS.aowAge;
    const rows = (pAge: string) => run({ pAge }).expected.rows;
    const same = rows('45');
    const young = rows('40');
    const youngAt = (age: number) => young.find((r) => r.age === age)?.pensionGross ?? 0;
    const sameAt = (age: number) => same.find((r) => r.age === age)?.pensionGross ?? 0;
    // At your pension age the younger partner's pension has not started, five years later it has.
    expect(youngAt(a)).toBeLessThan(sameAt(a));
    expect(Math.round(youngAt(a + 5))).toBe(Math.round(sameAt(a + 5)));
  });
  it('adds an event for the partner\'s state pension on the charts', () => {
    const { input } = inputOf({ pAge: '40' });
    const events = planEvents(input, DEFAULT_ASSUMPTIONS);
    const texts = [...events.values()].flat();
    expect(texts.some((t) => t.includes("partner's state pension"))).toBe(true);
    expect(events.get(DEFAULT_ASSUMPTIONS.aowAge + 5)?.some((t) => t.includes("partner's state pension"))).toBe(true);
  });
});

describe('what should be left at the planning age', () => {
  it('spend it all is the default and changes nothing', () => {
    const plain = run({});
    const explicit = run({ legacy: 'spend' });
    expect(explicit.monteCarlo.successProbability).toBe(plain.monteCarlo.successProbability);
    expect(explicit.expected.requiredCorpus).toBe(plain.expected.requiredCorpus);
  });
  it('keeping it intact is harder to reach than spending it all', () => {
    const rich: Partial<Profile> = { nlInvestments: '900000', nlCash: '100000' };
    const spend = run({ ...rich, legacy: 'spend' }).monteCarlo.successProbability;
    const intact = run({ ...rich, legacy: 'intact' }).monteCarlo.successProbability;
    expect(intact).toBeLessThanOrEqual(spend);
  });
  it('a very large pot always lasts, but keeping it intact is a much higher bar (tax and bad markets eat into it)', () => {
    const big: Partial<Profile> = { nlInvestments: '9000000', nlCash: '1000000' };
    const spend = run({ ...big, legacy: 'spend' }).monteCarlo.successProbability;
    const intact = run({ ...big, legacy: 'intact' }).monteCarlo.successProbability;
    expect(spend).toBeGreaterThanOrEqual(0.98);
    expect(intact).toBeLessThan(spend);
    expect(run({ nlInvestments: '400000', nlCash: '50000', legacy: 'intact' }).monteCarlo.successProbability).toBeLessThan(0.5);
  });
  it('the typical-future pot on the day you stop is reported', () => {
    expect(run({}).monteCarlo.medianAtRetirementReal).toBeGreaterThan(0);
  });
  it('the safe yearly payout is an assumption, 3.5% unless changed', () => {
    expect(DEFAULT_ASSUMPTIONS.safeWithdrawalRate).toBe(0.035);
    const r = parseProfile({ ...SAMPLE_PROFILE, assumptions: { safeWithdrawalRate: '4' } });
    expect(r.ok && r.value.overrides.safeWithdrawalRate).toBe(0.04);
    const bad = parseProfile({ ...SAMPLE_PROFILE, assumptions: { safeWithdrawalRate: '9' } });
    expect(bad.ok).toBe(false);
  });
});

describe('one definition of "needed"', () => {
  const view = (over: Partial<Profile>) => {
    const v = computeView({ ...SAMPLE_PROFILE, nlInvestments: '600000', ...over }, 90, 2026);
    if (!v) throw new Error('view');
    return v;
  };
  it('the break-even curve starts the year you stop at the headline figure', () => {
    const v = view({});
    const at = v.plan.expected.requiredByAge?.find((p) => p.age === v.retireAge);
    expect(at?.required).toBeCloseTo(v.plan.expected.requiredCorpus, 3);
  });
  it('spend it all: the needed line at the day you stop equals the headline, in both euro bases and with no percentage', () => {
    const v = view({});
    for (const basis of ['future', 'today'] as const) {
      const s = drawdownSeries(v.plan.monteCarlo.bands, v.monthly, { mode: 'spend', rate: v.safeRate, inflation: v.inflation, startAge: v.age, basis, retireAge: v.retireAge, required: v.plan.expected.requiredByAge ?? [], curve: v.curve });
      const toBasis = basis === 'today' ? 1 / (1 + v.inflation) ** (v.retireAge - v.age) : 1;
      expect(s.find((p) => p.age === v.retireAge)?.needed).toBeCloseTo(v.plan.expected.requiredCorpus * toBasis, 0);
    }
  });
  it('spend it all: needed is the same whatever the safe payout assumption says', () => {
    const a = view({});
    const b = view({ assumptions: { safeWithdrawalRate: '4.5' } });
    const f = (v: ReturnType<typeof view>) => drawdownSeries(v.plan.monteCarlo.bands, v.monthly, { mode: 'spend', rate: v.safeRate, inflation: v.inflation, startAge: v.age, basis: 'today', retireAge: v.retireAge, required: v.plan.expected.requiredByAge ?? [], curve: v.curve }).map((p) => Math.round(p.needed));
    expect(f(a)).toEqual(f(b));
  });
  it('keep it intact: needed follows the chosen share, so a lower share needs a bigger pot', () => {
    const lo = view({ legacy: 'intact', assumptions: { safeWithdrawalRate: '3' } });
    const hi = view({ legacy: 'intact', assumptions: { safeWithdrawalRate: '4.5' } });
    const need = (v: ReturnType<typeof view>) => drawdownSeries(v.plan.monteCarlo.bands, v.monthly, { mode: 'intact', rate: v.safeRate, inflation: v.inflation, startAge: v.age, basis: 'today' }).find((p) => p.age === v.retireAge)?.needed ?? 0;
    expect(need(lo) / need(hi)).toBeCloseTo(4.5 / 3, 6);
  });
  it('the view carries the chosen mode and the typical pot at the day you stop', () => {
    const v = view({ legacy: 'intact' });
    expect(v.legacy).toBe('intact');
    expect(v.typicalAtStop).toBeGreaterThan(0);
  });
});

describe('the warning for Both', () => {
  const w = (months: number) =>
    run({ destination: 'both', monthsInIndia: String(months) } as Partial<Profile>, { paths: 20 }).warnings.find((x) => x.code === 'snowbird-residency')?.message ?? '';
  it('says plainly from six months that Both results are not reliable', () => {
    expect(w(6)).toMatch(/not reliable/);
    expect(w(6)).toMatch(/1 April/);
    expect(w(6)).toMatch(/15 lakh/);
  });
  it('is gentler below four months', () => {
    expect(w(2)).not.toMatch(/not reliable/);
    expect(w(2)).toMatch(/120 and 182/);
  });
  it('is clear from four months', () => {
    expect(w(4)).toMatch(/may become an Indian tax resident/);
  });
});

describe('plan for me to live until age', () => {
  it('is an assumption you can change, 95 by default, with a range of 80 to 105', () => {
    expect(DEFAULT_ASSUMPTIONS.planToAge).toBe(95);
    const ok = parseProfile({ ...SAMPLE_PROFILE, assumptions: { planToAge: '90' } });
    expect(ok.ok && ok.value.overrides.planToAge).toBe(90);
    expect(parseProfile({ ...SAMPLE_PROFILE, assumptions: { planToAge: '70' } }).ok).toBe(false);
    expect(parseProfile({ ...SAMPLE_PROFILE, assumptions: { planToAge: '120' } }).ok).toBe(false);
  });
  it('a shorter plan needs less savings and the horizon follows', () => {
    const v = (age: string) => computeView({ ...SAMPLE_PROFILE, assumptions: { planToAge: age } }, 90, 2026)!;
    expect(v('85').plan.expected.requiredCorpus).toBeLessThan(v('100').plan.expected.requiredCorpus);
    expect(v('85').plan.meta.horizonYears).toBe(85 - 45);
  });
  it('a planning age before an age you entered (here a jewellery sale) is refused with a clear message, not a crash', () => {
    const r = parseProfile({ ...SAMPLE_PROFILE, jewelleryGrams: '100', jewellerySell: true, jewellerySellAge: '90', assumptions: { planToAge: '85' } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.assumptionErrors.planToAge).toMatch(/planning age/i);
  });
});
