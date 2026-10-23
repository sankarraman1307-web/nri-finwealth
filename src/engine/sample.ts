import type { PlanInput } from './types';

/** The default profile from the v1 app (45-year-old couple, two children, NL home, Indian assets). */
export const SAMPLE_INPUT: PlanInput = {
  startYear: 2026,
  age: 45,
  retirementAge: 55,
  familyStatus: 'partner',
  childrenAges: [12, 16],
  yearsInNl: 10,
  retirementDestination: 'nl',

  monthlyCoreSpend: 5000,
  annualLifestyleSpend: 8000,

  grossSalary: 180000,
  rulingYearsLeft: 0,
  rulingGrandfathered: false,
  eurCash: 25000,
  eurInvestments: 190000,
  dutchHomeValue: 650000,
  dutchMortgage: 320000,
  dutchMortgageMonthlyPayment: 1600,
  dutchMortgageYearsLeft: 18,
  dutchBusinessEquity: 0,
  dutchSuppPensionMonthly: 500,
  dutchPassiveIncomeMonthly: 0,

  inRealEstate: 12_000_000,
  inFixedDeposits: 6_500_000,
  inMutualFunds: 6_000_000,
  inEpf: 5_000_000,
  inBusinessEquity: 0,
  inMortgage: 0,
  inMortgageMonthlyPayment: 0,
  inMortgageYearsLeft: 15,
  inPensionAnnual: 0,
  inPassiveIncomeMonthly: 0,

  goldGrams: 100,
  goldEurPerGram: 78.5,
  otherDebts: 0,

  eurToInr: 90,
};
