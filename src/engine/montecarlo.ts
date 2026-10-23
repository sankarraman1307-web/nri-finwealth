import { percentile } from './rng';
import { makeShockGenerator, simulate, type SimContext } from './simulate';
import type { BandPoint } from './types';

export interface MonteCarloResult {
  successProbability: number;
  bands: BandPoint[];
  p10DepletionAge: number | null;
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
  let ok = 0;

  for (let p = 0; p < paths; p++) {
    const res = simulate(ctx, gen(ctx.horizon));
    if (res.depletedAtAge === null) ok++;
    else depletion.push(res.depletedAtAge);
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

  return { successProbability: ok / paths, bands, p10DepletionAge, paths };
}
