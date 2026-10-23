import type { CountryPack } from './types';
import { NL_PACK } from './nl';

export type { CountryPack, CountryRules, CountryLabels, Currency, WealthPosition } from './types';

/** All country packs. Add a new country here once its pack has been reviewed by a local tax adviser. */
export const COUNTRY_PACKS: Record<string, CountryPack> = {
  nl: NL_PACK,
};

export const DEFAULT_COUNTRY = 'nl';

export function countryPack(id: string | undefined): CountryPack {
  return COUNTRY_PACKS[id ?? DEFAULT_COUNTRY] ?? NL_PACK;
}
