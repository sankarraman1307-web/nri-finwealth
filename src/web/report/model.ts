/** Everything the PDF shows, as plain data computed from one run of the planner. No drawing here. */
import type { View } from '../compute';
import { deriveResults } from '../derive';
import { inputGroups, type InputGroup } from './inputs';
import { ASSUMPTION_FIELDS, formatEur, formatEurFull, mortgageFreeSentence, type Profile } from './profileApi';
import { whatIfRows, type WhatIfRow } from './whatif';

export interface ReportPlace {
  name: string;
  pct: number;
  on: boolean;
}

export interface ChartPoint {
  age: number;
  corpus: number;
  low: number;
  high: number;
  needed: number;
  monthlyNeed: number;
  pensions: number;
  drawdown: number;
}

export interface ReportModel {
  generated: string;
  engineVersion: string;
  rulesAsOf: string;
  paths: number;
  verdictLabel: string;
  tone: 'good' | 'warn' | 'bad';
  pct: number;
  horizonAge: number;
  headline: string;
  lead: string;
  places: ReportPlace[];
  placeNote: string;
  legacyText: string;
  warning: { first: string; rest: string } | null;
  inputs: InputGroup[];
  need: {
    title: string;
    explain: string;
    /** null when no savings are needed. */
    neededText: string | null;
    typicalText: string;
    noNeedText: string | null;
    earliestText: string;
    mortgageText: string | null;
  };
  bridge: { title: string; verdict: string; bullets: string[]; note: string } | null;
  chart: { points: ChartPoint[]; retireAge: number; aowAge: number; horizonAge: number; intact: boolean; rate: number; freeText: string };
  whatIf: { rows: WhatIfRow[]; showNeeded: boolean };
  assumptions: { label: string; value: string; changed: boolean }[];
  warnings: string[];
}

const VERDICT = {
  on_track: { label: 'On track', tone: 'good' },
  borderline: { label: 'Borderline', tone: 'warn' },
  at_risk: { label: 'At risk', tone: 'bad' },
} as const;

const pctText = (r: number): string => `${Number((r * 100).toFixed(1))}%`;

export function buildReportModel(view: View, profile: Profile, eurToInr: number, startYear: number, now: Date): ReportModel {
  // The report is always in today's euros, so it reads the same whatever the screen was set to.
  const d = deriveResults(view, profile, eurToInr, 'today');
  const { plan, retireAge, age, aowAge } = view;
  const v = VERDICT[plan.verdict];
  const horizonAge = d.horizonAge;
  const mort = d.mort;
  const lead =
    `Retire at ${retireAge}, living on about ${formatEurFull(d.spendNow)} a month in today’s money` +
    (mort.count > 0 && mort.monthlyEur > 0 && mort.lastEndAge !== null
      ? mort.count === 1
        ? `, plus your ${formatEurFull(mort.monthlyEur)} mortgage until age ${mort.lastEndAge}`
        : `, plus about ${formatEurFull(mort.monthlyEur)} a month in mortgages, the last until age ${mort.lastEndAge}`
      : '') +
    (d.intact ? `, keeping your savings intact and living on ${pctText(d.rate)} of them each year` : `, with nothing left at ${horizonAge}`) +
    '.' +
    (d.failRest >= 3
      ? d.intact
        ? ` In the other ${d.failRest} scenarios, your savings end up smaller than when you stopped working, or run out.`
        : plan.monteCarlo.medianFailAge !== null && plan.monteCarlo.medianFailAge !== undefined
          ? ` In the other ${d.failRest} scenarios, your money runs out around age ${plan.monteCarlo.medianFailAge} on average.`
          : ''
      : '');

  const places: ReportPlace[] = view.compare.map((c) => ({
    name: c.destination === 'nl' ? 'Netherlands' : c.destination === 'in' ? 'India' : `Both (${view.compareMonths} months a year in India)`,
    pct: c.destination === view.destination ? d.pct : Math.round(c.successProbability * 100),
    on: c.destination === view.destination,
  }));

  const earliestText =
    d.intact
      ? `Keeping your savings intact means that at ${horizonAge} they are still worth at least what they were when you stopped working, in today’s money.`
      : d.earliest === null
        ? 'On average returns, no retirement age up to 75 fully works.'
        : d.earliest < retireAge
          ? `On average returns you could stop as early as ${d.earliest}.`
          : d.earliest > retireAge
            ? `On average returns, the earliest age that fully works is ${d.earliest}.`
            : `On average returns, ${retireAge} is the earliest age that fully works.`;

  const soldBit = d.soldAtStop > 1000 ? `, including ${formatEur(d.soldAtStop)} from selling property that year` : '';
  const needBlock: ReportModel['need'] = {
    title: `Savings you need on the day you stop (age ${retireAge})`,
    explain: d.intact
      ? `Based on living on ${pctText(d.rate)} of your savings each year, and keeping them intact. Amounts are in ${d.unit}.`
      : `The smallest pot that lasts to ${horizonAge} if returns are exactly average. Amounts are in ${d.unit}.`,
    neededText: d.noSavingsNeeded && !d.intact ? null : d.neededAtStop === null ? 'n/a' : formatEur(d.neededAtStop),
    typicalText: `${formatEur(d.typicalAtStop)} projected in a typical future${soldBit}`,
    noNeedText:
      d.noSavingsNeeded && !d.intact
        ? `You would not need savings on the day you stop: your pensions, rent and later property sales already pay for your spending to ${horizonAge}, if returns are exactly average. In a typical future you are projected to have built up ${formatEur(d.typicalAtStop)}${soldBit}.`
        : null,
    earliestText,
    mortgageText: mort.lastEndAge !== null && mort.loans.length > 0 ? mortgageFreeSentence(mort.lastEndAge, retireAge) : null,
  };

  const b = d.bridge;
  const bridge: ReportModel['bridge'] = b
    ? {
        title: `Bridge check: ages ${b.fromAge} to ${b.toAge}`,
        verdict: b.selfFunded
          ? `You can pay for these ${b.years} years from your own savings in ${d.pct} of 100 futures. You do not need money from elsewhere.`
          : b.unmetTotal >= 1
            ? `Your own savings do not cover these years. On average returns you would need about ${formatEur(b.unmetTotal)} from elsewhere, or spend less or retire later.`
            : `Over your whole retirement your savings last to ${horizonAge} in only ${d.pct} of 100 futures. In a bad market they run out by age ${b.badRunOutAge ?? horizonAge}. Plan for extra money, less spending or a later stop.`,
        bullets: [
          `You spend about ${formatEurFull(b.spend)} a month, including mortgage and Box 3 tax.`,
          `Pensions, rent and other income give about ${formatEurFull(b.income)} a month.`,
          `Your plan takes about ${formatEurFull(b.fromSavings)} a month from savings: ${formatEur(b.totalFromSavings)} over ${b.years} years.`,
          ...(b.salesInBridge > 1000 ? [`Selling property in these years brings in ${formatEur(b.salesInBridge)}, which joins your savings.`] : []),
          `When your state pension starts you still have about ${formatEur(b.savingsAtEnd)} in a typical future, and ${formatEur(b.savingsAtEndBad)} in a bad one (1 in 10).`,
        ],
        note: `These are the years before your state pension starts at ${aowAge}. Amounts are in today’s euros, on average returns.`,
      }
    : null;

  const base = { pct: d.pct, needed: d.intact ? null : plan.expected.requiredCorpus / (1 + view.inflation) ** (retireAge - age), typical: plan.monteCarlo.medianAtRetirementReal };
  const effective = view.assumptions;
  const assumptions = ASSUMPTION_FIELDS.map((f) => {
    const typed = (profile.assumptions[f.key] ?? '').trim() !== '';
    const val = Number(f.read(effective).toFixed(2));
    return { label: f.label, value: f.key === 'planToAge' ? String(val) : `${val}%`, changed: typed };
  });

  return {
    generated: now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    engineVersion: plan.meta.engineVersion,
    rulesAsOf: plan.meta.rulesAsOf,
    paths: plan.meta.paths,
    verdictLabel: v.label,
    tone: v.tone,
    pct: d.pct,
    horizonAge,
    headline: `If you live to ${horizonAge}, your money lasts in ${d.pct} of 100 possible future scenarios.`,
    lead,
    places,
    placeNote: `Chance your money lasts to ${horizonAge}, by where you retire. India and Both look better than they are: Indian income tax is not included yet. Both assumes ${view.compareMonths} months a year in India.`,
    legacyText: d.intact
      ? `What should be left at ${horizonAge}: an inheritance. You live on ${pctText(d.rate)} of your savings each year and pass the full amount on, in today’s money.`
      : `What should be left at ${horizonAge}: nothing. Your savings run down to nothing by ${horizonAge}, so you need the smallest pot.`,
    warning: d.warnFirst ? { first: d.warnFirst, rest: d.warnRest } : null,
    inputs: inputGroups(profile),
    need: needBlock,
    bridge,
    chart: {
      points: d.series.map((p) => ({ age: p.age, corpus: p.corpus, low: p.low, high: p.high, needed: p.needed, monthlyNeed: p.monthlyNeed, pensions: p.pensions, drawdown: p.drawdown })),
      retireAge,
      aowAge,
      horizonAge,
      intact: d.intact,
      rate: d.rate,
      freeText: d.free !== null ? `On this measure your savings are enough from age ${d.free}.` : 'On this measure your savings never get there.',
    },
    whatIf: { rows: whatIfRows(base, profile, eurToInr, startYear), showNeeded: !d.intact },
    assumptions,
    warnings: plan.warnings.slice(0, 8).map((w) => w.message),
  };
}
