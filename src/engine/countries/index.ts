import type { CountryPack, CountryRules, Earner } from './types';
import { NL_PACK } from './nl';

export type {
  CountryPack,
  CountryRules,
  CountryLabels,
  Currency,
  Earner,
  PackStatus,
  StatePensionRules,
  WealthPosition,
} from './types';
export { definePack } from './types';

/**
 * Packs on the public site. Add a country here only once its pack has been reviewed by a local tax adviser
 * and its `status` is 'live'.
 */
export const COUNTRY_PACKS: Record<string, CountryPack> = {
  nl: NL_PACK,
};

/**
 * Packs under review. They exist in code and tests but are not reachable from the public site: `countryPack`
 * ignores them unless drafts are switched on, and `availableCountries` leaves them out.
 */
export const DRAFT_COUNTRY_PACKS: Record<string, CountryPack> = {};

export const DEFAULT_COUNTRY = 'nl';

export interface LookupOptions {
  /** Also look in the draft packs. Off by default, so a draft never reaches a visitor by accident. */
  includeDrafts?: boolean;
}

/** Pure lookup over explicit registries, so the rules can be tested with fake packs. */
export function resolvePack(
  id: string | undefined,
  live: Record<string, CountryPack>,
  drafts: Record<string, CountryPack>,
  opts: LookupOptions = {},
): CountryPack {
  const key = id ?? DEFAULT_COUNTRY;
  const hit = live[key] ?? (opts.includeDrafts ? drafts[key] : undefined);
  return hit ?? (live[DEFAULT_COUNTRY] as CountryPack);
}

export function countryPack(id: string | undefined, opts: LookupOptions = {}): CountryPack {
  return resolvePack(id, COUNTRY_PACKS, DRAFT_COUNTRY_PACKS, opts);
}

/** Countries a visitor can choose. Drafts appear only when switched on. */
export function availableCountries(opts: LookupOptions = {}): CountryPack[] {
  const all = opts.includeDrafts ? { ...COUNTRY_PACKS, ...DRAFT_COUNTRY_PACKS } : COUNTRY_PACKS;
  return Object.values(all);
}

/** The currency the plan is counted in for this country. */
export function homeCurrency(id: string | undefined, opts: LookupOptions = {}) {
  return countryPack(id, opts).currency;
}

/**
 * Income tax on all earners of a household, for any country.
 * - A country with no foreign-worker regime (labels.foreignWorkerRegime is null) never applies one,
 *   whatever the plan says.
 * - A country that taxes the household together supplies `tax.household`.
 * - Otherwise each earner is taxed on their own and the results are added in order.
 */
export function householdWageTax(
  pack: CountryPack,
  earners: Earner[],
  rules: CountryRules,
  indexFactor: number,
): number {
  const noRegime = pack.labels.foreignWorkerRegime === null;
  const list = noRegime ? earners.map((e) => ({ ...e, ruling: { active: false, grandfathered: false } })) : earners;
  if (pack.tax.household) return pack.tax.household(list, rules, indexFactor);
  let total = 0;
  for (const e of list) total += pack.tax.wage(e.gross, rules, indexFactor, e.ruling).tax;
  return total;
}
