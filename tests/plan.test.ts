import { describe, expect, it } from 'vitest';
import { mergeAssumptions } from '../src/engine/assumptions';
import { requiredCorpusAtRetirement, runPlan, verdictFor } from '../src/engine/plan';
import { SAMPLE_INPUT } from '../src/engine/sample';
import {
  expectedShocks,
  makeContext,
  simulate,
  sumPots,
} from '../src/engine/simulate';
import { validateInput } from '../src/engine/validate';
import { ASSET_CLASSES } from '../src/engine/types';

describe('input validation', () => {
  it('accepts the sample profile', () => {
    expect(validateInput(SAMPLE_INPUT).filter((i) => i.level === 'error')).toEqual([]);
  });
  it('rejects retiring before today, negatives and nonsense FX', () => {
    const errs = validateInput({ ...SAMPLE_INPUT, retirementAge: 40, eurCash: -5, eurToInr: 0 }).filter((i) => i.level === 'error');
    expect(errs.map((e) => e.field).sort()).toEqual(['eurCash', 'eurToInr', 'retirementAge']);
  });
  it('runPlan refuses invalid input instead of returning confident nonsense', () => {
    expect(() => runPlan({ ...SAMPLE_INPUT, retirementAge: 99 })).toThrow(/Invalid plan input/);
  });
  it('warns about an unusual exchange rate', () => {
    expect(validateInput({ ...SAMPLE_INPUT, eurToInr: 9 }).some((i) => i.field === 'eurToInr' && i.level === 'warning')).toBe(true);
  });
});

describe('snapshot (scores kept comparable with v1)', () => {
  const r = runPlan(SAMPLE_INPUT, { paths: 50 });
  it('net worth for the sample household, worked by hand', () => {
    // assets 25,000 + 650,000 + 190,000 + 29.5M/90 + 7,850; liabilities 320,000
    expect(r.snapshot.netWorth).toBeCloseTo(880_627.78, 1);
  });
  it('wealth and emergency scores', () => {
    expect(r.snapshot.financialWealthScore).toBe(87);
    expect(r.snapshot.emergencyScore).toBe(63); // 25,000 / (6 x (5,000 + 1,600))
  });
  it('REGRESSION v1: the category and geography charts add up to the same total', () => {
    const cat = r.snapshot.assetsByCategory.reduce((s, x) => s + x.value, 0);
    const geo = r.snapshot.assetsByGeography.reduce((s, x) => s + x.value, 0);
    expect(geo).toBeCloseTo(cat, 6);
    expect(cat).toBeCloseTo(r.snapshot.totalAssets, 6);
  });
});

describe('required corpus', () => {
  const a = mergeAssumptions();
  for (const retireAt of [55, 62, 70]) {
    it(`is the tipping point: just above survives, just below does not (retire at ${retireAt})`, () => {
      const input = { ...SAMPLE_INPUT, retirementAge: retireAt };
      const ctx = makeContext(input, a);
      const shocks = expectedShocks(a, ctx.horizon);
      const base = simulate(ctx, shocks);
      const req = requiredCorpusAtRetirement(ctx, base.stateAtRetirement, shocks);
      const total = sumPots(base.stateAtRetirement.pots);

      const withAmount = (amount: number) => {
        const pots = { ...base.stateAtRetirement.pots };
        for (const c of ASSET_CLASSES) pots[c] = (base.stateAtRetirement.pots[c] / total) * amount;
        return simulate(ctx, shocks, { from: { state: { ...base.stateAtRetirement, pots }, t: ctx.yearsToRetire } });
      };
      expect(withAmount(req * 1.001).depletedAtAge).toBeNull();
      expect(withAmount(req * 0.99).depletedAtAge).not.toBeNull();
    });
  }

  it('margin and expected-path outcome agree', () => {
    for (const retireAt of [55, 70]) {
      const r = runPlan({ ...SAMPLE_INPUT, retirementAge: retireAt }, { paths: 50 });
      if (r.expected.depletedAtAge === null) expect(r.expected.margin).toBeGreaterThan(-1);
      else expect(r.expected.margin).toBeLessThan(1);
    }
  });

  it('REGRESSION v1: the score is not capped, so a big shortfall stays visible', () => {
    const r = runPlan(SAMPLE_INPUT, { paths: 50 });
    expect(r.expected.margin).toBeLessThan(-100_000);
    expect(r.expected.coverageRatio).toBeLessThan(1);
  });

  it('is zero when pensions and passive income cover everything', () => {
    const r = runPlan({ ...SAMPLE_INPUT, dutchPassiveIncomeMonthly: 25_000 }, { paths: 100 });
    expect(r.expected.requiredCorpus).toBe(0);
    expect(r.expected.coverageRatio).toBeNull();
    expect(r.verdict).toBe('on_track');
  });
});

describe('verdict thresholds', () => {
  it('maps success probability to a plain-language verdict', () => {
    expect(verdictFor(0.95)).toBe('on_track');
    expect(verdictFor(0.9)).toBe('on_track');
    expect(verdictFor(0.89)).toBe('borderline');
    expect(verdictFor(0.7)).toBe('borderline');
    expect(verdictFor(0.69)).toBe('at_risk');
  });
  it('labels by the rounded percentage the user sees', () => {
    expect(verdictFor(0.896)).toBe('on_track'); // shown as 90%
    expect(verdictFor(0.894)).toBe('borderline'); // shown as 89%
    expect(verdictFor(0.696)).toBe('borderline'); // shown as 70%
  });
});

describe('warnings are honest about what is not modelled', () => {
  it('flags the 2027 ruling cut only for rulings it applies to', () => {
    const on = runPlan({ ...SAMPLE_INPUT, rulingYearsLeft: 3 }, { paths: 20 }).warnings.map((w) => w.code);
    const grand = runPlan({ ...SAMPLE_INPUT, rulingYearsLeft: 3, rulingGrandfathered: true }, { paths: 20 }).warnings.map((w) => w.code);
    const none = runPlan(SAMPLE_INPUT, { paths: 20 }).warnings.map((w) => w.code);
    expect(on).toContain('ruling-2027');
    expect(grand).not.toContain('ruling-2027');
    expect(none).not.toContain('ruling-2027');
  });
  it('India retirement carries an important tax warning', () => {
    const w = runPlan({ ...SAMPLE_INPUT, retirementDestination: 'in' }, { paths: 20 }).warnings;
    expect(w.find((x) => x.code === 'india-tax')?.severity).toBe('important');
  });
  it('lists unverified rule estimates', () => {
    expect(runPlan(SAMPLE_INPUT, { paths: 20 }).warnings.some((w) => w.code === 'unverified-rule')).toBe(true);
  });
  it('important warnings come first', () => {
    const w = runPlan({ ...SAMPLE_INPUT, retirementDestination: 'in' }, { paths: 20 }).warnings;
    expect(w[0]?.severity).toBe('important');
  });
});

describe('sweeps and sensitivities', () => {
  const r = runPlan(SAMPLE_INPUT, { paths: 300, sweep: true, sensitivities: true });
  it('success probability rises with retirement age', () => {
    const s = r.retirementAgeSweep ?? [];
    expect(s.length).toBeGreaterThan(10);
    expect((s.at(-1)?.successProbability ?? 0)).toBeGreaterThan(s[0]?.successProbability ?? 1);
  });
  it('sensitivities point the right way', () => {
    const by = Object.fromEntries((r.sensitivities ?? []).map((x) => [x.id, x.delta]));
    expect(by['retire-later-2']).toBeGreaterThanOrEqual(0);
    expect(by['spend-less-10']).toBeGreaterThanOrEqual(0);
    expect(by['spend-more-10']).toBeLessThanOrEqual(0);
    expect(by['returns-minus-1']).toBeLessThanOrEqual(0);
    expect(by['rupee-faster']).toBeLessThanOrEqual(0);
  });
});
