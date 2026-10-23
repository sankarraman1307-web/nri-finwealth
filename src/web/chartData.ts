import { countryPack, propertiesOf, type Assumptions, type BandPoint, type CorpusPoint, type PlanInput, type PlanResult, type YearRow } from '../engine';

/** One year of household money per month, in today's euros, on the expected path. */
export interface MonthlyPoint {
  age: number;
  /** Take-home pay of the working members of the household. */
  netPay: number;
  /** Pensions (after tax), rent and other passive income. */
  otherIncome: number;
  /** What has to come out of your savings to cover the gap. */
  fromSavings: number;
  /** Everything you spend, including mortgage and Box 3 tax. */
  spend: number;
  /** Income beyond spending, which you save. */
  saved: number;
}

export function monthlySeries(rows: YearRow[], inflationNl: number): MonthlyPoint[] {
  return rows.map((r) => {
    const per = 12 * (1 + inflationNl) ** r.t;
    const netPay = (r.salaryGross + r.partnerSalaryGross - r.incomeTaxNl) / per;
    const otherIncome = (r.pensionGross - r.pensionTax + r.passiveNet) / per;
    const spend = (r.totalSpend + r.box3Tax) / per;
    const gap = spend - netPay - otherIncome;
    return { age: r.age, netPay, otherIncome, fromSavings: Math.max(0, gap), spend, saved: Math.max(0, -gap) };
  });
}

/** The youngest retirement age at which what you have covers what you need, or null if none does. */
export function earliestFeasibleAge(curve: CorpusPoint[]): number | null {
  return curve.find((c) => c.available >= c.required)?.retirementAge ?? null;
}

/** One age on the two charts: the corpus you could have, the corpus you would need, and the monthly picture. */
export interface DrawdownPoint {
  age: number;
  /** Middle of the simulated futures, and the 10th and 90th percentile. */
  corpus: number;
  low: number;
  high: number;
  /** The corpus whose yearly drawdown, plus pensions, pays for spending that year. */
  needed: number;
  /** Per month. */
  monthlyNeed: number;
  pensions: number;
  drawdown: number;
  /** drawdown + pensions - monthlyNeed. Negative means a monthly shortfall. */
  gap: number;
  /** What your plan actually takes out of savings that month (average returns). */
  actualFromSavings: number;
}

export type EuroBasis = 'today' | 'future';

/**
 * Joins the simulated corpus with the monthly spending picture, for a fixed drawdown rate.
 *
 * - Needed corpus = 12 x (monthly spending - pensions and rent) / rate. Spending already includes Box 3 tax,
 *   the mortgage and prices in the country you retire to. Once pensions cover everything, nothing is needed.
 * - Drawdown = corpus x rate / 12, taken from the middle of the simulated futures.
 * - Inputs are in today's euros. "future" multiplies by Dutch inflation since today.
 *
 * The needed line and the drawdown line are two views of one comparison: the corpus is above the needed
 * line exactly when the drawdown plus pensions cover spending.
 */
export function drawdownSeries(
  bands: BandPoint[],
  monthly: MonthlyPoint[],
  opts: { rate: number; inflation: number; startAge: number; basis: EuroBasis },
): DrawdownPoint[] {
  const byAge = new Map(monthly.map((m) => [m.age, m]));
  const out: DrawdownPoint[] = [];
  for (const b of bands) {
    const m = byAge.get(b.age);
    if (!m) continue;
    const f = opts.basis === 'future' ? (1 + opts.inflation) ** (b.age - opts.startAge) : 1;
    const need = m.spend * f;
    const pensions = m.otherIncome * f;
    const corpus = b.p50 * f;
    const drawdown = (corpus * opts.rate) / 12;
    out.push({
      age: b.age,
      corpus,
      low: b.p10 * f,
      high: b.p90 * f,
      needed: (12 * Math.max(0, need - pensions)) / opts.rate,
      monthlyNeed: need,
      pensions,
      drawdown,
      gap: drawdown + pensions - need,
      actualFromSavings: m.fromSavings * f,
    });
  }
  return out;
}

/** The first age at which the corpus covers what is needed, or null if it never does. */
export function independenceAge(series: DrawdownPoint[]): number | null {
  return series.find((p) => p.corpus >= p.needed)?.age ?? null;
}

/**
 * The things that happen at each of your ages, in plain words, so a chart can say why a line moved.
 * Ages are your own age. The keys are the ages at which something changes.
 */
export function planEvents(input: PlanInput, a: Pick<Assumptions, 'aowAge' | 'indiaPensionAge' | 'childIndependenceAge'>): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const add = (age: number, text: string) => {
    if (!Number.isFinite(age) || age < input.age) return;
    const k = Math.round(age);
    out.set(k, [...(out.get(k) ?? []), text]);
  };
  const partner = input.familyStatus === 'partner';
  const pAge = input.partnerEarner?.age ?? input.partnerAge;
  const own = (who: 'you' | 'partner', theirAge: number) => (who === 'you' || pAge === undefined ? theirAge : theirAge + (input.age - pAge));

  add(input.retirementAge, 'You stop working');
  if (partner && input.partnerEarner && pAge !== undefined) add(own('partner', input.partnerEarner.retirementAge), 'Your partner stops working');
  if (input.retirementDestination === 'in') add(input.retirementAge, 'You move to India');
  const labels = countryPack(input.country).labels;
  add(a.aowAge, `State pension (${labels.statePension}) starts`);
  const regime = labels.foreignWorkerRegime;
  if (regime && input.rulingYearsLeft > 0) {
    add(input.age + input.rulingYearsLeft, `${regime} ends`);
    if (!input.rulingGrandfathered && input.startYear < 2027 && input.rulingYearsLeft + input.startYear > 2027) add(input.age + (2027 - input.startYear), `${regime} drops to 27%`);
  }
  if (input.partnerEarner && input.partnerEarner.rulingYearsLeft > 0 && pAge !== undefined) add(own('partner', input.partnerEarner.age + input.partnerEarner.rulingYearsLeft), `Your partner's ${regime ?? 'regime'} ends`);
  for (const c of input.childrenAges) {
    if (c < 18) add(input.age + (18 - c), 'A child turns 18');
    if (c < a.childIndependenceAge) add(input.age + (a.childIndependenceAge - c), 'A child becomes independent');
  }
  propertiesOf(input).forEach((p, i) => {
    const name = `${p.country === 'in' ? 'Indian' : 'Dutch'} property ${i + 1}`;
    if (p.loan && p.loan.yearsLeft > 0) add(input.age + p.loan.yearsLeft, `${p.country === 'in' ? 'Loan' : 'Mortgage'} on ${name} ends`);
    if (p.sellAtAge !== undefined) add(p.sellAtAge, `You sell ${name}`);
  });
  if (input.jewellerySellAtAge !== undefined && (input.jewellerySellShare ?? 0) > 0) add(input.jewellerySellAtAge, 'You sell some jewellery');
  for (const e of input.yearlyExpenses ?? []) {
    if (e.fromAge !== undefined && e.fromAge > input.age) add(e.fromAge, `${e.label || 'Yearly extra'} starts`);
    if (e.untilAge !== undefined) add(e.untilAge + 1, `${e.label || 'Yearly extra'} ends`);
  }
  for (const s of input.incomeStreams ?? []) {
    const label = s.label || 'Income';
    if (s.fromAge !== undefined && s.fromAge > input.age) add(own(s.who, s.fromAge), `${label} starts`);
    if (s.untilAge !== undefined) add(own(s.who, s.untilAge + 1), `${label} ends`);
  }
  if ((input.inPensionAnnual ?? 0) > 0) add(a.indiaPensionAge, 'Indian pension starts');
  const mi = input.monthlyInvesting;
  if (mi) add(mi.untilAge ?? input.retirementAge, 'You stop investing each month');
  return out;
}

/** The years between stopping work and the state pension, and how your savings carry them. All amounts in today's euros. */
export interface Bridge {
  fromAge: number;
  toAge: number;
  years: number;
  /** Monthly averages over the bridge years. */
  spend: number;
  income: number;
  fromSavings: number;
  /** Total taken from savings over the bridge years. */
  totalFromSavings: number;
  /** Property and jewellery sales received in these years (they join your savings). */
  salesInBridge: number;
  /** Savings on the day the state pension starts: a typical future and a bad one (1 in 10). */
  savingsAtEnd: number;
  savingsAtEndBad: number;
  /** Share of simulated futures in which the money lasts to the end of the plan. */
  successShare: number;
  /** In the expected path, money that could not be paid because savings ran out (today's euros). */
  unmetTotal: number;
  /** Age by which 1 in 10 futures has run out, if it does. */
  badRunOutAge: number | null;
  /** True when your own savings cover these years without money from elsewhere. */
  selfFunded: boolean;
}

export function bridgeCheck(plan: PlanResult, retireAge: number, aowAge: number, inflation: number, basis: EuroBasis = 'today'): Bridge | null {
  if (retireAge >= aowAge) return null;
  const rows = plan.expected.rows.filter((r) => r.age >= retireAge && r.age < aowAge);
  if (rows.length === 0) return null;
  // 'today' removes inflation since now; 'future' keeps the euros of that year.
  const real = (r: YearRow, v: number) => (basis === 'today' ? v / (1 + inflation) ** r.t : v);
  const sum = (f: (r: YearRow) => number) => rows.reduce((t, r) => t + real(r, f(r)), 0);
  const n = rows.length;
  const total = sum((r) => Math.max(0, -r.netFlow));
  const bandAt = plan.monteCarlo.bands.find((b) => b.age === aowAge);
  // The bands are in today's euros already.
  const bandFactor = basis === 'future' ? (1 + inflation) ** (aowAge - rows[0]!.age + rows[0]!.t) : 1;
  const unmet = sum((r) => r.unmetDeficit);
  const successShare = plan.monteCarlo.successProbability;
  return {
    fromAge: retireAge,
    toAge: aowAge - 1,
    years: n,
    spend: sum((r) => r.totalSpend + r.box3Tax) / n / 12,
    income: sum((r) => r.incomeNet) / n / 12,
    fromSavings: total / n / 12,
    totalFromSavings: total,
    salesInBridge: sum((r) => r.saleProceeds),
    savingsAtEnd: (bandAt?.p50 ?? 0) * bandFactor,
    savingsAtEndBad: (bandAt?.p10 ?? 0) * bandFactor,
    successShare,
    unmetTotal: unmet,
    badRunOutAge: plan.monteCarlo.p10DepletionAge,
    selfFunded: unmet < 1 && successShare >= 0.95,
  };
}
