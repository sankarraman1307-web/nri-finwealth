import { useEffect, useMemo, useRef, useState } from 'react';
import type { Destination } from '../engine';
import { computeView, type View } from './compute';
import { CorpusChart, MonthlyChart } from './charts';
import { bridgeCheck, drawdownSeries, earliestFeasibleAge, independenceAge, type EuroBasis } from './chartData';
import QuickStart, { GROUPS, groupOfField } from './QuickStart';
import RulingCard from './RulingCard';
import Recommend from './RecommendSlide';
import { applyChange, type Change } from './recommend';
import {
  clearSavedProfile,
  EMPTY_PROFILE,
  formatEur,
  formatEurFull,
  loadProfile,
  parseProfile,
  saveProfile,
  withDestination,
  type Profile,
} from './profile';

const VERDICT = {
  on_track: { label: 'On track', className: 'good' },
  borderline: { label: 'Borderline', className: 'warn' },
  at_risk: { label: 'At risk', className: 'bad' },
} as const;

const FALLBACK_RATE = 90;
const YEAR = new Date().getFullYear();
const sameProfile = (a: Profile, b: Profile) => JSON.stringify(a) === JSON.stringify(b);

export default function App() {
  // "draft" is what is typed in the form. "applied" is what the results were last calculated from.
  const [draft, setDraft] = useState<Profile>(loadProfile);
  const [applied, setApplied] = useState<Profile>(draft);
  const [rate, setRate] = useState({ value: FALLBACK_RATE, live: false });
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({ you: true });
  const [notice, setNotice] = useState<string | null>(null);
  // Do not shout about empty boxes before the person has tried to run anything.
  const [showErrors, setShowErrors] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Fetch today's euro-to-rupee rate once when the page opens. If it fails, keep the fallback.
  useEffect(() => {
    let cancelled = false;
    fetch('https://open.er-api.com/v6/latest/EUR')
      .then((r) => r.json())
      .then((d: { rates?: { INR?: number } }) => {
        const inr = d.rates?.INR;
        if (!cancelled && typeof inr === 'number' && inr > 50 && inr < 200) setRate({ value: inr, live: true });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Remember what is typed, in this browser only.
  useEffect(() => saveProfile(draft), [draft]);

  // The results. They only change when you press Run (or click a result control), or when the live exchange rate arrives.
  const view: View | null = useMemo(() => computeView(applied, rate.value, YEAR), [applied, rate.value]);
  const lastView = useRef<View | null>(null);
  if (view) lastView.current = view;
  const shown = view ?? lastView.current;

  const draftParsed = useMemo(() => parseProfile(draft), [draft]);
  const errors = draftParsed.ok || !showErrors ? {} : draftParsed.errors;
  const propertyErrors = draftParsed.ok || !showErrors ? {} : draftParsed.propertyErrors;
  const pensionErrors = draftParsed.ok || !showErrors ? {} : draftParsed.pensionErrors;
  const assumptionErrors = draftParsed.ok || !showErrors ? {} : draftParsed.assumptionErrors;
  const dirty = !sameProfile(draft, applied);

  const run = () => {
    if (!draftParsed.ok) {
      setShowErrors(true);
      // Open every group that has a problem and say so.
      const bad: Record<string, boolean> = {};
      for (const k of Object.keys(draftParsed.errors)) {
        const g = groupOfField(k);
        if (g) bad[g] = true;
      }
      setOpen((o) => ({ ...o, ...bad }));
      setNotice('A few answers are missing or need a fix before the simulation can run. The groups to check are open.');
      // Once the groups have opened and the errors have drawn, take the person to the first field that needs a fix.
      window.setTimeout(() => {
        const first = document.querySelector<HTMLElement>('.panel [aria-invalid="true"]');
        if (!first) return;
        first.scrollIntoView({ behavior: 'smooth', block: 'center' });
        first.focus({ preventScroll: true });
      }, 80);
      return;
    }
    setNotice(null);
    setRunning(true);
    // Let the browser paint "Running…" first, then do the (short) calculation.
    window.setTimeout(() => {
      setApplied(draft);
      setRunning(false);
      // Take the person to the results, wherever they were in the long form.
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 30);
  };

  // Buttons next to the results (retire age, place) apply straight away: a click is a deliberate choice.
  const [undo, setUndo] = useState<Profile | null>(null);
  const applyRecommendation = (c: Change) => {
    setUndo(applied);
    applyNow((p) => applyChange(p, c));
  };
  const undoRecommendation = () => {
    if (!undo) return;
    const back = undo;
    setUndo(null);
    setDraft(back);
    setApplied(back);
  };
  const applyNow = (change: (p: Profile) => Profile) => {
    setDraft((d) => change(d));
    setApplied((a) => change(a));
  };
  const nudgeRetireAge = (delta: number) => {
    const p = parseProfile(applied);
    if (!p.ok) return;
    const next = Math.min(75, Math.max(p.value.age, p.value.retireAge + delta));
    applyNow((p) => ({ ...p, retireAge: String(next) }));
  };

  return (
    <main className="page">
      <header className="top">
        <strong>NRI FinWealth</strong>
        <span className="pill">Your numbers stay on this device</span>
      </header>

      <h1>Where could you retire comfortably between EU and India?</h1>
      <p className="sub">Free, personalized and calculated safely on your own device</p>

      <div className="layout">
        <QuickStart
          profile={draft}
          errors={errors}
          propertyErrors={propertyErrors}
          pensionErrors={pensionErrors}
          assumptionErrors={assumptionErrors}
          eurToInr={rate.value}
          rateIsLive={rate.live}
          onChange={setDraft}
          onClearMine={() => {
            clearSavedProfile();
            setDraft(EMPTY_PROFILE);
            setApplied(EMPTY_PROFILE);
            setShowErrors(false);
            setNotice(null);
          }}
          open={open}
          onToggle={(id) => setOpen((o) => ({ ...o, [id]: !o[id] }))}
          onSetAll={(v) => setOpen(Object.fromEntries(GROUPS.map((g) => [g.id, v])))}
          dirty={dirty}
          hasResults={shown !== null}
          running={running}
          onRun={run}
        />

        <div className={`results ${dirty ? 'dim' : ''}`} ref={resultsRef}>
          {notice ? <div className="card alert" role="alert">{notice}</div> : null}
          {dirty ? (
            <div className="stale" role="status">
              <span>You changed your answers. The results here are from your last run.</span>
              <button type="button" className="run" disabled={running} onClick={run}>
                {running ? 'Running…' : 'Run simulation'}
              </button>
            </div>
          ) : null}
          {shown ? (
            <Results view={shown} destination={shown.destination} setDestination={(d) => applyNow((p) => withDestination(p, d))} nudge={nudgeRetireAge} profile={applied} eurToInr={rate.value} startYear={YEAR} onApply={applyRecommendation} onUndo={undoRecommendation} canUndo={undo !== null} />
          ) : (
            <div className="card empty">
              <h2>Your results will appear here</h2>
              <p>Open a group in the form, fill in what you know, and press <strong>Run simulation</strong>. Only age, the age you want to stop working, years in the Netherlands, salary and monthly spending are required. Leave anything else blank if it does not apply.</p>
            </div>
          )}
        </div>
      </div>

      <footer>
        Planning estimate, not advice. Tax rules as of {shown?.plan.meta.rulesAsOf ?? '2026-10-22'}. Engine v{shown?.plan.meta.engineVersion ?? '2.1.0'} &middot; {shown?.plan.meta.paths ?? 400} simulated futures.
        <details className="about">
          <summary>Privacy and disclaimer</summary>
          <p><strong>Your numbers stay with you.</strong> All calculations run in your browser. Nothing you type is sent to a server, and there is no account or tracking. The only outside call fetches the public euro-to-rupee rate; it carries none of your data. Your answers are saved only in this browser (local storage); clear your site data to remove them.</p>
          <p><strong>Not financial, tax or legal advice.</strong> This is a planning tool that shows what could happen under stated assumptions. Tax rules change (for example the Dutch Box 3 reform), some figures are proposals, and Indian tax and healthcare costs are only partly modelled. Check the result with a licensed adviser before you act on it.</p>
          <p>Open source (MIT licence). Spotted a wrong rule or number? Please tell us through the project page.</p>
        </details>
      </footer>
    </main>
  );
}

const RATES = [0.03, 0.035, 0.04, 0.045] as const;
const pctText = (r: number) => `${(r * 100).toFixed(1).replace(/\.0$/, '')}%`;

function Results(props: {
  view: View;
  destination: Destination;
  setDestination: (d: Destination) => void;
  nudge: (delta: number) => void;
  profile: Profile;
  eurToInr: number;
  startYear: number;
  onApply: (c: Change) => void;
  onUndo: () => void;
  canUndo: boolean;
}) {
  const { view, destination, setDestination, nudge, profile, eurToInr, startYear, onApply, onUndo, canUndo } = props;
  const { plan, ruling, compare, curve, monthly, retireAge, age, aowAge } = view;
  const [rate, setRate] = useState<number>(0.035);
  const [basis, setBasis] = useState<EuroBasis>('future');
  const [slide, setSlide] = useState<number>(() => {
    const m = /^#s(\d)$/.exec(typeof window === 'undefined' ? '' : window.location.hash);
    return m ? Math.min(5, Math.max(0, Number(m[1]) - 1)) : 0;
  });
  const [all, setAll] = useState(false);
  // The address bar follows the slide, so a slide can be bookmarked and the browser's Back button works.
  useEffect(() => {
    const want = `#s${slide + 1}`;
    if (window.location.hash !== want) window.history.pushState(null, '', want);
  }, [slide]);
  useEffect(() => {
    const onPop = () => {
      const m = /^#s(\d)$/.exec(window.location.hash);
      setSlide(m ? Math.min(5, Math.max(0, Number(m[1]) - 1)) : 0);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  // Left and right arrows change slide, unless you are typing or reading a chart.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest('input, textarea, select, svg') || t.isContentEditable)) return;
      setSlide((n) => Math.max(0, Math.min(5, n + (e.key === 'ArrowRight' ? 1 : -1))));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const pct = Math.round(plan.monteCarlo.successProbability * 100);
  const verdict = VERDICT[plan.verdict];
  const horizonAge = age + plan.meta.horizonYears;
  const gap = plan.expected.margin * (basis === 'today' ? 1 / (1 + view.inflation) ** (retireAge - age) : 1);
  const earliest = earliestFeasibleAge(curve);
  const series = useMemo(
    () => drawdownSeries(plan.monteCarlo.bands, monthly, { rate, inflation: view.inflation, startAge: age, basis }),
    [plan, monthly, rate, basis, view.inflation, age],
  );
  const free = independenceAge(series);
  const unit = basis === 'future' ? 'future euros' : "today's euros";
  // Values the engine gives at the day you stop are in that year's euros. 'today' removes inflation since now.
  const toBasis = basis === 'today' ? 1 / (1 + view.inflation) ** (retireAge - age) : 1;
  const bridge = useMemo(() => bridgeCheck(plan, retireAge, aowAge, view.inflation, basis), [plan, retireAge, aowAge, view.inflation, basis]);
  const topWarning = plan.warnings.find((w) => w.severity === 'important');
  const noSavingsNeeded = plan.expected.requiredCorpus <= 0;
  // Property sold in the year you stop is part of the corpus on that day.
  const soldAtStop = plan.expected.rows.filter((r) => r.age === retireAge).reduce((t, r) => t + r.saleProceeds, 0) * (basis === 'today' ? 1 / (1 + view.inflation) ** (retireAge - age) : 1);

  const slides: { id: string; title: string; attention: boolean; content: React.ReactNode }[] = [
    {
      id: 'verdict',
      title: 'Verdict',
      attention: pct < 90,
      content: (
        <>
      <section className="card hero">
        <div className={`big ${verdict.className}`}>{pct}%</div>
        <div>
          <span className={`badge ${verdict.className}`}>{verdict.label}</span>
          <h2>
            In {pct} of 100 simulated futures, your money lasts to {horizonAge}.
          </h2>
          <p>
            Retiring at {retireAge} the plan projects {formatEur(plan.expected.corpusAtRetirement * toBasis)} ({unit})
            {soldAtStop > 1000 ? `, including ${formatEur(soldAtStop)} from selling property that year` : ''}.{' '}
            {noSavingsNeeded
              ? `You would not need savings on the day you stop: your pensions, rent and later property sales already pay for your spending to ${horizonAge}, if returns are exactly average. The Savings over time slide uses a more cautious test.`
              : `If returns are exactly average, about ${formatEur(plan.expected.requiredCorpus * toBasis)} would be just enough to last to ${horizonAge}. The Savings over time slide uses a more cautious test.`}
            {earliest !== null && earliest < retireAge ? ` On average returns you could stop as early as ${earliest}.` : ''}
            {earliest !== null && earliest > retireAge ? ` On average returns, the earliest age that fully works is ${earliest}.` : ''}
            {earliest === null ? ' On average returns, no retirement age up to 75 fully works.' : ''}
          </p>
        </div>
      </section>

          {topWarning ? (
            <div className="card alert" role="note">
              {topWarning.message}
            </div>
          ) : null}
      <section className="card controls">
        <div>
          <span className="lbl">Retire in</span>
          <div className="row">
            {(['nl', 'both', 'in'] as const).map((d) => (
              <button key={d} type="button" className={destination === d ? 'on' : ''} aria-pressed={destination === d} onClick={() => setDestination(d)}>
                {d === 'nl' ? 'Netherlands' : d === 'both' ? 'Both (snowbird)' : 'India'}
              </button>
            ))}
          </div>
        </div>
        <div className="compareWrap">
          <span className="lbl compareLbl">Chance your money lasts to {horizonAge}, by place to retire</span>
          <div className="compare" aria-label="Chance your money lasts, by place to retire">
            {compare.map((c) => (
              <div key={c.destination} className={`opt ${c.destination === destination ? 'on' : ''}`}>
                <span>{c.destination === 'nl' ? 'Netherlands' : c.destination === 'in' ? 'India' : `Both (${view.compareMonths} mo.)`}</span>
                <b>{Math.round(c.successProbability * 100)}%</b>
                <span>money lasts</span>
              </div>
            ))}
          </div>
          <p className="muted small">India results look rosier than they are: Indian income tax and private healthcare are not modelled yet. The Both card assumes {view.compareMonths} months a year in India.</p>
        </div>
      </section>
        </>
      ),
    },
    {
      id: 'bridge',
      title: 'Bridge check',
      attention: bridge !== null && !bridge.selfFunded,
      content: bridge ? (
        <>
      {bridge ? (
        <section className="card bridge" aria-label="Bridge check">
          <h3>
            Bridge check: ages {bridge.fromAge} to {bridge.toAge} <span className="unit">({unit})</span>
          </h3>
          <p className={`bridgeVerdict ${bridge.selfFunded ? 'good' : 'bad'}`}>
            {bridge.selfFunded
              ? `You can pay for these ${bridge.years} years from your own savings in ${pct} of 100 futures. You do not need money from elsewhere.`
              : bridge.unmetTotal >= 1
                ? `Your own savings do not cover these years. On average returns you would need about ${formatEur(bridge.unmetTotal)} (${unit}) from elsewhere, or spend less or retire later.`
                : `Over your whole retirement your savings last to ${horizonAge} in only ${pct} of 100 futures. In a bad market they run out by age ${bridge.badRunOutAge ?? horizonAge}. Plan for extra money, less spending or a later stop.`}
          </p>
          <p className="muted tabnote">These are the years before your state pension starts at {aowAge}. Amounts are in {unit}, on average returns. Monthly figures are averages over these years.</p>
          <ul className="bridgeList">
            <li>You spend about <strong>{formatEurFull(bridge.spend)}</strong> a month, including mortgage and Box 3 tax.</li>
            <li>Pensions, rent and other income give about <strong>{formatEurFull(bridge.income)}</strong> a month.</li>
            <li>Your plan takes about <strong>{formatEurFull(bridge.fromSavings)}</strong> a month from savings: <strong>{formatEur(bridge.totalFromSavings)}</strong> over {bridge.years} years.</li>
            {bridge.salesInBridge > 1000 ? <li>Selling property in these years brings in <strong>{formatEur(bridge.salesInBridge)}</strong>, which joins your savings.</li> : null}
            <li>
              When your state pension starts you still have about <strong>{formatEur(bridge.savingsAtEnd)}</strong> in a typical future, and <strong>{formatEur(bridge.savingsAtEndBad)}</strong> in a bad one (1 in 10).
            </li>
          </ul>
        </section>
      ) : null}
        </>
      ) : (
        <section className="card">
          <h3>Bridge check</h3>
          <p>You stop working at or after the age your state pension starts, so there is no gap to bridge.</p>
        </section>
      ),
    },
    {
      id: 'savings',
      title: 'Savings over time',
      attention: false,
      content: (
        <>
      <section className="card">
        <h3>Your corpus and what you need</h3>
        <div className="chartControls">
          <div>
            <span className="lbl">Drawdown a year</span>
            <div className="row">
              {RATES.map((r) => (
                <button key={r} type="button" className={rate === r ? 'on' : ''} aria-pressed={rate === r} onClick={() => setRate(r)}>
                  {pctText(r)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="muted tabnote">
          The shaded years at the start are the years you still work. The teal line is the typical future of your savings and investments, and the shaded band holds 8 of 10 simulated futures. The amber line is the corpus you would need at each age, so that drawing {pctText(rate)} a year
          plus your pensions pays for your spending that year, including Box 3 tax.{' '}
          {free !== null ? `On this measure your corpus is enough from age ${free}.` : 'On this measure your corpus never gets there.'} A lower drawdown is safer for a long retirement, but needs a bigger corpus. This is a more cautious test than the break-even figure in the headline, which only asks whether your money lasts if returns are exactly average.
        </p>
        <CorpusChart series={series} retireAge={retireAge} aowAge={aowAge} rate={rate} events={view.events} />
      </section>
        </>
      ),
    },
    {
      id: 'monthly',
      title: 'Monthly picture',
      attention: false,
      content: (
        <>
      <section className="card">
        <h3>What you need each month and what you would get</h3>
        <p className="muted tabnote">
          Your monthly spending at each age, with inflation and the prices of the country you retire to, against pensions and rent plus {pctText(rate)} a year drawn from the corpus on the Savings over time slide, divided by 12. Amber shows any
          shortfall. The chart starts at the age you stop working. Point at an age to see what changes then.
        </p>
        <MonthlyChart series={series} retireAge={retireAge} aowAge={aowAge} rate={rate} events={view.events} />
      </section>
        </>
      ),
    },
    {
      id: 'todo',
      title: 'What you could do',
      attention: pct < 90,
      content: <Recommend profile={profile} eurToInr={eurToInr} startYear={startYear} onApply={onApply} onUndo={onUndo} canUndo={canUndo} active={all || slide === 4} />,
    },
    {
      id: 'details',
      title: 'Details',
      attention: false,
      content: (
        <>
      {ruling ? <RulingCard r={ruling} /> : null}

      {plan.expected.propertyReserveReal > 1000 ? (
        <section className="card">
          <h3>Property you keep</h3>
          <p>
            You keep property worth about <strong>{formatEur(plan.expected.propertyReserveReal)}</strong> by age {horizonAge}, in today&rsquo;s euros. It is a reserve for your family or a late sale, and it is
            not counted as money you can spend. Set a sale age in the Property group to see what it would add.
          </p>
        </section>
      ) : null}

      <section className="tiles">
        <div className="card">
          <span className="k">Projected at {retireAge}, {unit}</span>
          <span className="v">{formatEur(plan.expected.corpusAtRetirement * toBasis)}</span>
        </div>
        <div className="card">
          <span className="k">Break-even at {retireAge}, {unit}</span>
          <span className="v">{noSavingsNeeded ? 'Not needed' : formatEur(plan.expected.requiredCorpus * toBasis)}</span>
        </div>
        <div className="card">
          <span className="k">{gap < 0 ? 'Shortfall' : 'Cushion'}, {unit}</span>
          <span className={`v ${gap < 0 ? 'bad' : 'good'}`}>{formatEur(Math.abs(gap))}</span>
        </div>
      </section>

      <section className="card">
        <h3>What this model does not know yet</h3>
        <ul>
          {plan.warnings.slice(0, 8).map((w) => (
            <li key={w.code + w.message}>{w.message}</li>
          ))}
        </ul>
      </section>
        </>
      ),
    },
  ];
  const go = (n: number) => setSlide(Math.max(0, Math.min(slides.length - 1, n)));

  return (
    <>
      <div className="strip" role="region" aria-label="Your result at a glance">
        <div className="stripMain">
          <span className={`stripPct ${verdict.className}`}>{pct}%</span>
          <span className={`badge ${verdict.className}`}>{verdict.label}</span>
          <div className="stripAge" role="group" aria-label="Retire at age">
            <span className="lbl">Retire at</span>
            <button type="button" onClick={() => nudge(-1)} aria-label="Retire one year earlier">
              &minus;
            </button>
            <span className="age">{retireAge}</span>
            <button type="button" onClick={() => nudge(1)} aria-label="Retire one year later">
              +
            </button>
          </div>
        </div>
        <div className="unitbar" role="group" aria-label="Amounts in">
          <span className="lbl">Amounts in</span>
          <div className="row">
            <button type="button" className={basis === 'future' ? 'on' : ''} aria-pressed={basis === 'future'} onClick={() => setBasis('future')}>
              Future euros
            </button>
            <button type="button" className={basis === 'today' ? 'on' : ''} aria-pressed={basis === 'today'} onClick={() => setBasis('today')}>
              Today&rsquo;s euros
            </button>
          </div>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Results">
        {slides.map((sl, i) => (
          <button key={sl.id} type="button" role="tab" id={`tab-${sl.id}`} aria-selected={!all && slide === i} aria-controls={`slide-${sl.id}`} className={!all && slide === i ? 'tab on' : 'tab'} onClick={() => { setAll(false); go(i); }}>
            <span className="tabn">{i + 1}</span> {sl.title}
            {sl.attention ? <span className="dot" aria-label="needs attention" /> : null}
          </button>
        ))}
        <button type="button" className={all ? 'tab on' : 'tab'} aria-pressed={all} onClick={() => setAll((v) => !v)}>
          {all ? 'Back to slides' : 'Show everything'}
        </button>
      </div>

      {slides.map((sl, i) =>
        all || slide === i ? (
          <div key={sl.id} className="slide" role="tabpanel" id={`slide-${sl.id}`} aria-labelledby={`tab-${sl.id}`}>
            {all ? <h2 className="slideTitle">{i + 1}. {sl.title}</h2> : null}
            {sl.content}
          </div>
        ) : null,
      )}

      {all ? null : (
        <div className="pager">
          <button type="button" disabled={slide === 0} onClick={() => go(slide - 1)}>
            &larr; Back
          </button>
          <span className="muted small">
            {slide + 1} of {slides.length}
          </span>
          <button type="button" disabled={slide === slides.length - 1} onClick={() => go(slide + 1)}>
            Next &rarr;
          </button>
        </div>
      )}
    </>
  );
}
