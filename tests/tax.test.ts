import { describe, expect, it } from 'vitest';
import { getNlRules } from '../src/engine/countries/nl/rules';
import { box3ActualTax, box3DeemedTax, bracketTax, nlPensionTax, nlWageTax } from '../src/engine/countries/nl/tax';

const r26 = getNlRules(2026);
const r27 = getNlRules(2027);
const noRuling = { active: false, grandfathered: false };

describe('Box 1 brackets (2026)', () => {
  it('taxes a EUR 100,000 salary across three brackets', () => {
    // 38,883 x 35.75% + 39,543 x 37.56% + 21,574 x 49.5% (worked by hand)
    expect(nlWageTax(100_000, r26, 1, noRuling).tax).toBeCloseTo(39_432.15, 1);
  });
  it('is zero for zero or negative income', () => {
    expect(bracketTax(0, r26.box1.working)).toBe(0);
    expect(bracketTax(-5, r26.box1.working)).toBe(0);
  });
  it('is continuous at bracket edges', () => {
    const edge = 38_883;
    const below = bracketTax(edge - 0.01, r26.box1.working);
    const above = bracketTax(edge + 0.01, r26.box1.working);
    expect(above - below).toBeLessThan(0.02);
  });
  it('scales bracket limits with the index factor (no hidden bracket creep)', () => {
    const base = bracketTax(60_000, r26.box1.working, 1);
    const indexed = bracketTax(60_000 * 1.1, r26.box1.working, 1.1);
    expect(indexed).toBeCloseTo(base * 1.1, 6);
  });
  it('uses the lower first-bracket rate at AOW age', () => {
    expect(nlPensionTax(30_000, r26, 1)).toBeLessThan(bracketTax(30_000, r26.box1.working, 1));
  });
});

describe('30% ruling', () => {
  it('2026: 30% of salary is tax free', () => {
    // taxable 70,000 -> 38,883 x 35.75% + 31,117 x 37.56%
    const out = nlWageTax(100_000, r26, 1, { active: true, grandfathered: false });
    expect(out.taxableWage).toBeCloseTo(70_000, 6);
    expect(out.tax).toBeCloseTo(25_588.22, 1);
  });
  it('2027: allowance falls to 27% for rulings granted 2024 or later', () => {
    const out = nlWageTax(100_000, r27, 1, { active: true, grandfathered: false });
    expect(out.taxableWage).toBeCloseTo(73_000, 6);
    expect(out.tax).toBeCloseTo(26_715.02, 1);
  });
  it('2027: rulings granted before 2024 keep 30%', () => {
    const out = nlWageTax(100_000, r27, 1, { active: true, grandfathered: true });
    expect(out.taxableWage).toBeCloseTo(70_000, 6);
  });
  it('allowance is capped at 30% of the salary cap', () => {
    const out = nlWageTax(400_000, r26, 1, { active: true, grandfathered: false });
    expect(out.taxableWage).toBeCloseTo(400_000 - 0.3 * 262_000, 6);
  });
  it('the 2027 cut costs a EUR 100k earner about EUR 1,100 a year', () => {
    const a = nlWageTax(100_000, r26, 1, { active: true, grandfathered: false }).tax;
    const b = nlWageTax(100_000, r27, 1, { active: true, grandfathered: false }).tax;
    expect(b - a).toBeGreaterThan(1_000);
    expect(b - a).toBeLessThan(1_300);
  });
});

describe('Box 3 (deemed return, 2026)', () => {
  it('matches the published worked example: EUR 15k savings + EUR 90k investments, single', () => {
    const tax = box3DeemedTax({ savings: 15_000, other: 90_000, debts: 0, persons: 1 }, r26, 1);
    expect(tax).toBeCloseTo(875, 0);
  });
  it('is zero under the allowance, and the allowance doubles for partners', () => {
    expect(box3DeemedTax({ savings: 50_000, other: 0, debts: 0, persons: 1 }, r26, 1)).toBe(0);
    expect(box3DeemedTax({ savings: 100_000, other: 0, debts: 0, persons: 2 }, r26, 1)).toBe(0);
    expect(box3DeemedTax({ savings: 100_000, other: 0, debts: 0, persons: 1 }, r26, 1)).toBeGreaterThan(0);
  });
  it('is the same whether or not you earned anything: that is the point of a deemed return', () => {
    const pos = { savings: 0, other: 500_000, debts: 0, persons: 1 };
    expect(box3DeemedTax(pos, r26, 1)).toBeGreaterThan(5_000);
  });
  it('debts reduce the tax', () => {
    const noDebt = box3DeemedTax({ savings: 0, other: 300_000, debts: 0, persons: 1 }, r26, 1);
    const debt = box3DeemedTax({ savings: 0, other: 300_000, debts: 100_000, persons: 1 }, r26, 1);
    expect(debt).toBeLessThan(noDebt);
  });
});

describe('Box 3 (actual return regime, if enacted)', () => {
  it('taxes only positive returns', () => {
    const pos = { savings: 0, other: 500_000, debts: 0, persons: 1 };
    expect(box3ActualTax(pos, -20_000, r27, 1)).toBe(0);
    expect(box3ActualTax(pos, 30_000, r27, 1)).toBeGreaterThan(0);
  });
  it('gives a EUR 1,000 tax-free result per person, then taxes the rest at the Box 3 rate', () => {
    const pos = { savings: 0, other: 500_000, debts: 0, persons: 1 };
    expect(box3ActualTax(pos, 1_000, r27, 1)).toBe(0);
    expect(box3ActualTax(pos, 11_000, r27, 1)).toBeCloseTo(10_000 * r27.box3.rate, 6);
    expect(box3ActualTax({ ...pos, persons: 2 }, 11_000, r27, 1)).toBeCloseTo(9_000 * r27.box3.rate, 6);
  });
  it('uses the proposed 2027 tax-free capital and deemed return', () => {
    expect(r27.box3.allowancePerPerson).toBe(30_846);
    expect(r27.box3.otherReturn).toBeCloseTo(0.0787, 6);
  });
});
