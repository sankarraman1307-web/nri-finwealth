import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSUMPTIONS, mergeAssumptions } from '../src/engine/assumptions';
import { aowAccrualYears, householdWeight } from '../src/engine/simulate';
import { SAMPLE_INPUT } from '../src/engine/sample';

const a = DEFAULT_ASSUMPTIONS;

describe('household weight', () => {
  it('single adult = 1.0, partner adds 0.5', () => {
    expect(householdWeight(a, 'single', [], 0)).toBe(1);
    expect(householdWeight(a, 'partner', [], 0)).toBe(1.5);
  });
  it('children weigh 0.3 until 17, 0.5 from 18 to 24', () => {
    expect(householdWeight(a, 'single', [17], 0)).toBeCloseTo(1.3, 9);
    expect(householdWeight(a, 'single', [17], 1)).toBeCloseTo(1.5, 9);
    expect(householdWeight(a, 'single', [24], 0)).toBeCloseTo(1.5, 9);
  });
  it('REGRESSION v1: a child counts 0.0 from age 25, as the spec says (v1 still counted 0.5 at 25)', () => {
    expect(householdWeight(a, 'single', [24], 1)).toBe(1);
    expect(householdWeight(a, 'single', [30], 0)).toBe(1);
  });
});

describe('AOW accrual', () => {
  it('retiring in NL: you keep accruing until AOW age', () => {
    // 10 years so far + (68 - 45) more
    expect(aowAccrualYears({ ...SAMPLE_INPUT, retirementDestination: 'nl' }, mergeAssumptions())).toBe(33);
  });
  it('REGRESSION v1: retiring to India stops accrual at the retirement age', () => {
    // v1 gave 10 + (67 - 45) = 32 years even though the person had left at 55
    expect(aowAccrualYears({ ...SAMPLE_INPUT, retirementDestination: 'in' }, mergeAssumptions())).toBe(20);
  });
  it('caps at 50 years', () => {
    expect(aowAccrualYears({ ...SAMPLE_INPUT, yearsInNl: 44 }, mergeAssumptions())).toBe(50);
  });
});
