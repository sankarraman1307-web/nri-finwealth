/** "What you could do": tries changes on your own plan and reports which ones reach a safe level. */
import { mergeAssumptions, successProbabilityFor, type Destination } from '../engine';
import { parseMoney, parseProfile, toPlanInput, withDestination, type Profile } from './profile';

/** A plan counts as safe when the money lasts in at least this share of simulated futures. */
export const TARGET = 0.9;
const MAX_RETIRE_AGE = 75;

/** One change to your answers. Several can be combined. */
export interface Change {
  /** Stop working this many years later (negative = earlier). */
  retireShift?: number;
  /** Spend this percent less (negative = more). */
  spendCutPct?: number;
  /** Invest this many euros more each month (only when you invest fixed amounts). */
  saveMore?: number;
  destination?: Destination;
}

const wholeNumber = (t: string): number | null => (/^\d+$/.test(t.trim()) ? Number(t) : null);
const scaleMoney = (text: string, factor: number): string => {
  const n = parseMoney(text, 'eur');
  return n === null ? text : String(Math.round(n * factor));
};

/** The same answers with the change made. This is what the Apply button puts into your form. */
export function applyChange(p: Profile, c: Change): Profile {
  let next: Profile = { ...p };
  if (c.destination && c.destination !== p.destination) next = withDestination(next, c.destination);
  if (c.retireShift) {
    const r = wholeNumber(p.retireAge);
    if (r !== null) next.retireAge = String(Math.min(MAX_RETIRE_AGE, Math.max(wholeNumber(p.age) ?? 0, r + c.retireShift)));
  }
  if (c.spendCutPct) {
    const f = 1 - c.spendCutPct / 100;
    next.living = scaleMoney(p.living, f);
    next.expenses = p.expenses.map((e) => ({ ...e, amount: scaleMoney(e.amount, f) }));
  }
  if (c.saveMore && p.investMode === 'fixed') {
    const cur = p.invNl.trim() === '' ? 0 : parseMoney(p.invNl, 'eur') ?? 0;
    next.invNl = String(Math.round(cur + c.saveMore));
  }
  return next;
}

export interface TrialResult {
  label: string;
  change: Change;
  success: number;
}

export interface LeverResult {
  id: 'retire' | 'spend' | 'save' | 'place';
  title: string;
  trials: TrialResult[];
  /** The smallest tried change that reaches the target (or, for a plan that is already safe, the biggest one that still does). */
  pick: TrialResult | null;
}

export interface Recommendations {
  base: number;
  target: number;
  safe: boolean;
  levers: LeverResult[];
  /** When no single change is enough: the smallest mix of later retirement and lower spending that is. */
  combo: TrialResult | null;
  /** When even the mix is not enough: the strongest mix I tried, and where it gets you. */
  comboBest: TrialResult | null;
}

export interface RecommendOptions {
  eurToInr: number;
  startYear: number;
  paths: number;
  seed: number;
}

const placeName = (d: Destination) => (d === 'nl' ? 'the Netherlands' : d === 'in' ? 'India' : 'both (split year)');

export function computeRecommendations(profile: Profile, o: RecommendOptions): Recommendations | null {
  const cache = new Map<string, number>();
  const run = (c: Change): number | null => {
    const key = JSON.stringify(c);
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const parsed = parseProfile(applyChange(profile, c));
    if (!parsed.ok) return null;
    const input = toPlanInput(parsed.value, o.eurToInr, o.startYear);
    const s = successProbabilityFor(input, mergeAssumptions(parsed.value.overrides), o.paths, o.seed);
    cache.set(key, s);
    return s;
  };
  const base = run({});
  if (base === null) return null;
  const safe = base >= TARGET;
  const retireNow = wholeNumber(profile.retireAge) ?? 0;
  const ageNow = wholeNumber(profile.age) ?? 0;
  const levers: LeverResult[] = [];

  // Retire later (plan not safe) or earlier (plan safe).
  {
    const trials: TrialResult[] = [];
    let pick: TrialResult | null = null;
    for (let n = 1; n <= 8; n++) {
      const shift = safe ? -n : n;
      const age = retireNow + shift;
      if (age > MAX_RETIRE_AGE || age <= ageNow) break;
      const s = run({ retireShift: shift });
      if (s === null) break;
      const t: TrialResult = { label: safe ? `Stop at ${age}` : `Stop at ${age}`, change: { retireShift: shift }, success: s };
      trials.push(t);
      if (safe) {
        if (s >= TARGET) pick = t;
        else break;
      } else if (s >= TARGET) {
        pick = t;
        break;
      }
    }
    levers.push({ id: 'retire', title: safe ? 'Stop working earlier' : 'Stop working later', trials, pick });
  }

  // Spend less (plan not safe) or more (plan safe).
  if (parseProfile(profile).ok) {
    const trials: TrialResult[] = [];
    let pick: TrialResult | null = null;
    for (const pct of [5, 10, 15, 20, 25, 30]) {
      const cut = safe ? -pct : pct;
      const s = run({ spendCutPct: cut });
      if (s === null) break;
      const t: TrialResult = { label: safe ? `Spend ${pct}% more` : `Spend ${pct}% less`, change: { spendCutPct: cut }, success: s };
      trials.push(t);
      if (safe) {
        if (s >= TARGET) pick = t;
        else break;
      } else if (s >= TARGET) {
        pick = t;
        break;
      }
    }
    levers.push({ id: 'spend', title: safe ? 'Spend more' : 'Spend less', trials, pick });
  }

  // Invest more each month (only when you invest fixed amounts, and are still working).
  if (!safe && profile.investMode === 'fixed' && retireNow > ageNow) {
    const trials: TrialResult[] = [];
    let pick: TrialResult | null = null;
    for (const amount of [250, 500, 1000, 2000]) {
      const s = run({ saveMore: amount });
      if (s === null) break;
      const t: TrialResult = { label: `Invest €${amount} more a month`, change: { saveMore: amount }, success: s };
      trials.push(t);
      if (s >= TARGET) {
        pick = t;
        break;
      }
    }
    levers.push({ id: 'save', title: 'Invest more each month', trials, pick });
  }

  // Where you retire.
  {
    const trials: TrialResult[] = [];
    for (const d of ['nl', 'both', 'in'] as const) {
      if (d === profile.destination) continue;
      const s = run({ destination: d });
      if (s === null) continue;
      trials.push({ label: `Retire in ${placeName(d)}`, change: { destination: d }, success: s });
    }
    const best = [...trials].sort((a, b) => b.success - a.success)[0] ?? null;
    levers.push({ id: 'place', title: 'Where you retire', trials, pick: best && best.success > base ? best : null });
  }

  // When no single change is enough, the smallest mix of later retirement and lower spending.
  let combo: TrialResult | null = null;
  let comboBest: TrialResult | null = null;
  if (!safe && levers.every((l) => l.id === 'place' || l.pick === null)) {
    const grid: { years: number; pct: number; effort: number }[] = [];
    for (let years = 0; years <= 5; years++) for (const pct of [0, 5, 10, 15, 20]) if (years + pct > 0) grid.push({ years, pct, effort: years * 5 + pct });
    grid.sort((a, b) => a.effort - b.effort);
    for (const g of grid) {
      if (retireNow + g.years > MAX_RETIRE_AGE) continue;
      const change: Change = { retireShift: g.years || undefined, spendCutPct: g.pct || undefined };
      const s = run(change);
      if (s === null) continue;
      const t: TrialResult = { label: `${g.years ? `Stop at ${retireNow + g.years}` : ''}${g.years && g.pct ? ' and ' : ''}${g.pct ? `spend ${g.pct}% less` : ''}`, change, success: s };
      if (comboBest === null || s > comboBest.success) comboBest = t;
      if (s >= TARGET) {
        combo = t;
        break;
      }
    }
  }
  return { base, target: TARGET, safe, levers, combo, comboBest: combo ? null : comboBest };
}
