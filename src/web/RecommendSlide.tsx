import { useEffect, useState } from 'react';
import { computeRecommendations, TARGET, type Change, type LeverResult, type Recommendations, type TrialResult } from './recommend';
import type { Profile } from './profile';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const SEED = 20261022;

function TrialRow(props: { t: TrialResult; base: number; onApply: (c: Change) => void; strong?: boolean }) {
  const { t, base, onApply, strong } = props;
  const up = t.success >= base;
  return (
    <div className={`trial ${strong ? 'strong' : ''}`}>
      <div>
        <strong>{t.label}</strong>
        <span className="muted small">
          {' '}
          {pct(base)} &rarr; <b className={t.success >= TARGET ? 'good' : up ? 'warn' : 'bad'}>{pct(t.success)}</b> ({up ? '+' : ''}
          {Math.round((t.success - base) * 100)} points)
        </span>
      </div>
      <button type="button" className="applybtn" onClick={() => onApply(t.change)}>
        Apply
      </button>
    </div>
  );
}

function Lever(props: { l: LeverResult; base: number; safe: boolean; onApply: (c: Change) => void }) {
  const { l, base, safe, onApply } = props;
  if (l.trials.length === 0) return null;
  const last = l.trials[l.trials.length - 1] as TrialResult;
  return (
    <section className="card lever">
      <h3>{l.title}</h3>
      {l.id === 'place' ? (
        <p className="muted tabnote">The same plan, with a different place to retire. India results look rosier than they are: Indian income tax and private healthcare are not modelled yet.</p>
      ) : null}
      {l.pick ? (
        <>
          <p className="leverLine">
            {safe
              ? l.id === 'place'
                ? 'A better place for your money:'
                : 'You could go as far as this and still be safe:'
              : l.id === 'place'
                ? 'The best other place:'
                : 'The smallest change that gets you to safe:'}
          </p>
          <TrialRow t={l.pick} base={base} onApply={onApply} strong />
        </>
      ) : (
        <p className="leverLine">
          {safe ? 'Even the first step takes you below the safe level.' : `Even the biggest change I tried (${last.label.toLowerCase()}) only reaches ${pct(last.success)}.`}
        </p>
      )}
      {l.trials.length > 1 ? (
        <details>
          <summary>All the options I tried</summary>
          {l.trials.map((t) => (
            <TrialRow key={t.label} t={t} base={base} onApply={onApply} />
          ))}
        </details>
      ) : null}
    </section>
  );
}

export default function Recommend(props: {
  profile: Profile;
  eurToInr: number;
  startYear: number;
  onApply: (c: Change) => void;
  onUndo: () => void;
  canUndo: boolean;
  active: boolean;
}) {
  const { profile, eurToInr, startYear, onApply, onUndo, canUndo, active } = props;
  const [rec, setRec] = useState<Recommendations | null | 'busy'>('busy');
  const key = JSON.stringify(profile) + eurToInr + startYear;
  useEffect(() => {
    if (!active) return;
    setRec('busy');
    // Let the browser paint "Working..." first; the calculation takes a second or two.
    const id = window.setTimeout(() => setRec(computeRecommendations(profile, { eurToInr, startYear, paths: 300, seed: SEED })), 40);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active]);

  if (rec === 'busy') {
    return (
      <section className="card" aria-live="polite">
        <h3>What you could do</h3>
        <p className="muted">Trying changes on your plan&hellip;</p>
      </section>
    );
  }
  if (rec === null) {
    return (
      <section className="card">
        <h3>What you could do</h3>
        <p className="muted">Fill in the missing answers and run the simulation to see suggestions.</p>
      </section>
    );
  }
  return (
    <>
      <section className="card">
        <h3>What you could do</h3>
        <p>
          {rec.safe
            ? `Your plan is safe: your money lasts in ${pct(rec.base)} of simulated futures, above the ${pct(rec.target)} we aim for. Here is how much room you have.`
            : `Your money lasts in ${pct(rec.base)} of simulated futures. We aim for ${pct(rec.target)}. Here is what each change would do, tested on your own numbers.`}
        </p>
        {canUndo ? (
          <button type="button" className="linkbtn" onClick={onUndo}>
            Undo the last change
          </button>
        ) : null}
        {rec.combo ? (
          <>
            <p className="leverLine">No single change gets you there. The smallest mix that does:</p>
            <TrialRow t={rec.combo} base={rec.base} onApply={onApply} strong />
          </>
        ) : null}
        {!rec.combo && !rec.safe && rec.comboBest ? (
          <p className="leverLine">
            Even the strongest mix I tried ({rec.comboBest.label.toLowerCase()}) only reaches {pct(rec.comboBest.success)}. The gap is too big for small adjustments: look at the size of your savings, your income, or a very different plan for where you retire.
          </p>
        ) : null}
        <p className="muted small">Each result comes from 300 simulated futures, so small differences are noise. Applying a change updates your answers in the form, and you can undo it.</p>
      </section>
      {rec.levers.map((l) => (
        <Lever key={l.id} l={l} base={rec.base} safe={rec.safe} onApply={onApply} />
      ))}
    </>
  );
}
