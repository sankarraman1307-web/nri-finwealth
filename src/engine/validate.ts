import type { PlanInput, ValidationIssue } from './types';

const NUMERIC_NON_NEGATIVE: (keyof PlanInput)[] = [
  'monthlyCoreSpend',
  'annualLifestyleSpend',
  'grossSalary',
  'eurCash',
  'eurInvestments',
  'dutchHomeValue',
  'dutchMortgage',
  'dutchMortgageMonthlyPayment',
  'dutchBusinessEquity',
  'dutchSuppPensionMonthly',
  'dutchPassiveIncomeMonthly',
  'inRealEstate',
  'inFixedDeposits',
  'inMutualFunds',
  'inEpf',
  'inBusinessEquity',
  'inMortgage',
  'inMortgageMonthlyPayment',
  'inPensionAnnual',
  'inPassiveIncomeMonthly',
  'goldGrams',
  'otherDebts',
];

export function validateInput(input: PlanInput, planToAge = 95): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (field: string, message: string) => issues.push({ field, message, level: 'error' });
  const warn = (field: string, message: string) => issues.push({ field, message, level: 'warning' });

  for (const k of NUMERIC_NON_NEGATIVE) {
    const v = input[k] as number;
    if (!Number.isFinite(v)) err(k, 'Must be a number');
    else if (v < 0) err(k, 'Cannot be negative');
  }
  if (!Number.isFinite(input.eurToInr) || input.eurToInr <= 0) err('eurToInr', 'Exchange rate must be positive');
  if (input.age < 18 || input.age > 80) err('age', 'Age must be between 18 and 80');
  if (input.retirementAge < input.age) err('retirementAge', 'Retirement age cannot be before your current age');
  if (input.retirementAge >= planToAge) err('retirementAge', `Retirement age must be below the planning age (${planToAge})`);
  if (input.monthlyCoreSpend <= 0) err('monthlyCoreSpend', 'Core monthly spending must be above zero');
  if (input.yearsInNl < 0 || input.yearsInNl > input.age) err('yearsInNl', 'Years in NL cannot exceed your age');
  if (input.childrenAges.some((c) => c < 0 || c > 40)) err('childrenAges', 'Child ages must be between 0 and 40');
  const pe = input.partnerEarner;
  if (pe) {
    if (!Number.isFinite(pe.grossSalary) || pe.grossSalary < 0) err('partnerEarner.grossSalary', 'Cannot be negative');
    if (pe.age < 18 || pe.age > 80) err('partnerEarner.age', 'Partner age must be between 18 and 80');
    if (pe.retirementAge < pe.age) err('partnerEarner.retirementAge', 'Partner retirement age cannot be before their current age');
    if (pe.rulingYearsLeft < 0 || pe.rulingYearsLeft > 5) err('partnerEarner.rulingYearsLeft', 'The ruling lasts at most 5 years');
  }
  for (const e of input.yearlyExpenses ?? []) {
    if (!Number.isFinite(e.amountToday) || e.amountToday < 0) err('yearlyExpenses', `${e.label}: amount cannot be negative`);
  }
  if (input.snowbirdMonthsInIndia !== undefined && (input.snowbirdMonthsInIndia < 0 || input.snowbirdMonthsInIndia > 12))
    err('snowbirdMonthsInIndia', 'Months in India must be between 0 and 12');
  if (input.inPropertySellAtAge !== undefined && input.inPropertySellAtAge >= planToAge)
    err('inPropertySellAtAge', 'Sale age must be below the planning age');
  if (input.dutchHomeSellAtAge !== undefined && input.dutchHomeSellAtAge >= planToAge)
    err('dutchHomeSellAtAge', 'Sale age must be below the planning age');
  const seen = new Set<string>();
  for (const x of input.properties ?? []) {
    if (seen.has(x.id)) err('properties', `Two properties share the id ${x.id}`);
    seen.add(x.id);
    if (!Number.isFinite(x.value) || x.value < 0) err('properties', 'A property value cannot be negative');
    if (x.rentMonthly !== undefined && (!Number.isFinite(x.rentMonthly) || x.rentMonthly < 0)) err('properties', 'Rent cannot be negative');
    if (x.loan) {
      if (!(x.loan.balance >= 0) || !(x.loan.paymentMonthly >= 0)) err('properties', 'A loan balance or payment cannot be negative');
      if (!(x.loan.yearsLeft >= 0 && x.loan.yearsLeft <= 50)) err('properties', 'Loan years left must be between 0 and 50');
      if (x.value <= 0) err('properties', 'A loan needs a property with a value');
    }
    if (x.sellAtAge !== undefined && x.sellAtAge >= planToAge) err('properties', 'Sale age must be below the planning age');
  }
  for (const x of input.incomeStreams ?? []) {
    if (!Number.isFinite(x.monthlyToday) || x.monthlyToday < 0) err('incomeStreams', `${x.label}: amount cannot be negative`);
    if (x.fromAge !== undefined && x.untilAge !== undefined && x.untilAge < x.fromAge) err('incomeStreams', `${x.label}: it cannot end before it starts`);
  }
  const mi = input.monthlyInvesting;
  if (mi) {
    for (const k of ['eurEquity', 'eurCash', 'gold', 'inrEquity'] as const) {
      if (!Number.isFinite(mi[k]) || mi[k] < 0) err('monthlyInvesting', 'Monthly investing cannot be negative');
    }
    if (!(mi.stepUpYearly >= 0 && mi.stepUpYearly <= 0.25)) err('monthlyInvesting', 'The yearly increase must be between 0% and 25%');
  }
  if ((input.jewelleryGrams24k ?? 0) < 0) err('jewelleryGrams24k', 'Cannot be negative');
  for (const k of ['jewellerySellShare', 'jewelleryResaleDiscount'] as const) {
    const v = input[k];
    if (v !== undefined && (!Number.isFinite(v) || v < 0 || v > 1)) err(k, 'Must be between 0 and 100%');
  }
  if (input.jewellerySellAtAge !== undefined && input.jewellerySellAtAge >= planToAge)
    err('jewellerySellAtAge', 'Sale age must be below the planning age');
  if (input.rulingYearsLeft < 0 || input.rulingYearsLeft > 5) err('rulingYearsLeft', 'The ruling lasts at most 5 years');

  if (input.eurToInr > 0 && (input.eurToInr < 50 || input.eurToInr > 200))
    warn('eurToInr', 'Exchange rate looks unusual. Check it.');
  if (input.monthlyCoreSpend * 12 > input.grossSalary * 1.5 && input.grossSalary > 0)
    warn('monthlyCoreSpend', 'Core spending is far above salary. Is it monthly, not annual?');

  return issues;
}
