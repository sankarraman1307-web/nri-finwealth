/**
 * The quick-start profile: what a person types, how we read it, and how it becomes a PlanInput.
 * Pure TypeScript (no React), so it is easy to test.
 */
import { countryPack, DEFAULT_ASSUMPTIONS, type Assumptions, type AssumptionOverrides, type Destination, type IncomeStream, type MonthlyInvesting, type PartnerEarner, type PlanInput, type Property, type YearlyExpense } from '../engine';

/** One line in the "yearly extras" list, as typed. */
export interface ExpenseRow {
  label: string;
  amount: string;
  /** Your age when it stops. Blank = for life. */
  untilAge: string;
}

/** One property in the list, as typed. Amounts are in the property's own currency: euros (NL) or rupees (India). */
export interface PropertyRow {
  id: string;
  country: 'nl' | 'in';
  /** home = you live in it. Only a Dutch home is outside Box 3. */
  use: 'home' | 'rented' | 'empty';
  value: string;
  /** India only: the purchase price. Used for capital gains tax if you sell. */
  costBasis: string;
  /** Rent you receive each month after tax. */
  rent: string;
  hasLoan: boolean;
  loanBalance: string;
  loanPayment: string;
  loanYears: string;
  sell: boolean;
  sellAge: string;
  /** Dutch home only: rent you pay a month after selling it. */
  rentAfterSale: string;
}

export type PropertyErrors = Partial<Record<keyof PropertyRow, string>>;

export function newProperty(country: 'nl' | 'in', id: string): PropertyRow {
  return {
    id,
    country,
    use: country === 'nl' ? 'home' : 'empty',
    value: '',
    costBasis: '',
    rent: '',
    hasLoan: false,
    loanBalance: '',
    loanPayment: '',
    loanYears: '',
    sell: false,
    sellAge: '',
    rentAfterSale: '',
  };
}

/** What the employer pension loses for each year you start it before the date the pension overview assumes. A rough, cautious figure: funds differ. */
export const EARLY_PENSION_CUT_PER_YEAR = 0.06;

/** One pension, annuity or other income line, as typed. */
export interface PensionRow {
  id: string;
  who: 'you' | 'partner';
  /** nl-employer: from mijnpensionoverzicht.nl. annuity: a private or voluntary Dutch pension. in-pension: Indian. other: after-tax income such as a side business. */
  kind: 'aow' | 'nl-employer' | 'annuity' | 'in-pension' | 'other';
  label: string;
  /** aow, nl-employer, annuity: gross per year built up so far (as mijnpensioenoverzicht.nl shows). */
  built: string;
  /** aow, nl-employer, annuity: gross per year payable from age 68. in-pension: monthly rupees. other: yearly amount after tax. */
  amount: string;
  /** First age it is paid (own age). */
  fromAge: string;
  /** Last age it is paid (own age). Blank = for life. */
  untilAge: string;
  indexed: boolean;
}

export type PensionErrors = Partial<Record<keyof PensionRow, string>>;

export function newPension(kind: PensionRow['kind'], id: string): PensionRow {
  return { id, who: 'you', kind, label: '', built: '', amount: '', fromAge: '', untilAge: '', indexed: kind === 'nl-employer' || kind === 'other' || kind === 'aow' };
}

/** Assumptions people can change. Blank = the default. Percent values are typed as 2.5 for 2.5%. */
export interface AssumptionField {
  key: string;
  label: string;
  hint?: string;
  min: number;
  max: number;
  read: (a: Assumptions) => number;
  write: (o: AssumptionOverrides, pct: number) => void;
}

const retOf = (c: keyof Assumptions['returns']): Pick<AssumptionField, 'read' | 'write'> => ({
  read: (a) => a.returns[c].mean * 100,
  write: (o, v) => {
    o.returns = { ...(o.returns ?? {}), [c]: { mean: v / 100 } };
  },
});

export const ASSUMPTION_FIELDS: AssumptionField[] = [
  { key: 'wageGrowth', label: 'Salary growth a year', min: 0, max: 10, read: (a) => a.wageGrowth * 100, write: (o, v) => void (o.wageGrowth = v / 100) },
  { key: 'inflationNl', label: 'Dutch inflation a year', min: 0, max: 12, read: (a) => a.inflationNl * 100, write: (o, v) => void (o.inflationNl = v / 100) },
  { key: 'inflationIn', label: 'Indian inflation a year', min: 0, max: 20, read: (a) => a.inflationIn * 100, write: (o, v) => void (o.inflationIn = v / 100) },
  { key: 'fxDriftAnnual', label: 'Rupee weakens against the euro, a year', hint: 'Applied to everything you hold in rupees.', min: -3, max: 12, read: (a) => a.fxDriftAnnual * 100, write: (o, v) => void (o.fxDriftAnnual = v / 100) },
  { key: 'ret-eurEquity', label: 'Dutch investments (ETFs), return a year', min: -2, max: 20, ...retOf('eurEquity') },
  { key: 'ret-inrEquity', label: 'Indian funds, return a year in rupees', min: -2, max: 25, ...retOf('inrEquity') },
  { key: 'ret-gold', label: 'Gold, return a year', min: -5, max: 20, ...retOf('gold') },
  { key: 'ret-eurCash', label: 'Cash savings, interest a year', min: 0, max: 10, ...retOf('eurCash') },
  { key: 'ret-inrFd', label: 'Indian fixed deposits, interest a year', min: 0, max: 15, ...retOf('inrFd') },
  { key: 'realEstateGrowthNl', label: 'Dutch house prices, growth a year', min: -3, max: 12, read: (a) => a.realEstateGrowthNl * 100, write: (o, v) => void (o.realEstateGrowthNl = v / 100) },
  { key: 'realEstateGrowthIn', label: 'Indian property, growth a year in rupees', min: -3, max: 20, read: (a) => a.realEstateGrowthIn * 100, write: (o, v) => void (o.realEstateGrowthIn = v / 100) },
  { key: 'indiaCostFactor', label: 'Living costs in India, as a share of the Netherlands', hint: 'For example 38 means a lifestyle that costs €1,000 here costs €380 there.', min: 10, max: 150, read: (a) => a.indiaCostFactor * 100, write: (o, v) => void (o.indiaCostFactor = v / 100) },
];

/** The default of an assumption, as a percent, for showing as a placeholder. */
export const assumptionDefault = (f: AssumptionField): number => Number(f.read(DEFAULT_ASSUMPTIONS).toFixed(2));

/** What is stored and shown in the form. Money fields stay as text so people can type "250k". */
export interface Profile {
  /** Where you retire. Chosen with the buttons beside the results. */
  destination: Destination;
  age: string;
  retireAge: string;
  yearsInNl: string;
  partner: boolean;
  children: number[];
  salary: string;
  living: string;
  nlCash: string;
  nlInvestments: string;
  /** The one-number answer from the quick questions: savings and investments in the Netherlands. Used only while cash and investments below are both blank. */
  savingsQuick: string;
  hasRuling: boolean;
  /** Whole years the 30% ruling still runs, counting this year. */
  rulingYears: string;
  /** True if the ruling was granted before 1 January 2024. */
  rulingBefore2024: boolean;
  partnerEarns: boolean;
  pAge: string;
  pRetireAge: string;
  pSalary: string;
  pHasRuling: boolean;
  pRulingYears: string;
  pRulingBefore2024: boolean;
  expenses: ExpenseRow[];
  /** Every property you own, in the Netherlands or India. A mortgage belongs to one of them. */
  properties: PropertyRow[];
  /** Workplace pensions, annuities, Indian pensions and other income, for you and your partner. */
  pensions: PensionRow[];
  /** left = save whatever is left after spending. fixed = invest the amounts below, spend the rest. */
  investMode: 'left' | 'fixed';
  invNl: string;
  invCash: string;
  /** Rupees a month into Indian funds. */
  invIn: string;
  invGold: string;
  /** Percent the monthly amounts rise each year. */
  invStep: string;
  invUntil: string;
  /** Assumption overrides as typed (percent). Blank = default. */
  assumptions: Record<string, string>;
  inDeposits: string;
  inFunds: string;
  inEpf: string;
  monthsInIndia: string;
  /** Where you would live in India. Sets the India cost factor unless you set one under Assumptions. */
  indiaHome: '' | 'own' | 'family' | 'rent';
  /** Wealth tax (Box 3) from 2028: the current deemed-return system, or a tax on the actual yearly return (cautious estimate). */
  box3: 'deemed' | 'actual';
  travel: string;
  /** Gold price, EUR per gram of pure (24k) gold. */
  goldPrice: string;
  /** Bars, coins, gold funds and bonds, in grams of pure gold. */
  goldGrams: string;
  jewelleryGrams: string;
  jewelleryPurity: '24' | '22' | '18';
  jewellerySell: boolean;
  /** Percent of the jewellery you would sell. */
  jewellerySellShare: string;
  jewellerySellAge: string;
  /** Percent a jeweller takes off when you sell. */
  jewelleryLoss: string;
}

/** A worked example. Used by the tests only: the app starts with an empty form. */
export const SAMPLE_PROFILE: Profile = {
  destination: 'nl',
  age: '45',
  retireAge: '55',
  yearsInNl: '10',
  partner: true,
  children: [12, 16],
  salary: '180000',
  living: '5000',
  nlCash: '25000',
  nlInvestments: '190000',
  savingsQuick: '',
  hasRuling: true,
  rulingYears: '3',
  rulingBefore2024: false,
  partnerEarns: false,
  pAge: '43',
  pRetireAge: '60',
  pSalary: '60000',
  pHasRuling: false,
  pRulingYears: '3',
  pRulingBefore2024: false,
  expenses: [{ label: 'Family holiday', amount: '6000', untilAge: '65' }],
  properties: [
    { ...newProperty('nl', 'p1'), use: 'home', value: '650000', hasLoan: true, loanBalance: '320000', loanPayment: '1600', loanYears: '18' },
    { ...newProperty('in', 'p2'), use: 'empty', value: '11800000', costBasis: '5000000' },
  ],
  pensions: [],
  investMode: 'left',
  invNl: '',
  invCash: '',
  invIn: '',
  invGold: '',
  invStep: '',
  invUntil: '',
  assumptions: {},
  inDeposits: '6500000',
  inFunds: '5900000',
  inEpf: '5300000',
  monthsInIndia: '',
  indiaHome: '',
  box3: 'deemed',
  travel: '',
  goldPrice: '117',
  goldGrams: '50',
  jewelleryGrams: '100',
  jewelleryPurity: '22',
  jewellerySell: false,
  jewellerySellShare: '50',
  jewellerySellAge: '70',
  jewelleryLoss: '15',
};

/** What a new visitor sees: nothing filled in, except today's gold price, which they can change. */
export const EMPTY_PROFILE: Profile = {
  destination: 'nl',
  age: '',
  retireAge: '',
  yearsInNl: '',
  partner: false,
  children: [],
  salary: '',
  living: '',
  nlCash: '',
  nlInvestments: '',
  savingsQuick: '',
  hasRuling: false,
  rulingYears: '',
  rulingBefore2024: false,
  partnerEarns: false,
  pAge: '',
  pRetireAge: '',
  pSalary: '',
  pHasRuling: false,
  pRulingYears: '',
  pRulingBefore2024: false,
  expenses: [],
  properties: [],
  pensions: [],
  investMode: 'left',
  invNl: '',
  invCash: '',
  invIn: '',
  invGold: '',
  invStep: '',
  invUntil: '',
  assumptions: {},
  inDeposits: '',
  inFunds: '',
  inEpf: '',
  monthsInIndia: '',
  indiaHome: '',
  box3: 'deemed',
  travel: '',
  goldPrice: '117',
  goldGrams: '',
  jewelleryGrams: '',
  jewelleryPurity: '22',
  jewellerySell: false,
  jewellerySellShare: '',
  jewellerySellAge: '',
  jewelleryLoss: '',
};

/** Today's gold price in EUR per gram, 24k, from gold.de on 22 October 2026. People should check it. */
export const GOLD_PRICE_AS_OF = '22 October 2026';

export type Currency = 'eur' | 'inr';

const EUR_UNITS: Record<string, number> = { k: 1e3, m: 1e6 };
const INR_UNITS: Record<string, number> = {
  k: 1e3,
  m: 1e6,
  l: 1e5,
  lakh: 1e5,
  lakhs: 1e5,
  lac: 1e5,
  cr: 1e7,
  crore: 1e7,
  crores: 1e7,
};

/** "250k" -> 250000, "1.5m" -> 1500000, "2.95 crore" -> 29500000. Returns null if it cannot be read. */
export function parseMoney(text: string, currency: Currency): number | null {
  const cleaned = text
    .toLowerCase()
    .replace(/[€₹,\s]/g, '')
    .replace(/^(eur|inr|rs\.?)/, '');
  const m = /^(\d*\.?\d+)([a-z]*)$/.exec(cleaned);
  if (!m) return null;
  const num = Number(m[1]);
  const unit = m[2] ?? '';
  if (!Number.isFinite(num)) return null;
  if (unit === '') return num;
  const factor = (currency === 'eur' ? EUR_UNITS : INR_UNITS)[unit];
  return factor === undefined ? null : num * factor;
}

/** The symbol of the home currency of the current country pack. Amounts typed or shown as "eur" are in this currency. */
const HOME_SYMBOL = countryPack(undefined).currency.symbol;

const trim = (n: number, digits = 2) => String(Number(n.toFixed(digits)));

/** Short euro format: 1,630,924 -> "EUR 1.63M" style, with the euro sign. */
export function formatEur(n: number): string {
  const sign = n < 0 ? '−' : '';
  const a = Math.abs(n);
  const sym = HOME_SYMBOL;
  if (a >= 1e6) return `${sign}${sym}${(a / 1e6).toFixed(2)}M`;
  // Small amounts keep every euro, so a €1,376 payment never shows as "€1k".
  if (a >= 1e4) return `${sign}${sym}${trim(a / 1e3, 1)}k`;
  return `${sign}${sym}${Math.round(a).toLocaleString('en-US')}`;
}

export function formatEurFull(n: number): string {
  return `${n < 0 ? '−' : ''}${HOME_SYMBOL}${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
}

/** Indian style: 29,500,000 -> "₹2.95 crore", 5,000,000 -> "₹50 lakh". */
export function formatInr(n: number): string {
  if (n >= 1e7) return `₹${trim(n / 1e7)} crore`;
  if (n >= 1e5) return `₹${trim(n / 1e5)} lakh`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

export interface Parsed {
  destination: Destination;
  age: number;
  retireAge: number;
  yearsInNl: number;
  partner: boolean;
  children: number[];
  salary: number;
  living: number;
  nlCash: number;
  nlInvestments: number;
  hasRuling: boolean;
  rulingYears: number;
  rulingBefore2024: boolean;
  partner2: PartnerEarner | null;
  expenses: YearlyExpense[];
  properties: Property[];
  incomeStreams: IncomeStream[];
  /** Gross AOW per year in today's money, entered from mijnpensioenoverzicht.nl. Overrides the estimate for that person. */
  aowOverride: { you?: number; partner?: number };
  partnerAge: number | null;
  monthlyInvesting: MonthlyInvesting | null;
  overrides: AssumptionOverrides;
  inDeposits: number;
  inFunds: number;
  inEpf: number;
  monthsInIndia: number;
  travel: number;
  goldPrice: number;
  goldGrams: number;
  jewelleryGrams24k: number;
  jewellerySellAge: number | null;
  jewellerySellShare: number;
  jewelleryLoss: number;
}

export type ProfileErrors = Partial<Record<keyof Profile, string>>;
export type ParseResult =
  | { ok: true; value: Parsed }
  | {
      ok: false;
      errors: ProfileErrors;
      /** Errors inside each property card, by the property's id. */
      propertyErrors: Record<string, PropertyErrors>;
      /** Errors inside each pension row, by the row's id. */
      pensionErrors: Record<string, PensionErrors>;
      /** Errors in the assumptions panel, by assumption key. */
      assumptionErrors: Record<string, string>;
    };

/** When only one savings number is given, this share is treated as cash and the rest as investments. A stated assumption, shown to the user. */
export const QUICK_SAVINGS_CASH_SHARE = 0.3;

/** True once any savings answer has been given: the quick total, Dutch cash or investments, Indian savings, or gold. */
export const savingsAnswered = (p: Profile): boolean =>
  [p.savingsQuick, p.nlCash, p.nlInvestments, p.inDeposits, p.inFunds, p.inEpf, p.goldGrams, p.jewelleryGrams].some((t) => t.trim() !== '');

const wholeNumber = (text: string): number | null => {
  const t = text.trim();
  return /^\d+$/.test(t) ? Number(t) : null;
};

export function parseProfile(p: Profile): ParseResult {
  const errors: ProfileErrors = {};

  const age = wholeNumber(p.age);
  if (age === null || age < 18 || age > 80) errors.age = 'Enter your age, between 18 and 80.';

  const retireAge = wholeNumber(p.retireAge);
  if (retireAge === null) errors.retireAge = 'Enter an age, for example 60.';
  else if (age !== null && retireAge < age) errors.retireAge = 'That is before your current age.';
  else if (retireAge > 75) errors.retireAge = 'Pick an age of 75 or below.';

  const yearsInNl = wholeNumber(p.yearsInNl);
  if (yearsInNl === null) errors.yearsInNl = 'Enter whole years, for example 10.';
  else if (age !== null && yearsInNl > age) errors.yearsInNl = 'That is more than your age.';

  const salary = parseMoney(p.salary, 'eur');
  if (salary === null || salary < 0) errors.salary = 'Enter a yearly amount, for example 90000 or 90k.';

  const living = parseMoney(p.living, 'eur');
  if (living === null || living <= 0) errors.living = 'Enter a monthly amount above zero, for example 3500.';

  const eurField = (text: string, key: 'nlCash' | 'nlInvestments'): number => {
    if (text.trim() === '') return 0;
    const n = parseMoney(text, 'eur');
    if (n === null || n < 0) {
      errors[key] = 'Enter an amount, or leave it blank.';
      return 0;
    }
    return n;
  };
  let nlCash = eurField(p.nlCash, 'nlCash');
  let nlInvestments = eurField(p.nlInvestments, 'nlInvestments');
  // The quick answer is one number. It only applies while the detailed boxes are empty, and is split by a stated assumption.
  const quickText = p.savingsQuick.trim();
  if (quickText !== '' && p.nlCash.trim() === '' && p.nlInvestments.trim() === '') {
    const q = parseMoney(quickText, 'eur');
    if (q === null || q < 0) errors.savingsQuick = 'Enter an amount, for example 150000 or 150k. Use 0 if you have none.';
    else {
      nlCash = q * QUICK_SAVINGS_CASH_SHARE;
      nlInvestments = q - nlCash;
    }
  }

  const inrField = (text: string, key: 'inDeposits' | 'inFunds' | 'inEpf'): number => {
    if (text.trim() === '') return 0;
    const n = parseMoney(text, 'inr');
    if (n === null || n < 0) {
      errors[key] = 'Try "50 lakh" or "1.2 crore", or leave it blank.';
      return 0;
    }
    return n;
  };
  const inDeposits = inrField(p.inDeposits, 'inDeposits');
  const inFunds = inrField(p.inFunds, 'inFunds');
  const inEpf = inrField(p.inEpf, 'inEpf');

  // Savings must be answered, even if the answer is 0, so a blank form never looks like "you have nothing saved".
  if (!savingsAnswered(p) && !errors.savingsQuick) errors.savingsQuick = 'Tell us what you have saved. Enter 0 if you have nothing.';

  let rulingYears = 0;
  if (p.hasRuling) {
    const ry = wholeNumber(p.rulingYears);
    if (ry === null || ry < 1 || ry > 5) errors.rulingYears = 'Enter 1 to 5 whole years, counting this year.';
    else rulingYears = ry;
  }

  // ----- second earner -----
  // The partner's age is needed whenever the partner earns or has a pension line, and checked whenever it is typed.
  const partnerHasPension = p.pensions.some((r) => r.who === 'partner');
  let partnerAge: number | null = null;
  if (p.partner && (p.partnerEarns || partnerHasPension || p.pAge.trim() !== '')) {
    partnerAge = wholeNumber(p.pAge);
    if (partnerAge === null || partnerAge < 18 || partnerAge > 80) {
      errors.pAge = 'Enter their age, between 18 and 80.';
      partnerAge = null;
    }
  }
  let partner2: PartnerEarner | null = null;
  if (p.partner && p.partnerEarns) {
    const pAge = partnerAge;
    const pRetire = wholeNumber(p.pRetireAge);
    if (pRetire === null) errors.pRetireAge = 'Enter an age, for example 60.';
    else if (pAge !== null && pRetire < pAge) errors.pRetireAge = 'That is before their current age.';
    else if (pRetire > 75) errors.pRetireAge = 'Pick an age of 75 or below.';
    const pSal = parseMoney(p.pSalary, 'eur');
    if (pSal === null || pSal < 0) errors.pSalary = 'Enter a yearly amount, for example 60000 or 60k.';
    let pRuling = 0;
    if (p.pHasRuling) {
      const ry = wholeNumber(p.pRulingYears);
      if (ry === null || ry < 1 || ry > 5) errors.pRulingYears = 'Enter 1 to 5 whole years, counting this year.';
      else pRuling = ry;
    }
    if (pAge !== null && pRetire !== null && pSal !== null && !errors.pAge && !errors.pRetireAge && !errors.pSalary && !errors.pRulingYears) {
      partner2 = { age: pAge, retirementAge: pRetire, grossSalary: pSal, rulingYearsLeft: pRuling, rulingGrandfathered: p.pHasRuling && p.pRulingBefore2024 };
    }
  }

  // ----- yearly extras: a row is skipped if it is completely empty -----
  const expenses: YearlyExpense[] = [];
  for (const row of p.expenses) {
    if (row.label.trim() === '' && row.amount.trim() === '' && row.untilAge.trim() === '') continue;
    const amt = parseMoney(row.amount, 'eur');
    if (amt === null || amt < 0) {
      errors.expenses = 'Each yearly extra needs an amount, for example 6000 or 6k.';
      break;
    }
    let untilAge: number | undefined;
    if (row.untilAge.trim() !== '') {
      const u = wholeNumber(row.untilAge);
      if (u === null || (age !== null && u < age)) {
        errors.expenses = 'The "until age" must be a whole age from today on, or blank for life.';
        break;
      }
      untilAge = u;
    }
    expenses.push({ label: row.label.trim() || 'Yearly extra', amountToday: amt, ...(untilAge !== undefined ? { untilAge } : {}) });
  }

  // ----- property and snowbird -----
  const optionalEur = (text: string, key: keyof Profile): number => {
    if (text.trim() === '') return 0;
    const n = parseMoney(text, 'eur');
    if (n === null || n < 0) {
      errors[key] = 'Enter an amount, or leave it blank.';
      return 0;
    }
    return n;
  };
  const optionalInr = (text: string, key: keyof Profile): number => {
    if (text.trim() === '') return 0;
    const n = parseMoney(text, 'inr');
    if (n === null || n < 0) {
      errors[key] = 'Try "50 lakh", or leave it blank.';
      return 0;
    }
    return n;
  };
  const requiredEur = (text: string, key: keyof Profile): number => {
    const n = parseMoney(text, 'eur');
    if (n === null || n < 0) {
      errors[key] = 'Enter an amount, or 0.';
      return 0;
    }
    return n;
  };
  const sellAge = (text: string, key: keyof Profile | 'sellAge'): number | null => {
    const n = wholeNumber(text);
    if (n === null || (age !== null && n < age) || n > 94) {
      if (key !== 'sellAge') errors[key] = 'Enter an age from today on, up to 94.';
      return null;
    }
    return n;
  };

  // ----- properties: every loan, rent and sale belongs to one property -----
  const properties: Property[] = [];
  const propertyErrors: Record<string, PropertyErrors> = {};
  let homes = 0;
  for (const row of p.properties) {
    const e: PropertyErrors = {};
    const inIndia = row.country === 'in';
    const cur: Currency = inIndia ? 'inr' : 'eur';
    const money = (text: string, key: keyof PropertyRow, msg: string, allowZero = false): number | null => {
      const n = parseMoney(text, cur);
      if (n === null || n < 0 || (!allowZero && n === 0)) {
        e[key] = msg;
        return null;
      }
      return n;
    };
    // A Dutch home you keep can carry a mortgage payment without a value or a balance (the quick questions only ask for the payment).
    const homeKept = !inIndia && row.use === 'home' && row.hasLoan && !row.sell;
    const value = homeKept && row.value.trim() === '' ? 0 : money(row.value, 'value', inIndia ? 'Enter what it is worth, for example "1.2 crore".' : 'Enter what it is worth, for example 650000.');
    const prop: Property = { id: row.id, country: row.country, use: inIndia && row.use === 'home' ? 'empty' : row.use, value: value ?? 0 };
    if (!inIndia && prop.use === 'home') {
      homes += 1;
      if (homes > 1) e.use = 'You can only have one home you live in. Choose "Rented out" or "Empty" for this one.';
    }
    if (prop.use === 'rented') {
      const rent = money(row.rent, 'rent', 'Enter the monthly rent you receive after tax, or 0.', true);
      if (rent !== null) prop.rentMonthly = rent;
    }
    if (row.hasLoan) {
      const bal = homeKept && row.loanBalance.trim() === '' ? 0 : money(row.loanBalance, 'loanBalance', 'Enter what you still owe.', homeKept);
      const pay = money(row.loanPayment, 'loanPayment', inIndia ? 'Enter the monthly instalment, for example 45,000.' : 'Enter the monthly payment, for example 1600.');
      const yrs = wholeNumber(row.loanYears);
      if (yrs === null || yrs < 1 || yrs > 40) e.loanYears = 'Enter 1 to 40 years.';
      if (bal !== null && pay !== null && yrs !== null && yrs >= 1 && yrs <= 40) prop.loan = { balance: bal, paymentMonthly: pay, yearsLeft: yrs };
    }
    if (row.sell) {
      const sa = sellAge(row.sellAge, 'sellAge');
      if (sa === null) e.sellAge = 'Enter an age from today on, up to 94.';
      else prop.sellAtAge = sa;
      if (inIndia) {
        const cb = money(row.costBasis, 'costBasis', 'Enter the purchase price, for example "40 lakh", or 0.', true);
        if (cb !== null) prop.costBasis = cb;
      } else if (prop.use === 'home') {
        const staysInNl = p.destination !== 'in';
        const rs = money(row.rentAfterSale, 'rentAfterSale', 'Enter the rent you would pay a month, for example 1800.', true);
        if (rs !== null) prop.rentAfterSaleMonthly = rs;
        if (rs !== null && rs <= 0 && staysInNl) e.rentAfterSale = 'You will still need a place to live. Enter the rent you would pay, or untick the sale.';
      }
    } else if (inIndia && row.costBasis.trim() !== '') {
      const cb = parseMoney(row.costBasis, 'inr');
      if (cb !== null && cb >= 0) prop.costBasis = cb;
    }
    if (Object.keys(e).length > 0) propertyErrors[row.id] = e;
    else properties.push(prop);
  }
  if (Object.keys(propertyErrors).length > 0) errors.properties = 'Check the properties marked below.';

  // ----- pensions, annuities and other income -----
  const incomeStreams: IncomeStream[] = [];
  const aowOverride: { you?: number; partner?: number } = {};
  const pensionErrors: Record<string, PensionErrors> = {};
  const pensionDate = DEFAULT_ASSUMPTIONS.aowAge;
  const pRetireTyped = wholeNumber(p.pRetireAge);
  for (const row of p.pensions) {
    const e: PensionErrors = {};
    const isPartner = row.who === 'partner';
    if (isPartner && !p.partner) e.who = 'Choose "With a partner" under You and your household, or pick "You".';
    const ownerAge = isPartner ? partnerAge : age;
    const ownerStops = isPartner ? (p.partnerEarns && pRetireTyped !== null ? pRetireTyped : ownerAge) : retireAge;
    const inIndia = row.kind === 'in-pension';
    const yearly = row.kind === 'aow' || row.kind === 'nl-employer' || row.kind === 'annuity';
    const amt = parseMoney(row.amount, inIndia ? 'inr' : 'eur');
    if (amt === null || amt <= 0)
      e.amount = inIndia
        ? 'Enter the monthly pension in rupees, for example 25000.'
        : yearly
          ? 'Enter the gross amount per year from age 68, for example 14400.'
          : 'Enter the yearly amount after tax, for example 18000.';
    const ageField = (text: string, key: 'fromAge' | 'untilAge'): number | null => {
      if (text.trim() === '') return null;
      const n = wholeNumber(text);
      if (n === null || n < 18 || n > 100) {
        e[key] = 'Enter a whole age, for example 65.';
        return null;
      }
      return n;
    };
    let from = row.kind === 'aow' ? null : ageField(row.fromAge, 'fromAge');
    const until = row.kind === 'nl-employer' || row.kind === 'aow' ? null : ageField(row.untilAge, 'untilAge');
    if (from !== null && until !== null && until < from) e.untilAge = 'It cannot end before it starts.';
    if (isPartner && p.partner && ownerAge === null && !errors.pAge) e.who = "Enter your partner's age under You and your household.";
    if (row.kind === 'aow' && p.pensions.findIndex((o) => o.kind === 'aow' && o.who === row.who) !== p.pensions.indexOf(row)) e.who = 'You already have a state pension (AOW) line for this person.';

    let monthly = amt ?? 0;
    if (yearly) {
      const built = row.built.trim() === '' ? 0 : parseMoney(row.built, 'eur');
      if (built === null || built < 0) e.built = 'Enter the gross amount built up so far per year, or leave it blank.';
      else if (amt !== null && built > amt) e.built = 'Built up so far cannot be more than the amount payable from 68.';
      if (from === null) from = pensionDate;
      if (!e.built && amt !== null && ownerAge !== null && ownerStops !== null) {
        // The overview assumes you keep working (or living in the Netherlands) until the pension date.
        // Stopping earlier keeps only the part built by then. AOW stops building only when you leave the Netherlands.
        const yearsLeft = Math.max(0, pensionDate - ownerAge);
        const keepsBuilding = row.kind === 'aow' && p.destination !== 'in';
        const worked = keepsBuilding ? yearsLeft : Math.min(yearsLeft, Math.max(0, ownerStops - ownerAge));
        const b = built ?? 0;
        const atStop = yearsLeft === 0 ? amt : b + ((amt - b) * worked) / yearsLeft;
        const cut = row.kind === 'aow' ? 1 : Math.max(0, 1 - EARLY_PENSION_CUT_PER_YEAR * Math.max(0, pensionDate - from));
        monthly = (atStop * cut) / 12;
        if (row.kind === 'aow') aowOverride[row.who] = atStop;
      }
    } else if (row.kind === 'in-pension') {
      if (from === null) from = DEFAULT_ASSUMPTIONS.indiaPensionAge;
    } else if (row.kind === 'other') {
      monthly = (amt ?? 0) / 12;
    }
    if (Object.keys(e).length > 0) pensionErrors[row.id] = e;
    else if (row.kind !== 'aow') {
      const label = row.label.trim() || (row.kind === 'nl-employer' ? 'Workplace pension' : row.kind === 'annuity' ? 'Annuity' : row.kind === 'in-pension' ? 'Indian pension' : 'Other income');
      incomeStreams.push({
        id: row.id,
        label,
        who: row.who,
        kind: row.kind === 'nl-employer' ? 'nl-pension' : row.kind,
        monthlyToday: monthly,
        ...(from !== null ? { fromAge: from } : {}),
        ...(until !== null ? { untilAge: until } : {}),
        indexed: row.indexed,
      });
    }
  }
  if (Object.keys(pensionErrors).length > 0) {
    for (const k of ['you', 'partner'] as const) delete aowOverride[k];
  }
  if (Object.keys(pensionErrors).length > 0) errors.pensions = 'Check the lines marked below.';

  // ----- a fixed monthly investment -----
  let monthlyInvesting: MonthlyInvesting | null = null;
  if (p.investMode === 'fixed') {
    const nl = optionalEur(p.invNl, 'invNl');
    const cash = optionalEur(p.invCash, 'invCash');
    const gold = optionalEur(p.invGold, 'invGold');
    const inr = optionalInr(p.invIn, 'invIn');
    let step = 0;
    if (p.invStep.trim() !== '') {
      const n = Number(p.invStep.trim().replace('%', ''));
      if (!Number.isFinite(n) || n < 0 || n > 25) errors.invStep = 'Enter 0 to 25 percent, or leave it blank.';
      else step = n / 100;
    }
    let until: number | undefined;
    if (p.invUntil.trim() !== '') {
      const u = wholeNumber(p.invUntil);
      if (u === null || (age !== null && u < age) || u > 94) errors.invUntil = 'Enter an age from today on, or leave it blank for your retirement age.';
      else until = u;
    }
    if (nl + cash + gold + inr <= 0 && !errors.invNl && !errors.invCash && !errors.invGold && !errors.invIn)
      errors.investMode = 'Enter at least one amount, or choose "Whatever is left after spending".';
    monthlyInvesting = { eurEquity: nl, eurCash: cash, gold, inrEquity: inr, stepUpYearly: step, ...(until !== undefined ? { untilAge: until } : {}) };
  }

  // ----- assumptions -----
  const overrides: AssumptionOverrides = {};
  const assumptionErrors: Record<string, string> = {};
  for (const f of ASSUMPTION_FIELDS) {
    const t = (p.assumptions[f.key] ?? '').trim().replace('%', '');
    if (t === '') continue;
    const n = Number(t);
    if (!Number.isFinite(n) || n < f.min || n > f.max) {
      assumptionErrors[f.key] = `Enter a number from ${f.min} to ${f.max}, or leave it blank.`;
      continue;
    }
    f.write(overrides, n);
  }
  if (overrides.indiaCostFactor === undefined && p.destination !== 'nl' && p.indiaHome !== '') overrides.indiaCostFactor = INDIA_HOME_FACTOR[p.indiaHome];
  if (p.box3 === 'actual') overrides.box3Regime = 'actual';
  if (Object.keys(assumptionErrors).length > 0) errors.assumptions = 'Check the assumptions marked below.';

  // ----- gold -----
  const grams = (text: string, key: keyof Profile): number => {
    if (text.trim() === '') return 0;
    const m = /^(\d*\.?\d+)\s*(g|gm|gms|gram|grams)?$/i.exec(text.trim().replace(/,/g, ''));
    if (!m) {
      errors[key] = 'Enter grams, for example 50 or 120.5, or leave it blank.';
      return 0;
    }
    return Number(m[1]);
  };
  const goldGrams = grams(p.goldGrams, 'goldGrams');
  const jewelleryRaw = grams(p.jewelleryGrams, 'jewelleryGrams');
  const jewelleryGrams24k = (jewelleryRaw * Number(p.jewelleryPurity)) / 24;
  let goldPrice = parseMoney(p.goldPrice, 'eur');
  if ((goldGrams > 0 || jewelleryRaw > 0) && (goldPrice === null || goldPrice <= 0)) {
    errors.goldPrice = 'Enter today\'s price of 24k gold per gram in euros.';
    goldPrice = 0;
  }
  let jewellerySellAge: number | null = null;
  let jewellerySellShare = 0;
  let jewelleryLoss = 0;
  if (p.jewellerySell && jewelleryRaw > 0) {
    jewellerySellAge = sellAge(p.jewellerySellAge, 'jewellerySellAge');
    const share = wholeNumber(p.jewellerySellShare);
    if (share === null || share < 1 || share > 100) errors.jewellerySellShare = 'Enter 1 to 100 percent.';
    else jewellerySellShare = share / 100;
    const loss = wholeNumber(p.jewelleryLoss);
    if (loss === null || loss > 60) errors.jewelleryLoss = 'Enter 0 to 60 percent. Jewellers often take 10 to 25.';
    else jewelleryLoss = loss / 100;
  }

  // Months in India only matter for the snowbird choice. Blank is fine otherwise.
  let months: number | null = 0;
  if (p.monthsInIndia.trim() !== '' || p.destination === 'both') {
    months = wholeNumber(p.monthsInIndia);
    if (months === null || months > 12) errors.monthsInIndia = p.monthsInIndia.trim() === '' ? 'Enter how many months, 0 to 12.' : 'Enter 0 to 12 months.';
  }
  const travel = optionalEur(p.travel, 'travel');

  if (p.children.some((c) => !Number.isInteger(c) || c < 0 || c > 40)) errors.children = 'Children must be aged 0 to 40.';

  if (Object.keys(errors).length > 0) return { ok: false, errors, propertyErrors, pensionErrors, assumptionErrors };
  return {
    ok: true,
    value: {
      destination: p.destination === 'in' || p.destination === 'both' ? p.destination : 'nl',
      age: age as number,
      retireAge: retireAge as number,
      yearsInNl: yearsInNl as number,
      partner: p.partner,
      children: p.children,
      salary: salary as number,
      living: living as number,
      nlCash,
      nlInvestments,
      hasRuling: p.hasRuling,
      rulingYears,
      rulingBefore2024: p.hasRuling && p.rulingBefore2024,
      partner2,
      expenses,
      properties,
      incomeStreams,
      aowOverride,
      partnerAge,
      monthlyInvesting,
      overrides,
      monthsInIndia: months ?? 0,
      travel,
      goldPrice: goldPrice ?? 0,
      goldGrams,
      jewelleryGrams24k,
      jewellerySellAge,
      jewellerySellShare,
      jewelleryLoss,
      inDeposits,
      inFunds,
      inEpf,
    },
  };
}

export function toPlanInput(v: Parsed, eurToInr: number, startYear: number): PlanInput {
  return {
    startYear,
    age: v.age,
    retirementAge: v.retireAge,
    familyStatus: v.partner ? 'partner' : 'single',
    childrenAges: v.children,
    yearsInNl: v.yearsInNl,
    retirementDestination: v.destination,

    monthlyCoreSpend: v.living,
    annualLifestyleSpend: 0,

    grossSalary: v.salary,
    rulingYearsLeft: v.hasRuling ? v.rulingYears : 0,
    rulingGrandfathered: v.rulingBefore2024,
    eurCash: v.nlCash,
    eurInvestments: v.nlInvestments,
    dutchHomeValue: 0,
    dutchMortgage: 0,
    dutchMortgageMonthlyPayment: 0,
    dutchMortgageYearsLeft: 0,
    dutchBusinessEquity: 0,
    dutchSuppPensionMonthly: 0,
    dutchPassiveIncomeMonthly: 0,

    properties: v.properties,
    inRealEstate: 0,
    inFixedDeposits: v.inDeposits,
    inMutualFunds: v.inFunds,
    inEpf: v.inEpf,
    inBusinessEquity: 0,
    inMortgage: 0,
    inMortgageMonthlyPayment: 0,
    inMortgageYearsLeft: 0,
    inPensionAnnual: 0,
    inPassiveIncomeMonthly: 0,

    goldGrams: v.goldGrams,
    goldEurPerGram: v.goldPrice,
    otherDebts: 0,

    eurToInr,

    ...(v.partner2 && v.partner ? { partnerEarner: v.partner2 } : {}),
    country: 'nl',
    ...(v.incomeStreams.length > 0 ? { incomeStreams: v.incomeStreams } : {}),
    ...(Object.keys(v.aowOverride).length > 0 ? { aowAnnualOverride: v.aowOverride } : {}),
    ...(v.partner && v.partnerAge !== null ? { partnerAge: v.partnerAge } : {}),
    ...(v.monthlyInvesting ? { monthlyInvesting: v.monthlyInvesting } : {}),
    ...(v.expenses.length > 0 ? { yearlyExpenses: v.expenses } : {}),
    snowbirdMonthsInIndia: v.monthsInIndia,
    snowbirdTravelAnnual: v.travel,
    ...(v.jewelleryGrams24k > 0 ? { jewelleryGrams24k: v.jewelleryGrams24k } : {}),
    ...(v.jewellerySellAge !== null && v.jewelleryGrams24k > 0 ? { jewellerySellAtAge: v.jewellerySellAge, jewellerySellShare: v.jewellerySellShare, jewelleryResaleDiscount: v.jewelleryLoss } : {}),
  };
}

/** Choosing "Both" for the first time suggests an even split, 6 months in India, which you can change. */
export const DEFAULT_MONTHS_IN_INDIA = 6;

/** India living costs as a share of Dutch costs, by where you live there. Unanswered = the standard blend. */
export const INDIA_HOME_FACTOR = { own: 0.32, family: 0.3, rent: 0.45 } as const;

export function withDestination(p: Profile, destination: Destination): Profile {
  const months = destination === 'both' && p.monthsInIndia.trim() === '' ? String(DEFAULT_MONTHS_IN_INDIA) : p.monthsInIndia;
  return { ...p, destination, monthsInIndia: months };
}

/** The age at which a loan with this many years left ends. */
export const loanEndAge = (age: number, yearsLeft: number) => age + yearsLeft;

const STORAGE_KEY = 'nri-finwealth-profile-v9';

/** Reads the saved profile from this browser only. Anything odd falls back to the sample. */
export function loadProfile(): Profile {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return STARTER_PROFILE;
    const p = JSON.parse(raw) as Partial<Profile>;
    const merged = { ...EMPTY_PROFILE, ...p };
    return Array.isArray(merged.children) && Array.isArray(merged.expenses) && Array.isArray(merged.properties) && Array.isArray(merged.pensions) ? merged : STARTER_PROFILE;
  } catch {
    return STARTER_PROFILE;
  }
}

export function saveProfile(p: Profile): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* private mode or storage full: the app still works, it just will not remember */
  }
}

export function clearSavedProfile(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}

// ---------------------------------------------------------------------------
// Quick questions: the first screen, and the one mortgage record it shares with the Property group
// ---------------------------------------------------------------------------

/** What a first-time visitor sees on the quick questions. Savings is left empty on purpose: it is the one answer we need. */
export const STARTER_PROFILE: Profile = {
  ...EMPTY_PROFILE,
  age: '42',
  retireAge: '58',
  yearsInNl: '12',
  salary: '87500',
  living: '4250',
};

/** A loan's end age, from the age typed in the form. */
const wholeOrNull = (t: string): number | null => (/^\d+$/.test(t.trim()) ? Number(t) : null);

/** The Dutch home you live in, if it is in the list. There can be only one. */
export const dutchHomeRow = (p: Profile): PropertyRow | undefined => p.properties.find((r) => r.country === 'nl' && r.use === 'home');

/**
 * The quick "I pay a mortgage" box edits ONE record: the loan on the Dutch home. As soon as there is any other loan,
 * the box turns into a read-only summary, so a loan is never entered twice and never counted twice.
 */
export function quickMortgageMode(p: Profile): 'edit' | 'summary' {
  const loans = p.properties.filter((r) => r.hasLoan);
  if (loans.length === 0) return 'edit';
  if (loans.length === 1 && loans[0] === dutchHomeRow(p)) return 'edit';
  return 'summary';
}

/** Ticks or unticks the quick mortgage box. Unticking removes a home row that only existed for the loan. */
export function setQuickMortgage(p: Profile, on: boolean, newId: () => string): Profile {
  if (quickMortgageMode(p) !== 'edit') return p;
  const home = dutchHomeRow(p);
  if (on) {
    if (home) return { ...p, properties: p.properties.map((r) => (r === home ? { ...r, hasLoan: true } : r)) };
    return { ...p, properties: [...p.properties, { ...newProperty('nl', newId()), hasLoan: true }] };
  }
  if (!home) return p;
  const onlyForLoan = home.value.trim() === '' && home.rent.trim() === '' && !home.sell;
  if (onlyForLoan) return { ...p, properties: p.properties.filter((r) => r !== home) };
  return { ...p, properties: p.properties.map((r) => (r === home ? { ...r, hasLoan: false } : r)) };
}

/** Edits the payment or the years left of the home loan from the quick box. */
export function patchQuickMortgage(p: Profile, patch: Partial<Pick<PropertyRow, 'loanPayment' | 'loanYears'>>): Profile {
  const home = dutchHomeRow(p);
  if (!home) return p;
  return { ...p, properties: p.properties.map((r) => (r === home ? { ...r, ...patch } : r)) };
}

export interface MortgageSummary {
  /** How many properties carry a loan. */
  count: number;
  /** Total of the monthly payments, rupee loans converted at the given rate. */
  monthlyEur: number;
  /** The age at which the last loan ends, or null if no loan is complete yet. */
  lastEndAge: number | null;
  /** True if a rupee loan was converted. */
  hasRupeeLoan: boolean;
  loans: { id: string; label: string; endAge: number; monthlyEur: number }[];
}

const propertyLabel = (r: PropertyRow, n: number): string => {
  const place = r.country === 'nl' ? 'Dutch' : 'Indian';
  const what = r.country === 'nl' && r.use === 'home' ? 'home' : 'property';
  return n > 1 && what === 'property' ? `${place} property ${n}` : `${place} ${what}`;
};

/** A lenient digest of every loan in the form, for the quick box, the Property header and the results sentence. */
export function mortgageSummary(p: Profile, eurToInr: number): MortgageSummary {
  const age = wholeOrNull(p.age);
  const loans: MortgageSummary['loans'] = [];
  let count = 0;
  let monthlyEur = 0;
  let hasRupeeLoan = false;
  p.properties.forEach((r, i) => {
    if (!r.hasLoan) return;
    count += 1;
    const pay = parseMoney(r.loanPayment, r.country === 'in' ? 'inr' : 'eur');
    const yrs = wholeOrNull(r.loanYears);
    const eur = pay === null ? 0 : r.country === 'in' ? pay / eurToInr : pay;
    if (r.country === 'in') hasRupeeLoan = true;
    monthlyEur += eur;
    if (age !== null && yrs !== null) loans.push({ id: r.id, label: propertyLabel(r, i + 1), endAge: loanEndAge(age, yrs), monthlyEur: eur });
  });
  const lastEndAge = loans.length > 0 ? Math.max(...loans.map((l) => l.endAge)) : null;
  return { count, monthlyEur, lastEndAge, hasRupeeLoan, loans };
}

/** "You are mortgage-free at 60, two years after you stop working." */
export function mortgageFreeSentence(lastEndAge: number, retireAge: number): string {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const n = lastEndAge - retireAge;
  const num = (k: number) => words[k] ?? String(k);
  if (n > 0) return `You are mortgage-free at ${lastEndAge}, ${num(n)} ${n === 1 ? 'year' : 'years'} after you stop working.`;
  if (n === 0) return `You are mortgage-free at ${lastEndAge}, the year you stop working.`;
  return `You are mortgage-free at ${lastEndAge}, ${num(-n)} ${-n === 1 ? 'year' : 'years'} before you stop working.`;
}
