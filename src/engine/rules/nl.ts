/**
 * Versioned Dutch tax and pension rules.
 *
 * When the law changes, add or edit an entry here. The engine code does not change.
 * Anything we could not confirm against a primary or well-cited source is listed in `unverified`
 * and surfaces to the user as a warning, so estimates never masquerade as facts.
 */

export const RULES_AS_OF = '2026-10-22';

export interface Bracket {
  upTo: number;
  rate: number;
}

export interface NlRulesYear {
  year: number;
  box1: {
    /** Combined income tax + social premiums, below AOW age. */
    working: Bracket[];
    /** Same table at/after AOW age (lower first-bracket rate: no AOW premiums). */
    atAowAge: Bracket[];
  };
  ruling: {
    /** Tax-free share of salary for rulings granted from 2024 onward. */
    allowanceRate: number;
    /** Tax-free share for rulings granted before 2024 (transitional law). */
    grandfatheredRate: number;
    /** Salary cap the allowance applies to (WNT norm). */
    salaryCap: number;
  };
  box3: {
    rate: number;
    allowancePerPerson: number;
    savingsReturn: number;
    otherReturn: number;
    debtReturn: number;
  };
  aow: {
    singleMonthlyGross: number;
    partnerMonthlyGrossEach: number;
    fullAccrualYears: number;
  };
  unverified: string[];
  sources: string[];
}

const INF = Number.POSITIVE_INFINITY;

const NL_2026: NlRulesYear = {
  year: 2026,
  box1: {
    working: [
      { upTo: 38883, rate: 0.3575 },
      { upTo: 78426, rate: 0.3756 },
      { upTo: INF, rate: 0.495 },
    ],
    // First-bracket rate at AOW age is an estimate (2025: 17.92%); upper brackets are identical.
    atAowAge: [
      { upTo: 38883, rate: 0.1785 },
      { upTo: 78426, rate: 0.3756 },
      { upTo: INF, rate: 0.495 },
    ],
  },
  ruling: { allowanceRate: 0.3, grandfatheredRate: 0.3, salaryCap: 262000 },
  box3: {
    rate: 0.36,
    allowancePerPerson: 59357,
    savingsReturn: 0.0128,
    otherReturn: 0.06,
    debtReturn: 0.027,
  },
  aow: {
    // SVB gross amounts from 1 July 2026 (excl. holiday allowance).
    singleMonthlyGross: 1662.16,
    partnerMonthlyGrossEach: 1139.39,
    fullAccrualYears: 50,
  },
  unverified: [
    'AOW-age first-bracket rate (17.85%) is an estimate',
    'Heffingskortingen (general and labour tax credits) are not modelled',
    'Savings deemed return 1.28% is provisional until early 2027',
  ],
  sources: [
    'Belastingplan 2026 (Box 1 brackets and rates)',
    'Belastingdienst: Box 3 provisional assessment 2026',
    'SVB: AOW amounts 1 July 2026',
    'PwC Tax Summaries: 30% ruling',
  ],
};

const NL_2027: NlRulesYear = {
  ...NL_2026,
  year: 2027,
  ruling: { allowanceRate: 0.27, grandfatheredRate: 0.3, salaryCap: 262000 },
  unverified: [
    ...NL_2026.unverified,
    '2027 Box 1 brackets assumed equal to 2026 (indexed with inflation in the engine)',
    '2027 Box 3 parameters assumed equal to 2026; the tax-free allowance may change',
    '2027 salary cap for the ruling not yet confirmed',
  ],
  sources: [...NL_2026.sources, 'Belastingplan 2027 (ruling falls to 27% for rulings granted 2024 or later)'],
};

export const NL_RULES: Record<number, NlRulesYear> = {
  2026: NL_2026,
  2027: NL_2027,
};

const SORTED_YEARS = Object.keys(NL_RULES)
  .map(Number)
  .sort((a, b) => a - b);
const RULE_CACHE = new Map<number, NlRulesYear>();

/** Latest known rule year at or before `year`; before the first year, the first year. */
export function getNlRules(year: number): NlRulesYear {
  const hit = RULE_CACHE.get(year);
  if (hit) return hit;
  let pick = SORTED_YEARS[0] as number;
  for (const y of SORTED_YEARS) if (y <= year) pick = y;
  const rules = NL_RULES[pick] as NlRulesYear;
  RULE_CACHE.set(year, rules);
  return rules;
}

export function knownRuleYears(): number[] {
  return Object.keys(NL_RULES)
    .map(Number)
    .sort((a, b) => a - b);
}
