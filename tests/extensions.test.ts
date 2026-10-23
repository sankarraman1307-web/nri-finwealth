import { describe, expect, it } from 'vitest';
import { BARE, FLAT, runExpected } from './helpers';
import {
  analyzeHouseholdRuling,
  analyzeRuling,
  compareDestinations,
  computeCorpusCurve,
  getNlRules,
  mergeAssumptions,
  nlWageTax,
  propertiesOf,
  runPlan,
  SAMPLE_INPUT,
  validateInput,
  type PlanInput,
} from '../src/engine';

const flat = (over: object = {}) => ({ ...FLAT, wageGrowth: 0, realEstateGrowthIn: 0, realEstateGrowthNl: 0, ...over });
const rules2026 = getNlRules(2026);

const heldEur = (input: PlanInput, state: { propertyEur: number[] }, id: string) =>
  state.propertyEur[propertiesOf(input).findIndex((x) => x.id === id)] ?? 0;

describe('yearly extras such as family holidays', () => {
  const withHoliday: PlanInput = { ...BARE, yearlyExpenses: [{ label: 'Family holiday', amountToday: 6000, untilAge: 62 }] };

  it('apply from now until the age you set, inclusive, and then stop', () => {
    const { res } = runExpected(withHoliday, flat());
    expect(res.rows.slice(0, 4).map((r) => r.lifestyleSpend)).toEqual([6000, 6000, 6000, 0]);
  });
  it('inflate with Dutch prices', () => {
    const { res } = runExpected(withHoliday, flat({ inflationNl: 0.03 }));
    expect(res.rows[1]?.lifestyleSpend).toBeCloseTo(6000 * 1.03, 6);
  });
  it('can start later with fromAge', () => {
    const input = { ...BARE, yearlyExpenses: [{ label: 'Trip', amountToday: 3000, fromAge: 63 }] };
    const { res } = runExpected(input, flat());
    expect(res.rows[2]?.lifestyleSpend).toBe(0);
    expect(res.rows[3]?.lifestyleSpend).toBe(3000);
    expect(res.rows[9]?.lifestyleSpend).toBe(3000);
  });
  it('several items add up, and they cost money: the pot ends lower', () => {
    const two = { ...BARE, yearlyExpenses: [{ label: 'a', amountToday: 5000 }, { label: 'b', amountToday: 2500 }] };
    const base = runExpected(BARE, flat()).res;
    const more = runExpected(two, flat()).res;
    expect(more.rows[0]?.lifestyleSpend).toBe(7500);
    expect(base.rows[9]!.liquidEnd - more.rows[9]!.liquidEnd).toBeCloseTo(75_000, 4);
  });
});

describe('selling the Indian property', () => {
  // EUR 1,000,000 of property at 90 INR per EUR, bought for 45 million INR.
  const home: PlanInput = { ...BARE, inRealEstate: 90_000_000, inPropertyCostBasis: 45_000_000, inPropertySellAtAge: 62 };

  it('adds the proceeds, after selling costs and capital gains tax, in the year you sell', () => {
    const { res } = runExpected(home, flat());
    // (90m x 0.98 - 12.5% x (90m - 45m)) / 90 = 917,500
    expect(res.rows[1]?.saleProceeds).toBe(0);
    expect(res.rows[2]?.saleProceeds).toBeCloseTo(917_500, 4);
    // 1,000,000 - 2 years x 48,000 = 904,000, plus 917,500, less 48,000 spent
    expect(res.rows[2]?.liquidEnd).toBeCloseTo(1_773_500, 4);
    expect(heldEur(home, res.endState, 'in-property')).toBe(0);
  });
  it('REGRESSION: property you keep never pays for anything, however large it is', () => {
    const keep = { ...home, inPropertySellAtAge: undefined, eurCash: 100_000 };
    const { res } = runExpected(keep, flat());
    expect(res.depletedAtAge).toBe(62); // same as with no property at all
    expect(res.rows.every((r) => r.saleProceeds === 0)).toBe(true);
    expect(heldEur(keep, res.endState, 'in-property')).toBeCloseTo(1_000_000, 4);
  });
  it('selling can save a plan that would otherwise run out', () => {
    const { res } = runExpected({ ...home, eurCash: 100_000 }, flat());
    expect(res.depletedAtAge).toBeNull();
  });
  it('no cost basis means the whole price is taxed: the cautious choice', () => {
    const { res } = runExpected({ ...home, inPropertyCostBasis: undefined }, flat());
    // (90m x 0.98 - 12.5% x 90m) / 90 = 855,000
    expect(res.rows[2]?.saleProceeds).toBeCloseTo(855_000, 4);
  });
  it('a loss is not taxed', () => {
    const { res } = runExpected({ ...home, inPropertyCostBasis: 120_000_000 }, flat());
    expect(res.rows[2]?.saleProceeds).toBeCloseTo(980_000, 4); // costs only
  });
  it('the rupee price is what counts: a weaker rupee cuts the euros you receive', () => {
    const { res } = runExpected(home, flat({ fxDriftAnnual: 0.05 }));
    expect(res.rows[2]?.saleProceeds).toBeLessThan(917_500);
  });
  it('proceeds join your savings in the same mix as what you already hold', () => {
    const mixed = { ...home, eurCash: 300_000, eurInvestments: 100_000 };
    const { res } = runExpected(mixed, flat());
    const before = res.rows[2]!.liquidStart; // 400,000 - 96,000 = 304,000 plus the sale, before spending
    expect(before).toBeCloseTo(304_000 + 917_500, 4);
  });
  it('a sale age that has already passed sells in the first year', () => {
    const { res } = runExpected({ ...home, inPropertySellAtAge: 50 }, flat());
    expect(res.rows[0]?.saleProceeds).toBeGreaterThan(900_000);
  });
});

describe('selling the Dutch home', () => {
  const base: PlanInput = {
    ...BARE,
    dutchHomeValue: 500_000,
    dutchMortgage: 100_000,
    dutchMortgageMonthlyPayment: 1000,
    dutchMortgageYearsLeft: 5,
    dutchHomeSellAtAge: 62,
    dutchHomeRentAfterSaleMonthly: 1000,
  };

  it('repays the loan from the proceeds, stops the mortgage payments and starts rent', () => {
    const { res } = runExpected(base, flat());
    expect(res.rows[1]?.mortgagePayments).toBe(12_000);
    expect(res.rows[2]?.mortgagePayments).toBe(0);
    // 500,000 x 0.98 less the loan, assumed to be 60% left after 2 of 5 years: 490,000 - 60,000
    expect(res.rows[2]?.saleProceeds).toBeCloseTo(430_000, 4);
    expect(res.rows[1]?.lifestyleSpend).toBe(0);
    expect(res.rows[2]?.lifestyleSpend).toBe(12_000);
    expect(res.rows[9]?.lifestyleSpend).toBe(12_000);
  });
  it('REGRESSION: a home you keep is never turned into spending money, but its value grows', () => {
    const keep = { ...base, dutchHomeSellAtAge: undefined };
    const { res } = runExpected(keep, flat({ realEstateGrowthNl: 0.03 }));
    expect(res.rows.every((r) => r.saleProceeds === 0)).toBe(true);
    expect(heldEur(keep, res.endState, 'nl-home')).toBeCloseTo(500_000 * 1.03 ** 10, 4);
  });
  it('the home sits outside Box 3 until it is sold', () => {
    const resident: PlanInput = { ...base, retirementDestination: 'nl', eurCash: 10_000, dutchHomeSellAtAge: undefined };
    const { res } = runExpected(resident, flat());
    expect(res.rows[0]?.box3Tax).toBe(0);
  });
});

describe('snowbird: part of the year in each country', () => {
  const retiredBoth: PlanInput = { ...BARE, eurCash: 50_000, retirementDestination: 'both', snowbirdMonthsInIndia: 6, snowbirdTravelAnnual: 3000 };
  const cheap = flat({ indiaCostFactor: 0.5 });

  it('splits living costs by months: half at Dutch prices, half at Indian prices', () => {
    const { res } = runExpected(retiredBoth, cheap);
    expect(res.rows[0]?.coreSpend).toBeCloseTo(48_000 * (0.5 + 0.5 * 0.5), 6);
  });
  it('adds your travel budget', () => {
    const { res } = runExpected(retiredBoth, cheap);
    expect(res.rows[0]?.lifestyleSpend).toBe(3000);
  });
  it('zero months costs the same as living in the Netherlands, twelve the same as living in India', () => {
    const nl = runExpected({ ...BARE, eurCash: 50_000, retirementDestination: 'nl' }, cheap).res.rows[0]!.coreSpend;
    const inn = runExpected({ ...BARE, eurCash: 50_000, retirementDestination: 'in' }, cheap).res.rows[0]!.coreSpend;
    expect(runExpected({ ...retiredBoth, snowbirdMonthsInIndia: 0 }, cheap).res.rows[0]?.coreSpend).toBeCloseTo(nl, 6);
    expect(runExpected({ ...retiredBoth, snowbirdMonthsInIndia: 12 }, cheap).res.rows[0]?.coreSpend).toBeCloseTo(inn, 6);
  });
  it('REGRESSION: a snowbird stays a Dutch tax resident, so Box 3 still applies', () => {
    const rich = { ...retiredBoth, eurCash: 1_000_000 };
    expect(runExpected(rich, cheap).res.rows[0]?.box3Tax).toBeGreaterThan(0);
    expect(runExpected({ ...rich, retirementDestination: 'in' }, cheap).res.rows[0]?.box3Tax).toBe(0);
  });
  it('keeps building AOW like a Dutch resident (leaving for good would stop it)', () => {
    const a = mergeAssumptions();
    const early = { ...SAMPLE_INPUT, retirementAge: 55 };
    const accrual = (d: PlanInput['retirementDestination']) =>
      runPlan({ ...early, retirementDestination: d, snowbirdMonthsInIndia: 5 }, { paths: 50 }).expected.aow.accrualShare;
    expect(accrual('both')).toBeCloseTo(accrual('nl'), 10);
    expect(accrual('in')).toBeLessThan(accrual('nl'));
    expect(a.aowAge).toBe(68);
  });
  it('compares the three ways to retire', () => {
    const out = compareDestinations(SAMPLE_INPUT, mergeAssumptions(), 100, 1);
    expect(out.map((o) => o.destination)).toEqual(['nl', 'both', 'in']);
    for (const o of out) expect(o.successProbability).toBeGreaterThanOrEqual(0);
  });
  it('rejects more than 12 months', () => {
    const issues = validateInput({ ...retiredBoth, snowbirdMonthsInIndia: 14 });
    expect(issues.some((i) => i.field === 'snowbirdMonthsInIndia' && i.level === 'error')).toBe(true);
  });
});

describe('a second earner', () => {
  const couple: PlanInput = {
    ...BARE,
    familyStatus: 'partner',
    age: 60,
    retirementAge: 60,
    partnerEarner: { age: 50, retirementAge: 55, grossSalary: 60_000, rulingYearsLeft: 0, rulingGrandfathered: false },
  };

  it('earns and pays tax until their own retirement age, then stops', () => {
    const { res } = runExpected(couple, flat());
    const tax = nlWageTax(60_000, rules2026, 1, { active: false, grandfathered: false }).tax;
    expect(res.rows[0]?.partnerSalaryGross).toBe(60_000);
    expect(res.rows[0]?.incomeTaxNl).toBeCloseTo(tax, 6);
    expect(res.rows[4]?.partnerSalaryGross).toBe(60_000);
    expect(res.rows[5]?.partnerSalaryGross).toBe(0);
    expect(res.rows[5]?.incomeTaxNl).toBe(0);
  });
  it('their pay is part of household income', () => {
    const { res } = runExpected(couple, flat());
    const r = res.rows[0]!;
    expect(r.incomeNet).toBeCloseTo(60_000 - r.incomeTaxNl, 6);
  });
  it('REGRESSION: with the plan to retire in India, the move waits until BOTH have stopped working', () => {
    const { res } = runExpected(couple, flat({ indiaCostFactor: 0.5 }));
    expect(res.rows[4]?.coreSpend).toBeCloseTo(48_000, 6); // partner still works: Dutch costs
    expect(res.rows[5]?.coreSpend).toBeCloseTo(24_000, 6); // both stopped: Indian costs
  });
  it('each person has their own 30% ruling and end date', () => {
    const input: PlanInput = { ...couple, partnerEarner: { age: 40, retirementAge: 65, grossSalary: 100_000, rulingYearsLeft: 3, rulingGrandfathered: false } };
    const { res } = runExpected(input, flat());
    const yes = nlWageTax(100_000, rules2026, 1, { active: true, grandfathered: false }).tax;
    const no = nlWageTax(100_000, getNlRules(2029), 1, { active: false, grandfathered: false }).tax;
    expect(res.rows[0]?.incomeTaxNl).toBeCloseTo(yes, 6);
    expect(res.rows[3]?.incomeTaxNl).toBeCloseTo(no, 6);
    expect(no).toBeGreaterThan(yes);
  });
  it('two earners are taxed separately: two EUR 90k salaries pay less than one EUR 180k salary', () => {
    const pair: PlanInput = {
      ...couple,
      age: 40,
      retirementAge: 60,
      grossSalary: 90_000,
      partnerEarner: { age: 40, retirementAge: 60, grossSalary: 90_000, rulingYearsLeft: 0, rulingGrandfathered: false },
    };
    const one: PlanInput = { ...pair, grossSalary: 180_000, partnerEarner: undefined };
    const a = runExpected(pair, flat({ planToAge: 80 })).res.rows[0]!.incomeTaxNl;
    const b = runExpected(one, flat({ planToAge: 80 })).res.rows[0]!.incomeTaxNl;
    expect(a).toBeLessThan(b);
  });
  it('is ignored when the household is a single person', () => {
    const { res } = runExpected({ ...couple, familyStatus: 'single' }, flat());
    expect(res.rows[0]?.partnerSalaryGross).toBe(0);
  });
  it('REGRESSION: the pre-2024 Box 3 relief applies only while BOTH earners hold such a ruling', () => {
    const rich: PlanInput = {
      ...SAMPLE_INPUT,
      age: 50,
      retirementAge: 60,
      grossSalary: 100_000,
      rulingYearsLeft: 3,
      rulingGrandfathered: true,
      inMutualFunds: 90_000_000,
      partnerEarner: undefined,
    };
    const alone = runExpected(rich, flat({ planToAge: 80 })).res.rows[0]!.box3Tax;
    const withPlainPartner = runExpected(
      { ...rich, partnerEarner: { age: 50, retirementAge: 60, grossSalary: 50_000, rulingYearsLeft: 0, rulingGrandfathered: false } },
      flat({ planToAge: 80 }),
    ).res.rows[0]!.box3Tax;
    const withRulingPartner = runExpected(
      { ...rich, partnerEarner: { age: 50, retirementAge: 60, grossSalary: 50_000, rulingYearsLeft: 3, rulingGrandfathered: true } },
      flat({ planToAge: 80 }),
    ).res.rows[0]!.box3Tax;
    expect(withPlainPartner).toBeGreaterThan(alone);
    expect(withRulingPartner).toBeCloseTo(alone, 6);
  });
  it('validates the partner', () => {
    const bad = validateInput({ ...couple, partnerEarner: { ...couple.partnerEarner!, retirementAge: 40 } });
    expect(bad.some((i) => i.field === 'partnerEarner.retirementAge')).toBe(true);
  });
});

describe('household 30% ruling analysis', () => {
  const base: PlanInput = {
    ...SAMPLE_INPUT,
    age: 40,
    retirementAge: 60,
    grossSalary: 100_000,
    rulingYearsLeft: 3,
    rulingGrandfathered: false,
    monthlyCoreSpend: 3000,
    annualLifestyleSpend: 0,
    dutchMortgageMonthlyPayment: 0,
    dutchMortgageYearsLeft: 0,
    familyStatus: 'partner',
    partnerEarner: undefined,
  };
  const withPartner = (p: Partial<NonNullable<PlanInput['partnerEarner']>>): PlanInput => ({
    ...base,
    partnerEarner: { age: 40, retirementAge: 60, grossSalary: 80_000, rulingYearsLeft: 5, rulingGrandfathered: false, ...p },
  });

  it('returns null when nobody has a ruling', () => {
    expect(analyzeHouseholdRuling({ ...base, rulingYearsLeft: 0 })).toBeNull();
  });
  it('matches the single-person analysis when only you have the ruling', () => {
    const h = analyzeHouseholdRuling(base)!;
    const s = analyzeRuling(base)!;
    expect(h.benefitMonthlyNow).toBeCloseTo(s.benefitMonthlyNow, 6);
    expect(h.final.monthlyDrop).toBeCloseTo(s.atEnd.monthlyDrop, 6);
    expect(h.final.year).toBe(s.atEnd.year);
  });
  it('handles a ruling held by the partner only', () => {
    const h = analyzeHouseholdRuling({ ...withPartner({ rulingYearsLeft: 2 }), rulingYearsLeft: 0 })!;
    expect(h.people.map((p) => p.who)).toEqual(['partner']);
    expect(h.final.year).toBe(2028);
    expect(h.benefitMonthlyNow).toBeGreaterThan(0);
  });
  it('both have it, with different end dates: one drop per ruling, in date order', () => {
    const h = analyzeHouseholdRuling(withPartner({ rulingYearsLeft: 5 }))!;
    const ends = h.events.filter((e) => e.kind === 'end');
    expect(ends.map((e) => [e.who, e.year])).toEqual([['you', 2029], ['partner', 2031]]);
    expect(h.final.year).toBe(2031);
    // each drop is that person's own benefit in their last ruling year
    for (const e of ends) expect(e.monthlyDrop).toBeCloseTo(h.people.find((p) => p.who === e.who)!.endMonthlyDrop, 6);
    // household pay never rises along the way, and ends lower than it began. (Two events in one year share that year's figure.)
    const nets = [h.householdNetNow, ...h.events.map((e) => e.householdNetAfter)];
    for (let k = 1; k < nets.length; k++) expect(nets[k]!).toBeLessThanOrEqual(nets[k - 1]! + 1e-9);
    expect(nets.at(-1)!).toBeLessThan(h.householdNetNow);
  });
  it('the household benefit is the sum of both people', () => {
    const h = analyzeHouseholdRuling(withPartner({ rulingYearsLeft: 5 }))!;
    expect(h.benefitMonthlyNow).toBeCloseTo(h.people.reduce((s, p) => s + p.benefitMonthlyNow, 0), 6);
    expect(h.householdNetNow - h.householdNetWithoutRuling).toBeCloseTo(h.benefitMonthlyNow, 6);
  });
  it('flags the 2027 step for each non-grandfathered holder only', () => {
    const h = analyzeHouseholdRuling(withPartner({ rulingYearsLeft: 5, rulingGrandfathered: true }))!;
    const steps = h.events.filter((e) => e.kind === 'step2027');
    expect(steps.map((e) => e.who)).toEqual(['you']);
  });
  it('REGRESSION: a ruling that outlasts your working life causes no drop at the end', () => {
    const h = analyzeHouseholdRuling({ ...base, age: 58, retirementAge: 60, rulingYearsLeft: 5 })!;
    const you = h.people[0]!;
    expect(you.yearsLeft).toBe(2);
    expect(you.endYear).toBeNull();
    expect(h.events.filter((e) => e.kind === 'end')).toHaveLength(0);
  });
  it('includes yearly extras in what you spend', () => {
    const plain = analyzeHouseholdRuling(base)!;
    const withHoliday = analyzeHouseholdRuling({ ...base, yearlyExpenses: [{ label: 'Holiday', amountToday: 12_000 }] })!;
    expect(withHoliday.spendMonthlyNow - plain.spendMonthlyNow).toBeCloseTo(1000, 6);
  });
  it('investing the combined extra pay builds more than investing one person’s', () => {
    const one = analyzeHouseholdRuling(base)!;
    const two = analyzeHouseholdRuling(withPartner({ rulingYearsLeft: 3 }))!;
    expect(two.invest.projectedAtEnd).toBeGreaterThan(one.invest.projectedAtEnd);
  });
});

describe('what property does to the whole plan', () => {
  const rich: PlanInput = {
    ...SAMPLE_INPUT,
    retirementAge: 55,
    inRealEstate: 90_000_000,
    inPropertyCostBasis: 30_000_000,
    annualLifestyleSpend: 0,
    dutchHomeValue: 0,
    dutchMortgage: 0,
  };
  const p = (over: Partial<PlanInput>) => runPlan({ ...rich, ...over }, { paths: 300 });

  it('selling the property later in life raises the chance your money lasts', () => {
    expect(p({ inPropertySellAtAge: 70 }).monteCarlo.successProbability).toBeGreaterThan(p({}).monteCarlo.successProbability);
  });
  it('shows kept property as a reserve in today’s euros, and none once sold', () => {
    expect(p({}).expected.propertyReserveReal).toBeGreaterThan(500_000);
    expect(p({ inPropertySellAtAge: 70 }).expected.propertyReserveReal).toBe(0);
  });
  it('tells you when property is kept and unused, and about the limits when it is sold', () => {
    expect(p({}).warnings.some((w) => w.code === 'in-property-kept')).toBe(true);
    expect(p({ inPropertySellAtAge: 70 }).warnings.some((w) => w.code === 'in-property-sale' && /USD 1 million/.test(w.message))).toBe(true);
  });
  it('offers a what-if for selling the property', () => {
    const r = runPlan(rich, { paths: 200, sensitivities: true });
    expect(r.sensitivities?.some((s) => s.id === 'sell-india-75')).toBe(true);
  });
  it('warns more strongly about tax residency the more months you spend in India', () => {
    const w = (months: number) =>
      runPlan({ ...SAMPLE_INPUT, retirementDestination: 'both', snowbirdMonthsInIndia: months }, { paths: 50 }).warnings.find((x) => x.code === 'snowbird-residency');
    expect(w(6)?.severity).toBe('important');
    expect(w(2)?.severity).toBe('caution');
  });
});

describe('needed versus available, by retirement age', () => {
  const input: PlanInput = { ...SAMPLE_INPUT, retirementAge: 58 };
  const a = mergeAssumptions();
  const curve = computeCorpusCurve(input, a);

  it('covers every age from today up to 75', () => {
    expect(curve[0]?.retirementAge).toBe(45);
    expect(curve.at(-1)?.retirementAge).toBe(75);
    expect(curve).toHaveLength(31);
  });
  it('agrees with the main plan at the chosen retirement age, in today’s euros', () => {
    const plan = runPlan(input, { paths: 50 });
    const at = curve.find((c) => c.retirementAge === 58)!;
    const deflator = (1 + a.inflationNl) ** 13;
    expect(at.available).toBeCloseTo(plan.expected.corpusAtRetirement / deflator, 4);
    expect(at.required).toBeCloseTo(plan.expected.requiredCorpus / deflator, 4);
  });
  it('the longer you work, the more you have and the less you need', () => {
    const early = curve.find((c) => c.retirementAge === 50)!;
    const late = curve.find((c) => c.retirementAge === 68)!;
    expect(late.available).toBeGreaterThan(early.available);
    expect(late.required).toBeLessThan(early.required);
  });
  it('REGRESSION: retiring at a very late age needs little, because pensions arrive almost at once', () => {
    expect(curve.find((c) => c.retirementAge === 75)!.required).toBeLessThan(curve.find((c) => c.retirementAge === 45)!.required / 2);
  });
});

describe('gold: bullion and jewellery', () => {
  // EUR 100,000 of jewellery: 1,000 grams of pure gold at EUR 100 a gram. Gold flat (no growth) in FLAT.
  const base: PlanInput = { ...BARE, goldEurPerGram: 100, jewelleryGrams24k: 1000 };
  const sell: PlanInput = { ...base, jewellerySellAtAge: 62, jewellerySellShare: 0.5, jewelleryResaleDiscount: 0.2 };

  it('sells the share you chose, minus the jeweller’s cut, in the year you chose', () => {
    const { res } = runExpected(sell, flat());
    expect(res.rows[1]?.saleProceeds).toBe(0);
    expect(res.rows[2]?.saleProceeds).toBeCloseTo(40_000, 6); // 100,000 x 50% x (1 - 20%)
    expect(res.endState.jewelleryEur).toBeCloseTo(50_000, 6); // the rest stays as a reserve
  });
  it('REGRESSION: sells once, not again every year after', () => {
    const { res } = runExpected(sell, flat());
    expect(res.rows.filter((r) => r.saleProceeds > 0)).toHaveLength(1);
  });
  it('REGRESSION: jewellery you keep never pays for anything', () => {
    const poor = { ...base, eurCash: 100_000 };
    const { res } = runExpected(poor, flat());
    expect(res.depletedAtAge).toBe(62); // as if the jewellery did not exist
    expect(res.endState.jewelleryEur).toBeCloseTo(100_000, 6);
  });
  it('a planned sale can keep a plan alive that would otherwise run out', () => {
    const poor = { ...sell, eurCash: 100_000, jewelleryGrams24k: 5000, jewellerySellShare: 1, jewelleryResaleDiscount: 0 };
    expect(runExpected(poor, flat()).res.depletedAtAge).toBeNull();
  });
  it('follows the gold price, in the same way as bullion', () => {
    const rising = flat({ returns: { gold: { mean: 0.1, vol: 0 } } });
    const { res } = runExpected(base, rising);
    expect(res.endState.jewelleryEur).toBeCloseTo(100_000 * 1.1 ** 10, 4);
  });
  it('a sale age that has passed sells in the first year', () => {
    const { res } = runExpected({ ...sell, jewellerySellAtAge: 50 }, flat());
    expect(res.rows[0]?.saleProceeds).toBeCloseTo(40_000, 6);
  });
  it('jewellery is outside Box 3, bullion is inside it', () => {
    const resident = { ...BARE, retirementDestination: 'nl' as const, eurCash: 10_000, goldEurPerGram: 100 };
    const withJewellery = runExpected({ ...resident, jewelleryGrams24k: 20_000 }, flat()).res.rows[0]!.box3Tax;
    const withBullion = runExpected({ ...resident, goldGrams: 20_000 }, flat()).res.rows[0]!.box3Tax;
    expect(withJewellery).toBe(0);
    expect(withBullion).toBeGreaterThan(0);
  });
  it('shows what is kept as a reserve, and warns about it', () => {
    const plan = runPlan({ ...SAMPLE_INPUT, dutchHomeValue: 0, dutchMortgage: 0, inRealEstate: 0, goldEurPerGram: 100, jewelleryGrams24k: 1000 }, { paths: 50 });
    expect(plan.expected.propertyReserveReal).toBeGreaterThan(50_000);
    expect(plan.warnings.some((w) => w.code === 'jewellery-unused')).toBe(true);
    expect(plan.warnings.some((w) => w.code === 'jewellery-box3')).toBe(true);
    const sold = runPlan({ ...SAMPLE_INPUT, dutchHomeValue: 0, dutchMortgage: 0, inRealEstate: 0, goldEurPerGram: 100, jewelleryGrams24k: 1000, jewellerySellAtAge: 70, jewellerySellShare: 1, jewelleryResaleDiscount: 0.1 }, { paths: 50 });
    expect(sold.warnings.some((w) => w.code === 'jewellery-sale')).toBe(true);
    expect(sold.expected.propertyReserveReal).toBe(0);
  });
  it('is counted in total assets', () => {
    const a = runPlan({ ...SAMPLE_INPUT, goldEurPerGram: 100 }, { paths: 20 }).snapshot.totalAssets;
    const b = runPlan({ ...SAMPLE_INPUT, goldEurPerGram: 100, jewelleryGrams24k: 1000 }, { paths: 20 }).snapshot.totalAssets;
    expect(b - a).toBeCloseTo(100_000, 6);
  });
  it('validates shares and discounts', () => {
    const bad = validateInput({ ...sell, jewellerySellShare: 1.5 });
    expect(bad.some((i) => i.field === 'jewellerySellShare')).toBe(true);
  });
});

describe('a loan on the Indian property', () => {
  // EUR 1,000,000 of property at 90 INR per EUR; INR 18 million owed over 6 more years; EMI INR 100,000 a month.
  const loan: PlanInput = {
    ...BARE,
    inRealEstate: 90_000_000,
    inPropertyCostBasis: 45_000_000,
    inMortgage: 18_000_000,
    inMortgageMonthlyPayment: 100_000,
    inMortgageYearsLeft: 6,
  };

  it('is paid in rupees every month while it runs: INR 1.2 million a year is EUR 13,333 at 90', () => {
    const { res } = runExpected(loan, flat());
    expect(res.rows[0]?.mortgagePayments).toBeCloseTo(13_333.33, 2);
    expect(res.rows[5]?.mortgagePayments).toBeCloseTo(13_333.33, 2);
    expect(res.rows[6]?.mortgagePayments).toBe(0);
  });
  it('gets cheaper in euros as the rupee weakens, because the payment is fixed in rupees', () => {
    const { res } = runExpected(loan, flat({ fxDriftAnnual: 0.1 }));
    expect(res.rows[3]!.mortgagePayments).toBeLessThan(res.rows[0]!.mortgagePayments);
  });
  it('REGRESSION: selling the property repays the loan from the proceeds and stops the payments', () => {
    const sold = { ...loan, inPropertySellAtAge: 62 };
    const { res } = runExpected(sold, flat());
    // value 90m, costs 2%, gain tax 12.5% of 45m, loan 18m x (1 - 2/6) = 12m  ->  (88.2m - 5.625m - 12m) / 90
    expect(res.rows[2]?.saleProceeds).toBeCloseTo(70_575_000 / 90, 4);
    expect(res.rows[1]?.mortgagePayments).toBeCloseTo(13_333.33, 2);
    expect(res.rows[2]?.mortgagePayments).toBe(0);
    expect(res.rows[5]?.mortgagePayments).toBe(0);
  });
  it('a loan with no planned sale just keeps being paid, and costs money', () => {
    const none = runExpected({ ...loan, inMortgage: 0, inMortgageMonthlyPayment: 0, inMortgageYearsLeft: 0 }, flat()).res;
    const withLoan = runExpected(loan, flat()).res;
    expect(none.rows[9]!.liquidEnd - withLoan.rows[9]!.liquidEnd).toBeCloseTo(6 * 13_333.33, 1);
  });
});

describe('several properties, each with its own loan, rent and sale', () => {
  const two: PlanInput = {
    ...BARE,
    properties: [
      { id: 'a', country: 'in', use: 'empty', value: 90_000_000, costBasis: 45_000_000, sellAtAge: 62 },
      { id: 'b', country: 'in', use: 'rented', value: 45_000_000, rentMonthly: 90_000 },
    ],
  };
  it('sells only the property that has a sale age, and keeps the other', () => {
    const { res } = runExpected(two, flat());
    expect(res.rows[2]?.saleProceeds).toBeCloseTo(917_500, 4);
    expect(heldEur(two, res.endState, 'a')).toBe(0);
    expect(heldEur(two, res.endState, 'b')).toBeCloseTo(500_000, 4);
  });
  it('adds two sales together', () => {
    const both = { ...two, properties: two.properties!.map((p) => ({ ...p, sellAtAge: 62, costBasis: p.value / 2 })) };
    const { res } = runExpected(both, flat());
    // (90m + 45m) x 0.98 - 12.5% x (45m + 22.5m), in euros at 90
    expect(res.rows[2]?.saleProceeds).toBeCloseTo((135_000_000 * 0.98 - 0.125 * 67_500_000) / 90, 4);
  });
  it('a loan is repaid from its own property only', () => {
    const loan = { balance: 9_000_000, paymentMonthly: 0, yearsLeft: 10 };
    const withLoan = { ...two, properties: [{ ...two.properties![0]!, loan }, two.properties![1]!] };
    const noLoan = runExpected(two, flat()).res;
    const owed = runExpected(withLoan, flat()).res;
    // At the start of year 3 (t = 2) 80% is left: 7.2m rupees = 80,000 euros
    expect(noLoan.rows[2]!.saleProceeds - owed.rows[2]!.saleProceeds).toBeCloseTo(80_000, 4);
  });
  it('rent stops when its property is sold, and not before', () => {
    const rented = {
      ...BARE,
      properties: [{ id: 'r', country: 'nl' as const, use: 'rented' as const, value: 400_000, rentMonthly: 1_000, sellAtAge: 63 }],
    };
    const { res } = runExpected(rented, flat());
    const base = runExpected({ ...BARE, properties: [] }, flat()).res;
    expect(res.rows[1]!.incomeNet - base.rows[1]!.incomeNet).toBeCloseTo(12_000, 4);
    expect(res.rows[3]!.incomeNet - base.rows[3]!.incomeNet).toBeCloseTo(0, 4);
  });
  it('loan payments of two properties add up and each stops on time', () => {
    const loans = {
      ...BARE,
      properties: [
        { id: 'x', country: 'nl' as const, use: 'home' as const, value: 500_000, loan: { balance: 100_000, paymentMonthly: 1_000, yearsLeft: 2 } },
        { id: 'y', country: 'nl' as const, use: 'rented' as const, value: 300_000, loan: { balance: 100_000, paymentMonthly: 500, yearsLeft: 4 } },
      ],
    };
    const { res } = runExpected(loans, flat());
    const base = runExpected({ ...BARE, properties: [] }, flat()).res;
    const extra = (k: number) => res.rows[k]!.totalSpend - base.rows[k]!.totalSpend;
    expect([extra(0), extra(1), extra(2), extra(3), extra(4)]).toEqual([18_000, 18_000, 6_000, 6_000, 0].map((x) => expect.closeTo(x, 4)));
  });
  it('a second Dutch property is in Box 3, the home you live in is not', () => {
    const live = { ...BARE, retirementDestination: 'nl' as const, eurCash: 400_000 };
    const home = { ...live, properties: [{ id: 'h', country: 'nl' as const, use: 'home' as const, value: 600_000 }] };
    const rental = { ...live, properties: [{ id: 'h', country: 'nl' as const, use: 'rented' as const, value: 600_000 }] };
    const a = runExpected(home, flat()).res;
    const b = runExpected(rental, flat()).res;
    expect(b.rows[0]!.box3Tax).toBeGreaterThan(a.rows[0]!.box3Tax);
  });
  it('the sell-all-India scenario covers every kept Indian property', () => {
    const plan = runPlan({ ...SAMPLE_INPUT, properties: two.properties!.map((p) => ({ ...p, sellAtAge: undefined })) }, { paths: 50, seed: 1, sensitivities: true });
    expect(plan.sensitivities?.some((s) => s.id === 'sell-india-75' && /properties/.test(s.label))).toBe(true);
  });
});

describe('selling property in the year you retire', () => {
  it('counts the sale in the corpus, so retiring at 58 or 59 gives similar break-even figures', async () => {
    const { runPlan } = await import('../src/engine');
    const { SAMPLE_INPUT } = await import('../src/engine/sample');
    const base = {
      ...SAMPLE_INPUT,
      age: 45,
      familyStatus: 'single' as const,
      childrenAges: [],
      properties: [{ id: 'h', country: 'nl' as const, use: 'home' as const, value: 650_000, sellAtAge: 58, rentAfterSaleMonthly: 1800 }],
    };
    const at58 = runPlan({ ...base, retirementAge: 58 }, { paths: 50, seed: 1 });
    const at59 = runPlan({ ...base, retirementAge: 59 }, { paths: 50, seed: 1 });
    // Before the fix this jumped from 0 to a large number.
    const ratio = at58.expected.requiredCorpus / Math.max(1, at59.expected.requiredCorpus);
    expect(at59.expected.requiredCorpus).toBeGreaterThan(0);
    expect(ratio).toBeGreaterThan(0.6);
    expect(ratio).toBeLessThan(1.6);
  });
  it('does not sell twice: the sale shows up once in the rows', async () => {
    const { runPlan } = await import('../src/engine');
    const { SAMPLE_INPUT } = await import('../src/engine/sample');
    const r = runPlan(
      { ...SAMPLE_INPUT, age: 45, retirementAge: 58, familyStatus: 'single', childrenAges: [], properties: [{ id: 'h', country: 'nl', use: 'home', value: 650_000, sellAtAge: 58, rentAfterSaleMonthly: 1800 }] },
      { paths: 20, seed: 1 },
    );
    expect(r.expected.rows.filter((x) => x.saleProceeds > 0)).toHaveLength(1);
  });
});
