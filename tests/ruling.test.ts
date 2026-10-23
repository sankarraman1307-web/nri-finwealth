import { describe, expect, it } from 'vitest';
import { analyzeRuling, SAMPLE_INPUT, type PlanInput } from '../src/engine';

const base: PlanInput = {
  ...SAMPLE_INPUT,
  grossSalary: 100_000,
  rulingYearsLeft: 3,
  rulingGrandfathered: false,
  monthlyCoreSpend: 3000,
  annualLifestyleSpend: 0,
  dutchMortgageMonthlyPayment: 1000,
  dutchMortgageYearsLeft: 2,
};

describe('30% ruling analysis', () => {
  it('returns null when there is no ruling', () => {
    expect(analyzeRuling({ ...base, rulingYearsLeft: 0 })).toBeNull();
  });

  it('values the ruling at today’s rate: EUR 100k salary, worked by hand', () => {
    const r = analyzeRuling(base);
    // tax without ruling 39,432.15; with 30% ruling 25,588.22 -> EUR 13,843.93 a year
    expect(r?.benefitMonthlyNow).toBeCloseTo(13_843.93 / 12, 1);
  });

  it('flags the 2027 cut to 27% and sizes it', () => {
    const r = analyzeRuling(base);
    expect(r?.step2027.applies).toBe(true);
    // benefit 2026 13,843.93 vs 2027 12,717.13 -> EUR 1,126.80 a year
    expect(r?.step2027.monthlyDrop).toBeCloseTo(1126.8 / 12, 1);
  });

  it('does not flag 2027 for rulings granted before 2024', () => {
    expect(analyzeRuling({ ...base, rulingGrandfathered: true })?.step2027.applies).toBe(false);
  });

  it('does not flag 2027 when the ruling ends in 2026', () => {
    expect(analyzeRuling({ ...base, rulingYearsLeft: 1 })?.step2027.applies).toBe(false);
  });

  it('shows the drop when the ruling ends, and when that happens', () => {
    const r = analyzeRuling(base);
    expect(r?.atEnd.year).toBe(2029); // 2026, 2027, 2028 are ruling years
    expect(r?.atEnd.monthlyDrop).toBeGreaterThan(900);
    expect(r?.atEnd.dropPct).toBeGreaterThan(0.1);
    // the drop at the end equals the benefit in the last ruling year
    const lastBenefit = r?.invest.benefitsByYear.at(-1)?.monthly ?? 0;
    expect(r?.atEnd.monthlyDrop).toBeCloseTo(lastBenefit, 6);
  });

  it('checks whether life after the ruling still works: mortgage ends before, so spending drops', () => {
    const r = analyzeRuling(base); // mortgage has 2 years left, ruling ends after 3
    expect(r?.spendMonthlyNow).toBe(4000);
    expect(r?.atEnd.spendMonthlyAfter).toBe(3000);
  });

  it('warns when take-home pay will not cover spending', () => {
    const r = analyzeRuling({ ...base, grossSalary: 60_000, monthlyCoreSpend: 4200, dutchMortgageYearsLeft: 20 });
    expect(r?.atEnd.leftToSaveAfter).toBeLessThan(0);
  });

  it('projects what investing the benefit could become', () => {
    const r = analyzeRuling(base);
    expect(r?.invest.projectedAtEnd).toBeGreaterThan(r?.invest.totalContributed ?? Infinity);
  });

  it('with a zero net return the projection equals the contributions', () => {
    const drag = 0.36 * 0.06; // Box 3 rate x deemed return on investments, 2026
    const r = analyzeRuling(base, { returns: { eurEquity: { mean: drag } } });
    expect(r?.invest.projectedAtEnd).toBeCloseTo(r?.invest.totalContributed ?? -1, 4);
  });

  it('a longer ruling means more banked', () => {
    const a = analyzeRuling({ ...base, rulingYearsLeft: 2 });
    const b = analyzeRuling({ ...base, rulingYearsLeft: 4 });
    expect(b?.invest.projectedAtEnd).toBeGreaterThan(a?.invest.projectedAtEnd ?? Infinity);
  });
});
