import { mergeAssumptions } from './assumptions';
import { runMonteCarlo } from './montecarlo';
import { countryPack } from './countries';
import {
  expectedShocks,
  initialState,
  makeContext,
  simulate,
  sumPots,
  type SimContext,
  type SimState,
} from './simulate';
import { propertiesOf } from './properties';
import { validateInput } from './validate';
import type {
  AssumptionOverrides,
  Assumptions,
  Destination,
  PlanInput,
  PlanResult,
  Property,
  SensitivityResult,
  SweepPoint,
  Verdict,
  Warning,
  YearRow,
} from './types';
import { ASSET_CLASSES } from './types';

export const ENGINE_VERSION = '2.1.0';

export interface RunOptions {
  assumptions?: AssumptionOverrides;
  /** Monte Carlo paths for the headline result. */
  paths?: number;
  seed?: number;
  /** Also compute the retirement-age sweep (extra Monte Carlo runs). */
  sweep?: boolean;
  /** Also compute what-if sensitivities (extra Monte Carlo runs). */
  sensitivities?: boolean;
}

const DEFAULT_PATHS = 1000;
const DEFAULT_SEED = 20261022;

/** Works on the whole percentage the user sees, so "85%" is never labelled "borderline". */
export function verdictFor(successProbability: number): Verdict {
  const pct = Math.round(successProbability * 100);
  if (pct >= 90) return 'on_track';
  if (pct >= 70) return 'borderline';
  return 'at_risk';
}

/**
 * Smallest liquid corpus at retirement (in nominal EUR, keeping the user's asset mix) that lasts
 * to the planning age on the expected path. Replaces v1's "first-year shortfall / 4%" rule, which
 * ignored inflation, pension start dates and the actual length of retirement.
 */
export function requiredCorpusAtRetirement(
  ctx: SimContext,
  stateAtRetirement: SimState,
  shocks: ReturnType<typeof expectedShocks>,
): number {
  const total = sumPots(stateAtRetirement.pots);
  const shares = ASSET_CLASSES.map((c) => (total > 0 ? stateAtRetirement.pots[c] / total : c === 'eurEquity' ? 1 : 0));

  const survives = (amount: number): boolean => {
    const pots = { ...stateAtRetirement.pots };
    ASSET_CLASSES.forEach((c, idx) => {
      pots[c] = amount * (shares[idx] as number);
    });
    const res = simulate(ctx, shocks, {
      from: { state: { ...stateAtRetirement, pots }, t: ctx.yearsToRetire },
    });
    return res.depletedAtAge === null;
  };

  if (survives(0)) return 0;
  let hi = 100_000;
  while (!survives(hi)) {
    hi *= 2;
    if (hi > 1e11) return Number.POSITIVE_INFINITY;
  }
  let lo = hi / 2;
  if (survives(lo)) lo = 0;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (survives(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

export function collectWarnings(input: PlanInput, a: Assumptions, firstYear?: YearRow): Warning[] {
  const w: Warning[] = [];
  const push = (code: string, severity: Warning['severity'], message: string) => w.push({ code, severity, message });
  const pack = countryPack(input.country);
  const rules = pack.rulesFor(input.startYear);
  const dest = input.retirementDestination;
  const props = propertiesOf(input);

  push(
    'tax-credits',
    input.grossSalary > 0 && input.grossSalary < 90000 ? 'caution' : 'info',
    'Dutch tax credits (heffingskortingen) are not modelled, so net income is slightly understated. That errs on the cautious side.',
  );
  if (input.rulingYearsLeft > 0 && !input.rulingGrandfathered)
    push(
      'ruling-2027',
      'important',
      'From 2027 the 30% ruling allowance falls to 27% for rulings granted 2024 or later. The model applies this from 1 January 2027.',
    );
  push(
    'box3-2028',
    'caution',
    a.box3Regime === 'actual'
      ? 'Box 3 is modelled on the actual yearly return from 2028, with a EUR 1,000 tax-free result. That is a cautious estimate: the latest cabinet proposal taxes gains only when you sell, from 2028 for shares and bonds and from 2030 for other assets. None of it is final law.'
      : 'Box 3 is modelled on the current deemed-return system throughout. A new system based on actual returns is planned from 2028 but is not final law and could change your tax. You can try it under Assumptions.',
  );
  if (input.inFixedDeposits + input.inMutualFunds + input.inEpf + props.filter((x) => x.country === 'in' && x.value > 0).length > 0)
    push(
      'box3-india',
      'info',
      'Indian property, deposits, funds and EPF are included in your Dutch Box 3 base while you live in NL. EPF treatment is not settled, so it is treated as an ordinary asset.',
    );
  if (dest === 'both') {
    const months = Math.min(12, Math.max(0, input.snowbirdMonthsInIndia ?? 0));
    push(
      'snowbird-residency',
      months >= 4 ? 'important' : 'caution',
      `You plan about ${months} months a year in India. From around 120 to 182 days a year you can be treated as a tax resident of India, and your worldwide income can then be taxed there too (resident-but-not-ordinary status often limits this). The Dutch-Indian tax treaty decides if both countries claim you. Get advice before you commit to a split.`,
    );
    push(
      'snowbird-model',
      'info',
      'The snowbird plan keeps your main home, Dutch tax, Box 3 and AOW build-up in the Netherlands. Living costs are split by months using Dutch and Indian price levels, plus your travel budget. Indian income tax and a second healthcare cover are not modelled.',
    );
  }
  if (dest === 'in') {
    push('india-tax', 'important', 'Income tax and capital gains tax in India are not modelled yet. The India-retirement result is therefore optimistic.');
    push('india-healthcare', 'caution', 'Private healthcare in India is not modelled separately. The 0.38 cost factor is a single blended number: stress-test it.');
    push('aow-abroad', 'info', 'AOW is assumed to be payable in India and taxed under Dutch rules. Check the NL-India treaty position for your case.');
    push('aow-accrual', 'info', 'AOW accrual stops when you leave the Netherlands, so retiring early to India lowers your state pension.');
  }
  if (input.partnerEarner && input.familyStatus === 'partner')
    push(
      'partner-ruling',
      'info',
      'Each earner is taxed on their own salary and their own 30% ruling. The special Box 3 treatment for rulings granted before 2024 is applied only while both of you have one; otherwise your assets are taxed as normal.',
    );
  const nameOf = (x: Property) => {
    const where = x.country === 'in' ? 'Indian' : 'Dutch';
    const same = props.filter((y) => y.country === x.country).length > 1;
    return same ? `${where} property ${props.filter((y) => y.country === x.country).indexOf(x) + 1}` : x.country === 'nl' && x.use === 'home' ? 'Dutch home' : `${where} property`;
  };
  for (const x of props) {
    if (x.value <= 0) continue;
    const label = nameOf(x);
    if (x.sellAtAge === undefined) {
      push(
        `${x.id}-kept`,
        x.country === 'in' ? 'caution' : 'info',
        `Your ${label.toLowerCase().replace('dutch', 'Dutch').replace('indian', 'Indian')} is kept and never sold in this plan. It grows in value, but it does not pay for your retirement.${x.country === 'in' ? ' Choose a sale age if you would sell it, to see what it adds.' : ''}`,
      );
    } else if (x.country === 'in') {
      push(
        `${x.id}-sale`,
        'important',
        `The ${label} is sold at ${x.sellAtAge}. Capital gains tax is estimated at ${(a.inCapGainsTax * 100).toFixed(1)}% of the gain over what you paid, plus ${(a.inSaleCostShare * 100).toFixed(0)}% selling costs${x.loan ? ', and the loan still owed is repaid from the sale (its balance is assumed to fall in a straight line, so check the real figure with your lender)' : ''}. Exemptions, surcharge and TDS are not modelled. NRIs can move at most USD 1 million a year out of India, so a large sale may need to be spread over several years.`,
      );
    } else {
      push(
        `${x.id}-sale`,
        x.loan && x.loan.yearsLeft > x.sellAtAge - input.age ? 'caution' : 'info',
        `The ${label} is sold at ${x.sellAtAge}, after ${(a.nlSaleCostShare * 100).toFixed(0)}% selling costs${x.loan ? ' and the mortgage left to repay. The mortgage balance is assumed to fall in a straight line to zero, which is slightly generous, so check the real balance with your bank' : ''}.${x.use === 'home' ? ` After the sale you pay rent of ${Math.round(x.rentAfterSaleMonthly ?? 0)} euros a month in today's money.` : ''} House prices are assumed to grow ${(a.realEstateGrowthNl * 100).toFixed(0)}% a year.`,
      );
    }
  }
  if (props.some((x) => x.country === 'nl' && x.use !== 'home' && x.value > 0))
    push(
      'nl-investment-property',
      'info',
      'A Dutch property you do not live in is counted in Box 3 here, at its market value with its mortgage as a debt. In practice Box 3 uses the WOZ value and rented property can be valued differently, so check it with an adviser.',
    );
  if ((input.jewelleryGrams24k ?? 0) > 0 && input.jewellerySellAtAge === undefined)
    push(
      'jewellery-unused',
      'info',
      'Your gold jewellery is kept and never sold in this plan. It follows the gold price, but it does not pay for your retirement. Choose a share and an age if you would sell some.',
    );
  if ((input.jewelleryGrams24k ?? 0) > 0 && input.jewellerySellAtAge !== undefined)
    push(
      'jewellery-sale',
      'caution',
      `Part of your jewellery is sold at ${input.jewellerySellAtAge}, after a ${Math.round((input.jewelleryResaleDiscount ?? 0) * 100)}% loss at the jeweller. Indian capital gains tax on gold and any import or customs rules for moving gold are not modelled.`,
    );
  if ((input.jewelleryGrams24k ?? 0) > 0)
    push(
      'jewellery-box3',
      'info',
      'Jewellery you wear is generally outside Dutch Box 3 as a personal-use item, so it is left out of the Box 3 base here. Gold you hold as an investment, such as bars, coins and gold funds, is inside it. Check how your own jewellery is treated.',
    );
  const streams = (input.incomeStreams ?? []).filter((x) => x.monthlyToday > 0 && (x.who === 'you' || input.familyStatus === 'partner'));
  if (streams.some((x) => x.kind === 'nl-pension' || x.kind === 'annuity'))
    push(
      'pension-tax',
      'info',
      'Dutch workplace pensions and annuities are taxed as income together with AOW, at the lower rate that applies from AOW age. Your household is taxed as one taxpayer here, which is slightly cautious. Early-start cuts and fund rules differ, so check the amounts with your pension fund.',
    );
  const fixedIndia = streams.filter((x) => x.kind === 'in-pension' && !x.indexed);
  if (fixedIndia.length > 0)
    push(
      'in-pension-fixed',
      'caution',
      `An Indian pension that does not rise with inflation loses value fast. At ${(a.inflationIn * 100).toFixed(1)}% Indian inflation and a rupee that weakens ${(a.fxDriftAnnual * 100).toFixed(1)}% a year, its worth in euros falls by about half in 15 years. The plan uses a fixed rupee amount.`,
    );
  if (streams.some((x) => x.kind === 'other'))
    push('other-income', 'info', 'Other income is entered after tax and is not taxed again. Extra profit on top of a salary is usually taxed at your top rate, so use that rate when you estimate it.');
  const mi = input.monthlyInvesting;
  if (mi && firstYear && firstYear.investedPlanned > firstYear.invested * 1.001 + 1)
    push(
      'investing-capped',
      'caution',
      `You plan to invest about ${Math.round(firstYear.investedPlanned / 12).toLocaleString('en-US')} euros a month, but this year the plan leaves only about ${Math.round(Math.max(0, firstYear.invested) / 12).toLocaleString('en-US')} a month after spending and tax. Either your spending is higher than you entered, or you will invest less. The plan invests only what is left.`,
    );
  push('aow-age', 'info', `AOW starts at ${a.aowAge} in this model. The legal age rises with life expectancy, so younger people should expect 68 or higher.`);
  if (input.dutchBusinessEquity + input.inBusinessEquity > 0)
    push('business-equity', 'info', 'Business equity is counted in net worth but excluded from the liquid retirement pool.');
  if (props.some((x) => x.country === 'nl' && x.value + (x.loan?.balance ?? 0) > 0))
    push('mortgage-interest', 'info', 'Mortgage interest deduction and the imputed rental value of your home are not modelled.');
  if (input.retirementAge < 60)
    push('long-horizon', 'caution', `Retiring at ${input.retirementAge} means funding ${a.planToAge - input.retirementAge} years. Small assumption changes matter a lot over that span.`);
  if (input.retirementAge < a.aowAge)
    push('aow-gap', 'info', `${a.aowAge - input.retirementAge} years pass between retirement and AOW. Your portfolio carries you through them.`);

  const years = new Set<number>();
  const lastYear = input.startYear + Math.max(0, a.planToAge - input.age);
  for (let y = input.startYear; y <= Math.min(lastYear, input.startYear + 3); y++) years.add(countryPack(input.country).rulesFor(y).year);
  const unverified = new Set<string>();
  for (const y of years) for (const u of countryPack(input.country).rulesFor(y).unverified) unverified.add(u);
  for (const u of unverified) if (!u.startsWith('Heffingskortingen')) push('unverified-rule', 'caution', `Rule estimate: ${u}.`);

  const order = { important: 0, caution: 1, info: 2 } as const;
  return w.sort((x, y) => order[x.severity] - order[y.severity]);
}

function snapshotOf(input: PlanInput, state: SimState, a: Assumptions) {
  const r = input.eurToInr;
  const props = propertiesOf(input);
  const nlProps = props.filter((x) => x.country === 'nl');
  const inProps = props.filter((x) => x.country === 'in');
  const dutchHomeValue = nlProps.reduce((sum, x) => sum + x.value, 0);
  const inRealEstateEur = inProps.reduce((sum, x) => sum + x.value, 0) / r;
  const dutchMortgage = nlProps.reduce((sum, x) => sum + (x.loan?.balance ?? 0), 0);
  const dutchPayment = nlProps.reduce((sum, x) => sum + (x.loan?.paymentMonthly ?? 0), 0);
  const inMortgageEur = inProps.reduce((sum, x) => sum + (x.loan?.balance ?? 0), 0) / r;
  const inPaymentInr = inProps.reduce((sum, x) => sum + (x.loan?.paymentMonthly ?? 0), 0);
  const inBusinessEur = input.inBusinessEquity / r;
  const p = state.pots;
  const jewelleryEur = state.jewelleryEur;

  const totalAssets =
    dutchHomeValue + input.dutchBusinessEquity + inRealEstateEur + inBusinessEur + jewelleryEur + sumPots(p);
  const totalLiabilities = dutchMortgage + inMortgageEur + input.otherDebts;
  const netWorth = totalAssets - totalLiabilities;

  // Unchanged from v1 so scores stay comparable. Note the crude age x salary / 10 benchmark.
  const targetNetWorth = (input.age * input.grossSalary) / 10;
  const wealthRatio = targetNetWorth > 0 ? netWorth / targetNetWorth : 0;
  const ltv = totalAssets > 0 ? totalLiabilities / totalAssets : 0;
  const leverageFactor = Math.max(0, 1 - ltv / 0.8);
  const financialWealthScore = Math.max(0, Math.min(100, Math.round(Math.min(1, wealthRatio) * 60 + leverageFactor * 40)));

  // v1 used 6 x core only; mortgage payments are non-negotiable, so they count here.
  const essentialMonthly = input.monthlyCoreSpend + dutchPayment + inPaymentInr / r;
  const targetEmergency = 6 * essentialMonthly;
  const emergencyScore =
    targetEmergency > 0 ? Math.max(0, Math.min(100, Math.round((input.eurCash / targetEmergency) * 100))) : 100;

  const assetsByCategory = [
    { name: 'Dutch real estate', value: dutchHomeValue },
    { name: 'Indian real estate', value: inRealEstateEur },
    { name: 'Cash & FDs', value: p.eurCash + p.inrFd },
    { name: 'Equity funds & stocks', value: p.eurEquity + p.inrEquity },
    { name: 'EPF', value: p.inrEpf },
    { name: 'Business assets', value: input.dutchBusinessEquity + inBusinessEur },
    { name: 'Gold', value: p.gold },
    { name: 'Gold jewellery', value: jewelleryEur },
  ].filter((x) => x.value > 0);

  // v1 left EPF out of the geography split, so its two charts did not add up to the same total.
  const assetsByGeography = [
    { name: 'Netherlands', value: dutchHomeValue + input.dutchBusinessEquity + p.eurCash + p.eurEquity },
    { name: 'India', value: inRealEstateEur + inBusinessEur + p.inrFd + p.inrEquity + p.inrEpf },
    { name: 'Gold (portable)', value: p.gold + jewelleryEur },
  ].filter((x) => x.value > 0);

  void a;
  return {
    totalAssets,
    totalLiabilities,
    netWorth,
    liquidInvestments: sumPots(p),
    targetNetWorth,
    financialWealthScore,
    targetEmergency,
    emergencyScore,
    assetsByCategory,
    assetsByGeography,
  };
}

export function successProbabilityFor(
  input: PlanInput,
  a: Assumptions,
  paths: number,
  seed: number,
): number {
  return runMonteCarlo(makeContext(input, a), paths, seed).successProbability;
}

export function computeSensitivities(
  input: PlanInput,
  a: Assumptions,
  base: number,
  paths: number,
  seed: number,
): SensitivityResult[] {
  const tweakReturns = (delta: number): Assumptions => ({
    ...a,
    returns: {
      ...a.returns,
      eurEquity: { ...a.returns.eurEquity, mean: a.returns.eurEquity.mean + delta },
      inrEquity: { ...a.returns.inrEquity, mean: a.returns.inrEquity.mean + delta },
    },
  });
  const scenarios: { id: string; label: string; input: PlanInput; a: Assumptions }[] = [
    { id: 'retire-later-2', label: 'Retire 2 years later', input: { ...input, retirementAge: input.retirementAge + 2 }, a },
    { id: 'spend-less-10', label: 'Spend 10% less', input: { ...input, monthlyCoreSpend: input.monthlyCoreSpend * 0.9, annualLifestyleSpend: input.annualLifestyleSpend * 0.9 }, a },
    { id: 'spend-more-10', label: 'Spend 10% more', input: { ...input, monthlyCoreSpend: input.monthlyCoreSpend * 1.1, annualLifestyleSpend: input.annualLifestyleSpend * 1.1 }, a },
    { id: 'returns-minus-1', label: 'Equity returns 1 point lower', input, a: tweakReturns(-0.01) },
    { id: 'rupee-faster', label: 'Rupee falls 2 points faster per year', input, a: { ...a, fxDriftAnnual: a.fxDriftAnnual + 0.02 } },
    {
      id: 'flip-destination',
      label: input.retirementDestination === 'nl' ? 'Retire in India instead' : 'Retire in the Netherlands instead',
      input: { ...input, retirementDestination: input.retirementDestination === 'nl' ? 'in' : 'nl' },
      a,
    },
  ];
  const sellAt = Math.max(75, input.retirementAge);
  const keptIndia = propertiesOf(input).filter((x) => x.country === 'in' && x.value > 0 && x.sellAtAge === undefined);
  if (keptIndia.length > 0 && sellAt < a.planToAge)
    scenarios.push({
      id: 'sell-india-75',
      label: keptIndia.length > 1 ? `Sell the Indian properties at ${sellAt}` : `Sell the Indian property at ${sellAt}`,
      input: { ...input, properties: propertiesOf(input).map((x) => (keptIndia.includes(x) ? { ...x, sellAtAge: sellAt } : x)) },
      a,
    });
  if (input.retirementAge - 2 > input.age)
    scenarios.splice(1, 0, { id: 'retire-earlier-2', label: 'Retire 2 years earlier', input: { ...input, retirementAge: input.retirementAge - 2 }, a });

  return scenarios.map((s) => {
    const p = successProbabilityFor(s.input, s.a, paths, seed);
    return { id: s.id, label: s.label, successProbability: p, delta: p - base };
  });
}

export interface DestinationCompare {
  destination: Destination;
  successProbability: number;
}

/** The same household retiring in the Netherlands, in India, or splitting the year. */
export function compareDestinations(input: PlanInput, a: Assumptions, paths: number, seed: number): DestinationCompare[] {
  const dests: Destination[] = ['nl', 'both', 'in'];
  return dests.map((destination) => ({
    destination,
    successProbability: successProbabilityFor({ ...input, retirementDestination: destination }, a, paths, seed),
  }));
}

export interface CorpusPoint {
  retirementAge: number;
  /** Liquid money you would have at that retirement age, in today's EUR (expected path). */
  available: number;
  /** Liquid money you would need at that age to last to the planning age, in today's EUR. */
  required: number;
}

/**
 * For every possible retirement age: what you would have versus what you would need, on the
 * expected path. Where the first line rises above the second is the earliest age that works.
 */
export function computeCorpusCurve(input: PlanInput, a: Assumptions): CorpusPoint[] {
  const out: CorpusPoint[] = [];
  const to = Math.min(75, a.planToAge - 5);
  for (let ra = input.age; ra <= to; ra++) {
    const ctx = makeContext({ ...input, retirementAge: ra }, a);
    const shocks = expectedShocks(a, ctx.horizon);
    const res = simulate(ctx, shocks);
    const deflator = (1 + a.inflationNl) ** ctx.yearsToRetire;
    const required = requiredCorpusAtRetirement(ctx, res.stateAtRetirement, shocks);
    out.push({
      retirementAge: ra,
      available: sumPots(res.stateAtRetirement.pots) / deflator,
      required: Number.isFinite(required) ? required / deflator : Number.POSITIVE_INFINITY,
    });
  }
  return out;
}

export function computeSweep(input: PlanInput, a: Assumptions, paths: number, seed: number): SweepPoint[] {
  const out: SweepPoint[] = [];
  const from = Math.max(input.age, 40);
  const to = Math.min(70, a.planToAge - 5);
  for (let ra = from; ra <= to; ra++) {
    out.push({ retirementAge: ra, successProbability: successProbabilityFor({ ...input, retirementAge: ra }, a, paths, seed) });
  }
  return out;
}

export function runPlan(input: PlanInput, opts: RunOptions = {}): PlanResult {
  const a = mergeAssumptions(opts.assumptions);
  const errors = validateInput(input, a.planToAge).filter((i) => i.level === 'error');
  if (errors.length) throw new Error(`Invalid plan input: ${errors.map((e) => `${e.field}: ${e.message}`).join('; ')}`);

  const paths = opts.paths ?? DEFAULT_PATHS;
  const seed = opts.seed ?? DEFAULT_SEED;
  const ctx = makeContext(input, a);
  const shocks = expectedShocks(a, ctx.horizon);
  const expected = simulate(ctx, shocks);

  const corpus = sumPots(expected.stateAtRetirement.pots);
  const priceAtRetirement = (1 + a.inflationNl) ** ctx.yearsToRetire;
  const required = requiredCorpusAtRetirement(ctx, expected.stateAtRetirement, shocks);
  const retirementRows = expected.rows.filter((r) => r.phase === 'retirement');
  const first = retirementRows[0];

  const mc = runMonteCarlo(ctx, paths, seed);

  const result: PlanResult = {
    meta: { engineVersion: ENGINE_VERSION, rulesAsOf: countryPack(input.country).rulesAsOf, startYear: input.startYear, horizonYears: ctx.horizon, paths, seed },
    snapshot: snapshotOf(input, initialState(input), a),
    expected: {
      rows: expected.rows,
      corpusAtRetirement: corpus,
      corpusAtRetirementReal: corpus / priceAtRetirement,
      requiredCorpus: required,
      margin: corpus - required,
      coverageRatio: required > 0 && Number.isFinite(required) ? corpus / required : null,
      depletedAtAge: expected.depletedAtAge,
      endingLiquidReal: expected.endingLiquidReal,
      propertyReserveReal: (expected.endState.propertyEur.reduce((x, y) => x + y, 0) + expected.endState.jewelleryEur) / (1 + a.inflationNl) ** ctx.horizon,
      firstRetirementYear: first
        ? {
            age: first.age,
            spend: first.totalSpend + first.box3Tax,
            pensionAndPassive: first.pensionGross - first.pensionTax + first.passiveNet,
            fromPortfolio: Math.max(0, -first.netFlow),
            withdrawalRate: first.liquidStart > 0 ? Math.max(0, -first.netFlow) / first.liquidStart : 0,
          }
        : null,
      aow: {
        accrualShare: ctx.aowAccrualShare,
        persons: ctx.aowPersons,
        monthlyTodayEur: (ctx.aowFullAnnualToday * ctx.aowAccrualShare) / 12,
      },
    },
    monteCarlo: { successProbability: mc.successProbability, bands: mc.bands, p10DepletionAge: mc.p10DepletionAge },
    verdict: verdictFor(mc.successProbability),
    warnings: collectWarnings(input, a, expected.rows[0]),
  };

  if (opts.sensitivities) result.sensitivities = computeSensitivities(input, a, mc.successProbability, Math.min(paths, 500), seed);
  if (opts.sweep) result.retirementAgeSweep = computeSweep(input, a, Math.min(paths, 300), seed);
  return result;
}
