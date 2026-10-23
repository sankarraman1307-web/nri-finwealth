import { describe, expect, it } from 'vitest';
import { computeCorpusCurve, mergeAssumptions, runPlan, SAMPLE_INPUT, type CorpusPoint } from '../src/engine';
import { drawdownSeries, earliestFeasibleAge, independenceAge, monthlySeries, type MonthlyPoint } from '../src/web/chartData';

describe('monthly money series', () => {
  const plan = runPlan({ ...SAMPLE_INPUT, retirementAge: 55 }, { paths: 50 });
  const series = monthlySeries(plan.expected.rows, 0.024);

  it('has one point per year, starting at your age', () => {
    expect(series).toHaveLength(plan.expected.rows.length);
    expect(series[0]?.age).toBe(45);
  });
  it('REGRESSION: the stack of income plus savings drawn always equals spending when there is a gap', () => {
    for (const p of series) {
      if (p.fromSavings > 0) expect(p.netPay + p.otherIncome + p.fromSavings).toBeCloseTo(p.spend, 6);
      else expect(p.netPay + p.otherIncome - p.saved).toBeCloseTo(p.spend, 6);
    }
  });
  it('first-year spending matches the plan, in today’s money', () => {
    const r = plan.expected.rows[0]!;
    expect(series[0]?.spend).toBeCloseTo((r.totalSpend + r.box3Tax) / 12, 6);
  });
  it('shows pensions arriving at the state pension age', () => {
    const before = series.find((p) => p.age === 60)!;
    const after = series.find((p) => p.age === 70)!;
    expect(before.otherIncome).toBeLessThan(after.otherIncome);
  });
  it('shows spending stepping down when the mortgage ends', () => {
    const during = series.find((p) => p.age === 62)!; // mortgage 18 years from 45
    const after = series.find((p) => p.age === 64)!;
    expect(after.spend).toBeLessThan(during.spend);
  });
  it('someone who is working and saving is not drawing on savings', () => {
    expect(series[0]?.fromSavings).toBe(0);
    expect(series[0]?.saved).toBeGreaterThan(0);
  });
});

describe('earliest feasible retirement age', () => {
  it('finds the first age where available covers required', () => {
    const c: CorpusPoint[] = [
      { retirementAge: 50, available: 100, required: 500 },
      { retirementAge: 51, available: 300, required: 400 },
      { retirementAge: 52, available: 400, required: 400 },
      { retirementAge: 53, available: 900, required: 300 },
    ];
    expect(earliestFeasibleAge(c)).toBe(52);
  });
  it('returns null when no age works', () => {
    expect(earliestFeasibleAge([{ retirementAge: 50, available: 1, required: 2 }])).toBeNull();
  });
  it('is consistent with the real curve: at that age the plan really is covered', () => {
    const curve = computeCorpusCurve(SAMPLE_INPUT, mergeAssumptions());
    const age = earliestFeasibleAge(curve);
    expect(age).not.toBeNull();
    const plan = runPlan({ ...SAMPLE_INPUT, retirementAge: age as number }, { paths: 50 });
    expect(plan.expected.margin).toBeGreaterThanOrEqual(0);
    const before = runPlan({ ...SAMPLE_INPUT, retirementAge: (age as number) - 1 }, { paths: 50 });
    expect(before.expected.margin).toBeLessThan(0);
  });
});

describe('corpus drawdown series', () => {
  const m = (age: number, spend: number, otherIncome: number): MonthlyPoint => ({ age, netPay: 0, otherIncome, fromSavings: 0, spend, saved: 0 });
  const band = (age: number, p50: number) => ({ age, p10: p50 / 2, p50, p90: p50 * 2 });
  const opts = { rate: 0.04, inflation: 0.02, startAge: 50, basis: 'today' as const };

  it('needed corpus is 12 x (monthly spending - pensions) / rate', () => {
    const s = drawdownSeries([band(60, 1_000_000)], [m(60, 4000, 1000)], opts);
    expect(s[0]?.needed).toBeCloseTo(900_000, 6);
  });
  it('needs nothing once pensions cover all spending', () => {
    expect(drawdownSeries([band(70, 1)], [m(70, 3000, 3500)], opts)[0]?.needed).toBe(0);
  });
  it('drawdown is corpus x rate / 12 and the gap is drawdown + pensions - need', () => {
    const p = drawdownSeries([band(60, 1_200_000)], [m(60, 4000, 1000)], opts)[0]!;
    expect(p.drawdown).toBeCloseTo(4000, 6);
    expect(p.gap).toBeCloseTo(4000 + 1000 - 4000, 6);
  });
  it('a lower drawdown rate needs a bigger corpus', () => {
    const at = (rate: number) => drawdownSeries([band(60, 1)], [m(60, 4000, 1000)], { ...opts, rate })[0]!.needed;
    expect(at(0.03)).toBeGreaterThan(at(0.035));
    expect(at(0.035)).toBeGreaterThan(at(0.04));
  });
  it('future euros multiply every amount by inflation since today and change nothing else', () => {
    const today = drawdownSeries([band(60, 1_000_000)], [m(60, 4000, 1000)], opts)[0]!;
    const future = drawdownSeries([band(60, 1_000_000)], [m(60, 4000, 1000)], { ...opts, basis: 'future' })[0]!;
    const f = 1.02 ** 10;
    expect(future.corpus).toBeCloseTo(today.corpus * f, 6);
    expect(future.needed).toBeCloseTo(today.needed * f, 6);
    expect(future.monthlyNeed).toBeCloseTo(today.monthlyNeed * f, 6);
    expect(future.corpus / future.needed).toBeCloseTo(today.corpus / today.needed, 9);
  });
  it('keeps only the ages present in both series', () => {
    const s = drawdownSeries([band(60, 1), band(61, 1), band(62, 1)], [m(61, 1, 0), m(62, 1, 0), m(63, 1, 0)], opts);
    expect(s.map((p) => p.age)).toEqual([61, 62]);
  });
  it('independence age is the first age the corpus covers what is needed, and is null if never', () => {
    const series = drawdownSeries([band(60, 400_000), band(61, 950_000), band(62, 2_000_000)], [m(60, 4000, 1000), m(61, 4000, 1000), m(62, 4000, 1000)], opts);
    expect(independenceAge(series)).toBe(61);
    expect(independenceAge(drawdownSeries([band(60, 1)], [m(60, 4000, 0)], opts))).toBeNull();
  });
  it('on a real plan, corpus >= needed exactly when the monthly picture has no shortfall', () => {
    const plan = runPlan({ ...SAMPLE_INPUT, retirementAge: 55 }, { paths: 100 });
    const series = drawdownSeries(plan.monteCarlo.bands, monthlySeries(plan.expected.rows, 0.024), { ...opts, rate: 0.035, inflation: 0.024, startAge: 45 });
    expect(series.length).toBeGreaterThan(40);
    for (const p of series) expect(p.corpus >= p.needed - 1e-6).toBe(p.gap >= -1e-6);
  });
});
