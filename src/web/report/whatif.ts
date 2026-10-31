/** The "what if" table: the same plan with one change at a time. Every row is a fresh run with the same seed and number of futures. */
import { mergeAssumptions, runPlan } from '../../engine';
import { ASSUMPTION_FIELDS, assumptionDefault, parseMoney, parseProfile, toPlanInput, type Profile } from './profileApi';

export interface WhatIfRow {
  label: string;
  pct: number;
  /** Smallest pot that lasts, in today's euros, on the day you stop. Only meaningful when you spend it all. */
  needed: number | null;
  typical: number;
  isBase: boolean;
}

const SEED = 20261022;

interface Change {
  label: string;
  apply: (p: Profile) => Profile | null;
}

const withReturns = (p: Profile, delta: number): Profile | null => {
  const next = { ...p, assumptions: { ...p.assumptions } };
  for (const key of ['ret-eurEquity', 'ret-inrEquity']) {
    const f = ASSUMPTION_FIELDS.find((x) => x.key === key);
    if (!f) return null;
    const typed = Number((p.assumptions[key] ?? '').replace('%', ''));
    const cur = (p.assumptions[key] ?? '').trim() !== '' && Number.isFinite(typed) ? typed : assumptionDefault(f);
    next.assumptions[key] = String(Math.max(f.min, Number((cur + delta).toFixed(2))));
  }
  return next;
};

export const CHANGES: Change[] = [
  { label: 'Stop working 2 years earlier', apply: (p) => shiftRetire(p, -2) },
  { label: 'Stop working 2 years later', apply: (p) => shiftRetire(p, 2) },
  { label: 'Spend 10% less', apply: (p) => scaleLiving(p, 0.9) },
  { label: 'Spend 10% more', apply: (p) => scaleLiving(p, 1.1) },
  { label: 'Investment returns 1 point lower a year', apply: (p) => withReturns(p, -1) },
];

function shiftRetire(p: Profile, by: number): Profile | null {
  const cur = Number(p.retireAge);
  const age = Number(p.age);
  if (!Number.isFinite(cur) || !Number.isFinite(age) || p.retireAge.trim() === '') return null;
  const next = cur + by;
  if (next <= age || next > 80) return null;
  return { ...p, retireAge: String(next) };
}

function scaleLiving(p: Profile, factor: number): Profile | null {
  const n = parseMoney(p.living, 'eur');
  if (n === null || n <= 0) return null;
  return { ...p, living: String(Math.round(n * factor)) };
}

/** One run: chance it lasts, smallest pot, typical pot. Null if the changed profile is not valid. */
export function quickRun(p: Profile, eurToInr: number, startYear: number): { pct: number; needed: number; typical: number } | null {
  const parsed = parseProfile(p);
  if (!parsed.ok) return null;
  const input = toPlanInput(parsed.value, eurToInr, startYear);
  const plan = runPlan(input, { paths: 400, seed: SEED, assumptions: parsed.value.overrides });
  const a = mergeAssumptions(parsed.value.overrides);
  const toToday = 1 / (1 + a.inflationNl) ** (parsed.value.retireAge - parsed.value.age);
  return { pct: Math.round(plan.monteCarlo.successProbability * 100), needed: plan.expected.requiredCorpus * toToday, typical: plan.monteCarlo.medianAtRetirementReal };
}

export function whatIfRows(base: { pct: number; needed: number | null; typical: number }, profile: Profile, eurToInr: number, startYear: number): WhatIfRow[] {
  const rows: WhatIfRow[] = [{ label: 'Your plan as entered', pct: base.pct, needed: base.needed, typical: base.typical, isBase: true }];
  for (const c of CHANGES) {
    const changed = c.apply(profile);
    if (changed === null) continue;
    const r = quickRun(changed, eurToInr, startYear);
    if (r === null) continue;
    rows.push({ label: c.label, pct: r.pct, needed: r.needed, typical: r.typical, isBase: false });
  }
  return rows;
}
