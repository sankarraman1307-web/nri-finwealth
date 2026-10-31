/** Everything the results panel shows, computed in one go when you press Run. Pure TypeScript, no React. */
import {
  analyzeHouseholdRuling,
  compareDestinations,
  computeCorpusCurve,
  mergeAssumptions,
  runPlan,
  type CorpusPoint,
  type Destination,
  type Assumptions,
  type DestinationCompare,
  type HouseholdRuling,
  type PlanResult,
} from '../engine';
import { bridgeCheck, monthlySeries, planEvents, type Bridge, type MonthlyPoint } from './chartData';
import { DEFAULT_MONTHS_IN_INDIA, parseProfile, toPlanInput, type Profile } from './profile';

export interface View {
  plan: PlanResult;
  ruling: HouseholdRuling | null;
  compare: DestinationCompare[];
  curve: CorpusPoint[];
  monthly: MonthlyPoint[];
  retireAge: number;
  age: number;
  destination: Destination;
  aowAge: number;
  /** What should be left at the planning age, and the yearly share of savings used when it is kept intact. */
  legacy: 'spend' | 'intact';
  safeRate: number;
  /** Middle of the simulated futures for your savings on the day you stop, in the euros of that year (same basis as the headline figures). */
  typicalAtStop: number;
  /** Dutch inflation assumed, for showing amounts in future euros. */
  inflation: number;
  /** The assumptions used in this run, after your changes. */
  assumptions: Assumptions;
  /** Months in India used for the "Both" card. */
  compareMonths: number;
  /** What happens at which age, for the chart tooltips. */
  events: Map<number, string[]>;
  /** The years before your state pension, and how your savings carry them. Null if you retire at or after it. */
  bridge: Bridge | null;
}

const SEED = 20261022;

export function computeView(profile: Profile, eurToInr: number, startYear: number): View | null {
  const parsed = parseProfile(profile);
  if (!parsed.ok) return null;
  const input = toPlanInput(parsed.value, eurToInr, startYear);
  const a = mergeAssumptions(parsed.value.overrides);
  const compareMonths = parsed.value.monthsInIndia > 0 ? parsed.value.monthsInIndia : DEFAULT_MONTHS_IN_INDIA;
  const plan = runPlan(input, { paths: 400, seed: SEED, assumptions: parsed.value.overrides, requiredCurve: true });
  return {
    plan,
    ruling: analyzeHouseholdRuling(input, parsed.value.overrides),
    compare: compareDestinations({ ...input, snowbirdMonthsInIndia: compareMonths }, a, 200, SEED),
    curve: computeCorpusCurve(input, a),
    monthly: monthlySeries(plan.expected.rows, a.inflationNl),
    retireAge: parsed.value.retireAge,
    age: parsed.value.age,
    destination: parsed.value.destination,
    aowAge: a.aowAge,
    legacy: parsed.value.legacy,
    safeRate: a.safeWithdrawalRate,
    typicalAtStop: plan.monteCarlo.medianAtRetirementReal * (1 + a.inflationNl) ** (parsed.value.retireAge - parsed.value.age),
    inflation: a.inflationNl,
    assumptions: a,
    compareMonths,
    events: planEvents(input, a),
    bridge: bridgeCheck(plan, parsed.value.retireAge, a.aowAge, a.inflationNl),
  };
}
