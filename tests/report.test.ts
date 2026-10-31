import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeView } from '../src/web/compute';
import { EMPTY_PROFILE, SAMPLE_PROFILE, STARTER_PROFILE, newPension, newProperty, type Profile } from '../src/web/profile';
import { inputGroups } from '../src/web/report/inputs';
import { buildReportModel } from '../src/web/report/model';
import { renderReport } from '../src/web/report/render';

const font = (w: number) => new Uint8Array(readFileSync(`src/web/report/fonts/manrope-latin-${w}.ttf`));
const FONTS = { regular: font(400), bold: font(700), extra: font(800) };
const NOW = new Date('2026-10-31T12:00:00Z');
const RATE = 90;

const minimal: Profile = { ...STARTER_PROFILE, savingsQuick: '1300000' };
const typical: Profile = { ...SAMPLE_PROFILE };
const full: Profile = {
  ...SAMPLE_PROFILE,
  destination: 'both',
  monthsInIndia: '5',
  indiaHome: 'own',
  travel: '3000',
  legacy: 'intact',
  partnerEarns: true,
  pHasRuling: true,
  children: [8, 12, 15],
  expenses: [
    { label: 'Family holiday', amount: '6000', untilAge: '65' },
    { label: 'Children studies', amount: '12000', untilAge: '60' },
    { label: 'Car', amount: '4000', untilAge: '' },
  ],
  properties: [
    { ...newProperty('nl', 'a'), use: 'home', value: '650000', hasLoan: true, loanBalance: '320000', loanPayment: '1600', loanYears: '18', sell: true, sellAge: '75', rentAfterSale: '1800' },
    { ...newProperty('nl', 'b'), use: 'rented', value: '300000', rent: '1400', hasLoan: true, loanBalance: '150000', loanPayment: '800', loanYears: '15' },
    { ...newProperty('in', 'c'), use: 'empty', value: '11800000', costBasis: '5000000' },
    { ...newProperty('in', 'd'), use: 'rented', value: '8000000', costBasis: '3000000', rent: '30000', hasLoan: true, loanBalance: '2000000', loanPayment: '25000', loanYears: '10' },
    { ...newProperty('in', 'e'), use: 'empty', value: '5000000', costBasis: '2000000', sell: true, sellAge: '70' },
  ],
  pensions: [
    { ...newPension('aow', 'x1'), who: 'you', built: '12000', amount: '16000', fromAge: '68' },
    { ...newPension('aow', 'x2'), who: 'partner', built: '9000', amount: '16000', fromAge: '68' },
    { ...newPension('nl-employer', 'x3'), who: 'you', label: 'ABP', built: '9000', amount: '21000', fromAge: '67' },
    { ...newPension('annuity', 'x4'), who: 'partner', label: 'Bank annuity', built: '2000', amount: '4000', fromAge: '67' },
    { ...newPension('in-pension', 'x5'), who: 'you', label: 'EPS', amount: '7500', fromAge: '60' },
    { ...newPension('other', 'x6'), who: 'you', label: 'Side business', amount: '5000', fromAge: '60', untilAge: '75' },
  ],
  investMode: 'fixed',
  invNl: '1500',
  invCash: '300',
  invIn: '40000',
  invGold: '100',
  invStep: '2',
  invUntil: '54',
  jewellerySell: true,
  assumptions: { inflationNl: '2.5', 'ret-eurEquity': '5.5', planToAge: '97' },
  box3: 'actual',
};

async function run(name: string, p: Profile) {
  const view = computeView(p, RATE, 2026);
  expect(view).not.toBeNull();
  const model = buildReportModel(view!, p, RATE, 2026, NOW);
  const bytes = await renderReport(model, FONTS);
  if (process.env.REPORT_OUT) {
    mkdirSync(process.env.REPORT_OUT, { recursive: true });
    writeFileSync(`${process.env.REPORT_OUT}/${name}.pdf`, bytes);
  }
  return { view: view!, model, bytes };
}

describe('PDF report', () => {
  it('builds a valid PDF for a minimal, typical and full profile', async () => {
    for (const [name, p] of [['minimal', minimal], ['typical', typical], ['full', full]] as const) {
      const { bytes } = await run(name, p);
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
      expect(bytes.length).toBeGreaterThan(8000);
    }
  }, 120000);

  it('uses the same numbers as the screen', async () => {
    const { view, model } = await run('typical', typical);
    expect(model.pct).toBe(Math.round(view.plan.monteCarlo.successProbability * 100));
    expect(model.horizonAge).toBe(view.age + view.plan.meta.horizonYears);
    expect(model.whatIf.rows[0]?.pct).toBe(model.pct);
  }, 120000);

  it('skips empty answers and keeps filled ones', () => {
    const none = inputGroups(EMPTY_PROFILE).flatMap((g) => g.rows).filter((r) => r.kind === 'row');
    expect(none.every((r) => r.kind === 'row' && r.value.trim() !== '')).toBe(true);
    const groups = inputGroups(full);
    const titles = groups.map((g) => g.title);
    expect(titles).toContain('Property and mortgages');
    expect(titles).toContain('Pensions and other income');
    expect(titles).toContain('Assumptions you changed');
    const props = groups.find((g) => g.title === 'Property and mortgages')!;
    expect(props.rows.filter((r) => r.kind === 'sub')).toHaveLength(5);
  });
});
