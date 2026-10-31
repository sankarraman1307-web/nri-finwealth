/** The "Download PDF report" action. The PDF code and the fonts load only when the button is pressed, and nothing leaves the browser. */
import type { View } from '../compute';
import type { Profile } from './profileApi';

async function load(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load a font (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function downloadReport(view: View, profile: Profile, eurToInr: number, startYear: number): Promise<void> {
  const [{ buildReportModel }, { renderReport }, regular, bold, extra] = await Promise.all([
    import('./model'),
    import('./render'),
    import('./fonts/manrope-latin-400.ttf?url').then((m) => load(m.default)),
    import('./fonts/manrope-latin-700.ttf?url').then((m) => load(m.default)),
    import('./fonts/manrope-latin-800.ttf?url').then((m) => load(m.default)),
  ]);
  const now = new Date();
  const model = buildReportModel(view, profile, eurToInr, startYear, now);
  const bytes = await renderReport(model, { regular, bold, extra });
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = `NRI-FinWealth-plan-${now.toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 10000);
}
