import type { Bracket } from './nl/rules';

/**
 * A country pack: everything that is specific to one home country, behind one interface, so the engine
 * (cash flow, Monte Carlo, India side) never imports a country directly.
 *
 * `CountryRules` holds only what the engine itself reads for every country. Each pack adds its own tables
 * on top (the Dutch pack adds Box 1, Box 3 and the ruling) and its own tax functions read them. Packs are
 * written with their own rules type and registered through `definePack`.
 * See the Project doc "nri-app-country-scope" for what each country brings.
 */
export interface StatePensionRules {
  /** Gross monthly state pension for a single person with a full record, in the home currency. */
  singleMonthlyGross: number;
  /** Gross monthly state pension each, for a couple, with a full record. */
  partnerMonthlyGrossEach: number;
  /** Years of insured residence or work that earn the full amount. */
  fullAccrualYears: number;
}

/** What the engine reads from any country's rules for a given year. */
export interface CountryRules {
  year: number;
  statePension: StatePensionRules;
  /** Anything not confirmed against a primary source. Surfaces to the user as a warning. */
  unverified: string[];
  sources: string[];
}
export type { Bracket };

/** `live` packs are on the public site. `draft` packs exist in code and tests but are hidden until an adviser has reviewed them. */
export type PackStatus = 'live' | 'draft';

/** One earner in a household, for countries that tax the household together. */
export interface Earner {
  gross: number;
  ruling: { active: boolean; grandfathered: boolean };
}

export interface Currency {
  /** ISO code, for example EUR, CHF, GBP. */
  code: string;
  symbol: string;
}

/** Words the screens use, so a German pack can say "Rente" and "Abgeltungsteuer". null = does not exist here. */
export interface CountryLabels {
  /** The state pension, for example AOW. */
  statePension: string;
  /** The tax on savings, investments and gains, for example Box 3. */
  wealthTax: string;
  /** A special regime for foreign hires, for example the 30% ruling. null if the country has none. */
  foreignWorkerRegime: string | null;
}

export interface CountryPack<R extends CountryRules = CountryRules> {
  id: string;
  name: string;
  status: PackStatus;
  /** The currency the plan is counted in (the "home currency"). */
  currency: Currency;
  /** Date the rule tables were last checked. */
  rulesAsOf: string;
  labels: CountryLabels;
  /** Rule tables for a calendar year (the latest known year at or before it). */
  rulesFor(year: number): R;
  knownYears(): number[];
  tax: {
    /** Income tax on a salary, with the foreign-worker regime if it applies. */
    wage(
      gross: number,
      rules: R,
      indexFactor: number,
      ruling: { active: boolean; grandfathered: boolean },
    ): { taxableWage: number; tax: number };
    /**
     * Optional. Total income tax for a whole household that is taxed together (for example joint assessment).
     * When a pack leaves it out, the engine adds up `wage` for each earner.
     */
    household?(earners: Earner[], rules: R, indexFactor: number): number;
    /** Income tax on pension income. */
    pension(grossPension: number, rules: R, indexFactor: number): number;
    /** Tax on wealth or investments under the current rules. */
    wealthCurrent(pos: WealthPosition, rules: R, indexFactor: number): number;
    /** Tax on wealth or investments under a proposed new system, as a cautious estimate. */
    wealthProposed(pos: WealthPosition, actualReturn: number, rules: R, indexFactor: number): number;
  };
}

export interface WealthPosition {
  /** Bank and savings balances. */
  savings: number;
  /** Investments, gold, foreign deposits, second homes: everything that is not savings. */
  other: number;
  /** Deductible debts. */
  debts: number;
  /** 1 or 2 (a couple shares a doubled allowance). */
  persons: number;
}

/**
 * Register a pack written against its own rules type. The engine only ever reads the common `CountryRules`,
 * so the narrower type is erased here, in one place.
 */
export function definePack<R extends CountryRules>(pack: CountryPack<R>): CountryPack {
  return pack as unknown as CountryPack;
}
