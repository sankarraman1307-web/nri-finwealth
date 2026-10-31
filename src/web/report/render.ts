/** Turns a ReportModel into PDF bytes. All drawing lives here; all numbers come from the model. */
import { A4, C, CONTENT_W, Doc, M, type Color, type FontBytes } from './pdfDoc';
import type { ChartPoint, ReportModel } from './model';

const TONE: Record<ReportModel['tone'], { fg: Color; bg: Color }> = {
  good: { fg: C.teal, bg: C.tealLight },
  warn: { fg: C.amber, bg: C.amberLight },
  bad: { fg: C.red, bg: C.redLight },
};

const compactEur = (v: number): string => (v >= 1e6 ? `€${Number((v / 1e6).toFixed(1))}M` : v >= 1e4 ? `€${Math.round(v / 1e3)}k` : `€${Math.round(v).toLocaleString('en-US')}`);
const monthEur = (v: number): string => `€${Math.round(v).toLocaleString('en-US')}`;

function niceTicks(max: number, want = 4): number[] {
  if (!(max > 0)) return [0];
  const raw = max / want;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.01; v += step) out.push(v);
  return out;
}

interface Line {
  color: Color;
  width: number;
  values: (number | null)[];
}
interface ChartSpec {
  height: number;
  ages: number[];
  lines: Line[];
  band?: { low: number[]; high: number[] };
  marks: { age: number; label: string; dash?: boolean; row: number }[];
  shadeUntil?: number;
  fmt: (v: number) => string;
}

function chart(doc: Doc, s: ChartSpec): void {
  const L = M.left + 44;
  const R = A4.w - M.right - 4;
  const h = s.height;
  doc.ensure(h + 34);
  const top = doc.y + 6;
  const bottom = top + h - 20;
  const a0 = s.ages[0] ?? 0;
  const a1 = s.ages[s.ages.length - 1] ?? a0 + 1;
  let max = 0;
  for (const l of s.lines) for (const v of l.values) if (v !== null && Number.isFinite(v)) max = Math.max(max, v);
  if (s.band) for (const v of s.band.high) if (Number.isFinite(v)) max = Math.max(max, v);
  max *= 1.05;
  const ticks = niceTicks(max);
  const top2 = Math.max(max, ticks[ticks.length - 1] ?? max);
  const X = (a: number) => L + ((a - a0) / Math.max(1, a1 - a0)) * (R - L);
  const Y = (v: number) => top + (1 - Math.min(v, top2) / top2) * (bottom - top);
  const pg = doc.page;
  const abs = (t: number) => A4.h - t;

  if (s.shadeUntil !== undefined && s.shadeUntil > a0) {
    doc.rect(L, top, X(Math.min(s.shadeUntil, a1)) - L, bottom - top, C.zebra);
  }
  for (const t of ticks) {
    pg.drawLine({ start: { x: L, y: abs(Y(t)) }, end: { x: R, y: abs(Y(t)) }, thickness: 0.4, color: C.line });
    doc.drawRight(s.fmt(t), L - 5, Y(t) - 4, 7.5, 'regular', C.muted);
  }
  for (let a = Math.ceil(a0 / 5) * 5; a <= a1; a += 5) doc.drawLine(String(a), X(a) - 6, bottom + 5, 7.5, 'regular', C.muted);

  if (s.band) {
    const up = s.ages.map((a, i) => `${i === 0 ? 'M' : 'L'} ${X(a).toFixed(1)} ${Y(s.band!.high[i] ?? 0).toFixed(1)}`).join(' ');
    const down = [...s.ages].reverse().map((a, j) => `L ${X(a).toFixed(1)} ${Y(s.band!.low[s.ages.length - 1 - j] ?? 0).toFixed(1)}`).join(' ');
    pg.drawSvgPath(`${up} ${down} Z`, { x: 0, y: A4.h, color: C.teal, opacity: 0.14, borderWidth: 0 });
  }
  for (const l of s.lines) {
    let d = '';
    let pen = false;
    s.ages.forEach((a, i) => {
      const v = l.values[i];
      if (v === null || v === undefined || !Number.isFinite(v)) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'} ${X(a).toFixed(1)} ${Y(v).toFixed(1)} `;
      pen = true;
    });
    if (d.trim() !== '') pg.drawSvgPath(d, { x: 0, y: A4.h, borderColor: l.color, borderWidth: l.width });
  }
  for (const m of s.marks) {
    if (m.age < a0 || m.age > a1) continue;
    pg.drawLine({ start: { x: X(m.age), y: abs(top) }, end: { x: X(m.age), y: abs(bottom) }, thickness: 0.8, color: C.ink, dashArray: [3, 3] });
    doc.drawLine(m.label, X(m.age) + 3, top + 2 + m.row * 10, 7.5, 'bold', C.ink);
  }
  doc.y = bottom + 18;
}

function legend(doc: Doc, items: { color: Color; label: string; fillOnly?: boolean }[]): void {
  doc.ensure(16);
  let x = M.left;
  for (const it of items) {
    if (it.fillOnly) doc.rect(x, doc.y + 2, 14, 7, C.tealLight);
    else doc.rect(x, doc.y + 4, 14, 2.2, it.color);
    doc.drawLine(it.label, x + 19, doc.y, 8, 'regular', C.muted);
    x += 19 + doc.width(it.label, 8) + 14;
  }
  doc.y += 18;
}

function verdictBlock(doc: Doc, m: ReportModel): void {
  const t = TONE[m.tone];
  const lines = doc.wrap(m.headline, 13, CONTENT_W - 24, 'bold');
  const tileH = 44;
  const need = 8 + 18 + 6 + lines.length * 18 + 8 + 14 + 6 + 12 + tileH + 6;
  doc.ensure(need + 10);
  const x0 = M.left + 12;
  const w = CONTENT_W - 24;
  const top = doc.y;
  doc.rect(M.left, top, CONTENT_W, need, C.white, 8, C.line);
  // badge
  const label = `Verdict: ${m.verdictLabel}`;
  const bw = doc.width(label, 9, 'bold') + 18;
  doc.rect(x0, top + 9, bw, 15, t.bg, 7.5);
  doc.drawLine(label, x0 + 9, top + 12.5, 9, 'bold', t.fg);
  let y = top + 32;
  for (const ln of lines) {
    doc.drawLine(ln, x0, y, 13, 'bold', C.ink);
    y += 18;
  }
  y += 4;
  // meter
  doc.rect(x0, y, w, 8, C.line, 4);
  if (m.pct > 0) doc.rect(x0, y, Math.max(8, (w * m.pct) / 100), 8, t.fg, 4);
  doc.rect(x0 + w * 0.9 - 1, y - 3, 2, 14, C.ink);
  y += 14;
  doc.drawLine('0', x0, y, 7.5, 'regular', C.muted);
  doc.drawLine('Aim for 90 or more', x0 + w * 0.9 - doc.width('Aim for 90 or more', 7.5) / 2, y, 7.5, 'regular', C.muted);
  doc.drawRight('100', x0 + w, y, 7.5, 'regular', C.muted);
  y += 16;
  // place tiles
  const gap = 8;
  const tw = (w - gap * (m.places.length - 1)) / m.places.length;
  m.places.forEach((p, i) => {
    const tx = x0 + i * (tw + gap);
    doc.rect(tx, y, tw, tileH, p.on ? C.tealLight : C.zebra, 6, p.on ? C.teal : C.line);
    const nm = doc.wrap(p.name, 8, tw - 12, 'regular');
    nm.slice(0, 2).forEach((ln, k) => doc.drawLine(ln, tx + 8, y + 6 + k * 10, 8, p.on ? 'bold' : 'regular', C.muted));
    doc.drawRight(`${p.pct}%`, tx + tw - 8, y + 22, 15, 'extra', C.ink);
  });
  doc.y = top + need + 8;
  doc.text(m.placeNote, { size: 8.5, color: C.muted });
  doc.text(m.legacyText, { size: 9.5, color: C.ink });
  doc.text(m.lead, { size: 10.5, font: 'bold', color: C.ink, gapAfter: 8 });
  if (m.warning) doc.callout(m.warning.rest ? `${m.warning.first} ${m.warning.rest}` : m.warning.first, { fill: C.amberLight, size: 9 });
}

function inputsBlock(doc: Doc, m: ReportModel): void {
  doc.h2('Your inputs', 70);
  doc.text('These are the answers this report is based on. Amounts you left empty are not shown.', { size: 9, color: C.muted, gapAfter: 6 });
  const cols = [215, CONTENT_W - 215];
  for (const g of m.inputs) {
    const rows = g.rows.map((r) => (r.kind === 'row' ? { cells: [r.label, r.value] } : { cells: [r.label, ''], bold: true, fill: C.zebra }));
    doc.table({ cols, head: [g.title, ''], headCont: [`${g.title} (continued)`, ''], rows, size: 9, keepTogether: 190 });
  }
}

function needBlock(doc: Doc, m: ReportModel): void {
  const n = m.need;
  doc.h2(n.title, 110);
  doc.text(n.explain, { size: 9, color: C.muted, gapAfter: 6 });
  if (n.noNeedText) {
    doc.callout(n.noNeedText, { fill: C.tealLight, size: 10 });
  } else {
    const h = 54;
    doc.ensure(h + 8);
    const half = (CONTENT_W - 10) / 2;
    doc.rect(M.left, doc.y, half, h, C.tealLight, 8);
    doc.drawLine(n.neededText ?? 'n/a', M.left + 12, doc.y + 8, 22, 'extra', C.teal);
    doc.drawLine('what you need on the day you stop', M.left + 12, doc.y + 38, 8.5, 'regular', C.muted);
    doc.rect(M.left + half + 10, doc.y, half, h, C.zebra, 8);
    const parts = n.typicalText.split(' projected');
    doc.drawLine(parts[0] ?? '', M.left + half + 22, doc.y + 8, 22, 'extra', C.ink);
    const rest = doc.wrap(`projected${parts[1] ?? ''}`, 8.5, half - 24, 'regular');
    rest.slice(0, 2).forEach((ln, k) => doc.drawLine(ln, M.left + half + 22, doc.y + 33 + k * 10, 8.5, 'regular', C.muted));
    doc.y += h + 8;
  }
  doc.text(n.earliestText, { size: 9.5 });
  if (n.mortgageText) doc.text(n.mortgageText, { size: 9.5 });
  if (m.bridge) {
    const b = m.bridge;
    doc.h2(b.title, 90);
    doc.callout(b.verdict, { fill: m.tone === 'good' ? C.tealLight : C.redLight, size: 9.5, font: 'bold' });
    for (const bl of b.bullets) doc.text(`•  ${bl}`, { size: 9.5, x: M.left + 6, width: CONTENT_W - 6, gapAfter: 2 });
    doc.text(b.note, { size: 8.5, color: C.muted });
  }
}

function chartsBlock(doc: Doc, m: ReportModel): void {
  const c = m.chart;
  const pts: ChartPoint[] = c.points;
  doc.h2('Your savings and what you need, by age', 230);
  doc.text(
    c.intact
      ? `The teal line is the typical future of your savings. The amber line is the savings you need at each age to live on ${Number((c.rate * 100).toFixed(1))}% of them a year while keeping them intact. ${c.freeText}`
      : `The teal line is the typical future of your savings. The amber line is the smallest pot that lasts to ${c.horizonAge} on average returns. ${c.freeText}`,
    { size: 8.5, color: C.muted, gapAfter: 4 },
  );
  chart(doc, {
    height: 200,
    ages: pts.map((p) => p.age),
    lines: [
      { color: C.amber, width: 1.8, values: pts.map((p) => (Number.isFinite(p.needed) ? p.needed : null)) },
      { color: C.teal, width: 1.8, values: pts.map((p) => p.corpus) },
    ],
    band: { low: pts.map((p) => p.low), high: pts.map((p) => p.high) },
    marks: [
      { age: c.retireAge, label: `Stop working ${c.retireAge}`, row: 0 },
      { age: c.aowAge, label: `State pension ${c.aowAge}`, row: 1 },
    ],
    shadeUntil: c.retireAge,
    fmt: compactEur,
  });
  legend(doc, [
    { color: C.teal, label: 'Your savings (typical future)' },
    { color: C.amber, label: c.intact ? 'Savings you need, kept intact' : `Savings you need to last to ${c.horizonAge}` },
    { color: C.teal, label: '8 in 10 futures', fillOnly: true },
  ]);

  const after = pts.filter((p) => p.age >= c.retireAge);
  if (after.length > 2) {
    doc.h2('What you need each month and what you would get', 190);
    doc.text('Your monthly spending at each age against pensions and rent plus what your savings can pay. The chart starts at the age you stop working. Amounts are in today’s euros.', { size: 8.5, color: C.muted, gapAfter: 4 });
    chart(doc, {
      height: 170,
      ages: after.map((p) => p.age),
      lines: [
        { color: C.amber, width: 4, values: after.map((p) => p.monthlyNeed) },
        { color: C.teal, width: 1.4, values: after.map((p) => p.pensions + p.drawdown) },
      ],
      marks: [{ age: c.aowAge, label: `State pension ${c.aowAge}`, row: 0 }],
      fmt: monthEur,
    });
    legend(doc, [
      { color: C.amber, label: 'What you spend a month' },
      { color: C.teal, label: c.intact ? 'Pensions and rent plus your yearly share of savings' : 'Pensions and rent plus what your plan takes from savings' },
    ]);
  }
}

function whatIfBlock(doc: Doc, m: ReportModel): void {
  const w = m.whatIf;
  doc.h2('What if something changes?', 110);
  doc.text('The same plan with one change at a time. Each row is a new run of the planner with the same assumptions and the same 400 simulated futures.', { size: 9, color: C.muted, gapAfter: 6 });
  const base = w.rows[0]?.pct ?? 0;
  const cols = w.showNeeded ? [175, 80, 80, 90, CONTENT_W - 425] : [215, 100, 100, CONTENT_W - 415];
  const head = w.showNeeded ? ['Change', 'Chance it lasts', 'Against your plan', 'Savings you need', 'Typical savings'] : ['Change', 'Chance it lasts', 'Against your plan', 'Typical savings'];
  const fmtD = (n: number) => (n === 0 ? 'same' : `${n > 0 ? '+' : '-'}${Math.abs(n)} points`);
  const rows = w.rows.map((r) => ({
    cells: [r.label, `${r.pct} of 100`, r.isBase ? '' : fmtD(r.pct - base), ...(w.showNeeded ? [r.needed === null ? 'none needed' : compactEur(r.needed)] : []), compactEur(r.typical)],
    ...(r.isBase ? { bold: true, fill: C.tealLight } : {}),
  }));
  doc.table({ cols, head, rows, align: ['l', 'r', 'r', ...(w.showNeeded ? (['r', 'r'] as const) : (['r'] as const))] });
  doc.text('Savings amounts are on the day you stop working, in today’s euros. "Typical" is the middle of the simulated futures.', { size: 8, color: C.muted });
}

function assumptionsBlock(doc: Doc, m: ReportModel): void {
  doc.h2('Assumptions used', 90);
  doc.text('Standard assumptions unless marked "changed". You can change them in the planner under Assumptions.', { size: 9, color: C.muted, gapAfter: 6 });
  doc.table({
    cols: [260, 90, CONTENT_W - 350],
    head: ['Assumption', 'Used', ''],
    headCont: ['Assumption (continued)', 'Used', ''],
    rows: m.assumptions.map((a) => ({ cells: [a.label, a.value, a.changed ? 'changed' : ''] })),
    align: ['l', 'r', 'l'],
  });
  doc.h2('What is not in these numbers', 70);
  for (const w of m.warnings) doc.text(`•  ${w}`, { size: 9, x: M.left + 6, width: CONTENT_W - 6, gapAfter: 3 });
  doc.space(6);
  doc.callout(
    `This is a planning estimate, not financial, tax or legal advice. It shows what could happen under the stated assumptions. Tax rules as of ${m.rulesAsOf}; some are proposals and some Indian rules are not included yet. Check anything important with a licensed cross-border adviser before you act on it. Prepared ${m.generated} on nrifinwealth.com with planner engine v${m.engineVersion}.`,
    { fill: C.zebra, size: 8.5, title: 'Not advice', titleColor: C.ink },
  );
}

export async function renderReport(m: ReportModel, fonts: FontBytes): Promise<Uint8Array> {
  const doc = await Doc.create(fonts);
  doc.drawLine('My retirement plan', M.left, doc.y - 6, 22, 'extra', C.ink);
  doc.y += 28;
  doc.drawLine(`Netherlands and India  ·  prepared ${m.generated}  ·  all amounts in today’s euros`, M.left, doc.y, 9, 'regular', C.muted);
  doc.y += 12;
  doc.h2('The verdict', 140);
  verdictBlock(doc, m);
  inputsBlock(doc, m);
  needBlock(doc, m);
  chartsBlock(doc, m);
  whatIfBlock(doc, m);
  assumptionsBlock(doc, m);
  doc.finish({ left: 'NRI FinWealth', right: `Retirement plan report  ·  ${m.generated}`, foot: 'Planning estimate, not financial, tax or legal advice. Calculated in your browser; nothing was uploaded. nrifinwealth.com' });
  return doc.pdf.save();
}
