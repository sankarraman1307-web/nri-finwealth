import {
  QUICK_SAVINGS_CASH_SHARE,
  dutchHomeRow,
  formatEur,
  formatEurFull,
  mortgageSummary,
  parseMoney,
  patchQuickMortgage,
  quickMortgageMode,
  setQuickMortgage,
  withDestination,
  type Profile,
  type ProfileErrors,
} from './profile';

/** The first screen: 7 questions and a first answer. Everything here edits the same Profile as the groups below. */

const wholeOrNull = (t: string): number | null => (/^\d+$/.test(t.trim()) ? Number(t) : null);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

interface Props {
  profile: Profile;
  errors: ProfileErrors;
  eurToInr: number;
  onChange: (next: Profile) => void;
  onOpenGroup: (id: string) => void;
}

function SliderRow(props: { id: string; label: string; value: string; min: number; max: number; error?: string; onChange: (v: string) => void }) {
  const { id, label, value, min, max, error, onChange } = props;
  const n = wholeOrNull(value);
  return (
    <div className="qq-row">
      <div className="qq-head">
        <label htmlFor={id}>{label}</label>
        <input id={id} className="qq-num" value={value} inputMode="numeric" aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, '').slice(0, 3))} />
      </div>
      <input type="range" aria-label={`${label}, slider`} min={min} max={max} value={clamp(n ?? min, min, max)} onChange={(e) => onChange(e.target.value)} />
      {error ? <div className="err">{error}</div> : null}
    </div>
  );
}

/** One chip per range. A chip sets the middle of its range, which is what the plan then uses. */
function MoneyRow(props: {
  id: string;
  label: string;
  value: string;
  options: { label: string; value: number }[];
  error?: string;
  onChange: (v: string) => void;
  note?: string;
}) {
  const { id, label, value, options, error, onChange, note } = props;
  const cur = parseMoney(value, 'eur');
  return (
    <div className="qq-row">
      <div className="qq-head">
        <span id={`${id}-l`} className="qq-label">{label}</span>
        <b className="qq-big">{cur !== null ? formatEur(cur) : '—'}</b>
      </div>
      <div className="chips" role="group" aria-labelledby={`${id}-l`}>
        {options.map((o) => {
          const on = cur !== null && cur === o.value;
          return (
            <button key={o.label} type="button" className={on ? 'chip on' : 'chip'} aria-pressed={on} onClick={() => onChange(String(o.value))}>
              {o.label}
            </button>
          );
        })}
      </div>
      <div className="field qq-exact">
        <label htmlFor={id}>Or type the exact amount, €</label>
        <input id={id} value={value} inputMode="decimal" aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value)} />
      </div>
      {error ? <div className="err">{error}</div> : note ? <div className="hint">{note}</div> : null}
    </div>
  );
}

const SAVINGS_OPTIONS = [
  { label: 'Under 50k', value: 35_000 },
  { label: '50 to 150k', value: 100_000 },
  { label: '150 to 300k', value: 225_000 },
  { label: '300 to 600k', value: 450_000 },
  { label: '600k and up', value: 800_000 },
];
const SALARY_OPTIONS = [
  { label: 'Under 50k', value: 40_000 },
  { label: '50 to 75k', value: 62_500 },
  { label: '75 to 100k', value: 87_500 },
  { label: '100 to 150k', value: 125_000 },
  { label: '150k and up', value: 180_000 },
];
const SPEND_OPTIONS = [
  { label: 'Under 2.5k', value: 2_000 },
  { label: '2.5 to 3.5k', value: 3_000 },
  { label: '3.5 to 5k', value: 4_250 },
  { label: '5 to 7k', value: 6_000 },
  { label: '7k and up', value: 8_500 },
];

export default function QuickQuestions({ profile, errors, eurToInr, onChange, onOpenGroup }: Props) {
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => onChange({ ...profile, [key]: value });
  const months = wholeOrNull(profile.monthsInIndia);
  const monthsShown = clamp(months ?? 6, 1, 11);

  const detailedSavings = profile.nlCash.trim() !== '' || profile.nlInvestments.trim() !== '';
  const detailedTotal = (parseMoney(profile.nlCash, 'eur') ?? 0) + (parseMoney(profile.nlInvestments, 'eur') ?? 0);

  const mode = quickMortgageMode(profile);
  const home = dutchHomeRow(profile);
  const mortgageOn = home?.hasLoan === true;
  const summary = mortgageSummary(profile, eurToInr);
  const payTyped = home ? home.loanPayment.trim() !== '' : false;
  const yearsTyped = home ? home.loanYears.trim() !== '' : false;

  return (
    <section className="quick" aria-label="7 quick questions">
      <h2 className="panelTitle">7 quick questions</h2>
      <p className="muted">Answer 7 quick questions and see a first answer straight away. Add more detail later only if you want a sharper result.</p>

      <div className="qq-row">
        <span id="qq-place" className="qq-label">1. Where do you want to retire?</span>
        <div className="seg3" role="group" aria-labelledby="qq-place">
          {(['nl', 'in', 'both'] as const).map((d) => (
            <button key={d} type="button" className={profile.destination === d ? 'on' : ''} aria-pressed={profile.destination === d} onClick={() => onChange(withDestination(profile, d))}>
              {d === 'nl' ? 'Netherlands' : d === 'in' ? 'India' : 'Both'}
            </button>
          ))}
        </div>
        {profile.destination === 'both' ? (
          <>
            <div className="qq-head">
              <label htmlFor="qq-months">Months a year in India</label>
              <b className="qq-big">{monthsShown} in India, {12 - monthsShown} in the Netherlands</b>
            </div>
            <input id="qq-months" type="range" min={1} max={11} value={monthsShown} onChange={(e) => set('monthsInIndia', e.target.value)} />
            {errors.monthsInIndia ? <div className="err">{errors.monthsInIndia}</div> : null}
            {monthsShown >= 4 ? (
              <div className="qq-warn" role="note">
                <strong>Careful with 4 months or more.</strong> From about 4 to 6 months a year you may count as a tax resident of India as well. Check this with an adviser before you plan it.
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <SliderRow id="qq-age" label="2. Your age" value={profile.age} min={25} max={70} error={errors.age} onChange={(v) => set('age', v)} />
      <SliderRow id="qq-retire" label="3. Age you want to stop working" value={profile.retireAge} min={40} max={75} error={errors.retireAge} onChange={(v) => set('retireAge', v)} />
      <SliderRow id="qq-years" label="4. Years you have lived in the Netherlands" value={profile.yearsInNl} min={0} max={45} error={errors.yearsInNl} onChange={(v) => set('yearsInNl', v)} />

      {detailedSavings ? (
        <div className="qq-row">
          <div className="qq-head">
            <span className="qq-label">5. Savings and investments today</span>
            <b className="qq-big">{formatEur(detailedTotal)}</b>
          </div>
          <div className="hint">Taken from the cash and investments you entered under Savings and gold. Change them there.</div>
          <button type="button" className="linkbtn" onClick={() => onOpenGroup('savings')}>Open Savings and gold</button>
        </div>
      ) : (
        <MoneyRow
          id="qq-savings"
          label="5. Savings and investments today"
          value={profile.savingsQuick}
          options={SAVINGS_OPTIONS}
          onChange={(v) => set('savingsQuick', v)}
          error={profile.savingsQuick.trim() !== '' ? errors.savingsQuick : undefined}
          note={`Everything you have saved in the Netherlands, not your home. Until you split it under Savings and gold, we treat ${Math.round(QUICK_SAVINGS_CASH_SHARE * 100)}% as cash and ${Math.round((1 - QUICK_SAVINGS_CASH_SHARE) * 100)}% as investments. Enter 0 if you have none.`}
        />
      )}

      <MoneyRow id="qq-salary" label="6. Gross salary a year" value={profile.salary} options={SALARY_OPTIONS} error={errors.salary} onChange={(v) => set('salary', v)} />
      <MoneyRow
        id="qq-living"
        label="7. What you spend a month (include rent if you rent, leave out your mortgage)"
        value={profile.living}
        options={SPEND_OPTIONS}
        error={errors.living}
        onChange={(v) => set('living', v)}
      />

      <div className="qq-row">
        {mode === 'edit' ? (
          <>
            <label className="qq-check">
              <input type="checkbox" checked={mortgageOn} onChange={(e) => onChange(setQuickMortgage(profile, e.target.checked, newId))} />
              <span>
                I pay a mortgage
                <small>Keep it out of your spending. It is counted once, and the same mortgage shows under Property.</small>
              </span>
            </label>
            {mortgageOn && home ? (
              <>
                <div className="two qq-two">
                  <div className="field">
                    <label htmlFor="qq-pay">Payment a month, €</label>
                    <input id="qq-pay" value={home.loanPayment} inputMode="decimal" onChange={(e) => onChange(patchQuickMortgage(profile, { loanPayment: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label htmlFor="qq-yrs">Years left</label>
                    <input id="qq-yrs" value={home.loanYears} inputMode="numeric" onChange={(e) => onChange(patchQuickMortgage(profile, { loanYears: e.target.value.replace(/[^\d]/g, '').slice(0, 2) }))} />
                  </div>
                </div>
                {!payTyped || !yearsTyped ? <div className="hint">Fill in both and your answer updates.</div> : null}
              </>
            ) : null}
          </>
        ) : (
          <div className="qq-summary">
            <div className="qq-head">
              <strong>{summary.count} {summary.count === 1 ? 'mortgage' : 'mortgages'}</strong>
              <span className="qq-ok">Counted once</span>
            </div>
            <div>
              {summary.count === 1 && summary.lastEndAge !== null
                ? `About ${formatEurFull(summary.monthlyEur)} a month, ending at age ${summary.lastEndAge}.`
                : `About ${formatEurFull(summary.monthlyEur)} a month in total, each ending on its own date.`}
            </div>
            {summary.hasRupeeLoan ? <div className="hint">The rupee loan is converted at today&rsquo;s rate.</div> : null}
            <button type="button" className="qq-edit" onClick={() => onOpenGroup('property')}>Edit under Property and mortgages</button>
          </div>
        )}
      </div>

      <div className="qq-row last">
        <label className="qq-check">
          <input
            type="checkbox"
            checked={profile.hasRuling}
            onChange={(e) => onChange({ ...profile, hasRuling: e.target.checked, rulingYears: e.target.checked && profile.rulingYears.trim() === '' ? '3' : profile.rulingYears })}
          />
          <span>
            I have the 30% ruling
            <small>It changes how much you can save soon.</small>
          </span>
        </label>
        {profile.hasRuling ? (
          <>
            <span id="qq-ruling" className="lbl">Years it still runs, counting this year</span>
            <div className="chips" role="group" aria-labelledby="qq-ruling">
              {['1', '2', '3', '4', '5'].map((y) => (
                <button key={y} type="button" className={profile.rulingYears === y ? 'chip on' : 'chip'} aria-pressed={profile.rulingYears === y} onClick={() => set('rulingYears', y)}>
                  {y}
                </button>
              ))}
            </div>
            <div className="hint">We assumed 3. Check your ruling letter for the end date.</div>
          </>
        ) : null}
      </div>
    </section>
  );
}

/** What each optional group adds to the accuracy of the answer. */
export interface Booster {
  id: string;
  name: string;
  note: string;
  gain: 'Big gain' | 'Medium gain' | 'Optional';
  done: boolean;
}

export function boosters(p: Profile): Booster[] {
  const filled = (...t: string[]) => t.some((x) => x.trim() !== '');
  return [
    { id: 'pensions', name: 'Pensions', note: 'AOW, company pension', gain: 'Big gain', done: p.pensions.length > 0 },
    {
      id: 'savings',
      name: 'Split of your savings',
      note: 'Cash, ETFs, gold, India',
      gain: 'Medium gain',
      done: filled(p.nlCash, p.nlInvestments, p.inDeposits, p.inFunds, p.inEpf, p.goldGrams, p.jewelleryGrams),
    },
    { id: 'property', name: 'Property', note: 'In the Netherlands or India', gain: 'Medium gain', done: p.properties.length > 0 },
    { id: 'you', name: 'Partner and children', note: 'Their ages and income', gain: 'Medium gain', done: p.partner || p.children.length > 0 },
    { id: 'assumptions', name: 'Assumptions', note: 'Returns, inflation, tax regime', gain: 'Optional', done: Object.values(p.assumptions).some((v) => v.trim() !== '') || p.box3 !== 'deemed' },
  ];
}

/** A rough guide to how much detail the answer rests on. It is not a statistical error bar. */
export function accuracyLevel(p: Profile): { filled: number; label: string; next: Booster | null } {
  const b = boosters(p);
  const done = (id: string) => b.find((x) => x.id === id)?.done === true;
  const points = (done('pensions') ? 2 : 0) + (done('savings') ? 1 : 0) + (done('property') ? 1 : 0) + (done('you') ? 1 : 0);
  const filled = 1 + (points >= 2 ? 1 : 0) + (points >= 3 ? 1 : 0) + (points >= 5 ? 1 : 0);
  const label = ['Rough estimate', 'Fair estimate', 'Good estimate', 'Detailed estimate'][filled - 1] ?? 'Rough estimate';
  const next = b.find((x) => !x.done && x.gain !== 'Optional') ?? null;
  return { filled, label, next };
}

export function AccuracyPanel({ profile, onOpenGroup }: { profile: Profile; onOpenGroup: (id: string) => void }) {
  const { filled, label, next } = accuracyLevel(profile);
  const list = boosters(profile);
  return (
    <section className="accuracy" aria-label="How accurate is this?">
      <div className="acc-head">
        <h3>How accurate is this?</h3>
        <strong className={filled >= 3 ? 'acc-good' : 'acc-rough'}>{label}</strong>
      </div>
      <div className="acc-meter" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={i <= filled ? 'on' : ''} />
        ))}
      </div>
      <p className="muted small">
        {next ? `${next.name} is the next biggest gain. Every group is optional: skip any you do not know.` : 'You have added the main details. The rest is optional.'}
      </p>
      <ul className="acc-list">
        {list.map((b) => (
          <li key={b.id}>
            <button type="button" onClick={() => onOpenGroup(b.id)}>
              <span className={b.done ? 'acc-dot done' : 'acc-dot'} aria-hidden="true">{b.done ? '✓' : '+'}</span>
              <span className="acc-text">
                <b>{b.name}</b>
                <small>{b.note}</small>
              </span>
              <span className={b.done ? 'gtag done' : 'gtag'}>{b.done ? 'Done' : b.gain}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
