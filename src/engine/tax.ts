import type { Bracket, NlRulesYear } from './rules/nl';

/**
 * Progressive tax over brackets whose upper limits are scaled by `indexFactor`
 * (brackets are indexed every year; without this, wage growth silently pushes people into higher brackets).
 */
export function bracketTax(income: number, brackets: Bracket[], indexFactor = 1): number {
  if (income <= 0) return 0;
  let tax = 0;
  let lower = 0;
  for (const b of brackets) {
    const upper = b.upTo * indexFactor;
    if (income > lower) tax += (Math.min(income, upper) - lower) * b.rate;
    if (income <= upper) break;
    lower = upper;
  }
  return tax;
}

export interface WageTaxResult {
  taxableWage: number;
  tax: number;
}

/**
 * Box 1 tax on salary, with the 30% ruling.
 *
 * Allowance = rate x min(gross, salary cap). The rate is 30% up to 2026 and 27% from 2027
 * for rulings granted 2024 or later; rulings granted before 2024 stay at 30%.
 * Tax credits (heffingskortingen) are deliberately not modelled: this biases results towards
 * caution, and they are worth nothing at the salaries where most of the plan's value sits.
 */
export function nlWageTax(
  gross: number,
  rules: NlRulesYear,
  indexFactor: number,
  ruling: { active: boolean; grandfathered: boolean },
): WageTaxResult {
  let taxableWage = gross;
  if (ruling.active) {
    const rate = ruling.grandfathered ? rules.ruling.grandfatheredRate : rules.ruling.allowanceRate;
    taxableWage = gross - rate * Math.min(gross, rules.ruling.salaryCap * indexFactor);
  }
  return { taxableWage, tax: bracketTax(taxableWage, rules.box1.working, indexFactor) };
}

/** Box 1 tax on pension income (AOW + workplace pension) using the AOW-age bracket table. */
export function nlPensionTax(grossPension: number, rules: NlRulesYear, indexFactor: number): number {
  return bracketTax(grossPension, rules.box1.atAowAge, indexFactor);
}

export interface Box3Position {
  /** Bank and savings balances. */
  savings: number;
  /** Investments, gold, foreign deposits, second homes: everything that is not savings. */
  other: number;
  /** Deductible debts (not the mortgage on the own home, which belongs to Box 1). */
  debts: number;
  /** 1 or 2 (tax partners share a doubled allowance). */
  persons: number;
}

/**
 * Box 3 under the current transitional system (deemed return).
 * Mirrors the Belastingdienst steps: return rate = total deemed return / base before allowance;
 * benefit = (base - allowance) x return rate; tax = 36% x benefit.
 */
export function box3DeemedTax(pos: Box3Position, rules: NlRulesYear, indexFactor: number): number {
  const base = pos.savings + pos.other - pos.debts;
  const allowance = rules.box3.allowancePerPerson * pos.persons * indexFactor;
  if (base <= allowance || base <= 0) return 0;
  const deemedReturn =
    pos.savings * rules.box3.savingsReturn + pos.other * rules.box3.otherReturn - pos.debts * rules.box3.debtReturn;
  if (deemedReturn <= 0) return 0;
  const benefit = (base - allowance) * (deemedReturn / base);
  return benefit * rules.box3.rate;
}

/**
 * Box 3 if/when tax moves to actual returns (planned for 2028, not yet final law).
 * Simplified: tax on positive actual return, pro-rated for the allowance. No loss carry-forward.
 */
export function box3ActualTax(
  pos: Box3Position,
  actualReturn: number,
  rules: NlRulesYear,
  indexFactor: number,
): number {
  const base = pos.savings + pos.other - pos.debts;
  const allowance = rules.box3.allowancePerPerson * pos.persons * indexFactor;
  if (base <= allowance || base <= 0 || actualReturn <= 0) return 0;
  return actualReturn * ((base - allowance) / base) * rules.box3.rate;
}
