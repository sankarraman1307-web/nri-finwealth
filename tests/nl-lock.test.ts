import { describe, expect, it } from 'vitest';
import { runPlan } from '../src/engine/plan';
import { SAMPLE_INPUT } from '../src/engine/sample';
import type { PlanInput } from '../src/engine/types';

/**
 * Lock for the country refactor: the Dutch results across many different household shapes must not move.
 * The snapshot was taken before the country interface was widened (step 38). If it changes, the engine changed.
 */
const earner = { age: 43, retirementAge: 62, grossSalary: 95_000, rulingYearsLeft: 3, rulingGrandfathered: false };
const CASES: Record<string, PlanInput> = {
  sample: SAMPLE_INPUT,
  retireIndia: { ...SAMPLE_INPUT, retirementDestination: 'in' },
  snowbird: { ...SAMPLE_INPUT, retirementDestination: 'both', snowbirdMonthsInIndia: 4, snowbirdTravelAnnual: 3000 },
  rulingSingle: { ...SAMPLE_INPUT, familyStatus: 'single', childrenAges: [], rulingYearsLeft: 4, rulingGrandfathered: true },
  twoEarners: { ...SAMPLE_INPUT, partnerEarner: earner, rulingYearsLeft: 2 },
  twoEarnersIndia: { ...SAMPLE_INPUT, partnerEarner: earner, retirementDestination: 'in', retirementAge: 60 },
  start2028: { ...SAMPLE_INPUT, startYear: 2028, retirementAge: 62, rulingYearsLeft: 1 },
  streams: {
    ...SAMPLE_INPUT,
    incomeStreams: [
      { id: 'a', who: 'you', kind: 'in-pension', label: 'EPF pension', monthlyToday: 25_000, fromAge: 58, indexed: true },
      { id: 'b', who: 'partner', kind: 'annuity', label: 'Annuity', monthlyToday: 400, fromAge: 60, indexed: false },
    ],
  } as PlanInput,
};

describe('Dutch results are locked', () => {
  for (const [name, input] of Object.entries(CASES)) {
    it(name, () => {
      const r = runPlan(input, { paths: 200, seed: 11 });
      expect({
        corpus: Math.round(r.expected.corpusAtRetirement),
        required: Math.round(r.expected.requiredCorpus),
        depleted: r.expected.depletedAtAge,
        success: r.monteCarlo.successProbability,
        verdict: r.verdict,
        warnings: r.warnings.map((w) => w.code),
        years: r.expected.rows.map((y) => [y.age, Math.round(y.incomeTaxNl), Math.round(y.pensionTax), Math.round(y.box3Tax), Math.round(y.incomeNet), Math.round(y.liquidEnd)]),
      }).toMatchSnapshot();
    });
  }
});
