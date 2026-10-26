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
  STARTER_PROFILE,
  formatEur,
  formatEurFull,
  loadProfile,
  mortgageFreeSentence,
  mortgageSummary,
  parseMoney,
  parseProfile,
  savingsAnswered,
  saveProfile,
  withDestination,
  type Profile,
} from './profile';

const VERDICT = {
  on_track: { label: 'On track', className: 'good' },
  borderline: { label: 'Borderline', className: 'warn' },
  at_risk: { label: 'At risk', className: 'bad' },
} as const;

export const FEEDBACK_URL = 'https://forms.gle/JYd64pJHYjTB7wPt8';
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
  // True after an edit on the quick questions: those update the answer by themselves, a moment after you stop typing.
  const [auto, setAuto] = useState(false);

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
  const liveErrors = draftParsed.ok ? {} : draftParsed.errors;

  useEffect(() => {
    if (!auto) return;
    if (!draftParsed.ok) return; // wait until the answers are complete and valid
    const t = window.setTimeout(() => {
      setApplied(draft);
      setAuto(false);
    }, 350);
    return () => window.clearTimeout(t);
  }, [auto, draft, draftParsed]);

  const openGroup = (id: string) => {
    setOpen((o) => ({ ...o, [id]: true }));
    window.setTimeout(() => document.querySelector(`.panel [data-g="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

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
      const onlySavings = Object.keys(draftParsed.errors).every((k) => k === 'savingsQuick');
      setNotice(
        onlySavings
          ? 'Tell us what you have saved (question 5), then your answer appears. Enter 0 if you have nothing.'
          : 'A few answers are missing or need a fix before the simulation can run. The groups to check are open.',
      );
      // Once the groups have opened and the errors have drawn, take the person to the first field that needs a fix.
      window.setTimeout(() => {
        const first = document.querySelector<HTMLElement>('.panel [aria-invalid="true"]') ?? (draftParsed.errors.savingsQuick ? document.querySelector<HTMLElement>('#qq-savings') : null);
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
        <span className="beta" title="Beta: we are still checking the tax figures with advisers">Beta</span>
        <a className="topFeedback" href={FEEDBACK_URL} target="_blank" rel="noreferrer">Give feedback</a>
      </header>

      <h1>Where could you retire comfortably: the Netherlands, India, or both?</h1>
      <p className="sub">Free, personalised and calculated on your own device. Built for NRIs living in the Netherlands.</p>

      <div className="privacy" role="note">
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        <div>
          <strong>Your numbers stay on this device.</strong>
          <span> No account and no tracking of your answers: everything is calculated in your browser, and nothing you type is sent anywhere.</span>
        </div>
      </div>

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
          liveErrors={liveErrors}
          onQuickChange={(next) => {
            setDraft(next);
            setAuto(true);
          }}
          onOpenGroup={openGroup}
          onClearMine={() => {
            clearSavedProfile();
            lastView.current = null;
            setDraft(STARTER_PROFILE);
            setApplied(STARTER_PROFILE);
            setAuto(false);
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

        <div className={`results ${dirty && !(auto && draftParsed.ok) ? 'dim' : ''}`} ref={resultsRef}>
          {notice ? <div className="card alert" role="alert">{notice}</div> : null}
          {dirty && !(auto && draftParsed.ok) ? (
            <div className="stale" role="status">
              <span>You changed your answers. The results here are from your last run.</span>
              <button type="button" className="run" disabled={running} onClick={run}>
                {running ? 'Running…' : 'Run simulation'}
              </button>
            </div>
          ) : null}
          {shown ? (
            <Results view={shown} destination={shown.destination} setDestination={(d) => applyNow((p) => withDestination(p, d))} setLegacy={(l) => applyNow((p) => ({ ...p, legacy: l }))} nudge={nudgeRetireAge} profile={applied} eurToInr={rate.value} startYear={YEAR} onApply={applyRecommendation} onUndo={undoRecommendation} canUndo={undo !== null} />
          ) : (
            !savingsAnswered(draft) ? (
              <div className="card gate" role="status">
                <h2>One more answer needed</h2>
                <p>Tell us what you have saved, and your answer appears here.</p>
              </div>
            ) : (
              <div className="card empty">
                <h2>Your results will appear here</h2>
                <p>Check the answers marked in red on the left. Once the 7 quick questions are complete, your answer appears by itself. Answers in the groups below the questions need <strong>Run simulation</strong>.</p>
              </div>
            )
          )}
        </div>
      </div>

      {shown ? (
        <div className="liveBar" role="region" aria-label="Your answer so far">
          <div className="liveText">
            <span className={`badge ${VERDICT[shown.plan.verdict].className}`}>Verdict: {VERDICT[shown.plan.verdict].label}</span>
            <strong>
              If you live to {shown.age + shown.plan.meta.horizonYears}, your money lasts in {Math.round(shown.plan.monteCarlo.successProbability * 100)} of 100 possible future scenarios
            </strong>
          </div>
          <button type="button" className="run" onClick={() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            See details
          </button>
        </div>
      ) : null}

      <footer>
        Planning estimate, not advice. Tax rules as of {shown?.plan.meta.rulesAsOf ?? '2026-10-22'}. Engine v{shown?.plan.meta.engineVersion ?? '2.1.0'} &middot; {shown?.plan.meta.paths ?? 400} simulated futures.
        <div className="contact">
          <a href={FEEDBACK_URL} target="_blank" rel="noreferrer">Give feedback</a> &middot; <a href="mailto:hello@nrifinwealth.com">hello@nrifinwealth.com</a>
          <br />
          Living elsewhere in Europe? <a href={FEEDBACK_URL} target="_blank" rel="noreferrer">Tell us which country you would like next</a>.
        </div>
        <details className="about">
          <summary>Privacy and disclaimer</summary>
          <p><strong>Your numbers stay with you.</strong> All calculations run in your browser. Nothing you type is sent to a server, and the tool has no account and no tracking of its own. Your answers are saved only in this browser (local storage); clear your site data to remove them. The only outside call fetches the public euro-to-rupee rate; it carries none of your data. Our hosting provider, Cloudflare, keeps standard anonymous traffic counts, as any website host does.</p>
          <p><strong>Beta.</strong> This tool is still being tested and its tax figures are still being checked by advisers. Expect mistakes, and tell us when you find one.</p>
          <p><strong>Not financial, tax or legal advice.</strong> This is an educational planning tool. It shows what could happen under stated assumptions and gives general what-if scenarios. It does not know your full situation, and it does not recommend any bank, investment product or insurance. Tax rules change (for example the Dutch Box 3 reform), some figures are proposals, and Indian tax and healthcare costs are only partly modelled. Past or simulated results do not predict the future. Check the result with a licensed adviser before you act on it. We accept no liability for decisions made using this tool.</p>
          <p><strong>Feedback.</strong> Your numbers never leave this device. If you choose to send feedback, what you write goes to our form provider (Google Forms), so please do not include exact salary, savings or other personal figures.</p>
          <p>nrifinwealth.com is open source under the AGPL-3.0 licence. <a href="https://github.com/sankarraman1307-web/nri-finwealth" target="_blank" rel="noreferrer">Source code</a>. Spotted a wrong rule or number? Please report it there. Questions or feedback: <a href="mailto:hello@nrifinwealth.com">hello@nrifinwealth.com</a>.</p>
        </details>
      </footer>
    </main>
  );
}

const pctText = (r: number) => `${(r * 100).toFixed(1).replace(/\.0$/, '')}%`;

function Results(props: {
  view: View;
  destination: Destination;
  setDestination: (d: Destination) => void;
  setLegacy: (l: 'spend' | 'intact') => void;
  nudge: (delta: number) => void;
  profile: Profile;
  eurToInr: number;
  startYear: number;
  onApply: (c: Change) => void;
  onUndo: () => void;
  canUndo: boolean;
}) {
  const { view, destination, setDestination, setLegacy, nudge, profile, eurToInr, startYear, onApply, onUndo, canUndo } = props;
  const { plan, ruling, compare, curve, monthly, retireAge, age, aowAge } = view;
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
  const intact = view.legacy === 'intact';
  // The yearly share of savings you live on. Only used, and only shown, when you keep your savings intact.
  const rate = view.safeRate;
  const pct = Math.round(plan.monteCarlo.successProbability * 100);
  const failRest = 100 - pct;
  const spendNow = parseMoney(profile.living, 'eur') ?? 0;
  const mort = useMemo(() => mortgageSummary(profile, eurToInr), [profile, eurToInr]);
  const verdict = VERDICT[plan.verdict];
  const horizonAge = age + plan.meta.horizonYears;
  const gap = plan.expected.margin * (basis === 'today' ? 1 / (1 + view.inflation) ** (retireAge - age) : 1);
  const earliest = earliestFeasibleAge(curve);
  const series = useMemo(
    () =>
      drawdownSeries(plan.monteCarlo.bands, monthly, {
        mode: intact ? 'intact' : 'spend',
        rate,
        inflation: view.inflation,
        startAge: age,
        basis,
        retireAge,
        ...(plan.expected.requiredByAge ? { required: plan.expected.requiredByAge } : {}),
        curve,
      }),
    [plan, monthly, curve, intact, rate, basis, view.inflation, age, retireAge],
  );
  const free = independenceAge(series);
  const unit = basis === 'future' ? 'future euros' : "today's euros";
  // Values the engine gives at the day you stop are in that year's euros. 'today' removes inflation since now.
  const toBasis = basis === 'today' ? 1 / (1 + view.inflation) ** (retireAge - age) : 1;
  // One definition of "needed", chosen by the question. Spend it all: the smallest pot that lasts to the end. Keep it intact: a fixed share of the pot per year.
  const neededAtStop = intact ? series.find((p) => p.age === retireAge)?.needed ?? null : plan.expected.requiredCorpus * toBasis;
  const typicalAtStop = view.typicalAtStop * toBasis;
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
      <section className="card legacyCard" aria-labelledby="legacy-q">
        <h3 id="legacy-q">What should be left at the age of {horizonAge}?</h3>
        <p className="muted small">Your plan runs until age {horizonAge}. This sets the savings you need and the chance your money lasts. You can change the age under Assumptions.</p>
        <div className="legacyOpts" role="radiogroup" aria-labelledby="legacy-q">
          {([
            ['spend', 'Nothing, I will spend all of it', `Spend your savings down to nothing by ${horizonAge}. The smallest pot you need.`],
            ['intact', 'Keep the corpus intact for my descendants', `Live on a share of your savings each year and pass the full amount on, in today's money.`],
          ] as const).map(([id, title, note]) => (
            <button key={id} type="button" role="radio" aria-checked={view.legacy === id} className={`legacyOpt ${view.legacy === id ? 'on' : ''}`} onClick={() => setLegacy(id)}>
              <span className="legacyDot" aria-hidden="true" />
              <span>
                <b>{title}</b>
                <small>{note}</small>
              </span>
            </button>
          ))}
        </div>
        {intact ? (
          <p className="muted small">
            You will live on {pctText(rate)} of your savings each year. That is the assumption &ldquo;Safe yearly payout from your savings&rdquo; (3% cautious, 3.5% balanced, 4% the common rule, 4.5% bold). A lower share is safer but needs a bigger pot. You can change it under Assumptions.
          </p>
        ) : null}
        <p className="muted small">Amounts are in today&rsquo;s money. Property you keep is counted separately, as a family reserve.</p>
      </section>
      <section className="card hero verdictCard">
        <span className={`badge ${verdict.className}`}>Verdict: {verdict.label}</span>
        <h2>If you live to {horizonAge}, your money lasts in {pct} of 100 possible future scenarios.</h2>
        <div className="meter" role="img" aria-label={`${pct} out of 100. Aim for 90 or more.`}>
          <div className="meterBar">
            <div className={`meterFill ${verdict.className}`} style={{ width: `${pct}%` }} />
            <span className="meterMark" style={{ left: '90%' }} />
          </div>
          <div className="meterScale" aria-hidden="true">
            <span>0</span>
            <span className="aim">Aim for 90 or more</span>
            <span>100</span>
          </div>
        </div>
        <p className="lead">
          Retiring at {retireAge}, living on about {formatEurFull(spendNow)} a month in today&rsquo;s money
          {mort.count > 0 && mort.monthlyEur > 0 && mort.lastEndAge !== null
            ? mort.count === 1
              ? `, plus your ${formatEurFull(mort.monthlyEur)} mortgage until age ${mort.lastEndAge}`
              : `, plus about ${formatEurFull(mort.monthlyEur)} a month in mortgages, the last until age ${mort.lastEndAge}`
            : ''}
          {intact ? `, keeping your savings intact for your descendants and living on ${pctText(rate)} of them each year` : `, with nothing left at ${horizonAge}`}
          .
        </p>
        {intact && failRest >= 3 ? (
          <p className="lead">In the other {failRest} scenarios, your savings end up smaller than when you stopped working, or run out.</p>
        ) : null}
        {!intact && failRest >= 3 && plan.monteCarlo.medianFailAge !== null && plan.monteCarlo.medianFailAge !== undefined ? (
          <p className="lead">In the other {failRest} scenarios, your money runs out around age {plan.monteCarlo.medianFailAge} on average.</p>
        ) : null}
        <p className="muted small">
          We replay 100 different versions of the future, with good and bad markets and different inflation. We plan until age {horizonAge} so you are covered if you live long. You can change that age under Assumptions.
        </p>
      </section>
      <section className="card needCard" aria-label="Savings you need">
        <h3>Savings you need on the day you stop (age {retireAge})</h3>
        <p className="muted small">
          {intact
            ? `Based on living on ${pctText(rate)} of your savings each year, and keeping them intact.`
            : `The smallest pot that lasts to ${horizonAge} if returns are exactly average. The same figure is used on the Savings over time slide.`}{' '}
          Amounts are in {unit}.
        </p>
        {noSavingsNeeded && !intact ? (
          <p className="detailLine">
            You would not need savings on the day you stop: your pensions, rent and later property sales already pay for your spending to {horizonAge}, if returns are exactly average. In a typical future you are projected to have built up {formatEur(typicalAtStop)}{soldAtStop > 1000 ? `, including ${formatEur(soldAtStop)} from selling property that year` : ''}.
          </p>
        ) : (
          <div className="needRow">
            <span className="needBig">{neededAtStop === null ? 'n/a' : formatEur(neededAtStop)}</span>
            <span className="needSide">
              whereas you are projected to have built up <strong>{formatEur(typicalAtStop)}</strong> in a typical future{soldAtStop > 1000 ? `, including ${formatEur(soldAtStop)} from selling property that year` : ''}
            </span>
          </div>
        )}
        {intact ? (
          <p className="muted small">Keeping your savings intact means that at {horizonAge} they are still worth at least what they were when you stopped working, in today&rsquo;s money.</p>
        ) : (
          <p className="detailLine">
            {earliest !== null && earliest < retireAge ? `On average returns you could stop as early as ${earliest}.` : ''}
            {earliest !== null && earliest > retireAge ? `On average returns, the earliest age that fully works is ${earliest}.` : ''}
            {earliest === null ? 'On average returns, no retirement age up to 75 fully works.' : ''}
          </p>
        )}

      </section>
      {mort.loans.length > 0 ? <MortgageTimeline loans={mort.loans} age={age} retireAge={retireAge} lastEnd={mort.lastEndAge} /> : null}

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
        <h3>Your savings and what you need</h3>
        <p className="muted tabnote">
          The shaded years at the start are the years you still work. The teal line is the typical future of your savings and investments, and the shaded band holds 8 of 10 simulated futures.{' '}
          {intact
            ? `The amber line is the savings you would need at each age so that living on ${pctText(rate)} of them a year plus your pensions pays for your spending that year, including Box 3 tax, while keeping them intact. A lower share is safer for a long retirement, but needs a bigger pot.`
            : `The amber line is the smallest pot that would last to ${horizonAge} if returns are exactly average, at each age. Before the age you stop, it shows what you would need if you stopped at that age. It is the same figure as the headline, and no yearly percentage is involved.`}{' '}
          {free !== null ? `On this measure your savings are enough from age ${free}.` : 'On this measure your savings never get there.'}
        </p>
        <CorpusChart series={series} retireAge={retireAge} aowAge={aowAge} rate={intact ? rate : null} endAge={horizonAge} events={view.events} />
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
          Your monthly spending at each age, with inflation and the prices of the country you retire to, against pensions and rent plus {intact ? `${pctText(rate)} a year drawn from your savings, divided by 12` : 'what your plan takes from your savings on average returns'}. Amber shows any
          shortfall{intact ? '' : ', which appears only if your savings run out'}. The chart starts at the age you stop working. Point at an age to see what changes then.
        </p>
        <MonthlyChart series={series} retireAge={retireAge} aowAge={aowAge} rate={intact ? rate : null} events={view.events} />
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
          <span className={`stripPct ${verdict.className}`}>{pct}</span>
          <span className="stripOf">of 100 scenarios work</span>
          <span className={`badge ${verdict.className}`}>Verdict: {verdict.label}</span>
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

      <p className="notice" role="note">
        <strong>Beta, a planning estimate.</strong> These are what-if scenarios under stated assumptions, not financial, tax or legal advice. Tax rules are still being checked by advisers. Please check anything important with a licensed adviser before you act on it.
      </p>
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

      <p className="feedbackPrompt">
        Did this match what you expected? <a href={FEEDBACK_URL} target="_blank" rel="noreferrer">Tell us what is off</a>.
      </p>

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

/** Each loan as a bar from today to its end. Teal is paid while you still work, amber after you stop. */
function MortgageTimeline(props: { loans: { id: string; label: string; endAge: number }[]; age: number; retireAge: number; lastEnd: number | null }) {
  const { loans, age, retireAge, lastEnd } = props;
  if (lastEnd === null) return null;
  const to = Math.max(lastEnd, retireAge) + 2;
  const span = Math.max(1, to - age);
  const pctOf = (a: number) => Math.min(100, Math.max(0, ((a - age) / span) * 100));
  const rows = [...loans].sort((a, b) => a.endAge - b.endAge);
  return (
    <section className="card mortgageTl" aria-label="When your mortgages end">
      <h3>{mortgageFreeSentence(lastEnd, retireAge)}</h3>
      <div className="tlWrap">
        <span className="tlStop" style={{ left: `${pctOf(retireAge)}%` }}>Stop work at {retireAge}</span>
        {rows.map((l) => {
          const work = Math.max(0, pctOf(Math.min(l.endAge, retireAge)));
          const after = Math.max(0, pctOf(l.endAge) - pctOf(Math.max(retireAge, age)));
          return (
            <div className="tlRow" key={l.id}>
              <span className="tlName">{l.label}</span>
              <span className="tlTrack">
                <span className="tlWork" style={{ width: `${work}%` }} />
                <span className="tlAfter" style={{ width: `${l.endAge > retireAge ? after : 0}%` }} />
                <span className="tlEnd" style={{ left: `${pctOf(l.endAge)}%` }}>age {l.endAge}</span>
              </span>
            </div>
          );
        })}
        <div className="tlAxis"><span>Age {age}</span><span>{to}</span></div>
      </div>
      <div className="tlLegend"><span><i className="tlWork" />Paid while you work</span><span><i className="tlAfter" />Still paid after you stop</span></div>
    </section>
  );
}
