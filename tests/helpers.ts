import { mergeAssumptions } from '../src/engine/assumptions';
import { makeContext, expectedShocks, simulate } from '../src/engine/simulate';
import { SAMPLE_INPUT } from '../src/engine/sample';
import type { AssumptionOverrides, PlanInput } from '../src/engine/types';

/** A retired single person with only cash, no pensions, no property: easy to check by hand. */
export const BARE: PlanInput = {
  ...SAMPLE_INPUT,
  familyStatus: 'single',
  childrenAges: [],
  age: 60,
  retirementAge: 60,
  yearsInNl: 0,
  retirementDestination: 'in',
  monthlyCoreSpend: 4000,
  annualLifestyleSpend: 0,
  grossSalary: 0,
  rulingYearsLeft: 0,
  eurCash: 1_000_000,
  eurInvestments: 0,
  dutchHomeValue: 0,
  dutchMortgage: 0,
  dutchMortgageMonthlyPayment: 0,
  dutchMortgageYearsLeft: 0,
  dutchSuppPensionMonthly: 0,
  inRealEstate: 0,
  inFixedDeposits: 0,
  inMutualFunds: 0,
  inEpf: 0,
  goldGrams: 0,
};

/** Everything flat: no inflation, no FX movement, no returns, no pensions inside the horizon. */
export const FLAT: AssumptionOverrides = {
  planToAge: 70,
  aowAge: 99,
  indiaPensionAge: 99,
  inflationNl: 0,
  inflationIn: 0,
  fxDriftAnnual: 0,
  fxVol: 0,
  indiaCostFactor: 1,
  returns: {
    eurCash: { mean: 0, vol: 0 },
    eurEquity: { mean: 0, vol: 0 },
    gold: { mean: 0, vol: 0 },
    inrFd: { mean: 0, vol: 0 },
    inrEquity: { mean: 0, vol: 0 },
    inrEpf: { mean: 0, vol: 0 },
  },
};

export function runExpected(input: PlanInput, over: AssumptionOverrides) {
  const a = mergeAssumptions(over);
  const ctx = makeContext(input, a);
  return { ctx, a, res: simulate(ctx, expectedShocks(a, ctx.horizon)) };
}
