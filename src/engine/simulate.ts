import { inBox3, isSold, loanBalance, propertiesOf, valueEur } from './properties';
import { countryPack } from './countries';
import { makeNormal, mulberry32 } from './rng';
import type { AssetClass, Assumptions, PlanInput, Pots, YearRow } from './types';
import { ASSET_CLASSES } from './types';

/** Everything the yearly step needs that does not change during a run. */
export interface SimContext {
  input: PlanInput;
  a: Assumptions;
  horizon: number;
  yearsToRetire: number;
  initialWeight: number;
  aowPersons: number;
  aowAccrualShare: number;
  /** Full-accrual AOW per year for the household, today's EUR (before the accrual share). */
  aowFullAnnualToday: number;
  /** What you and your partner each get from AOW per year, today's EUR. Each starts at their own state pension age. */
  aowYouToday: number;
  aowPartnerToday: number;
}

export interface SimState {
  pots: Pots;
  /** Value of each property in EUR (nominal), in the order of propertiesOf(input). Illiquid: it only helps the plan if you sell it. */
  propertyEur: number[];
  /** Gold jewellery in EUR. Grows with the gold price, outside Box 3, and is spent only if you plan a sale. */
  jewelleryEur: number;
  /** INR depreciation vs EUR since the start: 1.10 means INR buys 10% fewer euros than today. */
  fxLevel: number;
  /** Set when the property and jewellery sales of this year are already in the pots, so they are not counted twice. */
  salesDoneAt?: number;
}

export interface YearShock {
  /** Nominal return per asset class in its own currency. */
  returns: Record<AssetClass, number>;
  /** INR depreciation against EUR during the year. */
  fxDep: number;
}

export interface SimResult {
  rows: YearRow[];
  stateAtRetirement: SimState;
  endState: SimState;
  depletedAtAge: number | null;
  endingLiquidReal: number;
}

const IS_INR: Record<AssetClass, boolean> = {
  eurCash: false,
  eurEquity: false,
  gold: false,
  inrFd: true,
  inrEquity: true,
  inrEpf: true,
};

export const sumPots = (p: Pots): number => p.eurCash + p.eurEquity + p.gold + p.inrFd + p.inrEquity + p.inrEpf;

export function householdWeight(
  a: Pick<Assumptions, 'partnerWeight' | 'childIndependenceAge' | 'childWeightUnder18' | 'childWeight18to24'>,
  familyStatus: PlanInput['familyStatus'],
  childrenAges: number[],
  yearsFromNow: number,
): number {
  let w = 1 + (familyStatus === 'partner' ? a.partnerWeight : 0);
  for (const c of childrenAges) {
    const simAge = c + yearsFromNow;
    // v1 used `<= 25`, so a 25-year-old still counted 0.5 although the spec says independent at 25.
    if (simAge < a.childIndependenceAge) w += simAge < 18 ? a.childWeightUnder18 : a.childWeight18to24;
  }
  return w;
}

/**
 * AOW accrues 2% per year of residence in NL between 15 and AOW age (cap 50 years).
 * If you retire to India, accrual stops when you leave. v1 assumed residence until 67 regardless.
 */
export function aowAccrualYears(input: PlanInput, a: Assumptions): number {
  // Snowbirds keep their main home, and so their AOW build-up, in the Netherlands.
  const stayUntil = input.retirementDestination === 'in' ? Math.min(a.aowAge, input.retirementAge) : a.aowAge;
  return Math.min(50, input.yearsInNl + Math.max(0, stayUntil - input.age));
}

export function makeContext(input: PlanInput, a: Assumptions): SimContext {
  const rules = countryPack(input.country).rulesFor(input.startYear);
  const persons = input.familyStatus === 'partner' ? 2 : 1;
  const perPerson =
    input.familyStatus === 'partner' ? rules.aow.partnerMonthlyGrossEach : rules.aow.singleMonthlyGross;
  const fullAnnual = perPerson * persons * 12;
  const accrualShare = aowAccrualYears(input, a) / rules.aow.fullAccrualYears;
  const ov = input.aowAnnualOverride;
  let aowTotal = fullAnnual * accrualShare;
  if (ov) {
    const each = perPerson * 12 * accrualShare;
    aowTotal = (ov.you ?? each) + (persons === 2 ? (ov.partner ?? each) : 0);
  }
  return {
    input,
    a,
    horizon: Math.max(1, a.planToAge - input.age),
    yearsToRetire: Math.max(0, input.retirementAge - input.age),
    initialWeight: householdWeight(a, input.familyStatus, input.childrenAges, 0),
    aowPersons: persons,
    // Partner is assumed to have the same NL residence record. An explicit input is a good v2.1 feature.
    aowAccrualShare: fullAnnual > 0 ? aowTotal / fullAnnual : accrualShare,
    aowFullAnnualToday: fullAnnual,
    aowYouToday: ov ? (ov.you ?? perPerson * 12 * accrualShare) : perPerson * 12 * accrualShare,
    aowPartnerToday: persons === 2 ? (ov ? (ov.partner ?? perPerson * 12 * accrualShare) : perPerson * 12 * accrualShare) : 0,
  };
}

export function initialState(input: PlanInput): SimState {
  const r = input.eurToInr;
  return {
    pots: {
      eurCash: input.eurCash,
      eurEquity: input.eurInvestments,
      gold: input.goldGrams * input.goldEurPerGram,
      inrFd: input.inFixedDeposits / r,
      inrEquity: input.inMutualFunds / r,
      inrEpf: input.inEpf / r,
    },
    propertyEur: propertiesOf(input).map((p) => valueEur(p, r)),
    jewelleryEur: (input.jewelleryGrams24k ?? 0) * input.goldEurPerGram,
    fxLevel: 1,
  };
}

/** Share of the year spent in India once everyone has stopped working. */
export function indiaShare(input: Pick<PlanInput, 'retirementDestination' | 'snowbirdMonthsInIndia'>): number {
  if (input.retirementDestination === 'in') return 1;
  if (input.retirementDestination === 'both') return Math.min(12, Math.max(0, input.snowbirdMonthsInIndia ?? 0)) / 12;
  return 0;
}

/** Remaining Dutch mortgage balance: assumed to fall in a straight line to zero at the end of the term. */
export function dutchMortgageBalance(input: PlanInput, t: number): number {
  let sum = 0;
  for (const p of propertiesOf(input)) if (p.country === 'nl') sum += loanBalance(p, t);
  return sum;
}

/** Today's-euro amount of yearly extras that apply at this age. */
export function yearlyExtrasToday(input: PlanInput, age: number): number {
  let sum = 0;
  for (const e of input.yearlyExpenses ?? []) {
    if (age >= (e.fromAge ?? 0) && age <= (e.untilAge ?? Number.POSITIVE_INFINITY)) sum += e.amountToday;
  }
  return sum;
}

export function expectedShocks(a: Assumptions, n: number): YearShock[] {
  const returns = {} as Record<AssetClass, number>;
  for (const c of ASSET_CLASSES) returns[c] = a.returns[c].mean;
  return Array.from({ length: n }, () => ({ returns: { ...returns }, fxDep: a.fxDriftAnnual }));
}

/**
 * Random shocks. Returns are lognormal with the stated arithmetic mean; assets share one market
 * factor through `marketBeta`; the FX move is independent. Same seed gives the same paths.
 */
export function makeShockGenerator(a: Assumptions, seed: number): (n: number) => YearShock[] {
  const normal = makeNormal(mulberry32(seed));
  return (n: number) => {
    const out: YearShock[] = [];
    for (let t = 0; t < n; t++) {
      const zMarket = normal();
      const returns = {} as Record<AssetClass, number>;
      for (const c of ASSET_CLASSES) {
        const { mean, vol, marketBeta } = a.returns[c];
        const idio = normal(); // always draw so path streams do not shift when parameters change
        const z = marketBeta * zMarket + Math.sqrt(Math.max(0, 1 - marketBeta * marketBeta)) * idio;
        returns[c] = Math.exp(Math.log(1 + mean) - (vol * vol) / 2 + vol * z) - 1;
      }
      const fxDep = Math.max(-0.5, a.fxDriftAnnual + a.fxVol * normal());
      out.push({ returns, fxDep });
    }
    return out;
  };
}

/**
 * Property and jewellery sales that happen at the start of year t: their net proceeds join your savings
 * in the same mix as the money you already hold. Does nothing if this year's sales are already in the state.
 */
export function applySales(ctx: SimContext, state: SimState, t: number): { pots: Pots; propertyEur: number[]; jewelleryEur: number; saleProceeds: number } {
  const { input: i, a } = ctx;
  const age = i.age + t;
  const eurToInrNow = i.eurToInr * state.fxLevel;
  const pots: Pots = { ...state.pots };
  const propertyEur = [...state.propertyEur];
  let jewelleryEur = state.jewelleryEur;
  let saleProceeds = 0;
  if (state.salesDoneAt === t) return { pots, propertyEur, jewelleryEur, saleProceeds };
  const props = propertiesOf(i);
  props.forEach((p, k) => {
    if (!isSold(p, age)) return;
    const value = propertyEur[k] ?? 0;
    if (value <= 0) return;
    // The loan is repaid out of the sale. Its balance is assumed to fall in a straight line to zero.
    const loan = loanBalance(p, t);
    if (p.country === 'in') {
      const valueInr = value * eurToInrNow;
      const gainInr = Math.max(0, valueInr - (p.costBasis ?? 0));
      const netInr = valueInr * (1 - a.inSaleCostShare) - a.inCapGainsTax * gainInr - loan;
      saleProceeds += Math.max(0, netInr) / eurToInrNow;
    } else {
      saleProceeds += Math.max(0, value * (1 - a.nlSaleCostShare) - loan);
    }
    propertyEur[k] = 0;
  });
  if (i.jewellerySellAtAge !== undefined && jewelleryEur > 0 && age === Math.max(i.jewellerySellAtAge, i.age)) {
    // One sale of a share of what you hold. What is left stays as a reserve.
    const share = jewelleryEur * Math.min(1, Math.max(0, i.jewellerySellShare ?? 0));
    saleProceeds += share * (1 - Math.min(1, Math.max(0, i.jewelleryResaleDiscount ?? 0)));
    jewelleryEur -= share;
  }
  if (saleProceeds > 0) {
    const total = sumPots(pots);
    if (total > 0) for (const c of ASSET_CLASSES) pots[c] += saleProceeds * (pots[c] / total);
    else pots.eurCash += saleProceeds;
  }
  return { pots, propertyEur, jewelleryEur, saleProceeds };
}

export function stepYear(
  ctx: SimContext,
  state: SimState,
  t: number,
  shock: YearShock,
): { state: SimState; row: YearRow } {
  const { input: i, a } = ctx;
  const age = i.age + t;
  const calendarYear = i.startYear + t;
  const pack = countryPack(i.country);
  const rules = pack.rulesFor(calendarYear);
  const priceNl = (1 + a.inflationNl) ** t;
  const priceIn = (1 + a.inflationIn) ** t;
  const eurToInrNow = i.eurToInr * state.fxLevel;
  const retired = age >= i.retirementAge;
  const dest = i.retirementDestination;
  const persons = ctx.aowPersons;

  // A second earner keeps working until their own retirement age.
  const pe = i.familyStatus === 'partner' ? i.partnerEarner : undefined;
  const partnerWorking = pe !== undefined && pe.age + t < pe.retirementAge;
  // The household moves (or starts splitting its year) only when everyone has stopped working.
  const allRetired = retired && !partnerWorking;
  const residentInNl = !allRetired || dest !== 'in';
  const indiaFraction = allRetired ? indiaShare(i) : 0;

  // ---------- Selling property (at the start of the year) ----------
  const sales = applySales(ctx, state, t);
  const pots: Pots = sales.pots;
  const props = propertiesOf(i);
  const propertyEur = sales.propertyEur;
  const sold = props.map((p) => isSold(p, age));
  const saleProceeds = sales.saleProceeds;
  let jewelleryEur = sales.jewelleryEur;

  // ---------- Income ----------
  let salaryGross = 0;
  let incomeTaxNl = 0;
  if (!retired) {
    salaryGross = i.grossSalary * (1 + a.wageGrowth) ** t;
    const rulingActive = t < i.rulingYearsLeft;
    incomeTaxNl = pack.tax.wage(salaryGross, rules, priceNl, {
      active: rulingActive,
      grandfathered: i.rulingGrandfathered,
    }).tax;
  }
  let partnerSalaryGross = 0;
  if (pe && partnerWorking) {
    partnerSalaryGross = pe.grossSalary * (1 + a.wageGrowth) ** t;
    incomeTaxNl += pack.tax.wage(partnerSalaryGross, rules, priceNl, {
      active: t < pe.rulingYearsLeft,
      grandfathered: pe.rulingGrandfathered,
    }).tax;
  }

  // AOW and the older single pension fields are counted from retirement. (Working past AOW age is rare;
  // ignoring AOW then is conservative.)
  let pensionGross = 0;
  let nlTaxable = 0;
  if (retired) {
    // Each person's state pension starts at their own age. Without a partner age, the partner is taken to be your age.
    const partnerAgeNow = (pe?.age ?? i.partnerAge ?? i.age) + t;
    const aow = ((age >= a.aowAge ? ctx.aowYouToday : 0) + (partnerAgeNow >= a.aowAge ? ctx.aowPartnerToday : 0)) * priceNl;
    const supp = age >= a.aowAge ? i.dutchSuppPensionMonthly * 12 * priceNl : 0;
    const indian = age >= a.indiaPensionAge ? (i.inPensionAnnual * priceIn) / eurToInrNow : 0;
    pensionGross = aow + supp + indian;
    // AOW and workplace pension are taxed in NL wherever you live (treaty detail: see warnings).
    // The Indian pension is taxed in NL unless you live in India; India-side tax is not modelled yet.
    nlTaxable = aow + supp + (dest !== 'in' ? indian : 0);
  }

  // Named pensions, annuities and other income. Each is paid between its owner's own ages.
  let streamOtherNet = 0;
  for (const s of i.incomeStreams ?? []) {
    if (s.who === 'partner' && i.familyStatus !== 'partner') continue;
    const ownerAge = s.who === 'you' ? age : (pe?.age ?? i.partnerAge ?? i.age) + t;
    if (s.fromAge !== undefined && ownerAge < s.fromAge) continue;
    if (s.untilAge !== undefined && ownerAge > s.untilAge) continue;
    const yearly = s.monthlyToday * 12;
    if (s.kind === 'in-pension') {
      const eur = (yearly * (s.indexed ? priceIn : 1)) / eurToInrNow;
      pensionGross += eur;
      if (dest !== 'in') nlTaxable += eur;
    } else if (s.kind === 'other') {
      streamOtherNet += yearly * (s.indexed ? priceNl : 1);
    } else {
      const eur = yearly * (s.indexed ? priceNl : 1);
      pensionGross += eur;
      nlTaxable += eur;
    }
  }
  const pensionTax = nlTaxable > 0 ? pack.tax.pension(nlTaxable, rules, priceNl) : 0;

  // Rent from each property stops when it is sold.
  let rentNet = 0;
  props.forEach((p, k) => {
    if (sold[k] || !p.rentMonthly) return;
    rentNet += p.country === 'nl' ? p.rentMonthly * 12 * priceNl : (p.rentMonthly * 12 * priceIn) / eurToInrNow;
  });
  const passiveNet =
    i.dutchPassiveIncomeMonthly * 12 * priceNl + (i.inPassiveIncomeMonthly * 12 * priceIn) / eurToInrNow + rentNet + streamOtherNet;

  const incomeNet = salaryGross + partnerSalaryGross - incomeTaxNl + pensionGross - pensionTax + passiveNet;

  // ---------- Spending ----------
  const weightRatio =
    householdWeight(a, i.familyStatus, i.childrenAges, t) / ctx.initialWeight;
  const coreToday = i.monthlyCoreSpend * 12 * weightRatio;
  // v1 never inflated core spending. Here it inflates in the currency it is paid in. A snowbird pays
  // Dutch prices for the months in the Netherlands and Indian prices for the months in India.
  const coreSpend =
    indiaFraction > 0
      ? coreToday * ((1 - indiaFraction) * priceNl + (indiaFraction * a.indiaCostFactor * priceIn) / state.fxLevel)
      : coreToday * priceNl;
  const travel = allRetired && dest === 'both' ? (i.snowbirdTravelAnnual ?? 0) : 0;
  let rentAfterSale = 0;
  props.forEach((p, k) => {
    if (sold[k] && p.country === 'nl' && p.use === 'home') rentAfterSale += (p.rentAfterSaleMonthly ?? 0) * 12;
  });
  const lifestyleSpend = (i.annualLifestyleSpend + yearlyExtrasToday(i, age) + travel + rentAfterSale) * priceNl;
  let mortgagePayments = 0;
  props.forEach((p, k) => {
    if (!p.loan || sold[k] || t >= p.loan.yearsLeft) return;
    mortgagePayments += p.country === 'nl' ? p.loan.paymentMonthly * 12 : (p.loan.paymentMonthly * 12) / eurToInrNow;
  });
  const totalSpend = coreSpend + lifestyleSpend + mortgagePayments;

  // ---------- Box 3 (only while resident in NL) ----------
  let box3Tax = 0;
  if (residentInNl) {
    const p = pots;
    const holderActive = !retired && t < i.rulingYearsLeft && i.rulingGrandfathered;
    const partnerActive = pe ? partnerWorking && t < pe.rulingYearsLeft && pe.rulingGrandfathered : true;
    const partialNonResident = holderActive && partnerActive && calendarYear < 2027;
    const savings = p.eurCash;
    const otherPots = partialNonResident
      ? p.eurEquity
      : p.eurEquity + p.gold + p.inrFd + p.inrEquity + p.inrEpf;
    // Every property except the Dutch home you live in is part of Box 3, with its own loan as a debt.
    // A partly non-resident taxpayer is taxed only on Dutch property.
    let propertyOther = 0;
    let propertyDebts = 0;
    props.forEach((pr, k) => {
      if (sold[k] || !inBox3(pr) || (partialNonResident && pr.country === 'in')) return;
      propertyOther += propertyEur[k] ?? 0;
      propertyDebts += pr.country === 'nl' ? loanBalance(pr, t) : loanBalance(pr, t) / eurToInrNow;
    });
    const debts = (partialNonResident ? 0 : i.otherDebts) + propertyDebts;
    const other = otherPots + propertyOther;
    const pos = { savings, other, debts, persons };
    if (calendarYear >= 2028 && a.box3Regime === 'actual') {
      let actual = 0;
      for (const c of ASSET_CLASSES) {
        const local = shock.returns[c];
        const eurR = IS_INR[c] ? (1 + local) / (1 + shock.fxDep) - 1 : local;
        if (c === 'eurCash') actual += p[c] * eurR;
        else if (!partialNonResident || c === 'eurEquity') actual += p[c] * eurR;
      }
      props.forEach((pr, k) => {
        if (sold[k] || !inBox3(pr) || (partialNonResident && pr.country === 'in')) return;
        actual += (propertyEur[k] ?? 0) * (pr.country === 'in' ? (1 + a.realEstateGrowthIn) / (1 + shock.fxDep) - 1 : a.realEstateGrowthNl);
      });
      box3Tax = pack.tax.wealthProposed(pos, actual, rules, priceNl);
    } else {
      box3Tax = pack.tax.wealthCurrent(pos, rules, priceNl);
    }
  }

  // ---------- Cash flow and portfolio ----------
  const netFlow = incomeNet - totalSpend - box3Tax;
  const liquidStart = sumPots(pots);
  let unmetDeficit = 0;

  if (netFlow < 0) {
    // Withdraw at the start of the year, pro-rata. v1 ignored deficits entirely before retirement.
    const need = -netFlow;
    if (need >= liquidStart) {
      unmetDeficit = need - liquidStart;
      for (const c of ASSET_CLASSES) pots[c] = 0;
    } else {
      const f = 1 - need / liquidStart;
      for (const c of ASSET_CLASSES) pots[c] *= f;
    }
  }

  for (const c of ASSET_CLASSES) {
    const local = shock.returns[c];
    const eurGrowth = IS_INR[c] ? (1 + local) / (1 + shock.fxDep) - 1 : local;
    pots[c] *= 1 + eurGrowth;
  }
  props.forEach((pr, k) => {
    propertyEur[k] = (propertyEur[k] ?? 0) * (pr.country === 'in' ? (1 + a.realEstateGrowthIn) / (1 + shock.fxDep) : 1 + a.realEstateGrowthNl);
  });
  jewelleryEur *= 1 + shock.returns.gold;

  // Money put aside arrives at year end and starts earning next year (same convention as v1).
  // With a fixed monthly investment, only that amount is invested (capped at what was left) and the rest is spent.
  let invested = 0;
  let investedPlanned = 0;
  const mi = i.monthlyInvesting;
  if (mi && age < (mi.untilAge ?? i.retirementAge)) {
    const step = (1 + (mi.stepUpYearly || 0)) ** t;
    const inrEur = mi.inrEquity / eurToInrNow;
    const planned = (mi.eurEquity + mi.eurCash + mi.gold + inrEur) * 12 * step;
    investedPlanned = planned;
    const scale = netFlow > 0 && planned > 0 ? Math.min(1, netFlow / planned) : 0;
    pots.eurEquity += mi.eurEquity * 12 * step * scale;
    pots.eurCash += mi.eurCash * 12 * step * scale;
    pots.gold += mi.gold * 12 * step * scale;
    pots.inrEquity += inrEur * 12 * step * scale;
    invested = planned * scale;
  } else if (netFlow > 0) {
    pots.eurEquity += netFlow * a.surplusToEquityShare;
    pots.eurCash += netFlow * (1 - a.surplusToEquityShare);
    invested = netFlow;
  }

  const liquidEnd = sumPots(pots);
  const row: YearRow = {
    t,
    age,
    calendarYear,
    phase: retired ? 'retirement' : 'accumulation',
    salaryGross,
    partnerSalaryGross,
    incomeTaxNl,
    box3Tax,
    pensionGross,
    pensionTax,
    saleProceeds,
    passiveNet,
    incomeNet,
    coreSpend,
    lifestyleSpend,
    mortgagePayments,
    totalSpend,
    netFlow,
    invested,
    investedPlanned,
    unmetDeficit,
    liquidStart,
    liquidEnd,
    liquidEndReal: liquidEnd / (1 + a.inflationNl) ** (t + 1),
  };
  return {
    state: { pots, propertyEur, jewelleryEur, fxLevel: state.fxLevel * (1 + shock.fxDep) },
    row,
  };
}

export function simulate(
  ctx: SimContext,
  shocks: YearShock[],
  opts: { from?: { state: SimState; t: number }; record?: SimState[] } = {},
): SimResult {
  const startT = opts.from?.t ?? 0;
  let state = opts.from?.state ?? initialState(ctx.input);
  // Snapshot taken at the start of the retirement year; if the run starts later, that is the start state.
  let stateAtRetirement = state;
  const rows: YearRow[] = [];
  let depletedAtAge: number | null = null;

  for (let t = startT; t < ctx.horizon; t++) {
    if (t === ctx.yearsToRetire) {
      // The corpus on the day you stop includes what you sell that year, so selling at 58 and retiring at 58 or 59 compare fairly.
      const sold = applySales(ctx, state, t);
      stateAtRetirement = { ...state, pots: sold.pots, propertyEur: sold.propertyEur, jewelleryEur: sold.jewelleryEur, salesDoneAt: t };
    }
    // For the break-even curve: the state at the start of each year (on the day you stop, with that year's sales included).
    if (opts.record) opts.record[t] = t === ctx.yearsToRetire ? stateAtRetirement : state;
    const shock = shocks[t];
    if (!shock) throw new Error(`Missing shock for year ${t}`);
    const step = stepYear(ctx, state, t, shock);
    rows.push(step.row);
    state = step.state;
    if (depletedAtAge === null && step.row.unmetDeficit > 1) depletedAtAge = step.row.age;
  }

  const last = rows[rows.length - 1];
  return {
    rows,
    stateAtRetirement,
    endState: state,
    depletedAtAge,
    endingLiquidReal: last ? last.liquidEndReal : sumPots(state.pots),
  };
}
