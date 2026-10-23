import { describe, expect, it } from 'vitest';
import { BARE, FLAT, runExpected } from './helpers';
import { runPlan } from '../src/engine/plan';
import { SAMPLE_INPUT } from '../src/engine/sample';
import { getNlRules } from '../src/engine/countries/nl/rules';
import { nlWageTax } from '../src/engine/countries/nl/tax';

describe('simulator: hand-checkable cases', () => {
  it('flat world: EUR 1M with EUR 48k a year of spending lasts ten years and ends at EUR 520k', () => {
    const { res } = runExpected(BARE, FLAT);
    expect(res.rows).toHaveLength(10);
    expect(res.rows[9]?.liquidEnd).toBeCloseTo(520_000, 4);
    expect(res.depletedAtAge).toBeNull();
  });

  it('detects the age at which money runs out', () => {
    const { res } = runExpected({ ...BARE, eurCash: 100_000 }, FLAT);
    // 100k -> 52k -> 4k -> year at age 62 cannot be funded
    expect(res.depletedAtAge).toBe(62);
    expect(res.rows[2]?.unmetDeficit).toBeCloseTo(44_000, 4);
  });

  it('REGRESSION v1: core spending inflates (v1 froze it for decades)', () => {
    const small = { ...BARE, retirementDestination: 'nl' as const, eurCash: 25_000 }; // under the Box 3 allowance
    const { res } = runExpected(small, { ...FLAT, inflationNl: 0.03 });
    expect(res.rows[0]?.coreSpend).toBeCloseTo(48_000, 6);
    expect(res.rows[2]?.coreSpend).toBeCloseTo(48_000 * 1.03 ** 2, 6);
  });

  it('REGRESSION v1: pensions and passive income reduce what is drawn from the portfolio', () => {
    const input = { ...BARE, retirementDestination: 'nl' as const, eurCash: 25_000, dutchPassiveIncomeMonthly: 4000 }; // under the 2027 Box 3 allowance
    const { res } = runExpected(input, FLAT);
    for (const r of res.rows) expect(r.netFlow).toBeCloseTo(0, 6);
    expect(res.rows[9]?.liquidEnd).toBeCloseTo(25_000, 6);
  });

  it('REGRESSION v1: deficits before retirement are funded from the portfolio instead of being ignored', () => {
    const input = { ...BARE, age: 40, retirementAge: 50, eurCash: 50_000, retirementDestination: 'nl' as const };
    const { res } = runExpected(input, { ...FLAT, planToAge: 60 });
    const first = res.rows[0];
    expect(first?.phase).toBe('accumulation');
    expect(first?.netFlow).toBeLessThan(0);
    expect(first?.liquidEnd).toBeLessThan(first?.liquidStart ?? 0);
  });

  it('REGRESSION v1: AOW is still paid when you retire to India (v1 set it to zero)', () => {
    const input = { ...BARE, yearsInNl: 30, retirementDestination: 'in' as const };
    const { res } = runExpected(input, { ...FLAT, aowAge: 62 });
    const at62 = res.rows.find((r) => r.age === 62);
    // 30 years of accrual = 60% of EUR 1,662.16 x 12
    expect(at62?.pensionGross).toBeCloseTo(1662.16 * 12 * 0.6, 2);
    expect(res.rows.find((r) => r.age === 61)?.pensionGross).toBe(0);
  });

  it('plans to age 95 by default, not 25 years after retirement', () => {
    const r = runPlan(SAMPLE_INPUT, { paths: 50 });
    expect(r.expected.rows).toHaveLength(50);
    expect(r.expected.rows.at(-1)?.age).toBe(94);
  });
});

describe('simulator: Box 3 and residency', () => {
  it('Box 3 stops when you retire to India, continues if you retire in NL', () => {
    const big = { ...BARE, eurCash: 2_000_000, monthlyCoreSpend: 1000 };
    const india = runExpected(big, { ...FLAT, planToAge: 65 }).res;
    const nl = runExpected({ ...big, retirementDestination: 'nl' }, { ...FLAT, planToAge: 65 }).res;
    expect(india.rows.every((r) => r.box3Tax === 0)).toBe(true);
    expect(nl.rows.every((r) => r.box3Tax > 0)).toBe(true);
  });

  it('Indian property is part of the Box 3 base for a Dutch resident', () => {
    const without = runExpected({ ...SAMPLE_INPUT, inRealEstate: 0 }, {}).res.rows[0]?.box3Tax ?? 0;
    const withRe = runExpected(SAMPLE_INPUT, {}).res.rows[0]?.box3Tax ?? 0;
    expect(withRe).toBeGreaterThan(without + 2_000);
  });

  it('grandfathered ruling holders are partial non-residents for Box 3 until the end of 2026', () => {
    const input = { ...SAMPLE_INPUT, rulingYearsLeft: 3, rulingGrandfathered: true };
    const { res } = runExpected(input, {});
    const y2026 = res.rows[0]?.box3Tax ?? 0;
    const y2027 = res.rows[1]?.box3Tax ?? 0;
    expect(y2027).toBeGreaterThan(y2026);
  });
});

describe('simulator: the 30% ruling flows through the yearly tax', () => {
  const input = { ...SAMPLE_INPUT, grossSalary: 100_000, rulingYearsLeft: 3, rulingGrandfathered: false };
  const { res, a } = runExpected(input, {});

  it('2026 uses 30%', () => {
    const exp = nlWageTax(100_000, getNlRules(2026), 1, { active: true, grandfathered: false }).tax;
    expect(res.rows[0]?.incomeTaxNl).toBeCloseTo(exp, 6);
  });
  it('2027 uses 27% on the grown, index-adjusted figures', () => {
    const gross = 100_000 * (1 + a.wageGrowth);
    const exp = nlWageTax(gross, getNlRules(2027), 1 + a.inflationNl, { active: true, grandfathered: false }).tax;
    expect(res.rows[1]?.incomeTaxNl).toBeCloseTo(exp, 6);
  });
  it('after the ruling ends, tax is on the full salary', () => {
    const t3 = res.rows[3];
    const gross = 100_000 * (1 + a.wageGrowth) ** 3;
    const exp = nlWageTax(gross, getNlRules(2029), (1 + a.inflationNl) ** 3, { active: false, grandfathered: false }).tax;
    expect(t3?.incomeTaxNl).toBeCloseTo(exp, 6);
  });
});

describe('simulator: currency matching (the point of modelling FX properly)', () => {
  it('INR assets that pay INR bills are insensitive to how fast the rupee falls', () => {
    const input = {
      ...BARE,
      eurCash: 0,
      inFixedDeposits: 90_000_000, // INR 9 crore = EUR 1M at 90
      monthlyCoreSpend: 3000,
      retirementDestination: 'in' as const,
    };
    const over = {
      ...FLAT,
      planToAge: 80,
      inflationIn: 0.05,
      returns: { ...FLAT.returns, inrFd: { mean: 0.07, vol: 0 } },
    };
    const lowDrift = runExpected(input, { ...over, fxDriftAnnual: 0 });
    const highDrift = runExpected(input, { ...over, fxDriftAnnual: 0.05 });
    // Convert the ending EUR balance back to rupees: it should be identical.
    const inrLow = lowDrift.res.endState.pots.inrFd * input.eurToInr * lowDrift.res.endState.fxLevel;
    const inrHigh = highDrift.res.endState.pots.inrFd * input.eurToInr * highDrift.res.endState.fxLevel;
    expect(inrHigh / inrLow).toBeCloseTo(1, 9);
  });

  it('but a Dutch-retiring household holding INR assets does feel it', () => {
    const input = { ...SAMPLE_INPUT, retirementDestination: 'nl' as const };
    const lowDrift = runPlan(input, { paths: 20, assumptions: { fxDriftAnnual: 0 } });
    const highDrift = runPlan(input, { paths: 20, assumptions: { fxDriftAnnual: 0.05 } });
    expect(highDrift.expected.corpusAtRetirement).toBeLessThan(lowDrift.expected.corpusAtRetirement);
  });
});
