import { describe, expect, it } from 'vitest';
import { computeView } from '../src/web/compute';
import { SAMPLE_PROFILE, withDestination } from '../src/web/profile';

describe('computing the whole results view', () => {
  it('returns nothing for an invalid profile instead of a half-wrong answer', () => {
    expect(computeView({ ...SAMPLE_PROFILE, salary: 'lots' }, 90, 2026)).toBeNull();
  });
  it('fills every part the page shows', () => {
    const v = computeView(SAMPLE_PROFILE, 90, 2026)!;
    expect(v.plan.monteCarlo.bands.length).toBeGreaterThan(10);
    expect(v.curve.length).toBeGreaterThan(10);
    expect(v.monthly.length).toBe(v.plan.expected.rows.length);
    expect(v.compare).toHaveLength(3);
    expect(v.ruling).not.toBeNull();
    expect(v.destination).toBe('nl');
  });
  it('the headline follows the retirement place you picked', () => {
    const nl = computeView({ ...SAMPLE_PROFILE, destination: 'nl' }, 90, 2026)!;
    const both = computeView(withDestination(SAMPLE_PROFILE, 'both'), 90, 2026)!;
    expect(both.plan.monteCarlo.successProbability).not.toBe(nl.plan.monteCarlo.successProbability);
    // and each place's figure on the comparison cards equals its own headline (same seed, but fewer paths, so allow a little noise)
    const card = nl.compare.find((c) => c.destination === 'nl')!.successProbability;
    expect(Math.abs(card - nl.plan.monteCarlo.successProbability)).toBeLessThan(0.1);
  });
  it('the Both card uses the months you typed, or 6 (an even split) when none', () => {
    expect(computeView(SAMPLE_PROFILE, 90, 2026)!.compareMonths).toBe(6);
    expect(computeView({ ...SAMPLE_PROFILE, monthsInIndia: '4' }, 90, 2026)!.compareMonths).toBe(4);
  });
  it('is repeatable: same answers give the same numbers', () => {
    const a = computeView(SAMPLE_PROFILE, 90, 2026)!;
    const b = computeView(SAMPLE_PROFILE, 90, 2026)!;
    expect(a.plan.monteCarlo.successProbability).toBe(b.plan.monteCarlo.successProbability);
  });
});
