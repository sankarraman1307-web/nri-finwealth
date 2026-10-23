import type { HouseholdRuling } from '../engine';
import { formatEur, formatEurFull } from './profile';

const POSS = { you: 'your', partner: 'your partner\u2019s' } as const;

/** What the 30% ruling is worth to the household, when take-home pay drops, and what investing the extra could add up to. */
export default function RulingCard({ r }: { r: HouseholdRuling }) {
  const two = r.people.length > 1;
  const short = r.final.leftToSaveAfter < 0;
  const mortgageEnds = r.final.spendMonthlyAfter < r.spendMonthlyNow - 0.5;

  // Two events in one year (for example both rulings stepping down in 2027) share one "take-home after" figure.
  const byYear = new Map<number, { drops: { text: string; amount: number }[]; net: number }>();
  for (const e of r.events) {
    const entry = byYear.get(e.year) ?? { drops: [], net: e.householdNetAfter };
    entry.drops.push({
      text: e.kind === 'step2027' ? `${POSS[e.who]} ruling steps down from 30% to 27%` : `${POSS[e.who]} ruling ends`,
      amount: e.monthlyDrop,
    });
    entry.net = e.householdNetAfter;
    byYear.set(e.year, entry);
  }

  return (
    <section className="card ruling">
      <h3>{two ? 'Your household’s 30% rulings' : 'Your 30% ruling'}</h3>
      <p>
        {two ? 'Together the rulings' : 'The ruling'} give your household about <strong>{formatEurFull(r.benefitMonthlyNow)} a month</strong> extra take-home pay this year. Household take-home pay is about{' '}
        {formatEurFull(r.householdNetNow)} a month with {two ? 'them' : 'it'} and {formatEurFull(r.householdNetWithoutRuling)} without.
      </p>
      {two ? (
        <ul className="plain">
          {r.people.map((p) => (
            <li key={p.who}>
              <strong>{p.who === 'you' ? 'You' : 'Your partner'}</strong>: {formatEurFull(p.benefitMonthlyNow)} a month extra, ruling runs through {p.lastRulingYear}
              {p.endYear === null ? ' (you stop working first)' : ''}.
            </li>
          ))}
        </ul>
      ) : null}

      <div className="ruleBox good">
        <strong>Invest the extra</strong>
        <p>
          Your spending is about {formatEurFull(r.spendMonthlyNow)} a month, so about {formatEurFull(Math.max(0, r.leftToSaveNow))} a month is left to save. If you invest the rulings&rsquo; extra pay through{' '}
          {r.invest.lastYear}, you put in about {formatEur(r.invest.totalContributed)}, which could grow to about <strong>{formatEur(r.invest.projectedAtEnd)}</strong> (at{' '}
          {(r.invest.assumedNetReturn * 100).toFixed(1)}% a year after Box 3 tax, in today&rsquo;s euros). Money spent on a bigger lifestyle now has to be paid for from a smaller income later.
        </p>
      </div>

      {byYear.size > 0 ? (
        <div className={`ruleBox ${short ? 'bad' : 'warn'}`}>
          <strong>When your take-home pay drops</strong>
          <div className="stack">
            {[...byYear.entries()].map(([year, entry]) => (
              <div className="ev" key={year}>
                <span>
                  <strong>{year}</strong>: {entry.drops.map((d) => `${d.text} (−${formatEurFull(d.amount)} a month)`).join('; ')}
                </span>
                <span>
                  now about <strong>{formatEurFull(entry.net)}</strong>
                </span>
              </div>
            ))}
          </div>
          <p>
            Once the last ruling has ended in {r.final.year}, household take-home pay is about {formatEurFull(r.final.householdNetAfter)} a month, {Math.round(r.final.dropPct * 100)}% below where it was in {r.final.year - 1}.
            {mortgageEnds ? ` Your spending also falls to about ${formatEurFull(r.final.spendMonthlyAfter)} a month because your mortgage ends by then.` : ` Your spending stays around ${formatEurFull(r.final.spendMonthlyAfter)} a month.`}{' '}
            {short
              ? `That leaves you short by about ${formatEurFull(-r.final.leftToSaveAfter)} a month, so you would draw on savings just to live. Cut costs or build a bigger buffer before then.`
              : `You would still have about ${formatEurFull(r.final.leftToSaveAfter)} a month left to save.`}
          </p>
        </div>
      ) : null}

      <p className="muted small">
        Uses today&rsquo;s salaries and the 2026 and 2027 rules, no raises, and no Dutch tax credits. The salary cap of €262,000 for the ruling is applied per person. Check the exact end dates with your employer or the Belastingdienst.
      </p>
    </section>
  );
}
