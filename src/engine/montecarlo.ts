import { percentile } from './rng';
import { makeShockGenerator, simulate, sumPots, type SimContext } from './simulate';
import type { BandPoint } from './types';

export interface MonteCarloResult {
  successProbability: number;
  bands: BandPoint[];
  p10DepletionAge: number | null;
  /** Typical (median) age at which the money runs out, among the paths that do run out. Null if none do. */
  medianFailAge: number | null;
  /** Middle of the simulated futures for your savings on the day you stop (sales that year included), in today's euros. */
  medianAtRetirementReal: number;
  paths: number;
}

/**
 * Runs `paths` random futures through the same simulator that produces the expected path.
 * Success = the money lasts to the planning age. Same seed = same result.
 */
export function runMonteCarlo(ctx: SimContext, paths: number, seed: number): MonteCarloResult {
  const gen = makeShockGenerator(ctx.a, seed);
  const perYear: number[][] = Array.from({ length: ctx.horizon }, () => []);
  const depletion: number[] = [];
  const atRetire: number[] = [];
  const realFactor = (1 + ctx.a.inflationNl) ** ctx.yearsToRetire;
  let ok = 0;

  for (let p = 0; p < paths; p++) {
    const res = simulate(ctx, gen(ctx.horizon));
    const potAtStop = sumPots(res.stateAtRetirement.pots) / realFactor;
    atRetire.push(potAtStop);
    if (res.depletedAtAge !== null) depletion.push(res.depletedAtAge);
    // Keeping savings intact: the money must also be worth at least as much (today's euros) at the end as on the day you stop.
    else if (!ctx.input.leaveIntact || res.endingLiquidReal >= potAtStop) ok++;
    for (let t = 0; t < res.rows.length; t++) (perYear[t] as number[]).push((res.rows[t] as { liquidEndReal: number }).liquidEndReal);
  }

  const bands: BandPoint[] = perYear.map((vals, t) => {
    const s = [...vals].sort((x, y) => x - y);
    return {
      age: ctx.input.age + t + 1,
      p10: percentile(s, 0.1),
      p50: percentile(s, 0.5),
      p90: percentile(s, 0.9),
    };
  });

  const failShare = depletion.length / paths;
  let p10DepletionAge: number | null = null;
  if (failShare >= 0.1) {
    // Age by which 10% of ALL paths have already failed.
    const sorted = [...depletion].sort((x, y) => x - y);
    p10DepletionAge = sorted[Math.max(0, Math.ceil(paths * 0.1) - 1)] ?? null;
  }

  let medianFailAge: number | null = null;
  if (depletion.length > 0) {
    const sorted = [...depletion].sort((x, y) => x - y);
    medianFailAge = sorted[Math.floor((sorted.length - 1) / 2)] ?? null;
  }

  const medianAtRetirementReal = percentile([...atRetire].sort((x, y) => x - y), 0.5);

  return { successProbability: ok / paths, bands, p10DepletionAge, medianFailAge, medianAtRetirementReal, paths };
}
