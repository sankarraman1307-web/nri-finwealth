import { describe, expect, it } from 'vitest';
import { mergeAssumptions } from '../src/engine/assumptions';
import { runMonteCarlo } from '../src/engine/montecarlo';
import { runPlan } from '../src/engine/plan';
import { SAMPLE_INPUT } from '../src/engine/sample';
import { makeContext, makeShockGenerator } from '../src/engine/simulate';
import { percentile } from '../src/engine/rng';

const ZERO_VOL = {
  fxVol: 0,
  returns: {
    eurCash: { vol: 0 },
    eurEquity: { vol: 0 },
    gold: { vol: 0 },
    inrFd: { vol: 0 },
    inrEquity: { vol: 0 },
    inrEpf: { vol: 0 },
  },
};

describe('Monte Carlo', () => {
  const input = { ...SAMPLE_INPUT, retirementAge: 65 };
  const a = mergeAssumptions();

  it('is reproducible: same seed, same answer', () => {
    const ctx = makeContext(input, a);
    const x = runMonteCarlo(ctx, 200, 7);
    const y = runMonteCarlo(ctx, 200, 7);
    expect(x.successProbability).toBe(y.successProbability);
    expect(x.bands).toEqual(y.bands);
  });

  it('different seeds give different paths but similar probabilities', () => {
    const ctx = makeContext(input, a);
    const x = runMonteCarlo(ctx, 800, 1).successProbability;
    const y = runMonteCarlo(ctx, 800, 2).successProbability;
    expect(Math.abs(x - y)).toBeLessThan(0.1);
  });

  it('percentile bands are ordered', () => {
    const { monteCarlo } = runPlan(input, { paths: 300 });
    for (const b of monteCarlo.bands) {
      expect(b.p10).toBeLessThanOrEqual(b.p50);
      expect(b.p50).toBeLessThanOrEqual(b.p90);
    }
  });

  it('with zero volatility every path equals the expected path', () => {
    const r = runPlan(input, { paths: 50, assumptions: ZERO_VOL });
    expect([0, 1]).toContain(r.monteCarlo.successProbability);
    expect(r.monteCarlo.successProbability).toBe(r.expected.depletedAtAge === null ? 1 : 0);
    for (const b of r.monteCarlo.bands) expect(b.p10).toBeCloseTo(b.p90, 6);
  });

  it('spending more never raises the chance of success (common random numbers)', () => {
    const base = runPlan(input, { paths: 400 }).monteCarlo.successProbability;
    const more = runPlan(
      { ...input, monthlyCoreSpend: input.monthlyCoreSpend * 1.2, annualLifestyleSpend: input.annualLifestyleSpend * 1.2 },
      { paths: 400 },
    ).monteCarlo.successProbability;
    expect(more).toBeLessThanOrEqual(base);
  });

  it('retiring later never lowers the chance of success', () => {
    const early = runPlan({ ...input, retirementAge: 58 }, { paths: 400 }).monteCarlo.successProbability;
    const late = runPlan({ ...input, retirementAge: 68 }, { paths: 400 }).monteCarlo.successProbability;
    expect(late).toBeGreaterThanOrEqual(early);
  });
});

describe('Shock generator statistics', () => {
  const a = mergeAssumptions();
  const n = 150_000;
  const draws = makeShockGenerator(a, 99)(n);

  it('lognormal returns reproduce the stated arithmetic mean', () => {
    const mean = draws.reduce((s, d) => s + d.returns.eurEquity, 0) / n;
    expect(mean).toBeCloseTo(a.returns.eurEquity.mean, 2);
    const inr = draws.reduce((s, d) => s + d.returns.inrEquity, 0) / n;
    expect(inr).toBeCloseTo(a.returns.inrEquity.mean, 2);
  });

  it('volatility is close to the stated value', () => {
    const logs = draws.map((d) => Math.log(1 + d.returns.eurEquity));
    const m = logs.reduce((s, x) => s + x, 0) / n;
    const sd = Math.sqrt(logs.reduce((s, x) => s + (x - m) ** 2, 0) / n);
    expect(sd).toBeCloseTo(a.returns.eurEquity.vol, 2);
  });

  it('Indian and European equities move together (market beta 0.7)', () => {
    const x = draws.map((d) => Math.log(1 + d.returns.eurEquity));
    const y = draws.map((d) => Math.log(1 + d.returns.inrEquity));
    const mx = x.reduce((s, v) => s + v, 0) / n;
    const my = y.reduce((s, v) => s + v, 0) / n;
    let cov = 0, vx = 0, vy = 0;
    for (let i = 0; i < n; i++) {
      const dx = (x[i] as number) - mx, dy = (y[i] as number) - my;
      cov += dx * dy; vx += dx * dx; vy += dy * dy;
    }
    expect(cov / Math.sqrt(vx * vy)).toBeCloseTo(0.7, 1);
  });

  it('FX depreciation averages the stated drift', () => {
    const mean = draws.reduce((s, d) => s + d.fxDep, 0) / n;
    expect(mean).toBeCloseTo(a.fxDriftAnnual, 2);
  });
});

describe('percentile helper', () => {
  it('interpolates', () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentile([0, 10], 0.25)).toBe(2.5);
    expect(percentile([], 0.5)).toBe(0);
  });
});
