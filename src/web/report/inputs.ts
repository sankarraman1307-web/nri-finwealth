/** "Your inputs": every answer the person gave, in plain words, grouped. Empty answers are skipped. Pure TypeScript. */
import { ASSUMPTION_FIELDS, formatEurFull, formatInr, parseMoney, type PensionRow, type Profile, type PropertyRow } from './profileApi';

export type InputRow = { kind: 'row'; label: string; value: string } | { kind: 'sub'; label: string };
export interface InputGroup {
  title: string;
  rows: InputRow[];
}

const filled = (t: string): boolean => t.trim() !== '';
const eur = (t: string): string | null => {
  if (!filled(t)) return null;
  const n = parseMoney(t, 'eur');
  return n === null ? t.trim() : formatEurFull(n);
};
const inr = (t: string): string | null => {
  if (!filled(t)) return null;
  const n = parseMoney(t, 'inr');
  return n === null ? t.trim() : formatInr(n);
};
const money = (t: string, cur: 'eur' | 'inr'): string | null => (cur === 'eur' ? eur(t) : inr(t));
const yrs = (t: string, one = 'year', many = 'years'): string | null => (filled(t) ? `${t.trim()} ${t.trim() === '1' ? one : many}` : null);

const PLACE = { nl: 'The Netherlands', in: 'India', both: 'Both' } as const;
const USE = { home: 'You live in it', rented: 'Rented out', empty: 'Empty or for family' } as const;
const PENSION_KIND = { aow: 'Dutch State Pension (AOW)', 'nl-employer': 'Dutch employer pension', annuity: 'Private or voluntary Dutch pension', 'in-pension': 'Indian pension', other: 'Other income' } as const;
const INDIA_HOME = { own: 'In a home you own', family: 'With family', rent: 'Renting' } as const;

const row = (label: string, value: string | null, out: InputRow[]): void => {
  if (value !== null && value !== '') out.push({ kind: 'row', label, value });
};

function propertyRows(r: PropertyRow, n: number, out: InputRow[]): void {
  const cur = r.country === 'in' ? 'inr' : 'eur';
  const place = r.country === 'nl' ? 'Dutch' : 'Indian';
  out.push({ kind: 'sub', label: `${place} ${r.country === 'nl' && r.use === 'home' ? 'home' : 'property'} ${n}` });
  row('Use', USE[r.use], out);
  row('Value', money(r.value, cur), out);
  if (r.country === 'in') row('Bought for', money(r.costBasis, 'inr'), out);
  if (r.use === 'rented') row('Rent a month, after tax', money(r.rent, cur), out);
  if (r.hasLoan) {
    row('Loan left', money(r.loanBalance, cur), out);
    row('Loan payment a month', money(r.loanPayment, cur), out);
    row('Years left on the loan', yrs(r.loanYears), out);
  }
  if (r.sell) {
    row('Sell at age', filled(r.sellAge) ? r.sellAge.trim() : null, out);
    if (r.country === 'nl' && r.use === 'home') row('Rent you pay a month after selling', eur(r.rentAfterSale), out);
  }
}

function pensionRows(p: PensionRow, n: number, out: InputRow[]): void {
  const who = p.who === 'you' ? 'you' : 'your partner';
  out.push({ kind: 'sub', label: `${PENSION_KIND[p.kind]} ${n}, for ${who}${filled(p.label) ? `: ${p.label.trim()}` : ''}` });
  if (p.kind === 'in-pension') row('Amount a month', inr(p.amount), out);
  else if (p.kind === 'other') row('Amount a year, after tax', eur(p.amount), out);
  else {
    row('Built up so far, gross a year', eur(p.built), out);
    row('Payable from the normal age, gross a year', eur(p.amount), out);
  }
  row('Paid from age', filled(p.fromAge) ? p.fromAge.trim() : null, out);
  row('Paid until age', filled(p.untilAge) ? p.untilAge.trim() : 'for life', out);
  row('Rises with inflation', p.indexed ? 'Yes' : 'No', out);
}

export function inputGroups(p: Profile): InputGroup[] {
  const groups: InputGroup[] = [];
  const add = (title: string, fill: (out: InputRow[]) => void): void => {
    const rows: InputRow[] = [];
    fill(rows);
    if (rows.length > 0) groups.push({ title, rows });
  };

  add('About you', (o) => {
    row('Age today', filled(p.age) ? p.age.trim() : null, o);
    row('Stop working at age', filled(p.retireAge) ? p.retireAge.trim() : null, o);
    row('Years lived in the Netherlands', filled(p.yearsInNl) ? p.yearsInNl.trim() : null, o);
    row('Household', p.partner ? 'You and a partner' : 'You alone', o);
    if (p.children.length > 0) row('Children, ages', p.children.join(', '), o);
    row('Gross salary a year', eur(p.salary), o);
    if (p.hasRuling) {
      row('30% ruling', `${yrs(p.rulingYears) ?? 'years not given'} left, ${p.rulingBefore2024 ? 'granted before 2024' : 'granted in 2024 or later'}`, o);
    }
  });

  if (p.partner) {
    add('Your partner', (o) => {
      row('Age today', filled(p.pAge) ? p.pAge.trim() : null, o);
      row('Works', p.partnerEarns ? 'Yes' : 'No', o);
      if (p.partnerEarns) {
        row('Stops working at age', filled(p.pRetireAge) ? p.pRetireAge.trim() : null, o);
        row('Gross salary a year', eur(p.pSalary), o);
        if (p.pHasRuling) row('30% ruling', `${yrs(p.pRulingYears) ?? 'years not given'} left, ${p.pRulingBefore2024 ? 'granted before 2024' : 'granted in 2024 or later'}`, o);
      }
    });
  }

  add('Where you retire', (o) => {
    row('Place', PLACE[p.destination], o);
    if (p.destination === 'both') row('Months a year in India', filled(p.monthsInIndia) ? p.monthsInIndia.trim() : 'not given, the planner uses 6', o);
    if (p.destination !== 'nl') {
      row('Where you live in India', p.indiaHome === '' ? null : INDIA_HOME[p.indiaHome], o);
      row('Flights and travel a year', eur(p.travel), o);
    }
  });

  add('Spending', (o) => {
    row('Living costs a month', eur(p.living), o);
    p.expenses.forEach((e, i) => {
      const amount = eur(e.amount);
      if (amount === null) return;
      row(filled(e.label) ? e.label.trim() : `Yearly extra ${i + 1}`, `${amount} a year, until age ${filled(e.untilAge) ? e.untilAge.trim() : 'for life'}`, o);
    });
  });

  add('Savings and gold', (o) => {
    row('Dutch savings (cash)', eur(p.nlCash), o);
    row('Dutch investments', eur(p.nlInvestments), o);
    if (!filled(p.nlCash) && !filled(p.nlInvestments)) row('Savings and investments in the Netherlands', eur(p.savingsQuick), o);
    row('Indian fixed deposits', inr(p.inDeposits), o);
    row('Indian funds and shares', inr(p.inFunds), o);
    row('EPF and PPF balance', inr(p.inEpf), o);
    if (filled(p.goldGrams) || filled(p.jewelleryGrams)) row('Gold price used a gram (24k)', eur(p.goldPrice), o);
    row('Gold bars, coins and funds, grams of pure gold', filled(p.goldGrams) ? p.goldGrams.trim() : null, o);
    if (filled(p.jewelleryGrams)) {
      row('Jewellery, grams', `${p.jewelleryGrams.trim()} at ${p.jewelleryPurity} carat`, o);
      if (p.jewellerySell) row('Jewellery you sell', `${filled(p.jewellerySellShare) ? p.jewellerySellShare.trim() : '100'}% at age ${filled(p.jewellerySellAge) ? p.jewellerySellAge.trim() : 'not given'}, jeweller keeps ${filled(p.jewelleryLoss) ? p.jewelleryLoss.trim() : '0'}%`, o);
    }
  });

  add('Monthly investing', (o) => {
    const any = [p.invNl, p.invCash, p.invIn, p.invGold].some(filled);
    if (p.investMode === 'left') {
      row('How you invest', 'Whatever is left after spending', o);
      return;
    }
    if (!any) return;
    row('How you invest', 'Fixed amounts, the rest is spent', o);
    row('Dutch investments a month', eur(p.invNl), o);
    row('Dutch savings a month', eur(p.invCash), o);
    row('Indian funds a month', inr(p.invIn), o);
    row('Gold a month', eur(p.invGold), o);
    row('Increase every year', filled(p.invStep) ? `${p.invStep.trim().replace('%', '')}%` : null, o);
    row('Stop investing at age', filled(p.invUntil) ? p.invUntil.trim() : null, o);
  });

  if (p.properties.length > 0) {
    add('Property and mortgages', (o) => p.properties.forEach((r, i) => propertyRows(r, i + 1, o)));
  }
  if (p.pensions.length > 0) {
    add('Pensions and other income', (o) => p.pensions.forEach((r, i) => pensionRows(r, i + 1, o)));
  }

  add('Your choices', (o) => {
    row('What should be left at the end', p.legacy === 'intact' ? 'An inheritance: savings kept intact' : 'Nothing: spend it all', o);
    row('Dutch wealth tax (Box 3) from 2028', p.box3 === 'actual' ? 'Tax on the actual yearly return (cautious estimate)' : 'Today’s system continues', o);
  });

  add('Assumptions you changed', (o) => {
    for (const f of ASSUMPTION_FIELDS) {
      const t = (p.assumptions[f.key] ?? '').trim().replace('%', '');
      if (t !== '') row(f.label, f.key === 'planToAge' ? `${t}` : `${t}%`, o);
    }
  });

  return groups;
}
