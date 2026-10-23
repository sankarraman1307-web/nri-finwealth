import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { independenceAge, type DrawdownPoint } from './chartData';
import { formatEur, formatEurFull } from './profile';

// ---------------------------------------------------------------------------------------------
// Shared pieces: scales, axes, hover cursor and tooltip. Everything is plain SVG, no chart library.
// ---------------------------------------------------------------------------------------------

const W = 720;
const H = 320;
const M = { top: 16, right: 16, bottom: 36, left: 64 };
const INK = '#0f1b2d';
const TEAL = '#0b6b73';
const BLUE = '#5b7fa6';
const AMBER = '#d99a3e';
const MUTED = '#4a5a6d';

/** A round-number step for the y axis (1, 2, 5 times a power of ten). */
export function niceStep(max: number, ticks: number): number {
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}

function makeScales(xMin: number, xMax: number, top: number) {
  const step = niceStep(Math.max(top, 1), 4);
  const yMax = Math.ceil(Math.max(top, 1) / step) * step;
  const x = (v: number) => M.left + ((v - xMin) / Math.max(1e-9, xMax - xMin)) * (W - M.left - M.right);
  const y = (v: number) => H - M.bottom - (Math.max(0, Math.min(v, yMax)) / yMax) * (H - M.top - M.bottom);
  const yTicks: number[] = [];
  for (let v = 0; v <= yMax + 1e-6; v += step) yTicks.push(v);
  const xTicks: number[] = [];
  for (let a = Math.ceil(xMin / 5) * 5; a <= xMax; a += 5) xTicks.push(a);
  return { x, y, yTicks, xTicks };
}

function Axes(props: { x: (v: number) => number; y: (v: number) => number; xTicks: number[]; yTicks: number[]; yFormat: (v: number) => string }) {
  return (
    <>
      {props.yTicks.map((v) => (
        <g key={v}>
          <line x1={M.left} x2={W - M.right} y1={props.y(v)} y2={props.y(v)} stroke="#e1e7ee" />
          <text x={M.left - 8} y={props.y(v) + 4} fontSize="12" textAnchor="end" fill={MUTED}>
            {props.yFormat(v)}
          </text>
        </g>
      ))}
      {props.xTicks.map((a) => (
        <text key={a} x={props.x(a)} y={H - 12} fontSize="12" textAnchor="middle" fill={MUTED}>
          {a}
        </text>
      ))}
    </>
  );
}

function Marker(props: { x: number; label: string; row: number }) {
  return (
    <g pointerEvents="none">
      <line x1={props.x} x2={props.x} y1={M.top} y2={H - M.bottom} stroke="#8a97a8" strokeDasharray="4 4" />
      <text x={props.x + 4} y={M.top + 14 + props.row * 16} fontSize="12" fontWeight="700" fill={MUTED}>
        {props.label}
      </text>
    </g>
  );
}

interface TipRow {
  label: string;
  value: string;
  color: string;
}

type Events = Map<number, string[]>;

/** Small diamonds on the age axis where something happens in your plan. */
function EventTicks(props: { events: Events; x: (v: number) => number; minAge: number; maxAge: number }) {
  const ages = [...props.events.keys()].filter((a) => a >= props.minAge && a <= props.maxAge);
  return (
    <g pointerEvents="none" aria-hidden="true">
      {ages.map((a) => (
        <path key={a} d={`M${props.x(a)},${H - M.bottom - 7} l4,4 l-4,4 l-4,-4 z`} fill="#8a97a8" stroke="#fff" strokeWidth="1" />
      ))}
    </g>
  );
}

const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}\u2026` : t);

function Tip(props: { cx: number; title: string; rows: TipRow[]; events?: string[] }) {
  const ev = props.events ?? [];
  const shown = ev.slice(0, 4);
  const width = ev.length > 0 ? 270 : 236;
  const evHeight = ev.length > 0 ? 12 + shown.length * 16 + (ev.length > shown.length ? 16 : 0) : 0;
  const height = 30 + props.rows.length * 20 + evHeight;
  const left = props.cx + 14 + width > W - 4 ? props.cx - 14 - width : props.cx + 14;
  return (
    <g pointerEvents="none">
      <line x1={props.cx} x2={props.cx} y1={M.top} y2={H - M.bottom} stroke={INK} strokeWidth="1" />
      <g transform={`translate(${left},${M.top + 4})`}>
        <rect width={width} height={height} rx="10" fill="#fff" stroke="#bcc8d5" />
        <text x="12" y="20" fontSize="13" fontWeight="800" fill={INK}>
          {props.title}
        </text>
        {props.rows.map((r, i) => (
          <g key={r.label} transform={`translate(12,${40 + i * 20})`}>
            <circle cx="4" cy="-4" r="4" fill={r.color} />
            <text x="16" y="0" fontSize="12" fill={MUTED}>
              {r.label}
            </text>
            <text x={width - 24} y="0" fontSize="12" fontWeight="800" fill={INK} textAnchor="end">
              {r.value}
            </text>
          </g>
        ))}
        {shown.map((t, i) => (
          <text key={t} x="12" y={40 + props.rows.length * 20 + 6 + i * 16} fontSize="12" fontWeight="700" fill={INK}>
            {'\u25C6 '}
            {clip(t, 38)}
          </text>
        ))}
        {ev.length > shown.length ? (
          <text x="12" y={40 + props.rows.length * 20 + 6 + shown.length * 16} fontSize="12" fill={MUTED}>
            {`+ ${ev.length - shown.length} more`}
          </text>
        ) : null}
      </g>
    </g>
  );
}

/**
 * Hover (mouse or touch) and the arrow keys move a cursor along the chart. `xs` are the x values of the
 * data points. Returns the nearest index, or null when nothing is pointed at.
 */
function useCursor(xs: number[], toPx: (v: number) => number, start: number) {
  const ref = useRef<SVGSVGElement>(null);
  const [idx, setIdx] = useState<number | null>(null);
  const nearest = (e: PointerEvent<SVGSVGElement>) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || box.width === 0) return null;
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    let bestD = Number.POSITIVE_INFINITY;
    xs.forEach((v, i) => {
      const d = Math.abs(toPx(v) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };
  const handlers = {
    onPointerMove: (e: PointerEvent<SVGSVGElement>) => setIdx(nearest(e)),
    onPointerDown: (e: PointerEvent<SVGSVGElement>) => setIdx(nearest(e)),
    onPointerLeave: (e: PointerEvent<SVGSVGElement>) => {
      if (e.pointerType === 'mouse') setIdx(null);
    },
    onFocus: () => setIdx((i) => i ?? Math.max(0, Math.min(xs.length - 1, start))),
    onBlur: () => setIdx(null),
    onKeyDown: (e: KeyboardEvent<SVGSVGElement>) => {
      if (e.key === 'ArrowRight') setIdx((i) => Math.min(xs.length - 1, (i ?? start) + 1));
      else if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, (i ?? start) - 1));
      else if (e.key === 'Escape') setIdx(null);
      else return;
      e.preventDefault();
    },
  };
  return { ref, idx, handlers };
}

function Frame(props: { svgRef: React.RefObject<SVGSVGElement | null>; label: string; handlers: object; children: ReactNode; legend: ReactNode; note?: string }) {
  return (
    <figure className="chart">
      <svg ref={props.svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={props.label} width="100%" tabIndex={0} className="hoverchart" {...props.handlers}>
        {props.children}
      </svg>
      <figcaption>{props.legend}</figcaption>
      <p className="muted small chartHint">Point at the chart, or use the left and right arrow keys, to read the numbers.{props.note ? ` ${props.note}` : ''}</p>
    </figure>
  );
}

// ---------------------------------------------------------------------------------------------
// 1. Your corpus versus the corpus you need
// ---------------------------------------------------------------------------------------------

export function CorpusChart(props: { series: DrawdownPoint[]; retireAge: number; aowAge: number; rate: number; events: Events }) {
  const { series, retireAge, aowAge, rate, events } = props;
  const first = series[0];
  const last = series[series.length - 1];
  const minAge = first?.age ?? 0;
  const maxAge = last?.age ?? 1;
  const top = Math.max(...series.map((p) => Math.max(p.high, p.needed)), 1);
  const sc = makeScales(minAge, maxAge, top);
  const startIdx = Math.max(0, series.findIndex((p) => p.age === retireAge));
  const cur = useCursor(series.map((p) => p.age), sc.x, startIdx);
  if (!first || !last || series.length < 2) return null;

  const path = (pick: (p: DrawdownPoint) => number) => series.map((p, i) => `${i === 0 ? 'M' : 'L'}${sc.x(p.age).toFixed(1)},${sc.y(pick(p)).toFixed(1)}`).join(' ');
  const area =
    series.map((p, i) => `${i === 0 ? 'M' : 'L'}${sc.x(p.age).toFixed(1)},${sc.y(p.high).toFixed(1)}`).join(' ') +
    ' ' +
    [...series].reverse().map((p) => `L${sc.x(p.age).toFixed(1)},${sc.y(p.low).toFixed(1)}`).join(' ') +
    ' Z';
  const free = independenceAge(series);
  const atRetire = series.find((p) => p.age === retireAge);
  const hit = cur.idx === null ? null : series[cur.idx];
  const pct = `${(rate * 100).toFixed(1).replace(/\.0$/, '')}%`;
  const label =
    `Your corpus compared with the corpus you need, from age ${minAge} to ${maxAge}. Drawdown rate ${pct}. ` +
    (atRetire ? `At ${retireAge} the typical future holds ${formatEur(atRetire.corpus)} and you need ${formatEur(atRetire.needed)}. ` : '') +
    (free !== null ? `The corpus first covers what is needed at age ${free}.` : 'The corpus never covers what is needed.');

  return (
    <Frame
      svgRef={cur.ref}
      label={label}
      handlers={cur.handlers}
      legend={
        <>
          <span className="swatch line" /> Your corpus (typical future) &nbsp; <span className="swatch band" /> 8 in 10 futures &nbsp; <span className="swatch line amber" /> Corpus you need at {pct} a year &nbsp; <span className="swatch sq" style={{ background: BLUE, opacity: 0.25 }} /> Years you still work
        </>
      }
    >
      <Axes {...sc} yFormat={formatEur} />
      {retireAge > minAge ? <rect x={sc.x(minAge)} y={M.top} width={sc.x(Math.min(retireAge, maxAge)) - sc.x(minAge)} height={H - M.top - M.bottom} fill={BLUE} opacity="0.07" pointerEvents="none" /> : null}
      <path d={area} fill={TEAL} opacity="0.16" />
      <path d={path((p) => p.low)} fill="none" stroke={TEAL} strokeWidth="1" opacity="0.5" />
      <path d={path((p) => p.high)} fill="none" stroke={TEAL} strokeWidth="1" opacity="0.5" />
      <path d={path((p) => p.needed)} fill="none" stroke={AMBER} strokeWidth="3" />
      <path d={path((p) => p.corpus)} fill="none" stroke={TEAL} strokeWidth="3" />
      {retireAge >= minAge && retireAge <= maxAge ? <Marker x={sc.x(retireAge)} label={`Retire ${retireAge}`} row={0} /> : null}
      {aowAge >= minAge && aowAge <= maxAge ? <Marker x={sc.x(aowAge)} label={`State pension ${aowAge}`} row={1} /> : null}
      {free !== null && free !== retireAge ? <Marker x={sc.x(free)} label={`Corpus is enough from ${free}`} row={2} /> : null}
      <EventTicks events={events} x={sc.x} minAge={minAge} maxAge={maxAge} />
      {hit ? (
        <>
          {[hit.high, hit.corpus, hit.low].map((v, i) => (
            <circle key={i} cx={sc.x(hit.age)} cy={sc.y(v)} r="4.5" fill="#fff" stroke={TEAL} strokeWidth="2" pointerEvents="none" />
          ))}
          <circle cx={sc.x(hit.age)} cy={sc.y(hit.needed)} r="4.5" fill="#fff" stroke={AMBER} strokeWidth="2" pointerEvents="none" />
          <Tip
            cx={sc.x(hit.age)}
            title={`Age ${hit.age}`}
            events={events.get(hit.age)}
            rows={[
              { label: 'Good luck (1 in 10)', value: formatEur(hit.high), color: TEAL },
              { label: 'Your corpus (typical)', value: formatEur(hit.corpus), color: INK },
              { label: 'Bad luck (1 in 10)', value: formatEur(hit.low), color: TEAL },
              { label: `Needed at ${pct} a year`, value: formatEur(hit.needed), color: AMBER },
              { label: hit.corpus >= hit.needed ? 'Cushion' : 'Short by', value: formatEur(Math.abs(hit.corpus - hit.needed)), color: hit.corpus >= hit.needed ? TEAL : AMBER },
            ]}
          />
        </>
      ) : null}
    </Frame>
  );
}

// ---------------------------------------------------------------------------------------------
// 2. What you need each month versus what the corpus and pensions give
// ---------------------------------------------------------------------------------------------

export function MonthlyChart(props: { series: DrawdownPoint[]; retireAge: number; aowAge: number; rate: number; events: Events }) {
  const { rate, events } = props;
  const { retireAge, aowAge } = props;
  // Only from the age you stop working: that is when the corpus has to pay for your life.
  const series = props.series.filter((p) => p.age >= retireAge);
  const first = series[0];
  const last = series[series.length - 1];
  const minAge = first?.age ?? 0;
  const maxAge = last?.age ?? 1;
  const top = Math.max(...series.map((p) => Math.max(p.monthlyNeed, p.pensions + p.drawdown)), 1);
  const sc = makeScales(minAge, maxAge, top);
  const startIdx = Math.max(0, series.findIndex((p) => p.age === retireAge));
  const cur = useCursor(series.map((p) => p.age), sc.x, startIdx);
  if (!first || !last || series.length < 2) return null;

  const layer = (lo: (p: DrawdownPoint) => number, hi: (p: DrawdownPoint) => number) =>
    series.map((p, i) => `${i === 0 ? 'M' : 'L'}${sc.x(p.age).toFixed(1)},${sc.y(hi(p)).toFixed(1)}`).join(' ') +
    ' ' +
    [...series].reverse().map((p) => `L${sc.x(p.age).toFixed(1)},${sc.y(lo(p)).toFixed(1)}`).join(' ') +
    ' Z';
  const income = (p: DrawdownPoint) => p.pensions + p.drawdown;
  const needLine = series.map((p, i) => `${i === 0 ? 'M' : 'L'}${sc.x(p.age).toFixed(1)},${sc.y(p.monthlyNeed).toFixed(1)}`).join(' ');
  const hit = cur.idx === null ? null : series[cur.idx];
  const pct = `${(rate * 100).toFixed(1).replace(/\.0$/, '')}%`;
  const atRetire = series.find((p) => p.age === retireAge);
  const label =
    `Monthly spending compared with monthly income from pensions and a ${pct} drawdown, from age ${minAge} to ${maxAge}. ` +
    (atRetire ? `At ${retireAge} you need ${formatEurFull(atRetire.monthlyNeed)} a month and the drawdown plus pensions give ${formatEurFull(income(atRetire))}.` : '');

  return (
    <Frame
      svgRef={cur.ref}
      label={label}
      handlers={cur.handlers}
      note="Typical future for the corpus, average returns for spending. Spending includes the mortgage and Box 3 tax."
      legend={
        <>
          <span className="swatch line ink" /> What you need a month &nbsp; <span className="swatch sq" style={{ background: BLUE }} /> Pensions and rent &nbsp; <span className="swatch sq" style={{ background: TEAL }} /> Drawdown from the
          corpus at {pct} &nbsp; <span className="swatch sq" style={{ background: AMBER }} /> Short of the safe draw
        </>
      }
    >
      <Axes {...sc} yFormat={formatEur} />
      <path d={layer(() => 0, (p) => p.pensions)} fill={BLUE} opacity="0.85" />
      <path d={layer((p) => p.pensions, income)} fill={TEAL} opacity="0.85" />
      <path d={layer(income, (p) => Math.max(income(p), p.monthlyNeed))} fill={AMBER} opacity="0.9" />
      <path d={needLine} fill="none" stroke={INK} strokeWidth="2.5" />
      <EventTicks events={events} x={sc.x} minAge={minAge} maxAge={maxAge} />
      {retireAge >= minAge && retireAge <= maxAge ? <Marker x={sc.x(retireAge)} label={`Retire ${retireAge}`} row={0} /> : null}
      {aowAge >= minAge && aowAge <= maxAge ? <Marker x={sc.x(aowAge)} label={`State pension ${aowAge}`} row={1} /> : null}
      {hit ? (
        <>
          <circle cx={sc.x(hit.age)} cy={sc.y(hit.monthlyNeed)} r="4.5" fill="#fff" stroke={INK} strokeWidth="2" pointerEvents="none" />
          <Tip
            cx={sc.x(hit.age)}
            title={`Age ${hit.age}, per month`}
            events={events.get(hit.age)}
            rows={[
              { label: 'You need', value: formatEurFull(hit.monthlyNeed), color: INK },
              { label: 'Pensions and rent', value: formatEurFull(hit.pensions), color: BLUE },
              { label: `Drawdown at ${pct}`, value: formatEurFull(hit.drawdown), color: TEAL },
              { label: hit.gap >= 0 ? 'Left over' : 'Short of the safe draw', value: formatEurFull(Math.abs(hit.gap)), color: hit.gap >= 0 ? TEAL : AMBER },
              { label: 'Your plan takes from savings', value: formatEurFull(hit.actualFromSavings), color: INK },
            ]}
          />
        </>
      ) : null}
    </Frame>
  );
}
