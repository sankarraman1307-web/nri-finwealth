import type { AssetClass, AssetReturn, AssumptionOverrides, Assumptions } from './types';
import { ASSET_CLASSES } from './types';

/**
 * Default planning assumptions. Every number here is a judgement call, which is why the UI
 * should expose them. Nominal returns are in each asset's own currency.
 *
 * v1 used one 9% return for everything. Here, INR assets earn INR returns and are converted
 * to EUR through the simulated FX path, so currency drift is real instead of cosmetic.
 */
export const DEFAULT_ASSUMPTIONS: Assumptions = {
  planToAge: 95,
  aowAge: 68,
  indiaPensionAge: 60,
  inflationNl: 0.024,
  inflationIn: 0.05,
  wageGrowth: 0.025,
  fxDriftAnnual: 0.025,
  fxVol: 0.05,
  indiaCostFactor: 0.38,
  realEstateGrowthIn: 0.06,
  realEstateGrowthNl: 0.03,
  nlSaleCostShare: 0.02,
  inSaleCostShare: 0.02,
  inCapGainsTax: 0.125,
  surplusToEquityShare: 0.8,
  childIndependenceAge: 25,
  childWeightUnder18: 0.3,
  childWeight18to24: 0.5,
  partnerWeight: 0.5,
  box3Regime: 'deemed',
  returns: {
    eurCash: { mean: 0.02, vol: 0.005, marketBeta: 0 },
    eurEquity: { mean: 0.07, vol: 0.16, marketBeta: 1 },
    gold: { mean: 0.05, vol: 0.15, marketBeta: 0.1 },
    inrFd: { mean: 0.07, vol: 0.01, marketBeta: 0 },
    inrEquity: { mean: 0.115, vol: 0.2, marketBeta: 0.7 },
    inrEpf: { mean: 0.0825, vol: 0.005, marketBeta: 0 },
  },
};

export function mergeAssumptions(over: AssumptionOverrides = {}): Assumptions {
  const { returns: retOver, ...rest } = over;
  const returns = {} as Record<AssetClass, AssetReturn>;
  for (const c of ASSET_CLASSES) {
    returns[c] = { ...DEFAULT_ASSUMPTIONS.returns[c], ...(retOver?.[c] ?? {}) };
  }
  return { ...DEFAULT_ASSUMPTIONS, ...rest, returns };
}
