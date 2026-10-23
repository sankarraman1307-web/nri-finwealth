import type { Bracket, NlRulesYear } from './nl/rules';

/**
 * A country pack: everything that is specific to one home country, behind one interface, so the engine
 * (cash flow, Monte Carlo, India side) never imports a country directly.
 *
 * Today the rule tables are shaped like the Dutch ones. When a second country is added, widen `CountryRules`
 * (or make the pack generic) and move whatever the new country does differently behind these functions.
 * See the Project doc "nri-app-country-scope" for what each country brings.
 */
export type CountryRules = NlRulesYear;
export type { Bracket };

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

export interface CountryPack {
  id: string;
  name: string;
  /** The currency the plan is counted in (the "home currency"). */
  currency: Currency;
  /** Date the rule tables were last checked. */
  rulesAsOf: string;
  labels: CountryLabels;
  /** Rule tables for a calendar year (the latest known year at or before it). */
  rulesFor(year: number): CountryRules;
  knownYears(): number[];
  tax: {
    /** Income tax on a salary, with the foreign-worker regime if it applies. */
    wage(
      gross: number,
      rules: CountryRules,
      indexFactor: number,
      ruling: { active: boolean; grandfathered: boolean },
    ): { taxableWage: number; tax: number };
    /** Income tax on pension income. */
    pension(grossPension: number, rules: CountryRules, indexFactor: number): number;
    /** Tax on wealth or investments under the current rules. */
    wealthCurrent(pos: WealthPosition, rules: CountryRules, indexFactor: number): number;
    /** Tax on wealth or investments under a proposed new system, as a cautious estimate. */
    wealthProposed(pos: WealthPosition, actualReturn: number, rules: CountryRules, indexFactor: number): number;
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
