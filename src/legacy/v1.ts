/**
 * A faithful TypeScript port of the v1 calculateSnapshot() maths, bugs included.
 * It exists only so tests can show what changed between v1 and v2 for the same household.
 * Do not use it in the product.
 */

export interface LegacyForm {
  age: number;
  retirementAge: number;
  familyStatus: 'single' | 'partner';
  yearsInNl: number;
  monthlyCashOutflow: number;
  annualLifestyleExpenses: number;
  rulingYearsLeft: number;
  retirementDestination: 'nl' | 'in';
  childrenAges: number[];
  salary: number;
  eurCash: number;
  dutchInvestments: number;
  dutchEmi: number;
  dutchMortgageYearsLeft: number;
  dutchSuppPension: number;
  inFds: number;
  inMfs: number;
  inEpfBalance: number;
  inPension: number;
  goldGrams: number;
}

const GOLD_EUR_PER_GRAM = 78.5;

export function legacyEstimateNlTax(gross: number, rulingYears: number): number {
  const taxableGross = rulingYears > 0 ? gross * 0.7 : gross;
  return taxableGross > 75518 ? 19300 + (taxableGross - 75518) * 0.495 : taxableGross * 0.37;
}

export interface LegacyResult {
  projectedCorpus: number;
  totalCorpusNeeded: number;
  readinessScore: number;
  startingCorpusEur: number;
  trajectory: { age: number; corpus: number; requiredCorpus: number }[];
}

export function legacySnapshot(f: LegacyForm, eurToInr: number): LegacyResult {
  const inFdsEur = f.inFds / eurToInr;
  const inMfsEur = f.inMfs / eurToInr;
  const inEpfEur = f.inEpfBalance / eurToInr;
  const goldValueEur = f.goldGrams * GOLD_EUR_PER_GRAM;
  const liquidInvestments = f.eurCash + f.dutchInvestments + inFdsEur + inMfsEur + inEpfEur + goldValueEur;

  const yearsToRetire = Math.max(0, f.retirementAge - f.age);
  let runningLiquid = liquidInvestments;
  let salarySim = f.salary;
  const wage = 0.025;
  const infl = 0.024;
  const cagr = 0.09;

  const weight = (yr: number) => {
    let adult = 1.0;
    if (f.familyStatus === 'partner') adult += 0.5;
    let kids = 0;
    for (const c of f.childrenAges) {
      const a = c + yr;
      if (a <= 25) kids += a <= 17 ? 0.3 : 0.5; // v1 off-by-one: age 25 still counted
    }
    return adult + kids;
  };
  const initialWeight =
    1.0 + (f.familyStatus === 'partner' ? 0.5 : 0) + f.childrenAges.reduce((acc, c) => acc + (c <= 17 ? 0.3 : 0.5), 0);

  const baseCoreMonthly = f.monthlyCashOutflow;
  let lifestyle = f.annualLifestyleExpenses;

  for (let yr = 0; yr < yearsToRetire; yr++) {
    runningLiquid *= 1 + cagr;
    const tax = legacyEstimateNlTax(salarySim, Math.max(0, f.rulingYearsLeft - yr));
    const net = salarySim - tax;
    const emi = yr < f.dutchMortgageYearsLeft ? f.dutchEmi : 0;
    const scaledCore = baseCoreMonthly * 12 * (weight(yr) / initialWeight); // never inflated
    const outflow = scaledCore + lifestyle + emi * 12;
    runningLiquid += Math.max(0, net - outflow); // deficits ignored
    salarySim *= 1 + wage;
    lifestyle *= 1 + infl;
  }

  const startingBase = runningLiquid;
  const maxAow = f.familyStatus === 'partner' ? 1000 : 1400;
  const yearsAt67 = Math.min(50, f.yearsInNl + Math.max(0, 67 - f.age));
  const aow = (yearsAt67 / 50) * maxAow;
  const inPensionMonthly = f.inPension / eurToInr / 12;

  const trajectory: LegacyResult['trajectory'] = [];
  let corpus = startingBase;
  let totalNeeded = 0;
  let projected = 0;
  for (let yr = 0; yr <= 25; yr++) {
    const ageR = f.retirementAge + yr;
    const fromNow = yearsToRetire + yr;
    const activeAow = ageR >= 67 ? (f.retirementDestination === 'in' ? 0 : aow) : 0; // AOW dropped for India
    const activeSupp = ageR >= 67 ? f.dutchSuppPension : 0;
    const activeIn = ageR >= 60 ? inPensionMonthly : 0;
    const pension = activeAow + activeSupp + activeIn;
    const emi = fromNow < f.dutchMortgageYearsLeft ? f.dutchEmi : 0;
    const scaledCore = baseCoreMonthly * 12 * (weight(fromNow) / initialWeight);
    const geo = f.retirementDestination === 'in' ? 0.38 : 1;
    const need = scaledCore * geo + lifestyle + emi * 12;
    const shortfall = Math.max(0, need - pension * 12);
    const required = shortfall / 0.04;
    if (yr === 0) {
      projected = Math.round(corpus);
      totalNeeded = required;
    }
    trajectory.push({ age: ageR, corpus: Math.round(corpus), requiredCorpus: Math.round(required) });
    corpus = Math.max(0, corpus + corpus * cagr - need); // pensions never reduce the drawdown
    lifestyle *= 1 + infl;
  }

  const readinessScore = totalNeeded > 0 ? Math.min(100, Math.round((projected / totalNeeded) * 100)) : 100;
  return { projectedCorpus: projected, totalCorpusNeeded: totalNeeded, readinessScore, startingCorpusEur: startingBase, trajectory };
}

export const LEGACY_SAMPLE: LegacyForm = {
  age: 45,
  retirementAge: 55,
  familyStatus: 'partner',
  yearsInNl: 10,
  monthlyCashOutflow: 5000,
  annualLifestyleExpenses: 8000,
  rulingYearsLeft: 0,
  retirementDestination: 'nl',
  childrenAges: [12, 16],
  salary: 180000,
  eurCash: 25000,
  dutchInvestments: 190000,
  dutchEmi: 1600,
  dutchMortgageYearsLeft: 18,
  dutchSuppPension: 500,
  inFds: 6_500_000,
  inMfs: 6_000_000,
  inEpfBalance: 5_000_000,
  inPension: 0,
  goldGrams: 100,
};
