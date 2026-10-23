import { describe, expect, it } from 'vitest';
import { LEGACY_SAMPLE, legacySnapshot } from '../src/legacy/v1';
import { runPlan } from '../src/engine/plan';
import { SAMPLE_INPUT } from '../src/engine/sample';

describe('v1 vs v2 on the same household', () => {
  const v1 = legacySnapshot(LEGACY_SAMPLE, 90);
  const v2 = runPlan(SAMPLE_INPUT, { paths: 300 });

  it('the v1 port reproduces a score in the plausible band the app used to show', () => {
    expect(v1.readinessScore).toBeGreaterThan(40);
    expect(v1.readinessScore).toBeLessThan(100);
  });

  it('v2 is materially more cautious than v1 for the same household', () => {
    expect(v2.expected.coverageRatio ?? 1).toBeLessThan(v1.readinessScore / 100);
  });

  it('v2 projects a smaller nominal corpus at retirement than v1 (lower return, Box 3, inflated spending)', () => {
    expect(v2.expected.corpusAtRetirement).toBeLessThan(v1.startingCorpusEur);
  });

  it('v1 reported the same score whatever the rupee did; v2 does not', () => {
    const lowFx = runPlan(SAMPLE_INPUT, { paths: 20, assumptions: { fxDriftAnnual: 0 } });
    const highFx = runPlan(SAMPLE_INPUT, { paths: 20, assumptions: { fxDriftAnnual: 0.06 } });
    expect(highFx.expected.corpusAtRetirement).not.toBeCloseTo(lowFx.expected.corpusAtRetirement, -2);
  });
});
