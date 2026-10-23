import { describe, expect, it } from 'vitest';
import { BARE, FLAT, runExpected } from './helpers';
import { expectedShocks, initialState, makeContext, mergeAssumptions, runPlan, SAMPLE_INPUT, stepYear, validateInput, type IncomeStream, type PlanInput } from '../src/engine';

const flat = (over: object = {}) => ({ ...FLAT, wageGrowth: 0, ...over });
const stream = (over: Partial<IncomeStream>): IncomeStream => ({ id: 's', label: 'x', who: 'you', kind: 'nl-pension', monthlyToday: 1000, indexed: false, ...over });
const withStreams = (...s: IncomeStream[]): PlanInput => ({ ...BARE, incomeStreams: s });

describe('pensions, annuities and other income', () => {
  it('a Dutch pension is paid between its owner’s own ages, gross, and taxed as pension income', () => {
    const { res } = runExpected(withStreams(stream({ fromAge: 62, untilAge: 64 })), flat());
    expect(res.rows.map((r) => r.pensionGross)).toEqual([0, 0, 12_000, 12_000, 12_000, 0, 0, 0, 0, 0]);
    expect(res.rows[2]!.pensionTax).toBeGreaterThan(0);
    expect(res.rows[2]!.pensionTax).toBeLessThan(12_000 * 0.2);
    expect(res.rows[1]!.pensionTax).toBe(0);
  });
  it('with no ages it is paid from today for life', () => {
    const { res } = runExpected(withStreams(stream({})), flat());
    expect(res.rows.every((r) => r.pensionGross === 12_000)).toBe(true);
  });
  it('an indexed pension rises with Dutch inflation and a fixed one does not', () => {
    const idx = runExpected(withStreams(stream({ indexed: true })), flat({ inflationNl: 0.03 })).res;
    const fix = runExpected(withStreams(stream({ indexed: false })), flat({ inflationNl: 0.03 })).res;
    expect(idx.rows[5]!.pensionGross).toBeCloseTo(12_000 * 1.03 ** 5, 6);
    expect(fix.rows[5]!.pensionGross).toBe(12_000);
  });
  it('an Indian pension is in rupees: fixed it shrinks in euros as the rupee weakens, indexed it keeps up with Indian inflation', () => {
    const base = { fromAge: 60, monthlyToday: 50_000 };
    const over = flat({ fxDriftAnnual: 0.025, inflationIn: 0.05 });
    const fixed = runExpected(withStreams(stream({ ...base, kind: 'in-pension', indexed: false })), over).res;
    const idx = runExpected(withStreams(stream({ ...base, kind: 'in-pension', indexed: true })), over).res;
    expect(fixed.rows[0]!.pensionGross).toBeCloseTo((50_000 * 12) / 90, 6);
    expect(fixed.rows[4]!.pensionGross).toBeCloseTo((50_000 * 12) / (90 * 1.025 ** 4), 4);
    expect(idx.rows[4]!.pensionGross).toBeCloseTo((50_000 * 12 * 1.05 ** 4) / (90 * 1.025 ** 4), 4);
    expect(idx.rows[9]!.pensionGross).toBeGreaterThan(fixed.rows[9]!.pensionGross);
  });
  it('an Indian pension is not taxed in the Netherlands when you retire to India, and is when you retire to the Netherlands', () => {
    const s = stream({ kind: 'in-pension', monthlyToday: 100_000, fromAge: 60 });
    const inIndia = runExpected({ ...withStreams(s), retirementDestination: 'in' }, flat()).res;
    const inNl = runExpected({ ...withStreams(s), retirementDestination: 'nl' }, flat()).res;
    expect(inIndia.rows[0]!.pensionTax).toBe(0);
    expect(inNl.rows[0]!.pensionTax).toBeGreaterThan(0);
  });
  it('other income is added after tax and is not taxed again', () => {
    const { res } = runExpected(withStreams(stream({ kind: 'other', monthlyToday: 1500, fromAge: 60, untilAge: 64 })), flat());
    const base = runExpected(BARE, flat()).res;
    for (let k = 0; k < 5; k++) expect(res.rows[k]!.incomeNet - base.rows[k]!.incomeNet).toBeCloseTo(18_000, 6);
    expect(res.rows[5]!.incomeNet - base.rows[5]!.incomeNet).toBeCloseTo(0, 6);
    expect(res.rows[0]!.pensionTax).toBe(0);
    expect(res.rows[0]!.pensionGross).toBe(0);
  });
  it('a partner pension starts at the partner’s age, not yours, and is ignored for a single person', () => {
    const s = stream({ who: 'partner', fromAge: 60 });
    const couple: PlanInput = { ...withStreams(s), familyStatus: 'partner', partnerAge: 55 };
    const { res } = runExpected(couple, flat());
    expect(res.rows.map((r) => r.pensionGross > 0)).toEqual([false, false, false, false, false, true, true, true, true, true]);
    const single = runExpected(withStreams(s), flat()).res;
    expect(single.rows.every((r) => r.pensionGross === 0)).toBe(true);
  });
  it('more pension income means a better chance and a longer-lasting pot', () => {
    const base = runPlan({ ...SAMPLE_INPUT, retirementAge: 55 }, { paths: 300 }).monteCarlo.successProbability;
    const more = runPlan({ ...SAMPLE_INPUT, retirementAge: 55, incomeStreams: [stream({ monthlyToday: 1500, fromAge: 68, indexed: true })] }, { paths: 300 }).monteCarlo.successProbability;
    expect(more).toBeGreaterThan(base);
  });
  it('warns about a fixed Indian pension and about taxes on Dutch pensions', () => {
    const plan = runPlan({ ...SAMPLE_INPUT, incomeStreams: [stream({ kind: 'in-pension', indexed: false }), stream({ id: 'b', kind: 'annuity' })] }, { paths: 20 });
    expect(plan.warnings.some((w) => w.code === 'in-pension-fixed')).toBe(true);
    expect(plan.warnings.some((w) => w.code === 'pension-tax')).toBe(true);
  });
  it('rejects a negative amount or an end before the start', () => {
    const bad = validateInput(withStreams(stream({ monthlyToday: -1, fromAge: 65, untilAge: 60 })));
    expect(bad.filter((i) => i.level === 'error' && i.field === 'incomeStreams').length).toBe(2);
  });
});

describe('a fixed monthly investment', () => {
  // Working for ten years on 6,000 a month after tax, spending 4,000 a month.
  const working: PlanInput = {
    ...BARE,
    age: 50,
    retirementAge: 60,
    retirementDestination: 'nl',
    incomeStreams: [stream({ id: 'inc', kind: 'other', monthlyToday: 6000 })],
  };
  const invest = (mi: Partial<NonNullable<PlanInput['monthlyInvesting']>>): PlanInput => ({
    ...working,
    monthlyInvesting: { eurEquity: 0, eurCash: 0, gold: 0, inrEquity: 0, stepUpYearly: 0, ...mi },
  });

  it('invests exactly what you planned when enough is left, and spends the rest', () => {
    const legacy = runExpected(working, flat()).res;
    const fixed = runExpected(invest({ eurEquity: 500 }), flat()).res;
    expect(legacy.rows[0]!.netFlow).toBeGreaterThan(6000);
    expect(fixed.rows[0]!.invested).toBe(6000);
    expect(fixed.rows[0]!.investedPlanned).toBe(6000);
    // The leftover is not saved, so the pot ends lower than when everything left over is saved.
    expect(fixed.rows[9]!.liquidEnd).toBeLessThan(legacy.rows[9]!.liquidEnd);
  });
  it('invests no more than what is left, and says so', () => {
    const { res } = runExpected(invest({ eurEquity: 100_000 }), flat());
    expect(res.rows[0]!.invested).toBeCloseTo(res.rows[0]!.netFlow, 6);
    expect(res.rows[0]!.investedPlanned).toBe(1_200_000);
    const plan = runPlan(invest({ eurEquity: 100_000 }), { paths: 20 });
    expect(plan.warnings.some((w) => w.code === 'investing-capped')).toBe(true);
    expect(runPlan(invest({ eurEquity: 500 }), { paths: 20 }).warnings.some((w) => w.code === 'investing-capped')).toBe(false);
  });
  it('the yearly increase compounds, and investing stops at the chosen age', () => {
    const { res } = runExpected(invest({ eurEquity: 500, stepUpYearly: 0.1, untilAge: 53 }), flat());
    expect(res.rows[0]!.invested).toBeCloseTo(6000, 6);
    expect(res.rows[1]!.invested).toBeCloseTo(6600, 6);
    expect(res.rows[2]!.invested).toBeCloseTo(7260, 6);
    expect(res.rows[3]!.investedPlanned).toBe(0); // age 53: stopped
  });
  it('splits the money into the pots you chose, converting rupees at the day’s rate', () => {
    const input = invest({ eurEquity: 100, eurCash: 50, gold: 25, inrEquity: 9000 });
    const a = mergeAssumptions(flat());
    const ctx = makeContext(input, a);
    const start = initialState(input);
    const { state } = stepYear(ctx, start, 0, expectedShocks(a, ctx.horizon)[0]!);
    expect(state.pots.eurEquity - start.pots.eurEquity).toBeCloseTo(1200, 6);
    expect(state.pots.eurCash - start.pots.eurCash).toBeCloseTo(600, 6);
    expect(state.pots.gold - start.pots.gold).toBeCloseTo(300, 6);
    expect(state.pots.inrEquity - start.pots.inrEquity).toBeCloseTo((9000 * 12) / 90, 6);
  });
  it('without a fixed amount, everything left over is saved as before (80% invested, 20% cash)', () => {
    const { res } = runExpected(working, flat());
    expect(res.rows[0]!.invested).toBeCloseTo(res.rows[0]!.netFlow, 6);
    expect(res.rows[0]!.investedPlanned).toBe(0);
  });
  it('rejects negative amounts and silly increases', () => {
    expect(validateInput(invest({ eurEquity: -5 })).some((i) => i.field === 'monthlyInvesting')).toBe(true);
    expect(validateInput(invest({ stepUpYearly: 0.5 })).some((i) => i.field === 'monthlyInvesting')).toBe(true);
  });
});
