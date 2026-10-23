import { mergeAssumptions } from './assumptions';
import { getNlRules } from './countries/nl/rules';
import { nlWageTax } from './countries/nl/tax';
import { nlLoanPaymentsMonthly } from './properties';
import { yearlyExtrasToday } from './simulate';
import type { AssumptionOverrides, PlanInput } from './types';

/**
 * What the 30% ruling is worth, what happens to your take-home pay when it steps down in 2027 and
 * when it ends, and what the extra pay could become if it is invested instead of spent.
 *
 * Everything is in today's euros on today's salary, with no wage growth, so the numbers show the
 * effect of the ruling itself and nothing else. Dutch tax credits are not modelled (see warnings).
 */
export interface RulingAnalysis {
  startYear: number;
  lastRulingYear: number;
  endYear: number;
  yearsLeft: number;
  grandfathered: boolean;
  netMonthlyWithRuling: number;
  netMonthlyWithoutRuling: number;
  /** Extra monthly take-home pay the ruling gives you this year. */
  benefitMonthlyNow: number;
  /** Spending (living, holidays, mortgage while it runs) in the first ruling year. */
  spendMonthlyNow: number;
  leftToSaveNow: number;
  /** The January 2027 cut from 30% to 27%, for rulings granted 2024 or later. */
  step2027: { applies: boolean; monthlyDrop: number; netMonthlyAfter: number };
  /** The month the ruling ends. */
  atEnd: {
    year: number;
    netMonthlyBefore: number;
    netMonthlyAfter: number;
    monthlyDrop: number;
    dropPct: number;
    spendMonthlyAfter: number;
    leftToSaveAfter: number;
  };
  /** What happens if every euro of the ruling's benefit is invested for the rest of the ruling. */
  invest: {
    assumedNetReturn: number;
    totalContributed: number;
    projectedAtEnd: number;
    benefitsByYear: { year: number; monthly: number }[];
  };
}

export function analyzeRuling(input: PlanInput, over: AssumptionOverrides = {}): RulingAnalysis | null {
  const years = Math.floor(input.rulingYearsLeft);
  if (years < 1) return null;

  const a = mergeAssumptions(over);
  const start = input.startYear;
  const last = start + years - 1;
  const end = last + 1;
  const g = input.rulingGrandfathered;

  const netAnnual = (year: number, ruling: boolean): number =>
    input.grossSalary -
    nlWageTax(input.grossSalary, getNlRules(year), 1, { active: ruling, grandfathered: g }).tax;

  const spendMonthly = (year: number): number => {
    return input.monthlyCoreSpend + input.annualLifestyleSpend / 12 + nlLoanPaymentsMonthly(input, year - start);
  };

  const withNow = netAnnual(start, true) / 12;
  const withoutNow = netAnnual(start, false) / 12;
  const spendNow = spendMonthly(start);

  const step2027Applies = !g && start < 2027 && last >= 2027;
  const net2027 = netAnnual(2027, true) / 12;

  const before = netAnnual(last, true) / 12;
  const after = netAnnual(end, false) / 12;
  const spendAfter = spendMonthly(end);

  const rules = getNlRules(start);
  const assumedNetReturn = a.returns.eurEquity.mean - rules.box3.rate * rules.box3.otherReturn;
  const benefitsByYear: { year: number; monthly: number }[] = [];
  let projected = 0;
  let contributed = 0;
  for (let y = start; y <= last; y++) {
    const monthly = (netAnnual(y, true) - netAnnual(y, false)) / 12;
    benefitsByYear.push({ year: y, monthly });
    contributed += monthly * 12;
    projected += monthly * 12 * (1 + assumedNetReturn) ** (last - y);
  }

  return {
    startYear: start,
    lastRulingYear: last,
    endYear: end,
    yearsLeft: years,
    grandfathered: g,
    netMonthlyWithRuling: withNow,
    netMonthlyWithoutRuling: withoutNow,
    benefitMonthlyNow: withNow - withoutNow,
    spendMonthlyNow: spendNow,
    leftToSaveNow: withNow - spendNow,
    step2027: { applies: step2027Applies, monthlyDrop: step2027Applies ? withNow - net2027 : 0, netMonthlyAfter: step2027Applies ? net2027 : withNow },
    atEnd: {
      year: end,
      netMonthlyBefore: before,
      netMonthlyAfter: after,
      monthlyDrop: before - after,
      dropPct: before > 0 ? (before - after) / before : 0,
      spendMonthlyAfter: spendAfter,
      leftToSaveAfter: after - spendAfter,
    },
    invest: { assumedNetReturn, totalContributed: contributed, projectedAtEnd: projected, benefitsByYear },
  };
}

// ---------------------------------------------------------------------------------------------
// Household version: one or both partners can have the ruling, each with their own end date.
// ---------------------------------------------------------------------------------------------

export interface RulingPerson {
  who: 'you' | 'partner';
  grandfathered: boolean;
  /** Ruling years that actually matter: capped at the years you still work. */
  yearsLeft: number;
  lastRulingYear: number;
  /** The year take-home pay falls because the ruling ends (null if work stops first). */
  endYear: number | null;
  benefitMonthlyNow: number;
  netMonthlyWithRuling: number;
  netMonthlyWithoutRuling: number;
  step2027MonthlyDrop: number;
  endMonthlyDrop: number;
}

export interface RulingEvent {
  year: number;
  kind: 'step2027' | 'end';
  who: 'you' | 'partner';
  /** How much household take-home pay falls because of this event, per month. */
  monthlyDrop: number;
  /** Household take-home pay per month right after this event. */
  householdNetAfter: number;
}

export interface HouseholdRuling {
  startYear: number;
  people: RulingPerson[];
  benefitMonthlyNow: number;
  householdNetNow: number;
  householdNetWithoutRuling: number;
  spendMonthlyNow: number;
  leftToSaveNow: number;
  events: RulingEvent[];
  /** After the last ruling has ended. */
  final: {
    year: number;
    householdNetBefore: number;
    householdNetAfter: number;
    monthlyDrop: number;
    dropPct: number;
    spendMonthlyAfter: number;
    leftToSaveAfter: number;
  };
  invest: { assumedNetReturn: number; totalContributed: number; projectedAtEnd: number; lastYear: number };
}

export function analyzeHouseholdRuling(input: PlanInput, over: AssumptionOverrides = {}): HouseholdRuling | null {
  const a = mergeAssumptions(over);
  const start = input.startYear;
  const pe = input.familyStatus === 'partner' ? input.partnerEarner : undefined;

  interface Earner {
    who: 'you' | 'partner';
    salary: number;
    rulingYears: number; // as typed
    worksYears: number; // years until they stop working (0 = already stopped)
    grand: boolean;
  }
  const earners: Earner[] = [
    {
      who: 'you',
      salary: input.grossSalary,
      rulingYears: Math.floor(input.rulingYearsLeft),
      worksYears: Math.max(0, input.retirementAge - input.age),
      grand: input.rulingGrandfathered,
    },
  ];
  if (pe)
    earners.push({
      who: 'partner',
      salary: pe.grossSalary,
      rulingYears: Math.floor(pe.rulingYearsLeft),
      worksYears: Math.max(0, pe.retirementAge - pe.age),
      grand: pe.rulingGrandfathered,
    });

  const effective = (e: Earner) => Math.min(e.rulingYears, e.worksYears);
  const withRuling = earners.filter((e) => effective(e) >= 1);
  if (withRuling.length === 0) return null;

  const taxFor = (e: Earner, year: number, ruling: boolean) =>
    nlWageTax(e.salary, getNlRules(year), 1, { active: ruling, grandfathered: e.grand }).tax;
  /** Take-home pay per year for one earner. `rulingOn` = honour their ruling dates; false = pretend no ruling. */
  const netOf = (e: Earner, year: number, rulingOn: boolean): number => {
    if (year - start >= e.worksYears) return 0;
    const active = rulingOn && year - start < e.rulingYears;
    return e.salary - taxFor(e, year, active);
  };
  const householdNet = (year: number, rulingOn: boolean) => earners.reduce((sum, e) => sum + netOf(e, year, rulingOn), 0) / 12;

  const spendMonthly = (year: number): number => {
    const t = year - start;
    const age = input.age + t;
    return (
      input.monthlyCoreSpend +
      (input.annualLifestyleSpend + yearlyExtrasToday(input, age)) / 12 +
      nlLoanPaymentsMonthly(input, t)
    );
  };

  const lastYear = Math.max(...withRuling.map((e) => start + effective(e) - 1));
  const finalYear = lastYear + 1;

  const people: RulingPerson[] = withRuling.map((e) => {
    const last = start + effective(e) - 1;
    const endsByWork = e.worksYears <= e.rulingYears;
    const step = !e.grand && start < 2027 && last >= 2027;
    return {
      who: e.who,
      grandfathered: e.grand,
      yearsLeft: effective(e),
      lastRulingYear: last,
      endYear: endsByWork ? null : last + 1,
      benefitMonthlyNow: (netOf(e, start, true) - netOf(e, start, false)) / 12,
      netMonthlyWithRuling: netOf(e, start, true) / 12,
      netMonthlyWithoutRuling: netOf(e, start, false) / 12,
      step2027MonthlyDrop: step ? (netOf(e, 2026, true) - netOf(e, 2027, true)) / 12 : 0,
      endMonthlyDrop: endsByWork ? 0 : (netOf(e, last, true) - netOf(e, last + 1, false)) / 12,
    };
  });

  // Walk the years and record each year in which a ruling event lowers household take-home pay.
  const events: RulingEvent[] = [];
  for (const e of withRuling) {
    const last = start + effective(e) - 1;
    if (!e.grand && start < 2027 && last >= 2027) {
      const drop = (netOf(e, 2026, true) - netOf(e, 2027, true)) / 12;
      events.push({ year: 2027, kind: 'step2027', who: e.who, monthlyDrop: drop, householdNetAfter: householdNet(2027, true) });
    }
    if (e.worksYears > e.rulingYears) {
      const drop = (netOf(e, last, true) - netOf(e, last + 1, false)) / 12;
      events.push({ year: last + 1, kind: 'end', who: e.who, monthlyDrop: drop, householdNetAfter: householdNet(last + 1, true) });
    }
  }
  events.sort((x, y) => x.year - y.year || (x.kind === 'step2027' ? -1 : 1));

  const before = householdNet(lastYear, true);
  const after = householdNet(finalYear, true);
  const spendNow = spendMonthly(start);
  const spendAfter = spendMonthly(finalYear);

  const rules = getNlRules(start);
  const assumedNetReturn = a.returns.eurEquity.mean - rules.box3.rate * rules.box3.otherReturn;
  let projected = 0;
  let contributed = 0;
  for (let y = start; y <= lastYear; y++) {
    const benefit = earners.reduce((sum, e) => sum + netOf(e, y, true) - netOf(e, y, false), 0);
    contributed += benefit;
    projected += benefit * (1 + assumedNetReturn) ** (lastYear - y);
  }

  return {
    startYear: start,
    people,
    benefitMonthlyNow: householdNet(start, true) - householdNet(start, false),
    householdNetNow: householdNet(start, true),
    householdNetWithoutRuling: householdNet(start, false),
    spendMonthlyNow: spendNow,
    leftToSaveNow: householdNet(start, true) - spendNow,
    events,
    final: {
      year: finalYear,
      householdNetBefore: before,
      householdNetAfter: after,
      monthlyDrop: before - after,
      dropPct: before > 0 ? (before - after) / before : 0,
      spendMonthlyAfter: spendAfter,
      leftToSaveAfter: after - spendAfter,
    },
    invest: { assumedNetReturn, totalContributed: contributed, projectedAtEnd: projected, lastYear },
  };
}
