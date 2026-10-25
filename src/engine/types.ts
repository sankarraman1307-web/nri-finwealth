/**
 * Public types for the NRI FinWealth engine.
 *
 * Conventions
 *  - Money is in EUR unless the field name starts with `in` (then INR).
 *  - Anything described as "today's" is in today's prices and is inflated by the engine.
 *  - Rates are decimals (0.07 = 7%).
 */

/** 'both' = snowbird: you keep your main home in the Netherlands and spend part of each year in India. */
export type Destination = 'nl' | 'in' | 'both';
export type FamilyStatus = 'single' | 'partner';

export type AssetClass = 'eurCash' | 'eurEquity' | 'gold' | 'inrFd' | 'inrEquity' | 'inrEpf';
export const ASSET_CLASSES: readonly AssetClass[] = [
  'eurCash',
  'eurEquity',
  'gold',
  'inrFd',
  'inrEquity',
  'inrEpf',
] as const;
export const INR_CLASSES: readonly AssetClass[] = ['inrFd', 'inrEquity', 'inrEpf'] as const;

/** A second earner in the household, with their own salary, retirement age and 30% ruling. */
export interface PartnerEarner {
  age: number;
  retirementAge: number;
  grossSalary: number;
  /** Years of 30% ruling remaining from today (0 = none). */
  rulingYearsLeft: number;
  rulingGrandfathered: boolean;
}

/** A named yearly cost that is not in the monthly budget, such as a family holiday. */
export interface YearlyExpense {
  label: string;
  /** Today's EUR per year. Inflates with Dutch prices. */
  amountToday: number;
  /** Your age when it starts (default: now). */
  fromAge?: number;
  /** Your age when it stops, inclusive (default: for life). */
  untilAge?: number;
}

/**
 * One property. Values are in the property's own currency: euros for the Netherlands, rupees for India.
 * A loan belongs to exactly one property, so a mortgage can never exist without one.
 */
export interface Property {
  id: string;
  country: 'nl' | 'in';
  /** home = you live in it (Netherlands: outside Box 3). rented and empty count as investments. */
  use: 'home' | 'rented' | 'empty';
  /** Worth today. */
  value: number;
  /** India only: the purchase price, for capital gains tax on a sale. */
  costBasis?: number;
  /** Rent you receive each month after tax, while you still own it. */
  rentMonthly?: number;
  loan?: { balance: number; paymentMonthly: number; yearsLeft: number };
  /** Sell at this age. Leave out to keep it for good. */
  sellAtAge?: number;
  /** Rent you pay each month after selling the home you live in (euros, today's money). */
  rentAfterSaleMonthly?: number;
}

/**
 * A pension, annuity or other income that starts and stops at ages. Ages are the OWNER's own age.
 * Amounts are per month in today's money: euros, except 'in-pension', which is in rupees.
 */
export interface IncomeStream {
  id: string;
  label: string;
  who: 'you' | 'partner';
  /**
   * nl-pension and annuity: gross, taxed in the Netherlands with AOW.
   * in-pension: gross rupees, taxed in the Netherlands unless you live in India (India's own tax is not modelled).
   * other: already after tax (side business, part-time work after retiring). Not taxed again.
   */
  kind: 'nl-pension' | 'annuity' | 'in-pension' | 'other';
  monthlyToday: number;
  /** First age it is paid. Absent = from today. */
  fromAge?: number;
  /** Last age it is paid. Absent = for life. */
  untilAge?: number;
  /** Rises with inflation (Dutch inflation, or Indian inflation for in-pension). If not, it stays fixed in its own currency. */
  indexed: boolean;
}

/**
 * What you actually put aside each month. Money not invested here counts as spent. Amounts are per month and
 * grow by `stepUpYearly` each year. Rupees are converted at each year's rate.
 */
export interface MonthlyInvesting {
  eurEquity: number;
  eurCash: number;
  gold: number;
  /** Rupees a month into Indian funds (a SIP). */
  inrEquity: number;
  stepUpYearly: number;
  /** Stop investing at this age. Absent = at retirement. */
  untilAge?: number;
}

export interface PlanInput {
  /** Home country pack: 'nl' (default). Decides tax rules, state pension and wording. */
  country?: string;
  /** Gross AOW per year in today's money for each person, as the pension overview shows it. A person left out uses the estimate from years lived in the Netherlands. */
  aowAnnualOverride?: { you?: number; partner?: number };
  /** Pensions, annuities and other income. Added to the older single pension fields, which still work. */
  incomeStreams?: IncomeStream[];
  /** Your partner's age, for partner pensions when the partner has no salary. */
  partnerAge?: number;
  /** A fixed monthly investment. Absent = everything left over after spending is saved. */
  monthlyInvesting?: MonthlyInvesting;
  /**
   * The list of properties. When given, it replaces the older single-home fields (dutchHomeValue,
   * dutchMortgage..., inRealEstate, inMortgage..., the sale ages). Leave it out to use those.
   */
  properties?: Property[];
  /** Calendar year of "now" (decides which tax-rule year applies first). */
  startYear: number;
  age: number;
  retirementAge: number;
  familyStatus: FamilyStatus;
  childrenAges: number[];
  /** Years already lived in NL (drives AOW accrual). */
  yearsInNl: number;
  retirementDestination: Destination;

  /** Household core living cost per month, today's EUR, for the CURRENT household composition. */
  monthlyCoreSpend: number;
  /** Holidays, flights home, discretionary: per year, today's EUR. Not geo-adjusted. */
  annualLifestyleSpend: number;

  // ---- Netherlands (EUR) ----
  grossSalary: number;
  /** Years of 30% ruling remaining from today (0 = none). */
  rulingYearsLeft: number;
  /** True if the ruling was granted before 1 Jan 2024 (keeps 30% after 2026). */
  rulingGrandfathered: boolean;
  eurCash: number;
  /** Liquid Dutch investments (ETFs, shares). */
  eurInvestments: number;
  dutchHomeValue: number;
  dutchMortgage: number;
  dutchMortgageMonthlyPayment: number;
  dutchMortgageYearsLeft: number;
  /** Counted in net worth, excluded from the liquid pool. */
  dutchBusinessEquity: number;
  /** Supplemental (workplace) pension per month from AOW age, today's EUR. */
  dutchSuppPensionMonthly: number;
  /** Net-of-tax rental/business income per month, today's EUR. */
  dutchPassiveIncomeMonthly: number;

  // ---- India (INR) ----
  inRealEstate: number;
  inFixedDeposits: number;
  inMutualFunds: number;
  inEpf: number;
  inBusinessEquity: number;
  inMortgage: number;
  inMortgageMonthlyPayment: number;
  inMortgageYearsLeft: number;
  /** Indian pension per YEAR from pension age, today's INR. */
  inPensionAnnual: number;
  /** Net-of-tax rental/business income per month, today's INR. */
  inPassiveIncomeMonthly: number;

  goldGrams: number;
  goldEurPerGram: number;
  otherDebts: number;

  /** INR per 1 EUR, today. */
  eurToInr: number;

  // ---- Optional extensions (all default to "off" when absent) ----
  /** A second earner. Only used when familyStatus is 'partner'. */
  partnerEarner?: PartnerEarner;
  /** Named yearly costs on top of the monthly budget. */
  yearlyExpenses?: YearlyExpense[];
  /** Sell the Indian property when you reach this age. Absent = keep it (it grows but is never used). */
  inPropertySellAtAge?: number;
  /** What you originally paid for the Indian property, in INR. Needed to estimate capital gains tax on a sale. */
  inPropertyCostBasis?: number;
  /** Sell the Dutch home when you reach this age. Absent = keep it. */
  dutchHomeSellAtAge?: number;
  /** Monthly rent you pay after selling the Dutch home, today's EUR. */
  dutchHomeRentAfterSaleMonthly?: number;
  /** Snowbird: months per year spent in India once everyone has stopped working (0 to 12). Used when the destination is 'both'. */
  snowbirdMonthsInIndia?: number;
  /** Snowbird: extra flights and travel per year, today's EUR. */
  snowbirdTravelAnnual?: number;
  /** Gold jewellery you hold, in grams of pure (24k) gold. Priced with goldEurPerGram. Never spent unless you set a sale age. */
  jewelleryGrams24k?: number;
  /** Sell part of the jewellery when you reach this age. Absent = keep it all as a family reserve. */
  jewellerySellAtAge?: number;
  /** Share of the jewellery you would sell, 0 to 1. */
  jewellerySellShare?: number;
  /** What a jeweller takes off when you sell (making charges, purity deductions), 0 to 1. */
  jewelleryResaleDiscount?: number;
}

export interface AssetReturn {
  /** Expected (arithmetic) nominal return in the asset's own currency. */
  mean: number;
  /** Annual volatility of the return. */
  vol: number;
  /** Loading on the common equity-market factor (0..1). */
  marketBeta: number;
}

export interface Assumptions {
  planToAge: number;
  /** Age at which AOW starts. Legal age rises with life expectancy: 68 is a prudent default for people under ~50. */
  aowAge: number;
  indiaPensionAge: number;
  inflationNl: number;
  inflationIn: number;
  wageGrowth: number;
  /** Expected annual depreciation of INR against EUR. */
  fxDriftAnnual: number;
  /** Annual volatility of the INR/EUR depreciation. */
  fxVol: number;
  /** Cost of the same lifestyle in India relative to NL (v1 used 0.38). */
  indiaCostFactor: number;
  /** Nominal INR growth of Indian property. */
  realEstateGrowthIn: number;
  /** Nominal euro growth of Dutch house prices. */
  realEstateGrowthNl: number;
  /** Agent, notary and other selling costs, as a share of the Dutch sale price. */
  nlSaleCostShare: number;
  /** Selling costs as a share of the Indian sale price. */
  inSaleCostShare: number;
  /** Long-term capital gains tax rate in India on the gain (no indexation). */
  inCapGainsTax: number;
  /** Share of yearly savings invested in EUR equity (rest to cash). */
  surplusToEquityShare: number;
  childIndependenceAge: number;
  childWeightUnder18: number;
  childWeight18to24: number;
  partnerWeight: number;
  /** What Box 3 looks like from 2028. 'deemed' = keep the current system (default until the law is final). */
  box3Regime: 'deemed' | 'actual';
  returns: Record<AssetClass, AssetReturn>;
}

export type AssumptionOverrides = Partial<Omit<Assumptions, 'returns'>> & {
  returns?: Partial<Record<AssetClass, Partial<AssetReturn>>>;
};

export type Pots = Record<AssetClass, number>;

export interface YearRow {
  t: number;
  age: number;
  calendarYear: number;
  phase: 'accumulation' | 'retirement';
  salaryGross: number;
  /** Partner's gross salary this year (0 if the partner does not work). Included in incomeNet. */
  partnerSalaryGross: number;
  incomeTaxNl: number;
  box3Tax: number;
  pensionGross: number;
  pensionTax: number;
  /** Net money from selling property this year (after costs, tax and any mortgage payoff). Added to your savings. */
  saleProceeds: number;
  passiveNet: number;
  incomeNet: number;
  coreSpend: number;
  lifestyleSpend: number;
  mortgagePayments: number;
  totalSpend: number;
  /** incomeNet - totalSpend - box3Tax. Negative = withdrawal. */
  netFlow: number;
  /** Euros actually invested at the end of this year (what you planned, capped at what was left). */
  invested: number;
  /** Euros you planned to invest this year (0 when you did not set a fixed amount). */
  investedPlanned: number;
  /** Part of a deficit that could not be funded because the pots ran out. */
  unmetDeficit: number;
  liquidStart: number;
  liquidEnd: number;
  /** liquidEnd in today's EUR (deflated by NL inflation). */
  liquidEndReal: number;
}

export type Severity = 'info' | 'caution' | 'important';
export interface Warning {
  code: string;
  severity: Severity;
  message: string;
}

export interface BandPoint {
  age: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface SensitivityResult {
  id: string;
  label: string;
  successProbability: number;
  /** Percentage points vs base case, as a decimal (0.12 = +12 pts). */
  delta: number;
}

export interface SweepPoint {
  retirementAge: number;
  successProbability: number;
}

export type Verdict = 'on_track' | 'borderline' | 'at_risk';

export interface PlanResult {
  meta: {
    engineVersion: string;
    rulesAsOf: string;
    startYear: number;
    horizonYears: number;
    paths: number;
    seed: number;
  };
  snapshot: {
    totalAssets: number;
    totalLiabilities: number;
    netWorth: number;
    liquidInvestments: number;
    targetNetWorth: number;
    financialWealthScore: number;
    targetEmergency: number;
    emergencyScore: number;
    assetsByCategory: { name: string; value: number }[];
    assetsByGeography: { name: string; value: number }[];
  };
  expected: {
    rows: YearRow[];
    corpusAtRetirement: number;
    corpusAtRetirementReal: number;
    requiredCorpus: number;
    /** corpusAtRetirement - requiredCorpus. Not capped: negative means a shortfall. */
    margin: number;
    /** corpus / required. null when nothing is required (pensions cover everything). */
    coverageRatio: number | null;
    depletedAtAge: number | null;
    endingLiquidReal: number;
    /** Property and jewellery you kept (never sold) at the end of the plan, in today's EUR. A reserve, not spending money. */
    propertyReserveReal: number;
    firstRetirementYear: {
      age: number;
      spend: number;
      pensionAndPassive: number;
      fromPortfolio: number;
      withdrawalRate: number;
    } | null;
    aow: { accrualShare: number; persons: number; monthlyTodayEur: number };
  };
  monteCarlo: {
    successProbability: number;
    bands: BandPoint[];
    /** Age by which 10% of simulated paths have run out of money (null if fewer than 10% do). */
    p10DepletionAge: number | null;
    /** Typical (median) age the money runs out, among the simulated paths that run out. Null if none do. */
    medianFailAge: number | null;
  };
  verdict: Verdict;
  warnings: Warning[];
  sensitivities?: SensitivityResult[];
  retirementAgeSweep?: SweepPoint[];
}

export interface ValidationIssue {
  field: string;
  message: string;
  level: 'error' | 'warning';
}
