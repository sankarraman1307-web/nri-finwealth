import { describe, expect, it } from 'vitest';
import { runPlan } from '../src/engine/plan';
import { SAMPLE_INPUT } from '../src/engine/sample';

/**
 * Golden cases. If a change to the engine moves any of these numbers, this test fails and a human
 * must decide whether the change is intended. Replace these with 10-15 profiles reviewed by a Dutch
 * tax adviser and a cross-border planner before launch: the tests are only as good as the review.
 *
 * Updated 2026-10-23 for the proposed 2027 Box 3 figures (tax-free capital 30,846, deemed return 7.87% on other assets), which lowers every success rate.
 * Values are tied to the 2026-10-22 rule set and the default assumptions, 1,000 paths, default seed.
 */
describe('golden profiles', () => {
  it('sample household retiring at 55 in the Netherlands', () => {
    const r = runPlan(SAMPLE_INPUT, { paths: 1000 });
    expect(r.expected.corpusAtRetirement).toBeCloseTo(713_326, -2);
    expect(r.expected.requiredCorpus).toBeCloseTo(1_876_447, -2);
    expect(r.expected.depletedAtAge).toBe(62);
    expect(r.monteCarlo.successProbability).toBe(0.012);
    expect(r.verdict).toBe('at_risk');
  });

  it('same household retiring at 68 in the Netherlands', () => {
    const r = runPlan({ ...SAMPLE_INPUT, retirementAge: 68 }, { paths: 1000 });
    expect(r.expected.corpusAtRetirement).toBeCloseTo(2_051_953, -2);
    expect(r.expected.requiredCorpus).toBeCloseTo(1_372_451, -2);
    expect(r.expected.depletedAtAge).toBeNull();
    expect(r.monteCarlo.successProbability).toBe(0.601);
    expect(r.verdict).toBe('at_risk');
  });

  it('same household retiring at 55 in India (optimistic: Indian tax not modelled)', () => {
    const r = runPlan({ ...SAMPLE_INPUT, retirementDestination: 'in' }, { paths: 1000 });
    expect(r.expected.requiredCorpus).toBeCloseTo(588_462, -2);
    expect(r.monteCarlo.successProbability).toBe(0.513);
    expect(r.warnings.some((w) => w.code === 'india-tax' && w.severity === 'important')).toBe(true);
  });
});
