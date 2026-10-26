import { describe, expect, it } from 'vitest';
import { runPlan, validateInput } from '../src/engine';
import {
  EMPTY_PROFILE,
  SAMPLE_PROFILE,
  withDestination,
  formatInr,
  loanEndAge,
  newProperty,
  parseMoney,
  parseProfile,
  toPlanInput,
  type Profile,
  type PropertyRow,
} from '../src/web/profile';

const nlRow = (over: Partial<PropertyRow> = {}): PropertyRow => ({
  ...newProperty('nl', 'nl1'),
  use: 'home',
  value: '650000',
  hasLoan: true,
  loanBalance: '320000',
  loanPayment: '1600',
  loanYears: '18',
  ...over,
});
const inRow = (over: Partial<PropertyRow> = {}): PropertyRow => ({ ...newProperty('in', 'in1'), value: '1 crore', costBasis: '40 lakh', ...over });
const only = (...rows: PropertyRow[]) => ({ properties: rows });

const propErrors = (over: Partial<Profile>) => {
  const r = parseProfile({ ...SAMPLE_PROFILE, ...over });
  return r.ok ? {} : r.propertyErrors;
};

describe('friendly money parsing', () => {
  it('reads euro shorthand', () => {
    expect(parseMoney('250k', 'eur')).toBe(250_000);
    expect(parseMoney('1.5m', 'eur')).toBe(1_500_000);
    expect(parseMoney('€1,200,000', 'eur')).toBe(1_200_000);
    expect(parseMoney(' 90 000 ', 'eur')).toBe(90_000);
  });
  it('reads Indian units', () => {
    expect(parseMoney('2.95 crore', 'inr')).toBeCloseTo(29_500_000, 4);
    expect(parseMoney('50 lakh', 'inr')).toBe(5_000_000);
    expect(parseMoney('₹3cr', 'inr')).toBe(30_000_000);
    expect(parseMoney('12,000,000', 'inr')).toBe(12_000_000);
  });
  it('refuses nonsense instead of guessing', () => {
    expect(parseMoney('abc', 'eur')).toBeNull();
    expect(parseMoney('', 'eur')).toBeNull();
    expect(parseMoney('5 crore', 'eur')).toBeNull(); // crore is not a euro unit
    expect(parseMoney('-5', 'eur')).toBeNull();
  });
  it('formats rupees the Indian way', () => {
    expect(formatInr(29_500_000)).toBe('₹2.95 crore');
    expect(formatInr(5_000_000)).toBe('₹50 lakh');
  });
});

describe('profile validation', () => {
  it('accepts the sample profile', () => {
    expect(parseProfile(SAMPLE_PROFILE).ok).toBe(true);
  });
  const bad = (over: Partial<Profile>) => parseProfile({ ...SAMPLE_PROFILE, ...over });
  it('explains what is wrong, field by field', () => {
    const r = bad({ age: '45', retireAge: '40', salary: 'lots', living: '0' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.retireAge).toMatch(/before your current age/);
      expect(r.errors.salary).toBeDefined();
      expect(r.errors.living).toBeDefined();
      expect(r.errors.age).toBeUndefined();
    }
  });
  it('only checks loan fields when the property has a loan', () => {
    expect(bad({ properties: [{ ...nlRow(), hasLoan: false, loanPayment: 'x', loanYears: 'y' }] }).ok).toBe(true);
    expect(bad({ properties: [{ ...nlRow(), loanYears: '60' }] }).ok).toBe(false);
  });
  it('rejects more years in NL than years of life', () => {
    expect(bad({ age: '30', yearsInNl: '35', retireAge: '55' }).ok).toBe(false);
  });
});

describe('profile to plan', () => {
  const parsed = parseProfile(SAMPLE_PROFILE);
  if (!parsed.ok) throw new Error('sample profile must parse');
  const plan = toPlanInput(parsed.value, 90, 2026);

  it('produces an input the engine accepts', () => {
    expect(validateInput(plan).filter((i) => i.level === 'error')).toEqual([]);
  });
  it('passes your savings through exactly as typed, with no assumed split', () => {
    expect(plan.eurCash).toBe(25_000);
    expect(plan.eurInvestments).toBe(190_000);
  });
  it('REGRESSION: a large cash balance is not silently moved into investments', () => {
    const r = parseProfile({ ...SAMPLE_PROFILE, nlCash: '120000', nlInvestments: '0' });
    if (!r.ok) throw new Error('should parse');
    const p = toPlanInput(r.value, 90, 2026);
    expect(p.eurCash).toBe(120_000);
    expect(p.eurInvestments).toBe(0);
  });
  it('passes each Indian asset through as typed', () => {
    expect(plan.properties?.find((x) => x.country === 'in')?.value).toBe(11_800_000);
    expect(plan.inFixedDeposits).toBe(6_500_000);
    expect(plan.inMutualFunds).toBe(5_900_000);
    expect(plan.inEpf).toBe(5_300_000);
  });
  it('REGRESSION: India property is whatever you typed, not 40% of a total', () => {
    const r = parseProfile({ ...SAMPLE_PROFILE, ...only(nlRow()), inDeposits: '1 crore', inFunds: '0', inEpf: '0' });
    if (!r.ok) throw new Error('should parse');
    const p = toPlanInput(r.value, 90, 2026);
    expect(p.properties?.some((x) => x.country === 'in')).toBe(false);
    expect(p.inFixedDeposits).toBe(10_000_000);
  });
  it('carries the 30% ruling into the plan', () => {
    expect(plan.rulingYearsLeft).toBe(3);
    expect(plan.rulingGrandfathered).toBe(false);
    const r = parseProfile({ ...SAMPLE_PROFILE, rulingBefore2024: true });
    if (!r.ok) throw new Error('should parse');
    expect(toPlanInput(r.value, 90, 2026).rulingGrandfathered).toBe(true);
  });
  it('no ruling means zero ruling years, and its fields are not validated', () => {
    const r = parseProfile({ ...SAMPLE_PROFILE, hasRuling: false, rulingYears: 'abc', rulingBefore2024: true });
    if (!r.ok) throw new Error('should parse');
    const p = toPlanInput(r.value, 90, 2026);
    expect(p.rulingYearsLeft).toBe(0);
    expect(p.rulingGrandfathered).toBe(false);
  });
  it('validates ruling years', () => {
    expect(parseProfile({ ...SAMPLE_PROFILE, rulingYears: '9' }).ok).toBe(false);
    expect(parseProfile({ ...SAMPLE_PROFILE, rulingYears: '0' }).ok).toBe(false);
  });
  it('keeps the mortgage as a separate fixed payment with its own end date', () => {
    const loan = plan.properties?.find((x) => x.country === 'nl')?.loan;
    expect(loan).toEqual({ balance: 320_000, paymentMonthly: 1600, yearsLeft: 18 });
    expect(plan.monthlyCoreSpend).toBe(5000); // living costs are NOT merged with the mortgage
    expect(loanEndAge(parsed.value.age, 18)).toBe(63);
  });
  it('drops the mortgage entirely when switched off', () => {
    const r = parseProfile({ ...SAMPLE_PROFILE, ...only(nlRow({ hasLoan: false })) });
    if (!r.ok) throw new Error('should parse');
    const p = toPlanInput(r.value, 90, 2026);
    expect(p.properties?.[0]?.loan).toBeUndefined();
  });
  it('REGRESSION: a mortgage that ends after retirement lowers the chance of success versus none', () => {
    const withM = runPlan(plan, { paths: 300 }).monteCarlo.successProbability;
    const r = parseProfile({ ...SAMPLE_PROFILE, ...only(nlRow({ hasLoan: false }), inRow({ value: '11800000', costBasis: '5000000' })) });
    if (!r.ok) throw new Error('should parse');
    const without = runPlan(toPlanInput(r.value, 90, 2026), { paths: 300 }).monteCarlo.successProbability;
    expect(without).toBeGreaterThan(withM);
  });
});

describe('second earner, yearly extras, property and snowbird in the profile', () => {
  const plan = (over: Partial<Profile>) => {
    const r = parseProfile({ ...SAMPLE_PROFILE, ...over });
    if (!r.ok) throw new Error(`should parse: ${JSON.stringify(r.errors)}`);
    return toPlanInput(r.value, 90, 2026);
  };
  const errorsOf = (over: Partial<Profile>) => {
    const r = parseProfile({ ...SAMPLE_PROFILE, ...over });
    return r.ok ? {} : r.errors;
  };

  it('has no partner earner unless you switch it on', () => {
    expect(plan({}).partnerEarner).toBeUndefined();
    expect(plan({ partnerEarns: true, partner: false }).partnerEarner).toBeUndefined();
  });
  it('passes the partner\u2019s salary, age, retirement age and own ruling through', () => {
    const p = plan({ partnerEarns: true, pHasRuling: true, pRulingYears: '2', pRulingBefore2024: true });
    expect(p.partnerEarner).toEqual({ age: 43, retirementAge: 60, grossSalary: 60_000, rulingYearsLeft: 2, rulingGrandfathered: true });
    expect(p.rulingYearsLeft).toBe(3); // yours is separate
    expect(p.rulingGrandfathered).toBe(false);
  });
  it('checks partner fields only when they are switched on', () => {
    expect(errorsOf({ partner: false, partnerEarns: false, pAge: 'x', pSalary: 'y' })).toEqual({});
    const e = errorsOf({ partnerEarns: true, pAge: '50', pRetireAge: '45', pSalary: 'lots', pHasRuling: true, pRulingYears: '9' });
    expect(e.pRetireAge).toMatch(/before their current age/);
    expect(e.pSalary).toBeDefined();
    expect(e.pRulingYears).toBeDefined();
  });
  it('turns the yearly extras list into engine items, skipping empty rows', () => {
    const p = plan({ expenses: [{ label: 'Holiday', amount: '8k', untilAge: '60' }, { label: '', amount: '', untilAge: '' }, { label: '', amount: '3000', untilAge: '' }] });
    expect(p.yearlyExpenses).toEqual([
      { label: 'Holiday', amountToday: 8000, untilAge: 60 },
      { label: 'Yearly extra', amountToday: 3000 },
    ]);
  });
  it('explains a bad yearly extra', () => {
    expect(errorsOf({ expenses: [{ label: 'x', amount: 'lots', untilAge: '' }] }).expenses).toBeDefined();
    expect(errorsOf({ expenses: [{ label: 'x', amount: '100', untilAge: '30' }] }).expenses).toMatch(/until age/);
  });
  it('keeps property unless you choose to sell it', () => {
    const keep = plan(only(nlRow(), inRow()));
    expect(keep.properties?.every((x) => x.sellAtAge === undefined)).toBe(true);
    const sell = plan(only(nlRow({ sell: true, sellAge: '78', rentAfterSale: '2000' }), inRow({ sell: true, sellAge: '72', costBasis: '50 lakh' })));
    const nl = sell.properties?.find((x) => x.country === 'nl');
    const ind = sell.properties?.find((x) => x.country === 'in');
    expect(nl?.sellAtAge).toBe(78);
    expect(nl?.rentAfterSaleMonthly).toBe(2000);
    expect(ind?.sellAtAge).toBe(72);
    expect(ind?.costBasis).toBe(5_000_000);
  });
  it('needs the cost basis (India) or rent after sale (Dutch home) and a sale age only when selling', () => {
    const inErr = (over: Partial<PropertyRow>) => propErrors(only(inRow(over)))['in1'] ?? {};
    const nlErr = (over: Partial<PropertyRow>) => propErrors(only(nlRow(over)))['nl1'] ?? {};
    expect(inErr({ sell: true, costBasis: '' }).costBasis).toBeDefined();
    expect(inErr({ sell: true, sellAge: '30' }).sellAge).toBeDefined();
    expect(inErr({ sell: false, costBasis: '', sellAge: '' })).toEqual({});
    expect(nlErr({ sell: true, sellAge: '75', rentAfterSale: '' }).rentAfterSale).toBeDefined();
    expect(nlErr({ sell: false, rentAfterSale: '' })).toEqual({});
  });
  it('passes rent from a rented property, and only that property', () => {
    const p = plan(only(inRow({ use: 'rented', rent: '40000' }), inRow({ id: 'in2', use: 'empty', rent: '99999' })));
    expect(p.properties?.[0]?.rentMonthly).toBe(40_000);
    expect(p.properties?.[1]?.rentMonthly).toBeUndefined();
  });
  it('carries snowbird months and travel, and rejects more than 12 months', () => {
    const p = plan({ monthsInIndia: '5', travel: '4k' });
    expect(p.snowbirdMonthsInIndia).toBe(5);
    expect(p.snowbirdTravelAnnual).toBe(4000);
    expect(errorsOf({ monthsInIndia: '13' }).monthsInIndia).toBeDefined();
  });
  it('the sample household still runs end to end', () => {
    const p = plan({});
    expect(validateInput(p).filter((i) => i.level === 'error')).toEqual([]);
    expect(runPlan(p, { paths: 100 }).monteCarlo.successProbability).toBeGreaterThanOrEqual(0);
  });
});

describe('retirement place in the profile', () => {
  it('defaults to the Netherlands and passes the choice into the plan', () => {
    const r = parseProfile(SAMPLE_PROFILE);
    if (!r.ok) throw new Error('should parse');
    expect(toPlanInput(r.value, 90, 2026).retirementDestination).toBe('nl');
    for (const d of ['in', 'both'] as const) {
      const x = parseProfile(withDestination(SAMPLE_PROFILE, d));
      if (!x.ok) throw new Error('should parse');
      expect(toPlanInput(x.value, 90, 2026).retirementDestination).toBe(d);
    }
  });
});

describe('snowbird fields are optional unless you choose Both', () => {
  it('starts blank, so nothing is pre-filled for you', () => {
    expect(SAMPLE_PROFILE.monthsInIndia).toBe('');
    expect(SAMPLE_PROFILE.travel).toBe('');
    expect(parseProfile(SAMPLE_PROFILE).ok).toBe(true);
  });
  it('REGRESSION: choosing Both suggests an even split of 6 months, which you can then change', () => {
    const p = withDestination(SAMPLE_PROFILE, 'both');
    expect(p.destination).toBe('both');
    expect(p.monthsInIndia).toBe('6');
    expect(withDestination({ ...p, monthsInIndia: '7' }, 'both').monthsInIndia).toBe('7');
  });
  it('asks for the months if you choose Both and clear the box', () => {
    const r = parseProfile({ ...SAMPLE_PROFILE, destination: 'both', monthsInIndia: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.monthsInIndia).toMatch(/how many months/);
  });
  it('switching back to the Netherlands keeps your months but does not require them', () => {
    const p = withDestination(withDestination(SAMPLE_PROFILE, 'both'), 'nl');
    expect(p.monthsInIndia).toBe('6');
    expect(parseProfile({ ...p, monthsInIndia: '' }).ok).toBe(true);
  });
});

describe('the app starts empty, with no sample household', () => {
  it('asks for the essentials and nothing else', () => {
    const r = parseProfile(EMPTY_PROFILE);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(['age', 'living', 'retireAge', 'salary', 'savingsQuick', 'yearsInNl']);
    }
  });
  it('works once only the essentials are filled in; everything else is blank and counts as none', () => {
    const r = parseProfile({ ...EMPTY_PROFILE, age: '40', retireAge: '60', yearsInNl: '5', salary: '90k', living: '3500', savingsQuick: '0' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const p = toPlanInput(r.value, 90, 2026);
      expect(p.eurCash + p.eurInvestments + p.inRealEstate + p.inFixedDeposits + p.inMutualFunds + p.inEpf + p.goldGrams).toBe(0);
      expect(p.partnerEarner).toBeUndefined();
      expect(p.yearlyExpenses).toBeUndefined();
      expect(p.jewelleryGrams24k).toBeUndefined();
      expect(validateInput(p).filter((i) => i.level === 'error')).toEqual([]);
    }
  });
  it('does not pre-fill anything about your money, apart from the gold price you can change', () => {
    const filled = Object.entries(EMPTY_PROFILE).filter(([k, v]) => typeof v === 'string' && v !== '' && k !== 'goldPrice' && k !== 'jewelleryPurity' && k !== 'destination' && k !== 'investMode' && k !== 'box3' && k !== 'legacy');
    expect(filled).toEqual([]);
  });
});

describe('gold in the profile', () => {
  const plan = (over: Partial<Profile>) => {
    const r = parseProfile({ ...SAMPLE_PROFILE, ...over });
    if (!r.ok) throw new Error(`should parse: ${JSON.stringify(r.errors)}`);
    return toPlanInput(r.value, 90, 2026);
  };
  const errorsOf = (over: Partial<Profile>) => {
    const r = parseProfile({ ...SAMPLE_PROFILE, ...over });
    return r.ok ? {} : r.errors;
  };
  it('passes bullion and the price straight through', () => {
    const p = plan({ goldGrams: '50', goldPrice: '117' });
    expect(p.goldGrams).toBe(50);
    expect(p.goldEurPerGram).toBe(117);
  });
  it('turns jewellery weight into pure gold by purity: 100 g of 22k is 91.67 g of 24k', () => {
    expect(plan({ jewelleryGrams: '100', jewelleryPurity: '22' }).jewelleryGrams24k).toBeCloseTo(91.6667, 3);
    expect(plan({ jewelleryGrams: '100', jewelleryPurity: '24' }).jewelleryGrams24k).toBe(100);
    expect(plan({ jewelleryGrams: '100', jewelleryPurity: '18' }).jewelleryGrams24k).toBe(75);
  });
  it('accepts "120 g" and "1,200 grams"', () => {
    expect(plan({ goldGrams: '120 g' }).goldGrams).toBe(120);
    expect(plan({ goldGrams: '1,200 grams' }).goldGrams).toBe(1200);
  });
  it('keeps jewellery unless you choose to sell, and then passes share, age and loss', () => {
    expect(plan({ jewellerySell: false }).jewellerySellAtAge).toBeUndefined();
    const p = plan({ jewellerySell: true, jewellerySellShare: '40', jewellerySellAge: '72', jewelleryLoss: '20' });
    expect(p.jewellerySellAtAge).toBe(72);
    expect(p.jewellerySellShare).toBeCloseTo(0.4, 10);
    expect(p.jewelleryResaleDiscount).toBeCloseTo(0.2, 10);
  });
  it('needs a price only if you hold gold, and explains bad entries', () => {
    expect(errorsOf({ goldGrams: '', jewelleryGrams: '', goldPrice: '' })).toEqual({});
    expect(errorsOf({ goldGrams: '10', goldPrice: '' }).goldPrice).toBeDefined();
    expect(errorsOf({ goldGrams: 'lots' }).goldGrams).toBeDefined();
    expect(errorsOf({ jewellerySell: true, jewellerySellShare: '150' }).jewellerySellShare).toBeDefined();
    expect(errorsOf({ jewellerySell: true, jewelleryLoss: '' }).jewelleryLoss).toBeDefined();
  });
  it('a ticked sale with no jewellery is ignored, not an error', () => {
    expect(plan({ jewelleryGrams: '', jewellerySell: true, jewellerySellShare: 'x', jewellerySellAge: 'y' }).jewellerySellAtAge).toBeUndefined();
  });
});

describe('every mortgage belongs to one property', () => {
  const rowErr = (row: PropertyRow, key: keyof PropertyRow) => propErrors(only(row))[row.id]?.[key];
  it('a mortgage needs the property to have a value, except on a home you keep (the quick questions only ask for the payment)', () => {
    expect(rowErr(nlRow({ use: 'rented', rent: '0', value: '' }), 'value')).toBeDefined();
    expect(rowErr(nlRow({ value: '', sell: true, sellAge: '65', rentAfterSale: '1800' }), 'value')).toBeDefined();
    expect(rowErr(nlRow({ value: '' }), 'value')).toBeUndefined();
    expect(rowErr(nlRow({ value: '', loanBalance: '' }), 'loanBalance')).toBeUndefined();
  });
  it('a loan needs a balance, a payment and years', () => {
    const e = propErrors(only(inRow({ hasLoan: true, loanBalance: '', loanPayment: '', loanYears: '' })))['in1'] ?? {};
    expect(e.loanBalance).toBeDefined();
    expect(e.loanPayment).toBeDefined();
    expect(e.loanYears).toBeDefined();
  });
  it('a loan with no property cannot exist: the list is the only place a loan can live', () => {
    const r = parseProfile({ ...SAMPLE_PROFILE, ...only() });
    expect(r.ok).toBe(true);
    if (r.ok) expect(toPlanInput(r.value, 90, 2026).properties).toEqual([]);
  });
  it('an India loan reaches the plan in rupees, on its own property', () => {
    const r = parseProfile({ ...SAMPLE_PROFILE, ...only(nlRow({ hasLoan: false }), inRow({ hasLoan: true, loanBalance: '40 lakh', loanPayment: '45000', loanYears: '10' })) });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const props = toPlanInput(r.value, 90, 2026).properties ?? [];
      expect(props.find((x) => x.country === 'nl')?.loan).toBeUndefined();
      expect(props.find((x) => x.country === 'in')?.loan).toEqual({ balance: 4_000_000, paymentMonthly: 45_000, yearsLeft: 10 });
    }
  });
  it('two Indian properties and two Dutch ones can each carry their own loan', () => {
    const rows = [
      nlRow({ id: 'a', use: 'home' }),
      nlRow({ id: 'b', use: 'rented', rent: '1200', loanBalance: '100000', loanPayment: '700', loanYears: '9' }),
      inRow({ id: 'c', hasLoan: true, loanBalance: '30 lakh', loanPayment: '30000', loanYears: '8' }),
      inRow({ id: 'd', use: 'rented', rent: '25000' }),
    ];
    const r = parseProfile({ ...SAMPLE_PROFILE, ...only(...rows) });
    expect(r.ok).toBe(true);
    if (r.ok) expect(toPlanInput(r.value, 90, 2026).properties?.map((x) => x.loan?.paymentMonthly)).toEqual([1600, 700, 30_000, undefined]);
  });
  it('only one Dutch property can be the home you live in', () => {
    expect(propErrors(only(nlRow({ id: 'a' }), nlRow({ id: 'b' }))).b?.use).toMatch(/only have one home/);
  });
  it('an Indian property cannot be marked as a home you live in in the Netherlands', () => {
    const r = parseProfile({ ...SAMPLE_PROFILE, ...only(inRow({ use: 'home' })) });
    expect(r.ok).toBe(true);
    if (r.ok) expect(toPlanInput(r.value, 90, 2026).properties?.[0]?.use).toBe('empty');
  });
  it('a rented property needs a rent, which may be 0', () => {
    expect(rowErr(nlRow({ use: 'rented', rent: '' }), 'rent')).toBeDefined();
    expect(rowErr(nlRow({ use: 'rented', rent: '0' }), 'rent')).toBeUndefined();
  });
  it('a blank property row is an error, not silently dropped', () => {
    const r = parseProfile({ ...SAMPLE_PROFILE, ...only(newProperty('in', 'blank')) });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.properties).toBeDefined();
      expect(r.propertyErrors.blank?.value).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Step 15: pensions, fixed investing, assumptions, partner age
// ---------------------------------------------------------------------------------------------
import { newPension, ASSUMPTION_FIELDS } from '../src/web/profile';
import { planEvents } from '../src/web/chartData';
import { computeView } from '../src/web/compute';

const base: Profile = { ...SAMPLE_PROFILE, partner: false, partnerEarns: false, pensions: [] };
const parsedOf = (over: Partial<Profile>) => parseProfile({ ...base, ...over });
const okOf = (over: Partial<Profile>) => {
  const r = parsedOf(over);
  if (!r.ok) throw new Error(JSON.stringify(r.errors) + JSON.stringify(r.pensionErrors));
  return r.value;
};

describe('partner age', () => {
  it('is required whenever a partner who earns is ticked, wherever the other fields are', () => {
    const r = parsedOf({ partner: true, partnerEarns: true, pAge: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.pAge).toBeDefined();
  });
  it('is required when a partner has a pension line', () => {
    const r = parsedOf({ partner: true, partnerEarns: false, pAge: '', pensions: [{ ...newPension('annuity', 'a1'), who: 'partner', amount: '6000', fromAge: '65' }] });
    expect(r.ok).toBe(false);
  });
  it('is not needed for a single person', () => {
    expect(parsedOf({ partner: false, pAge: '' }).ok).toBe(true);
  });
});

describe('workplace pension from mijnpensionoverzicht', () => {
  const emp = (over: Partial<ReturnType<typeof newPension>>) => ({ ...newPension('nl-employer', 'e1'), built: '4200', amount: '16800', ...over });
  it('keeps only the part built by the age you stop working', () => {
    // 23 years to 68: age 45, stop at 55 => 10 of 23 years => 350 + 1050 * 10/23
    const v = okOf({ age: '45', retireAge: '55', pensions: [emp({})] });
    const s = v.incomeStreams[0]!;
    expect(s.kind).toBe('nl-pension');
    expect(s.monthlyToday).toBeCloseTo(350 + (1050 * 10) / 23, 5);
    expect(s.fromAge).toBe(68);
    expect(s.indexed).toBe(true);
  });
  it('is the full projection if you keep working to the pension date', () => {
    const v = okOf({ age: '45', retireAge: '68', pensions: [emp({})] });
    expect(v.incomeStreams[0]!.monthlyToday).toBeCloseTo(1400, 5);
  });
  it('cuts 6% for each year it starts before 68', () => {
    const v = okOf({ age: '45', retireAge: '68', pensions: [emp({ fromAge: '65' })] });
    expect(v.incomeStreams[0]!.monthlyToday).toBeCloseTo(1400 * 0.82, 5);
  });
  it('rejects built-up above the projection', () => {
    const r = parsedOf({ pensions: [emp({ built: '20000' })] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.pensionErrors.e1?.built).toBeDefined();
  });
  it('a partner who does not work builds nothing more', () => {
    const v = okOf({ partner: true, partnerEarns: false, pAge: '45', pensions: [emp({ who: 'partner' })] });
    expect(v.incomeStreams[0]!.monthlyToday).toBeCloseTo(350, 5);
  });
});

describe('other pension lines', () => {
  it('an Indian pension is in rupees from 60 by default and not indexed', () => {
    const s = okOf({ pensions: [{ ...newPension('in-pension', 'i1'), amount: '25000' }] }).incomeStreams[0]!;
    expect(s.kind).toBe('in-pension');
    expect(s.monthlyToday).toBe(25_000);
    expect(s.fromAge).toBe(60);
    expect(s.indexed).toBe(false);
  });
  it('other income is entered per year and used per month', () => {
    const s = okOf({ pensions: [{ ...newPension('other', 'o1'), amount: '18000', label: 'Consulting' }] }).incomeStreams[0]!;
    expect(s.monthlyToday).toBeCloseTo(1500, 6);
    expect(s.label).toBe('Consulting');
    expect(s.fromAge).toBeUndefined();
  });
  it('a voluntary pension is gross per year, from 68 unless you say otherwise, and cannot end before it starts', () => {
    const v = okOf({ age: '45', retireAge: '68', pensions: [{ ...newPension('annuity', 'a1'), built: '1200', amount: '4800' }] });
    expect(v.incomeStreams[0]).toMatchObject({ kind: 'annuity', fromAge: 68 });
    expect(v.incomeStreams[0]!.monthlyToday).toBeCloseTo(400, 6);
    const r2 = parsedOf({ pensions: [{ ...newPension('annuity', 'a1'), amount: '4800', fromAge: '65', untilAge: '60' }] });
    expect(r2.ok).toBe(false);
  });
  it('reach the engine input', () => {
    const v = okOf({ pensions: [{ ...newPension('annuity', 'a1'), amount: '4800', fromAge: '65' }] });
    expect(toPlanInput(v, 90, 2026).incomeStreams).toHaveLength(1);
  });
});

describe('monthly investing', () => {
  it('left mode sends nothing to the engine', () => {
    expect(toPlanInput(okOf({ investMode: 'left' }), 90, 2026).monthlyInvesting).toBeUndefined();
  });
  it('fixed mode needs at least one amount', () => {
    expect(parsedOf({ investMode: 'fixed', invNl: '', invCash: '', invIn: '', invGold: '' }).ok).toBe(false);
  });
  it('fixed mode passes amounts, step-up and stop age', () => {
    const mi = toPlanInput(okOf({ investMode: 'fixed', invNl: '1500', invIn: '40000', invStep: '5', invUntil: '58' }), 90, 2026).monthlyInvesting!;
    expect(mi).toMatchObject({ eurEquity: 1500, inrEquity: 40_000, stepUpYearly: 0.05, untilAge: 58 });
  });
  it('rejects a step-up above 25%', () => {
    expect(parsedOf({ investMode: 'fixed', invNl: '100', invStep: '40' }).ok).toBe(false);
  });
});

describe('assumptions', () => {
  it('blank means standard', () => {
    expect(okOf({ assumptions: {} }).overrides).toEqual({});
  });
  it('every field has a sane range and a standard value', () => {
    for (const f of ASSUMPTION_FIELDS) expect(f.min).toBeLessThan(f.max);
  });
  it('an override changes the result', () => {
    const lo = computeView({ ...base, assumptions: { inflationNl: '1' } }, 90, 2026)!;
    const hi = computeView({ ...base, assumptions: { inflationNl: '5' } }, 90, 2026)!;
    expect(lo.inflation).toBeCloseTo(0.01, 6);
    expect(hi.inflation).toBeCloseTo(0.05, 6);
    expect(hi.plan.expected.requiredCorpus).toBeGreaterThan(lo.plan.expected.requiredCorpus);
  });
  it('rejects a nonsense number and says which one', () => {
    const r = parsedOf({ assumptions: { inflationNl: '400' } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.assumptionErrors.inflationNl).toBeDefined();
  });
});

describe('events on the charts', () => {
  const input = toPlanInput(okOf({ age: '45', retireAge: '55', children: [10], properties: [nlRow({ loanYears: '18' })] }), 90, 2026);
  const ev = planEvents(input, { aowAge: 68, indiaPensionAge: 60, childIndependenceAge: 25 });
  it('names the main moments at the right ages', () => {
    expect(ev.get(55)).toContain('You stop working');
    expect(ev.get(68)).toContain('State pension (AOW) starts');
    expect(ev.get(63)?.join(' ')).toMatch(/Mortgage/);
    expect(ev.get(53)).toContain('A child turns 18');
    expect(ev.get(60)).toContain('A child becomes independent');
  });
});

describe('state pension (AOW) from the overview', () => {
  const aow = (over: Partial<ReturnType<typeof newPension>> = {}) => ({ ...newPension('aow', 'w1'), built: '6000', amount: '15000', ...over });
  it('is not an income stream; it overrides the estimate, gross per year', () => {
    const v = okOf({ age: '45', retireAge: '55', destination: 'nl', pensions: [aow()] });
    expect(v.incomeStreams).toHaveLength(0);
    expect(v.aowOverride.you).toBeCloseTo(15000, 6);
    const input = toPlanInput(v, 90, 2026);
    expect(input.aowAnnualOverride).toEqual({ you: 15000 });
  });
  it('keeps only what you built if you leave the Netherlands at retirement', () => {
    // 23 years to 68, 10 spent here: 6000 + 9000 * 10/23
    const v = okOf({ age: '45', retireAge: '55', destination: 'in', pensions: [aow()] });
    expect(v.aowOverride.you).toBeCloseTo(6000 + (9000 * 10) / 23, 6);
  });
  it('changes the plan: a higher AOW lowers the corpus you need', () => {
    const lo = computeView({ ...base, pensions: [aow({ amount: '8000', built: '2000' })] }, 90, 2026)!;
    const hi = computeView({ ...base, pensions: [aow({ amount: '20000', built: '2000' })] }, 90, 2026)!;
    expect(hi.plan.expected.requiredCorpus).toBeLessThan(lo.plan.expected.requiredCorpus);
  });
  it('a second AOW line for the same person is refused', () => {
    expect(parsedOf({ pensions: [aow(), aow({ id: 'w2' })] }).ok).toBe(false);
  });
});

describe('money readouts', () => {
  it('shows a mortgage balance in thousands', async () => {
    const { formatEur } = await import('../src/web/profile');
    expect(formatEur(320000)).toBe('\u20AC320k');
  });
});

describe('step 17 fixes', () => {
  it('shows small euro amounts in full and big ones with k', async () => {
    const { formatEur } = await import('../src/web/profile');
    expect(formatEur(1376)).toBe('€1,376');
    expect(formatEur(9999)).toBe('€9,999');
    expect(formatEur(12500)).toBe('€12.5k');
    expect(formatEur(320000)).toBe('€320k');
    expect(formatEur(1_630_924)).toBe('€1.63M');
  });
  const sale = (over: Partial<Profile>) =>
    parseProfile({ ...base, properties: [nlRow({ sell: true, sellAge: '58', rentAfterSale: '0', hasLoan: false })], ...over });
  it('needs a rent after selling your home when you retire in the Netherlands or both', () => {
    for (const destination of ['nl', 'both'] as const) {
      const r = sale({ destination, monthsInIndia: '4' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.propertyErrors.nl1?.rentAfterSale).toMatch(/place to live/);
    }
  });
  it('allows zero rent when you retire in India', () => {
    expect(sale({ destination: 'in' }).ok).toBe(true);
  });
  it('where you live in India sets the cost factor, unless you set one yourself', () => {
    expect(okOf({ destination: 'in', indiaHome: 'rent' }).overrides.indiaCostFactor).toBe(0.45);
    expect(okOf({ destination: 'in', indiaHome: 'rent', assumptions: { indiaCostFactor: '50' } }).overrides.indiaCostFactor).toBe(0.5);
    expect(okOf({ destination: 'nl', indiaHome: 'rent' }).overrides.indiaCostFactor).toBeUndefined();
    expect(okOf({ destination: 'in', indiaHome: '' }).overrides.indiaCostFactor).toBeUndefined();
  });
});

describe('bridge check', () => {
  const scenario = (over: Partial<Profile> = {}): Profile => ({
    ...base,
    age: '45',
    retireAge: '58',
    properties: [nlRow({ sell: true, sellAge: '58', rentAfterSale: '1800', hasLoan: false })],
    ...over,
  });
  it('covers the years before the state pension', () => {
    const v = computeView(scenario(), 90, 2026)!;
    expect(v.bridge).not.toBeNull();
    expect(v.bridge!.fromAge).toBe(58);
    expect(v.bridge!.toAge).toBe(67);
    expect(v.bridge!.years).toBe(10);
    expect(v.bridge!.spend).toBeGreaterThan(0);
    expect(v.bridge!.totalFromSavings).toBeGreaterThanOrEqual(0);
    expect(v.bridge!.salesInBridge).toBeGreaterThan(0);
  });
  it('is absent when you stop at or after the state pension age', () => {
    expect(computeView(scenario({ retireAge: '68' }), 90, 2026)!.bridge).toBeNull();
  });
  it('says outside money is needed when savings cannot carry the years', () => {
    const v = computeView(scenario({ retireAge: '50', nlCash: '', nlInvestments: '', properties: [], living: '6000' }), 90, 2026)!;
    expect(v.bridge!.selfFunded).toBe(false);
  });
  it('the break-even does not jump when you retire a year after selling', () => {
    const a = computeView(scenario({ retireAge: '58' }), 90, 2026)!.plan.expected.requiredCorpus;
    const b = computeView(scenario({ retireAge: '59' }), 90, 2026)!.plan.expected.requiredCorpus;
    expect(b).toBeGreaterThan(0);
    expect(a / b).toBeGreaterThan(0.5);
    expect(a / b).toBeLessThan(2);
  });
});

describe('one set of units', () => {
  it('the same sale is the same money in future and in today\'s euros', async () => {
    const { bridgeCheck } = await import('../src/web/chartData');
    const v = computeView({ ...base, age: '45', retireAge: '58', properties: [nlRow({ sell: true, sellAge: '58', rentAfterSale: '1800', hasLoan: false })] }, 90, 2026)!;
    const today = bridgeCheck(v.plan, 58, 68, v.inflation, 'today')!;
    const future = bridgeCheck(v.plan, 58, 68, v.inflation, 'future')!;
    expect(future.salesInBridge).toBeCloseTo(today.salesInBridge * (1 + v.inflation) ** 13, 3);
    expect(future.savingsAtEnd).toBeCloseTo(today.savingsAtEnd * (1 + v.inflation) ** 23, 3);
  });
});

describe('Box 3 choice', () => {
  it('defaults to the current system and passes nothing', () => {
    expect(okOf({}).overrides.box3Regime).toBeUndefined();
  });
  it('switches the engine to the actual-return estimate', async () => {
    expect(okOf({ box3: 'actual' }).overrides.box3Regime).toBe('actual');
    const rich = { age: '45', retireAge: '55', nlCash: '200000', nlInvestments: '1500000' };
    const cur = computeView({ ...base, ...rich }, 90, 2026)!;
    const act = computeView({ ...base, ...rich, box3: 'actual' }, 90, 2026)!;
    const tax = (v: typeof cur) => v.plan.expected.rows.filter((r) => r.calendarYear >= 2029).reduce((t, r) => t + r.box3Tax, 0);
    expect(tax(act)).not.toBe(tax(cur));
    expect(act.plan.warnings.some((w) => w.code === 'box3-2028' && /actual yearly return/.test(w.message))).toBe(true);
  });
});

describe('recommendations', () => {
  it('applying a change edits your answers the way you would', async () => {
    const { applyChange } = await import('../src/web/recommend');
    const p: Profile = { ...base, age: '45', retireAge: '55', living: '4000', expenses: [{ label: 'Holiday', amount: '6000', untilAge: '' }], investMode: 'fixed', invNl: '1000' };
    expect(applyChange(p, { retireShift: 2 }).retireAge).toBe('57');
    expect(applyChange(p, { spendCutPct: 10 }).living).toBe('3600');
    expect(applyChange(p, { spendCutPct: 10 }).expenses[0]!.amount).toBe('5400');
    expect(applyChange(p, { saveMore: 500 }).invNl).toBe('1500');
    expect(applyChange(p, { destination: 'in' }).destination).toBe('in');
    expect(applyChange({ ...p, investMode: 'left' }, { saveMore: 500 }).invNl).toBe('1000');
    expect(applyChange(p, { retireShift: 99 }).retireAge).toBe('75');
  });
  it('finds the smallest change that reaches 90 percent, and it really does', async () => {
    const { computeRecommendations, applyChange, TARGET } = await import('../src/web/recommend');
    const p: Profile = { ...base, age: '45', retireAge: '50', nlCash: '150000', nlInvestments: '350000', living: '4500', salary: '100000' };
    const opts = { eurToInr: 90, startYear: 2026, paths: 150, seed: 7 };
    const rec = computeRecommendations(p, opts)!;
    expect(rec.safe).toBe(false);
    const retire = rec.levers.find((l) => l.id === 'retire')!;
    if (retire.pick) {
      expect(retire.pick.success).toBeGreaterThanOrEqual(TARGET);
      // the step before the pick did not reach it
      const before = retire.trials[retire.trials.indexOf(retire.pick) - 1];
      if (before) expect(before.success).toBeLessThan(TARGET);
      // applying it to the form reaches the same figure
      const again = computeRecommendations(applyChange(p, retire.pick.change), opts)!;
      expect(again.base).toBeCloseTo(retire.pick.success, 6);
    }
  });
  it('for a safe plan it shows how much room you have', async () => {
    const { computeRecommendations } = await import('../src/web/recommend');
    const p: Profile = { ...base, age: '45', retireAge: '65', nlCash: '600000', nlInvestments: '2500000', living: '3000', salary: '150000' };
    const rec = computeRecommendations(p, { eurToInr: 90, startYear: 2026, paths: 150, seed: 7 })!;
    expect(rec.safe).toBe(true);
    expect(rec.levers.find((l) => l.id === 'retire')!.title).toMatch(/earlier/);
  });
});
