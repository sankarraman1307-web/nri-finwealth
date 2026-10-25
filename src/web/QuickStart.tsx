import QuickQuestions, { AccuracyPanel, boosters } from './QuickQuestions';
import { countryPack } from '../engine';
import { INDIA_HOME_FACTOR, mortgageSummary, ASSUMPTION_FIELDS, assumptionDefault, newPension, EARLY_PENSION_CUT_PER_YEAR, GOLD_PRICE_AS_OF, withDestination, formatEur, formatEurFull, formatInr, newProperty, parseMoney, type Currency, type Profile, type ProfileErrors, type PensionErrors, type PensionRow, type PropertyErrors, type PropertyRow } from './profile';

interface Props {
  profile: Profile;
  errors: ProfileErrors;
  propertyErrors: Record<string, PropertyErrors>;
  pensionErrors: Record<string, PensionErrors>;
  assumptionErrors: Record<string, string>;
  eurToInr: number;
  rateIsLive: boolean;
  onChange: (next: Profile) => void;
  /** Edits made on the quick questions: these update the answer by themselves, without pressing Run. */
  /** Errors for the quick questions, shown as you type (the groups below only show theirs after a Run). */
  liveErrors: ProfileErrors;
  onQuickChange: (next: Profile) => void;
  onOpenGroup: (id: string) => void;
  onClearMine: () => void;
  open: Record<string, boolean>;
  onToggle: (id: string) => void;
  onSetAll: (open: boolean) => void;
  dirty: boolean;
  hasResults: boolean;
  running: boolean;
  onRun: () => void;
}

/** Which form fields live in which group, so a group can show "Needs a fix" and open itself. */
export const GROUPS: { id: string; title: string; fields: (keyof Profile)[] }[] = [
  { id: 'you', title: 'You and your household', fields: ['age', 'retireAge', 'yearsInNl', 'children', 'partner', 'pAge'] },
  { id: 'retire', title: 'Where you retire', fields: ['destination', 'monthsInIndia', 'travel', 'indiaHome'] },
  { id: 'income', title: 'Income and 30% ruling', fields: ['salary', 'rulingYears', 'pRetireAge', 'pSalary', 'pRulingYears'] },
  { id: 'pensions', title: 'Pensions and other income', fields: ['pensions'] },
  { id: 'spending', title: 'Spending', fields: ['living', 'expenses'] },
  { id: 'savings', title: 'Savings and gold', fields: ['nlCash', 'nlInvestments', 'inDeposits', 'inFunds', 'inEpf', 'goldPrice', 'goldGrams', 'jewelleryGrams', 'jewellerySellAge', 'jewellerySellShare', 'jewelleryLoss', 'investMode', 'invNl', 'invCash', 'invIn', 'invGold', 'invStep', 'invUntil'] },
  { id: 'property', title: 'Property and mortgages', fields: ['properties'] },
  { id: 'assumptions', title: 'Assumptions', fields: ['assumptions', 'box3'] },
];

export const groupOfField = (field: string): string | undefined => GROUPS.find((g) => (g.fields as string[]).includes(field))?.id;

function Group(props: { id: string; n: number; title: string; summary: string; open: boolean; hasError: boolean; tag?: { text: string; done: boolean }; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section className={`group ${props.open ? 'open' : ''}`} data-g={props.id}>
      <button type="button" className="ghead" aria-expanded={props.open} aria-controls={`g-${props.id}`} onClick={props.onToggle}>
        <span className="gnum" aria-hidden="true">{props.n}</span>
        <span className="gtext">
          <span className="gtitle">
            {props.title}
            {props.hasError ? <span className="gerr">Needs a fix</span> : null}
            {props.tag ? <span className={props.tag.done ? 'gtag done' : 'gtag'}>{props.tag.text}</span> : null}
          </span>
          <span className="gsum">{props.summary}</span>
        </span>
        <span className="chev" aria-hidden="true">{props.open ? '\u25B4' : '\u25BE'}</span>
      </button>
      {props.open ? (
        <div className="gbody" id={`g-${props.id}`}>
          {props.children}
        </div>
      ) : null}
    </section>
  );
}

const asInt = (t: string): number | null => (/^\d+$/.test(t.trim()) ? Number(t) : null);

/** One-line digest of each group, built leniently because a field may be half typed. */
function summaries(p: Profile, eurToInr: number): Record<string, string> {
  const eur = (t: string) => parseMoney(t, 'eur');
  const inr = (t: string) => parseMoney(t, 'inr');
  const kids = p.children.length;
  const extras = p.expenses.reduce((sum, r) => sum + (eur(r.amount) ?? 0), 0);
  const nl = (eur(p.nlCash) ?? 0) + (eur(p.nlInvestments) ?? 0);
  const india = [p.inDeposits, p.inFunds, p.inEpf].reduce((sum, t) => sum + (inr(t) ?? 0), 0);
  const sal = eur(p.salary);
  const living = eur(p.living);
  const price = eur(p.goldPrice) ?? 0;
  const pure = (t: string) => {
    const m = /^(\d*\.?\d+)/.exec(t.trim());
    return m ? Number(m[1]) : 0;
  };
  const goldTotal = (pure(p.goldGrams) + (pure(p.jewelleryGrams) * Number(p.jewelleryPurity)) / 24) * price;
  const nlCount = p.properties.filter((r) => r.country === 'nl').length;
  const inCount = p.properties.filter((r) => r.country === 'in').length;
  return {
    you: p.age.trim() === '' && p.retireAge.trim() === '' ? 'Not filled in yet' : `Age ${asInt(p.age) ?? '?'}, stop at ${asInt(p.retireAge) ?? '?'} \u00B7 ${p.partner ? 'with a partner' : 'alone'}${kids ? `, ${kids} child${kids > 1 ? 'ren' : ''}` : ''}`,
    income: p.salary.trim() === '' ? 'Not filled in yet' : `${sal === null ? '?' : formatEur(sal)} salary${p.hasRuling ? ` \u00B7 30% ruling, ${asInt(p.rulingYears) ?? '?'} yr` : ''}${p.partner && p.partnerEarns ? ` \u00B7 partner ${eur(p.pSalary) === null ? '?' : formatEur(eur(p.pSalary) as number)}` : ''}`,
    spending: p.living.trim() === '' ? 'Not filled in yet' : `${living === null ? '?' : formatEurFull(living)} a month${extras > 0 ? ` \u00B7 extras ${formatEur(extras)} a year` : ''}`,
    savings: nl + india + goldTotal === 0 ? 'Nothing entered' : `Netherlands ${formatEur(nl)} \u00B7 India ${formatInr(india)}${goldTotal > 0 ? ` \u00B7 gold ${formatEur(goldTotal)}` : ''}`,
    property:
      p.properties.length === 0
        ? 'None added: add each property you own'
        : (() => {
            const ms = mortgageSummary(p, eurToInr);
            const n = p.properties.length;
            const where = [nlCount ? `${nlCount} in the Netherlands` : '', inCount ? `${inCount} in India` : ''].filter(Boolean).join(', ');
            if (ms.count === 0) return `${n} ${n === 1 ? 'property' : 'properties'} (${where}) \u00B7 no mortgage`;
            const end = ms.lastEndAge === null ? '' : ms.count === 1 ? ` \u00B7 ends at age ${ms.lastEndAge}` : ` \u00B7 the last one ends at age ${ms.lastEndAge}`;
            return `${n} ${n === 1 ? 'property' : 'properties'} \u00B7 ${ms.count} ${ms.count === 1 ? 'mortgage' : 'mortgages'} \u00B7 about ${formatEur(ms.monthlyEur)} a month${end}`;
          })(),
    pensions: p.pensions.length === 0 ? 'Only the state pension (AOW) so far' : `${p.pensions.length} line${p.pensions.length > 1 ? 's' : ''} added, on top of AOW`,
    assumptions: Object.values(p.assumptions).filter((v) => v.trim() !== '').length === 0 ? 'Using the standard assumptions' : `${Object.values(p.assumptions).filter((v) => v.trim() !== '').length} changed by you`,
    retire: p.destination === 'nl' ? 'Netherlands' : p.destination === 'in' ? 'India' : `Both: ${asInt(p.monthsInIndia) ?? '?'} months a year in India`,
  };
}

function Field(props: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  inputMode?: 'numeric' | 'decimal' | 'text';
}) {
  const { id, label, value, onChange, error, hint, inputMode = 'decimal' } = props;
  const note = error ?? hint;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value}
        inputMode={inputMode}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? `${id}-note` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {note ? (
        <div id={`${id}-note`} className={error ? 'err' : 'hint'}>
          {note}
        </div>
      ) : null}
    </div>
  );
}

function Chips(props: { options: { label: string; value: string }[]; current: string; currency: Currency; onPick: (v: string) => void }) {
  const cur = parseMoney(props.current, props.currency);
  return (
    <div className="chips">
      {props.options.map((o) => {
        const on = cur !== null && cur === parseMoney(o.value, props.currency);
        return (
          <button key={o.label} type="button" className={on ? 'chip on' : 'chip'} aria-pressed={on} onClick={() => props.onPick(o.value)}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const newPropertyId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const USE_LABEL: Record<PropertyRow['country'], { value: PropertyRow['use']; label: string }[]> = {
  nl: [
    { value: 'home', label: 'I live in it' },
    { value: 'rented', label: 'Rented out' },
    { value: 'empty', label: 'Empty' },
  ],
  in: [
    { value: 'rented', label: 'Rented out' },
    { value: 'empty', label: 'Empty, or family lives in it' },
  ],
};

/** One property with its own mortgage, rent and sale. Every loan sits inside the property it belongs to. */
function PropertyCard(props: {
  row: PropertyRow;
  index: number;
  errors: PropertyErrors;
  age: number | null;
  retire: number | null;
  onChange: (patch: Partial<PropertyRow>) => void;
  onRemove: () => void;
}) {
  const { row, index, errors: e, age, retire, onChange, onRemove } = props;
  // A Dutch home you keep can carry a mortgage without a value or a balance: the quick questions only ask for the payment.
  const homeKept = row.country === 'nl' && row.use === 'home' && !row.sell;
  const inIndia = row.country === 'in';
  const cur: Currency = inIndia ? 'inr' : 'eur';
  const sym = inIndia ? '\u20B9' : '\u20AC';
  const fmt = (n: number) => (inIndia ? formatInr(n) : formatEur(n));
  const value = parseMoney(row.value, cur);
  const pay = parseMoney(row.loanPayment, cur);
  const bal = parseMoney(row.loanBalance, cur);
  const years = /^\d+$/.test(row.loanYears.trim()) ? Number(row.loanYears) : null;
  const id = (k: string) => `${row.id}-${k}`;
  const use = USE_LABEL[row.country].some((u) => u.value === row.use) ? row.use : USE_LABEL[row.country][0]?.value ?? 'empty';

  let loanNote: string | null = null;
  if (row.hasLoan && pay && years) {
    const end = age ? age + years : null;
    loanNote = inIndia
      ? `Your instalment of ${formatInr(pay)} a month stops after ${years} years${end ? `, at age ${end}` : ''}. It is fixed in rupees, so a weaker rupee makes it cost fewer euros.`
      : `Your spending drops by ${formatEurFull(pay)} a month${end ? ` at age ${end}` : ''}.`;
    if (end && retire !== null) loanNote += retire < end ? ` If you stop working at ${retire}, your savings carry this loan for ${end - retire} years, and the plan accounts for that.` : ' It ends before you plan to stop working.';
  }

  return (
    <section className="qcard pcard" data-country={row.country}>
      <div className="phead">
        <h3>
          Property {index + 1} <span className="tag">{inIndia ? 'India' : 'Netherlands'}</span>
          {row.country === 'nl' && row.use === 'home' && row.hasLoan ? <span className="tag quick">Shared with your quick answers</span> : null}
        </h3>
        <button type="button" className="linkbtn" onClick={onRemove} aria-label={`Remove property ${index + 1}`}>
          Remove
        </button>
      </div>

      <div className="seg" role="group" aria-label="Where is it">
        {(['nl', 'in'] as const).map((c) => (
          <button
            key={c}
            type="button"
            className={row.country === c ? 'on' : ''}
            aria-pressed={row.country === c}
            onClick={() => (row.country === c ? undefined : onChange({ country: c, use: c === 'nl' ? 'home' : 'empty' }))}
          >
            {c === 'nl' ? 'Netherlands' : 'India'}
          </button>
        ))}
      </div>

      <div className="seg" role="group" aria-label="How you use it">
        {USE_LABEL[row.country].map((u) => (
          <button key={u.value} type="button" className={use === u.value ? 'on' : ''} aria-pressed={use === u.value} onClick={() => onChange({ use: u.value })}>
            {u.label}
          </button>
        ))}
      </div>
      {e.use ? <div className="err">{e.use}</div> : null}

      <div className="two">
        <Field id={id('value')} label={`Worth today (${sym})`} value={row.value} onChange={(v) => onChange({ value: v })} error={e.value} hint={value !== null && !e.value ? `= ${fmt(value)}` : inIndia ? 'Try "1.2 crore".' : homeKept && row.hasLoan ? 'Optional while you keep it. Needed if you sell.' : undefined} />
        {use === 'rented' ? (
          <Field id={id('rent')} label={`Rent a month, after tax (${sym})`} value={row.rent} onChange={(v) => onChange({ rent: v })} error={e.rent} />
        ) : (
          <div />
        )}
      </div>

      <label className="switch">
        <input type="checkbox" checked={row.hasLoan} onChange={(ev) => onChange({ hasLoan: ev.target.checked })} />
        <span>{inIndia ? 'There is a loan on this property' : 'There is a mortgage on this property'}</span>
      </label>
      {row.hasLoan ? (
        <>
          <div className="two">
            <Field id={id('pay')} label={`Monthly ${inIndia ? 'instalment' : 'payment'} (${sym})`} value={row.loanPayment} onChange={(v) => onChange({ loanPayment: v })} error={e.loanPayment} hint={pay !== null && !e.loanPayment ? `= ${fmt(pay)} a month` : undefined} />
            <Field id={id('yrs')} label="Years left" value={row.loanYears} onChange={(v) => onChange({ loanYears: v })} error={e.loanYears} inputMode="numeric" />
          </div>
          <Field id={id('bal')} label={`Still owed (${sym})`} value={row.loanBalance} onChange={(v) => onChange({ loanBalance: v })} error={e.loanBalance} hint={bal === null && homeKept ? 'Not needed unless you sell.' : bal !== null && !e.loanBalance ? `= ${fmt(bal)}. Used to repay the loan if you sell this property.` : 'Used to repay the loan if you sell this property.'} />
          {loanNote ? <div className="note">{loanNote}</div> : null}
        </>
      ) : null}

      <label className="switch">
        <input type="checkbox" checked={row.sell} onChange={(ev) => onChange({ sell: ev.target.checked })} />
        <span>{use === 'home' ? 'I would sell it and rent instead' : 'I would sell it at some age'}</span>
      </label>
      {row.sell ? (
        <div className="two">
          <Field id={id('sell')} label="Sell at age" value={row.sellAge} onChange={(v) => onChange({ sellAge: v })} error={e.sellAge} inputMode="numeric" />
          {inIndia ? (
            <Field id={id('cost')} label="Purchase price (₹)" value={row.costBasis} onChange={(v) => onChange({ costBasis: v })} error={e.costBasis} hint="What you paid when you bought it. Sets the capital gains tax." />
          ) : use === 'home' ? (
            <Field id={id('ras')} label="Rent after, € a month" value={row.rentAfterSale} onChange={(v) => onChange({ rentAfterSale: v })} error={e.rentAfterSale} />
          ) : (
            <div />
          )}
        </div>
      ) : (
        <div className="note">Kept: it will not fund your retirement in this plan.</div>
      )}
    </section>
  );
}

const HOME = countryPack(undefined);

const PENSION_TITLE: Record<PensionRow['kind'], string> = {
  aow: `State pension (${HOME.labels.statePension})`,
  'nl-employer': 'Workplace pension (Netherlands)',
  annuity: 'Voluntary or private pension',
  'in-pension': 'Indian pension',
  other: 'Other income',
};

/** One pension or income line, for you or your partner. */
function PensionCard(props: {
  row: PensionRow;
  errors: PensionErrors;
  partner: boolean;
  age: number | null;
  retire: number | null;
  onChange: (patch: Partial<PensionRow>) => void;
  onRemove: () => void;
}) {
  const { row, errors: e, partner, age, retire, onChange, onRemove } = props;
  const id = (k: string) => `${row.id}-${k}`;
  const inr = row.kind === 'in-pension';
  const cur: Currency = inr ? 'inr' : 'eur';
  const amt = parseMoney(row.amount, cur);
  const built = row.built.trim() === '' ? 0 : parseMoney(row.built, 'eur');
  let note: string | null = null;
  if ((row.kind === 'nl-employer' || row.kind === 'annuity') && amt !== null && built !== null && amt >= built && row.who === 'you' && age !== null && retire !== null) {
    const left = Math.max(0, 68 - age);
    const worked = Math.min(left, Math.max(0, retire - age));
    const at = left === 0 ? amt : built + ((amt - built) * worked) / left;
    const from = /^\d+$/.test(row.fromAge.trim()) ? Number(row.fromAge) : 68;
    const cut = Math.max(0, 1 - EARLY_PENSION_CUT_PER_YEAR * Math.max(0, 68 - from));
    note = `If you stop at ${retire}, you keep about ${formatEurFull((at * cut) / 12)} a month in today's money${cut < 1 ? `, after a ${Math.round((1 - cut) * 100)}% cut for starting before 68` : ''}.`;
  }
  return (
    <section className="qcard pcard">
      <div className="phead">
        <h3>
          {PENSION_TITLE[row.kind]} <span className="tag">{row.who === 'you' ? 'You' : 'Partner'}</span>
        </h3>
        <button type="button" className="linkbtn" onClick={onRemove} aria-label={`Remove ${PENSION_TITLE[row.kind]}`}>
          Remove
        </button>
      </div>
      {partner ? (
        <div className="seg" role="group" aria-label="Whose is it">
          {(['you', 'partner'] as const).map((w) => (
            <button key={w} type="button" className={row.who === w ? 'on' : ''} aria-pressed={row.who === w} onClick={() => onChange({ who: w })}>
              {w === 'you' ? 'Mine' : "My partner's"}
            </button>
          ))}
        </div>
      ) : null}
      {e.who ? <div className="err">{e.who}</div> : null}
      {row.kind === 'aow' || row.kind === 'nl-employer' || row.kind === 'annuity' ? (
        <>
          <p className="muted small">
            Find both numbers, gross per year, on <a href="https://www.mijnpensioenoverzicht.nl" target="_blank" rel="noopener noreferrer">mijnpensioenoverzicht.nl</a>.
            {row.kind === 'aow' ? ' Blank = we estimate your AOW from the years you have lived in the Netherlands.' : ''}
          </p>
          <div className="two">
            <Field id={id('built')} label="Built up so far, € a year" value={row.built} onChange={(v) => onChange({ built: v })} error={e.built} hint={built !== null && built > 0 ? `= ${formatEur(built)} a year, ${formatEurFull(built / 12)} a month` : 'Gross. Blank if unknown.'} />
            <Field id={id('amount')} label="Payable from age 68, € a year" value={row.amount} onChange={(v) => onChange({ amount: v })} error={e.amount} hint={amt !== null && !e.amount ? `= ${formatEur(amt)} a year, ${formatEurFull(amt / 12)} a month` : 'Gross, at the official pension age.'} />
          </div>
          {row.kind !== 'aow' && /^\d+$/.test(row.fromAge.trim()) && Number(row.fromAge) < 63 ? (
            <div className="note">Starting more than 5 years before 68 is often not allowed. Ask your pension fund first.</div>
          ) : null}
          {row.kind === 'aow' ? null : (
            <div className="two">
              <Field id={id('from')} label="Starts at age" value={row.fromAge} onChange={(v) => onChange({ fromAge: v })} error={e.fromAge} inputMode="numeric" hint="Blank = 68. Check with your pension fund that starting earlier is allowed. If it is, we cut 6% for every year as a rough guess." />
              {row.kind === 'annuity' ? <Field id={id('until')} label="Ends at age" value={row.untilAge} onChange={(v) => onChange({ untilAge: v })} error={e.untilAge} inputMode="numeric" hint="Blank = for life." /> : <div />}
            </div>
          )}
        </>
      ) : null}
      {row.kind === 'in-pension' ? (
        <>
          <div className="two">
            <Field id={id('amount')} label="Monthly pension, ₹" value={row.amount} onChange={(v) => onChange({ amount: v })} error={e.amount} hint={amt !== null ? `= ${formatInr(amt)}` : undefined} />
            <Field id={id('from')} label="Starts at age" value={row.fromAge} onChange={(v) => onChange({ fromAge: v })} error={e.fromAge} inputMode="numeric" hint="Blank = 60." />
          </div>
          <Field id={id('until')} label="Ends at age" value={row.untilAge} onChange={(v) => onChange({ untilAge: v })} error={e.untilAge} inputMode="numeric" hint="Blank = for life." />
        </>
      ) : null}
      {row.kind === 'other' ? (
        <>
          <Field id={id('label')} label="What is it" value={row.label} onChange={(v) => onChange({ label: v })} inputMode="text" />
          <Field id={id('amount')} label="Per year, after tax, €" value={row.amount} onChange={(v) => onChange({ amount: v })} error={e.amount} hint="Business owners: the amount you take home after tax." />
          <div className="two">
            <Field id={id('from')} label="From age" value={row.fromAge} onChange={(v) => onChange({ fromAge: v })} error={e.fromAge} inputMode="numeric" hint="Blank = from now." />
            <Field id={id('until')} label="Until age" value={row.untilAge} onChange={(v) => onChange({ untilAge: v })} error={e.untilAge} inputMode="numeric" hint="Blank = for life." />
          </div>
        </>
      ) : null}
      <label className="switch">
        <input type="checkbox" checked={row.indexed} onChange={(ev) => onChange({ indexed: ev.target.checked })} />
        <span>{row.kind === 'other' ? 'It rises with inflation' : 'It is adjusted for inflation each year'}</span>
      </label>
      {note ? <div className="note">{note}</div> : null}
    </section>
  );
}

export default function QuickStart({ profile, errors, propertyErrors, pensionErrors, assumptionErrors, eurToInr, rateIsLive, onChange, liveErrors, onQuickChange, onOpenGroup, onClearMine, open, onToggle, onSetAll, dirty, hasResults, running, onRun }: Props) {
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => onChange({ ...profile, [key]: value });

  const age = /^\d+$/.test(profile.age.trim()) ? Number(profile.age) : null;
  const retire = /^\d+$/.test(profile.retireAge.trim()) ? Number(profile.retireAge) : null;

  const goldPriceNum = parseMoney(profile.goldPrice, 'eur') ?? 0;
  const jewRaw = /^(\d*\.?\d+)/.exec(profile.jewelleryGrams.trim());
  const jewelleryValue = jewRaw ? (Number(jewRaw[1]) * Number(profile.jewelleryPurity) / 24) * goldPriceNum : 0;
  const bullionRaw = /^(\d*\.?\d+)/.exec(profile.goldGrams.trim());
  const goldValue = jewelleryValue + (bullionRaw ? Number(bullionRaw[1]) * goldPriceNum : 0);
  const sum = summaries(profile, eurToInr);
  const errorIds = new Set(Object.keys(errors).map((k) => groupOfField(k)));
  const boost = boosters(profile);
  const grp = (id: string) => ({ tag: ((b) => (b ? { text: b.done ? 'Done' : b.gain, done: b.done } : undefined))(boost.find((x) => x.id === id)), id, n: GROUPS.findIndex((g) => g.id === id) + 1, title: GROUPS.find((g) => g.id === id)?.title ?? id, summary: sum[id] ?? '', open: !!open[id], hasError: errorIds.has(id), onToggle: () => onToggle(id) });
  const yearlyExtrasTotal = profile.expenses.reduce((sum, r) => sum + (parseMoney(r.amount, 'eur') ?? 0), 0);
  const inrParts = [profile.inDeposits, profile.inFunds, profile.inEpf].map((t) => (t.trim() === '' ? 0 : parseMoney(t, 'inr')));
  const inrTotal = inrParts.every((x) => x !== null) ? (inrParts as number[]).reduce((a, b) => a + b, 0) : null;

  return (
    <aside className="panel" aria-label="Your details">

      <QuickQuestions profile={profile} errors={liveErrors} eurToInr={eurToInr} onChange={onQuickChange} onOpenGroup={onOpenGroup} />
      <AccuracyPanel profile={profile} onOpenGroup={onOpenGroup} />

      <h2 className="panelTitle">Make it more accurate</h2>
      <p className="muted">Every group is optional. Open one, change your answers, then press Run simulation. Some answers repeat the quick questions above: they are the same answers.</p>
      <div className="gtools">
        <button type="button" className="linkbtn" onClick={() => onSetAll(true)}>Open all</button>
        <button type="button" className="linkbtn" onClick={() => onSetAll(false)}>Close all</button>
      </div>

      <Group {...grp('you')}>
      <section className="qcard">
        <h3>You</h3>
        <div className="two">
          <Field id="age" label="Your age" value={profile.age} onChange={(v) => set('age', v)} error={errors.age} inputMode="numeric" />
          <Field id="retire" label="Stop working at" value={profile.retireAge} onChange={(v) => set('retireAge', v)} error={errors.retireAge} inputMode="numeric" />
        </div>
        <Field
          id="yearsNl"
          label="Years you have lived in the Netherlands"
          value={profile.yearsInNl}
          onChange={(v) => set('yearsInNl', v)}
          error={errors.yearsInNl}
          hint="This sets how much state pension (AOW) you build up."
          inputMode="numeric"
        />
      </section>

      <section className="qcard">
        <h3>Household</h3>
        <div className="seg" role="group" aria-label="Household">
          <button type="button" className={!profile.partner ? 'on' : ''} aria-pressed={!profile.partner} onClick={() => set('partner', false)}>
            Alone
          </button>
          <button type="button" className={profile.partner ? 'on' : ''} aria-pressed={profile.partner} onClick={() => set('partner', true)}>
            With a partner
          </button>
        </div>
        {profile.partner ? <Field id="page" label="Your partner's age" value={profile.pAge} onChange={(v) => set('pAge', v)} error={errors.pAge} inputMode="numeric" hint="Needed for their pension and for the years you both work." /> : null}
        <span className="lbl">Children's ages</span>
        <div className="kids">
          {profile.children.map((c, i) => (
            <div className="kid" key={i}>
              <input
                aria-label={`Age of child ${i + 1}`}
                inputMode="numeric"
                value={String(c)}
                onChange={(e) => {
                  const n = e.target.value === '' ? 0 : Number(e.target.value);
                  if (Number.isFinite(n)) set('children', profile.children.map((x, j) => (j === i ? Math.max(0, Math.min(40, Math.round(n))) : x)));
                }}
              />
              <button type="button" className="x" aria-label={`Remove child ${i + 1}`} onClick={() => set('children', profile.children.filter((_, j) => j !== i))}>
                &times;
              </button>
            </div>
          ))}
          <button type="button" className="chip" onClick={() => set('children', [...profile.children, 5])}>
            + Add a child
          </button>
        </div>
        {errors.children ? <div className="err">{errors.children}</div> : null}
      </section>
      </Group>

      <Group {...grp('retire')}>
        <section className="qcard">
          <h3>Where do you want to retire?</h3>
          <div className="seg3" role="group" aria-label="Where you retire">
            {(['nl', 'both', 'in'] as const).map((d) => (
              <button key={d} type="button" className={profile.destination === d ? 'on' : ''} aria-pressed={profile.destination === d} onClick={() => onChange(withDestination(profile, d))}>
                {d === 'nl' ? 'Netherlands' : d === 'both' ? 'Both (snowbird)' : 'India'}
              </button>
            ))}
          </div>
          {profile.destination === 'nl' ? <p className="muted">You stay in the Netherlands all year. You can change this at any time.</p> : null}
          {profile.destination === 'in' ? <p className="muted">You move to India once you and your partner have stopped working. Your state pension build-up stops when you leave.</p> : null}
          {profile.destination === 'both' ? (
            <>
              <p className="muted">Your main home stays in the Netherlands. The rest of the year you live in India.</p>
              <div className="two">
                <Field id="months" label="Months a year in India" value={profile.monthsInIndia} onChange={(v) => set('monthsInIndia', v)} error={errors.monthsInIndia} inputMode="numeric" hint="For example 4 or 6." />
                <Field id="travel" label="Flights and travel a year, €" value={profile.travel} onChange={(v) => set('travel', v)} error={errors.travel} hint="Today's money. Blank for none." />
              </div>
            </>
          ) : null}
          {profile.destination !== 'nl' ? (
            <>
              <span className="lbl">Where will you live in India?</span>
              <div className="seg3" role="group" aria-label="Where you live in India">
                {([['own', 'In my own home'], ['family', 'With family'], ['rent', 'In a rented home']] as const).map(([k, label]) => (
                  <button key={k} type="button" className={profile.indiaHome === k ? 'on' : ''} aria-pressed={profile.indiaHome === k} onClick={() => set('indiaHome', profile.indiaHome === k ? '' : k)}>
                    {label}
                  </button>
                ))}
              </div>
              <p className="muted small">
                {profile.indiaHome === ''
                  ? 'Not chosen: the plan uses a standard guess of 38% of your Dutch living costs, which includes housing. Choose one to refine it.'
                  : `Your living costs in India are set to ${Math.round(INDIA_HOME_FACTOR[profile.indiaHome] * 100)}% of your Dutch costs. You can change this under Assumptions.`}
                {profile.indiaHome === 'own' && !profile.properties.some((r) => r.country === 'in') ? ' You have not added a property in India: add the home you live in under Property and mortgages.' : ''}
              </p>
            </>
          ) : null}
        </section>
      </Group>

      <Group {...grp('income')}>
      <section className="qcard">
        <h3>Income and 30% ruling</h3>
        <p className="muted small">This version is built for employees. If you are a freelancer or own a business, enter that income after tax under Pensions and other income.</p>
        <Field id="salary" label="Gross salary per year" value={profile.salary} onChange={(v) => set('salary', v)} error={errors.salary} hint={parseMoney(profile.salary, 'eur') !== null ? `= ${formatEur(parseMoney(profile.salary, 'eur') as number)} a year` : undefined} />
        <Chips
          currency="eur"
          current={profile.salary}
          onPick={(v) => set('salary', v)}
          options={[
            { label: '€60k', value: '60000' },
            { label: '€100k', value: '100000' },
            { label: '€150k', value: '150000' },
            { label: '€180k', value: '180000' },
            { label: '€250k', value: '250000' },
          ]}
        />
        <label className="switch">
          <input type="checkbox" checked={profile.hasRuling} onChange={(e) => set('hasRuling', e.target.checked)} />
          <span>I have the 30% ruling</span>
        </label>
        {profile.hasRuling ? (
          <>
            <Field id="ryears" label="Years it still runs, counting this year" value={profile.rulingYears} onChange={(v) => set('rulingYears', v)} error={errors.rulingYears} hint="Check your ruling letter for the end date. The maximum is 5 years in total." inputMode="numeric" />
            <label className="switch">
              <input type="checkbox" checked={profile.rulingBefore2024} onChange={(e) => set('rulingBefore2024', e.target.checked)} />
              <span>It was granted before 1 January 2024</span>
            </label>
          </>
        ) : null}

        {profile.partner ? (
          <>
            <label className="switch">
              <input type="checkbox" checked={profile.partnerEarns} onChange={(e) => set('partnerEarns', e.target.checked)} />
              <span>My partner also earns a salary</span>
            </label>
            {profile.partnerEarns ? (
              <div className="subcard">
                <span className="lbl">Your partner</span>
                <Field id="pretire" label="Stop working at" value={profile.pRetireAge} onChange={(v) => set('pRetireAge', v)} error={errors.pRetireAge} inputMode="numeric" />
                <Field id="psalary" label="Their gross salary per year" value={profile.pSalary} onChange={(v) => set('pSalary', v)} error={errors.pSalary} hint="Each of you is taxed on your own salary." />
                <label className="switch">
                  <input type="checkbox" checked={profile.pHasRuling} onChange={(e) => set('pHasRuling', e.target.checked)} />
                  <span>They have the 30% ruling</span>
                </label>
                {profile.pHasRuling ? (
                  <>
                    <Field id="pryears" label="Years it still runs, counting this year" value={profile.pRulingYears} onChange={(v) => set('pRulingYears', v)} error={errors.pRulingYears} inputMode="numeric" />
                    <label className="switch">
                      <input type="checkbox" checked={profile.pRulingBefore2024} onChange={(e) => set('pRulingBefore2024', e.target.checked)} />
                      <span>Theirs was granted before 1 January 2024</span>
                    </label>
                  </>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </section>
      </Group>

      <Group {...grp('pensions')}>
        <section className="qcard">
          <h3>Pensions and other income</h3>
          <p className="muted">
            Your state pension (AOW) is estimated from your years in the Netherlands. For a more exact figure, add your AOW line from the pension overview. Add anything else that pays you money later. Amounts are in today&rsquo;s money.
          </p>
          {errors.pensions ? <div className="err">{errors.pensions}</div> : null}
        </section>
        {profile.pensions.map((row, i) => (
          <PensionCard
            key={row.id}
            row={row}
            errors={pensionErrors[row.id] ?? {}}
            partner={profile.partner}
            age={age}
            retire={retire}
            onChange={(patch) => onChange({ ...profile, pensions: profile.pensions.map((r) => (r.id === row.id ? { ...r, ...patch } : r)) })}
            onRemove={() => onChange({ ...profile, pensions: profile.pensions.filter((r) => r.id !== row.id) })}
          />
        ))}
        <div className="addrow">
          {([
            ['aow', '+ State pension (AOW), from the overview'],
            ['nl-employer', '+ Workplace pension (Netherlands)'],
            ['annuity', '+ Voluntary or private pension'],
            ['in-pension', '+ Indian pension'],
            ['other', '+ Other income (freelance, business, rent elsewhere)'],
          ] as const).map(([k, label]) => (
            <button key={k} type="button" className="addbtn" onClick={() => onChange({ ...profile, pensions: [...profile.pensions, newPension(k, newPropertyId())] })}>
              {label}
            </button>
          ))}
        </div>
      </Group>

      <Group {...grp('spending')}>
      <section className="qcard">
        <h3>Monthly spending</h3>
        <Field id="living" label="Living costs: include rent if you rent, leave out your mortgage" value={profile.living} onChange={(v) => set('living', v)} error={errors.living} hint="Everyday costs only. Put holidays and other big yearly costs under Yearly extras, so they are not counted twice." />
        <Chips
          currency="eur"
          current={profile.living}
          onPick={(v) => set('living', v)}
          options={[
            { label: '€3k', value: '3000' },
            { label: '€4k', value: '4000' },
            { label: '€5k', value: '5000' },
            { label: '€6k', value: '6000' },
            { label: '€8k', value: '8000' },
          ]}
        />
        <p className="muted small">Mortgage payments are entered under Property, next to your home. They are not part of this amount.</p>
      </section>

      <section className="qcard">
        <h3>Yearly extras</h3>
        <p className="muted">Big costs that are not in your monthly spending above, such as the family holiday. Add each one only here, not in both places. They grow with inflation and stop at the age you choose.</p>
        {profile.expenses.map((row, i) => (
          <div className="expense" key={i}>
            <Field id={`el${i}`} label="What" value={row.label} inputMode="text" onChange={(v) => set('expenses', profile.expenses.map((x, j) => (j === i ? { ...x, label: v } : x)))} />
            <Field id={`ea${i}`} label="Per year, €" value={row.amount} onChange={(v) => set('expenses', profile.expenses.map((x, j) => (j === i ? { ...x, amount: v } : x)))} />
            <Field id={`eu${i}`} label="Until your age" value={row.untilAge} inputMode="numeric" hint="Blank = for life" onChange={(v) => set('expenses', profile.expenses.map((x, j) => (j === i ? { ...x, untilAge: v } : x)))} />
            <button type="button" className="x" aria-label={`Remove ${row.label || 'yearly extra'}`} onClick={() => set('expenses', profile.expenses.filter((_, j) => j !== i))}>
              &times;
            </button>
          </div>
        ))}
        {errors.expenses ? <div className="err">{errors.expenses}</div> : null}
        <div className="chips">
          <button type="button" className="chip" onClick={() => set('expenses', [...profile.expenses, { label: 'Family holiday', amount: '6000', untilAge: '' }])}>+ Family holiday</button>
          <button type="button" className="chip" onClick={() => set('expenses', [...profile.expenses, { label: 'Trip to India', amount: '3000', untilAge: '' }])}>+ Trip to India</button>
          <button type="button" className="chip" onClick={() => set('expenses', [...profile.expenses, { label: '', amount: '', untilAge: '' }])}>+ Something else</button>
        </div>
        {yearlyExtrasTotal > 0 ? <div className="note">Together about {formatEurFull(yearlyExtrasTotal)} a year today, or {formatEurFull(yearlyExtrasTotal / 12)} a month on top of your budget.</div> : null}
      </section>
      </Group>

      <Group {...grp('savings')}>
      <section className="qcard">
        <h3>Netherlands savings</h3>
        <p className="muted">Not your home. Leave a box blank if you have none.</p>
        <div className="two">
          <Field id="nlcash" label="Cash and savings" value={profile.nlCash} onChange={(v) => set('nlCash', v)} error={errors.nlCash} hint={parseMoney(profile.nlCash, 'eur') !== null ? `= ${formatEur(parseMoney(profile.nlCash, 'eur') as number)}` : undefined} />
          <Field id="nlinv" label="Investments and ETFs" value={profile.nlInvestments} onChange={(v) => set('nlInvestments', v)} error={errors.nlInvestments} hint={parseMoney(profile.nlInvestments, 'eur') !== null ? `= ${formatEur(parseMoney(profile.nlInvestments, 'eur') as number)}` : undefined} />
        </div>
      </section>

      <section className="qcard">
        <h3>India savings</h3>
        <p className="muted">In rupees, not counting property (add that under Property and mortgages). Try "50 lakh" or "1.2 crore". Leave a box blank if you have none.</p>
        <Field id="indep" label="Fixed deposits and savings" value={profile.inDeposits} onChange={(v) => set('inDeposits', v)} error={errors.inDeposits} hint={parseMoney(profile.inDeposits, 'inr') !== null ? `= ${formatInr(parseMoney(profile.inDeposits, 'inr') as number)}` : undefined} />
        <Field id="infun" label="Mutual funds and shares" value={profile.inFunds} onChange={(v) => set('inFunds', v)} error={errors.inFunds} hint={parseMoney(profile.inFunds, 'inr') !== null ? `= ${formatInr(parseMoney(profile.inFunds, 'inr') as number)}` : undefined} />
        <Field id="inepf" label="EPF / PPF balance" value={profile.inEpf} onChange={(v) => set('inEpf', v)} error={errors.inEpf} hint={parseMoney(profile.inEpf, 'inr') !== null ? `= ${formatInr(parseMoney(profile.inEpf, 'inr') as number)}` : undefined} />
        {inrTotal !== null ? (
          <div className="note">
            Total {formatInr(inrTotal)}, about {formatEur(inrTotal / eurToInr)} at ₹{eurToInr.toFixed(1)} per €1 ({rateIsLive ? 'live rate' : 'assumed rate'}).
          </div>
        ) : null}
      </section>

      <section className="qcard">
        <h3>Gold</h3>
        <p className="muted">Gold is split in two. Bars, coins and gold funds can be sold any time, so they count as spendable savings. Jewellery is only spent if you say you would sell some.</p>
        <Field id="goldprice" label="Gold price today, € per gram (24k)" value={profile.goldPrice} onChange={(v) => set('goldPrice', v)} error={errors.goldPrice} hint={`About €117 on ${GOLD_PRICE_AS_OF} (gold.de). Check today's price and update it.`} />
        <Field id="goldgrams" label="Bars, coins, gold funds and bonds (grams of pure gold)" value={profile.goldGrams} onChange={(v) => set('goldGrams', v)} error={errors.goldGrams} hint="Leave blank if none." />
        <Field id="jewgrams" label="Jewellery (total weight in grams)" value={profile.jewelleryGrams} onChange={(v) => set('jewelleryGrams', v)} error={errors.jewelleryGrams} hint="Leave blank if none." />
        {(profile.jewelleryGrams.trim() !== '') ? (
          <>
            <span className="lbl">Purity of the jewellery</span>
            <div className="chips" role="group" aria-label="Purity of the jewellery">
              {(['24', '22', '18'] as const).map((k) => (
                <button key={k} type="button" className={profile.jewelleryPurity === k ? 'chip on' : 'chip'} aria-pressed={profile.jewelleryPurity === k} onClick={() => set('jewelleryPurity', k)}>
                  {k} carat
                </button>
              ))}
            </div>
            {goldValue > 0 ? <div className="note">Your gold is worth about {formatEurFull(goldValue)} at today&rsquo;s price, of which {formatEurFull(jewelleryValue)} is jewellery.</div> : null}
            <label className="switch">
              <input type="checkbox" checked={profile.jewellerySell} onChange={(e) => set('jewellerySell', e.target.checked)} />
              <span>I would sell some of the jewellery</span>
            </label>
            {profile.jewellerySell ? (
              <>
                <div className="two">
                  <Field id="jewshare" label="Share you would sell, %" value={profile.jewellerySellShare} onChange={(v) => set('jewellerySellShare', v)} error={errors.jewellerySellShare} inputMode="numeric" />
                  <Field id="jewage" label="Sell at age" value={profile.jewellerySellAge} onChange={(v) => set('jewellerySellAge', v)} error={errors.jewellerySellAge} inputMode="numeric" />
                </div>
                <Field id="jewloss" label="What a jeweller takes off, %" value={profile.jewelleryLoss} onChange={(v) => set('jewelleryLoss', v)} error={errors.jewelleryLoss} inputMode="numeric" hint="Making charges and purity deductions. Often 10 to 25." />
              </>
            ) : (
              <div className="note">Kept: the jewellery stays as a family reserve and will not fund your retirement.</div>
            )}
          </>
        ) : null}
      </section>

      <section className="qcard">
        <h3>Investing every month</h3>
        <p className="muted">How do you build your savings from now until you stop working?</p>
        <div className="seg" role="group" aria-label="How you invest">
          <button type="button" className={profile.investMode === 'left' ? 'on' : ''} aria-pressed={profile.investMode === 'left'} onClick={() => set('investMode', 'left')}>
            Whatever is left
          </button>
          <button type="button" className={profile.investMode === 'fixed' ? 'on' : ''} aria-pressed={profile.investMode === 'fixed'} onClick={() => set('investMode', 'fixed')}>
            Fixed amounts
          </button>
        </div>
        {profile.investMode === 'left' ? (
          <p className="muted small">Everything left after tax and spending is saved: 80% into investments, 20% into cash.</p>
        ) : (
          <>
            <p className="muted small">Only what you enter here is invested. Money that is not invested counts as spent. If your income cannot cover it, the plan invests less and tells you.</p>
            <div className="two">
              <Field id="invnl" label="Dutch investments, € a month" value={profile.invNl} onChange={(v) => set('invNl', v)} error={errors.invNl} />
              <Field id="invcash" label="Cash and savings, € a month" value={profile.invCash} onChange={(v) => set('invCash', v)} error={errors.invCash} />
            </div>
            <div className="two">
              <Field id="invin" label="Indian mutual funds (SIP), ₹ a month" value={profile.invIn} onChange={(v) => set('invIn', v)} error={errors.invIn} />
              <Field id="invgold" label="Gold, € a month" value={profile.invGold} onChange={(v) => set('invGold', v)} error={errors.invGold} />
            </div>
            <div className="two">
              <Field id="invstep" label="Increase every year, %" value={profile.invStep} onChange={(v) => set('invStep', v)} error={errors.invStep} hint="Blank = no increase." />
              <Field id="invuntil" label="Stop investing at age" value={profile.invUntil} onChange={(v) => set('invUntil', v)} error={errors.invUntil} inputMode="numeric" hint="Blank = when you stop working." />
            </div>
            {errors.investMode ? <div className="err">{errors.investMode}</div> : null}
          </>
        )}
      </section>
      </Group>

      <Group {...grp('property')}>
        <section className="qcard">
          <h3>Your properties</h3>
          <p className="muted">
            Add each property you own, in the Netherlands or in India. A mortgage belongs to one property, so you tick it on that property. Properties you do not add are left out of your plan. You can have only one home you live in. Other properties in the Netherlands are marked "rented out" or "empty". Mortgages never go into what you spend. For a rented-out or empty property, "still owed" counts against you in Box 3, so fill it in.
          </p>
          {errors.properties ? <div className="err">{errors.properties}</div> : null}
        </section>
        {profile.properties.map((row, i) => (
          <PropertyCard
            key={row.id}
            row={row}
            index={i}
            errors={propertyErrors[row.id] ?? {}}
            age={age}
            retire={retire}
            onChange={(patch) => onChange({ ...profile, properties: profile.properties.map((r) => (r.id === row.id ? { ...r, ...patch } : r)) })}
            onRemove={() => onChange({ ...profile, properties: profile.properties.filter((r) => r.id !== row.id) })}
          />
        ))}
        <div className="addrow">
          <button type="button" className="addbtn" onClick={() => onChange({ ...profile, properties: [...profile.properties, newProperty('nl', newPropertyId())] })}>
            + Add a property in the Netherlands
          </button>
          <button type="button" className="addbtn" onClick={() => onChange({ ...profile, properties: [...profile.properties, newProperty('in', newPropertyId())] })}>
            + Add a property in India
          </button>
        </div>
      </Group>


      <Group {...grp('assumptions')}>
        <section className="qcard">
          <h3>Assumptions behind the numbers</h3>
          <p className="muted">These are the standard guesses. Change one only if you have a reason. Leave a box blank to use the standard value. Percentages are yearly.</p>
          {errors.assumptions ? <div className="err">{errors.assumptions}</div> : null}
          <span className="lbl">Wealth tax ({HOME.labels.wealthTax}) from 2028</span>
          <div className="seg" role="group" aria-label="Wealth tax from 2028">
            <button type="button" className={profile.box3 === 'deemed' ? 'on' : ''} aria-pressed={profile.box3 === 'deemed'} onClick={() => set('box3', 'deemed')}>
              Current system
            </button>
            <button type="button" className={profile.box3 === 'actual' ? 'on' : ''} aria-pressed={profile.box3 === 'actual'} onClick={() => set('box3', 'actual')}>
              Tax on actual yearly return
            </button>
          </div>
          <p className="muted small">
            The new Box 3 law is not final. The Tweede Kamer passed a tax on your actual return, and the cabinet has since proposed taxing gains only when you sell, from 2028 for shares and bonds and from 2030 for the rest. &ldquo;Tax on actual yearly return&rdquo; is a cautious estimate of this: it taxes the whole yearly return after a €1,000 tax-free result. The current system is the default until the law is final. 2027 figures use the proposed lower tax-free capital of €30,846.
          </p>
          <div className="assum">
            {ASSUMPTION_FIELDS.map((f) => (
              <Field
                key={f.key}
                id={`as-${f.key}`}
                label={f.label}
                value={profile.assumptions[f.key] ?? ''}
                onChange={(v) => onChange({ ...profile, assumptions: { ...profile.assumptions, [f.key]: v } })}
                error={assumptionErrors[f.key]}
                hint={`Standard: ${assumptionDefault(f)}${f.hint ? `. ${f.hint}` : ''}`}
              />
            ))}
          </div>
          <button type="button" className="linkbtn" onClick={() => onChange({ ...profile, assumptions: {} })}>Reset all to standard</button>
        </section>
      </Group>

      <div className="actions">
        <button type="button" onClick={onClearMine}>Clear my saved data</button>
      </div>
      <p className="muted small">Your answers are saved in this browser only. Nothing is sent anywhere.</p>
      <div className="runbar">
        <span className={`runstate ${dirty ? 'dirty' : ''}`} role="status">
          {running ? 'Running\u2026' : !hasResults ? 'Ready when you are' : dirty ? 'Changes not applied yet' : 'Results are up to date'}
        </span>
        <button type="button" className="run" disabled={running} onClick={onRun}>
          {running ? 'Running\u2026' : 'Run simulation'}
        </button>
      </div>
    </aside>
  );
}
