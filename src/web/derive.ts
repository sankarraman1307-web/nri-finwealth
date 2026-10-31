/**
 * Everything the verdict, the savings chart and the PDF report show, worked out once from one run.
 * The results screen and the report both call this, so their numbers cannot disagree.
 */
import type { View } from './compute';
import { bridgeCheck, drawdownSeries, earliestFeasibleAge, independenceAge, type Bridge, type DrawdownPoint, type EuroBasis } from './chartData';
import { mortgageSummary, parseMoney, type MortgageSummary, type Profile } from './profile';

export interface Derived {
  intact: boolean;
  rate: number;
  pct: number;
  failRest: number;
  spendNow: number;
  mort: MortgageSummary;
  horizonAge: number;
  earliest: number | null;
  series: DrawdownPoint[];
  free: number | null;
  unit: string;
  neededAtStop: number | null;
  typicalAtStop: number;
  bridge: Bridge | null;
  topWarning: { message: string } | undefined;
  warnFirst: string;
  warnRest: string;
  noSavingsNeeded: boolean;
  soldAtStop: number;
}

export function deriveResults(view: View, profile: Profile, eurToInr: number, basis: EuroBasis): Derived {
  const { plan, monthly, curve, retireAge, age, aowAge } = view;
  const intact = view.legacy === 'intact';
  // The yearly share of savings you live on. Only used, and only shown, when you keep your savings intact.
  const rate = view.safeRate;
  const pct = Math.round(plan.monteCarlo.successProbability * 100);
  const spendNow = parseMoney(profile.living, 'eur') ?? 0;
  const mort = mortgageSummary(profile, eurToInr);
  const horizonAge = age + plan.meta.horizonYears;
  const earliest = earliestFeasibleAge(curve);
  const series = drawdownSeries(plan.monteCarlo.bands, monthly, {
    mode: intact ? 'intact' : 'spend',
    rate,
    inflation: view.inflation,
    startAge: age,
    basis,
    retireAge,
    ...(plan.expected.requiredByAge ? { required: plan.expected.requiredByAge } : {}),
    curve,
  });
  const free = independenceAge(series);
  const unit = basis === 'future' ? 'future euros' : "today's euros";
  // Values the engine gives at the day you stop are in that year's euros. 'today' removes inflation since now.
  const toBasis = basis === 'today' ? 1 / (1 + view.inflation) ** (retireAge - age) : 1;
  // One definition of "needed", chosen by the question. Spend it all: the smallest pot that lasts to the end. Keep it intact: a fixed share of the pot per year.
  const neededAtStop = intact ? series.find((p) => p.age === retireAge)?.needed ?? null : plan.expected.requiredCorpus * toBasis;
  const typicalAtStop = view.typicalAtStop * toBasis;
  const bridge = bridgeCheck(plan, retireAge, aowAge, view.inflation, basis);
  const topWarning = plan.warnings.find((w) => w.severity === 'important');
  const warnParts = topWarning ? topWarning.message.split(/(?<=[.!?])\s+/) : [];
  const warnFirst = warnParts[0] ?? '';
  const warnRest = warnParts.slice(1).join(' ');
  const noSavingsNeeded = plan.expected.requiredCorpus <= 0;
  // Property sold in the year you stop is part of the corpus on that day.
  const soldAtStop = plan.expected.rows.filter((r) => r.age === retireAge).reduce((t, r) => t + r.saleProceeds, 0) * toBasis;
  return { intact, rate, pct, failRest: 100 - pct, spendNow, mort, horizonAge, earliest, series, free, unit, neededAtStop, typicalAtStop, bridge, topWarning, warnFirst, warnRest, noSavingsNeeded, soldAtStop };
}
