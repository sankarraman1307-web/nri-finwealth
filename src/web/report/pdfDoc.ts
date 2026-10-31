/**
 * A small page-flow layer over pdf-lib. We keep a cursor `y` measured from the top of the page, and every
 * block asks for the room it needs; when there is not enough, a new page starts. Header and footer
 * (with "Page n of N") are added at the end, once the page count is known.
 */
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

export const A4 = { w: 595.28, h: 841.89 };
export const M = { left: 42, right: 42, top: 64, bottom: 54 };
export const CONTENT_W = A4.w - M.left - M.right;

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
export const C = {
  ink: hex('#0f1b2d'),
  muted: hex('#4a5a6d'),
  line: hex('#e1e7ee'),
  teal: hex('#0b6b73'),
  tealLight: hex('#e3f3f4'),
  amber: hex('#c9741a'),
  amberLight: hex('#fef0d5'),
  red: hex('#b4330a'),
  redLight: hex('#fbe3dc'),
  gold: hex('#d9962b'),
  zebra: hex('#f6f9fb'),
  white: rgb(1, 1, 1),
};
export type Color = ReturnType<typeof rgb>;

export interface FontBytes {
  regular: Uint8Array;
  bold: Uint8Array;
  extra: Uint8Array;
}
export interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  extra: PDFFont;
}

export interface TextOpts {
  size?: number;
  font?: keyof Fonts;
  color?: Color;
  /** Line height as a multiple of size. */
  lh?: number;
  x?: number;
  width?: number;
  gapAfter?: number;
}

/** Characters Manrope does not have are swapped for plain ones, so nothing prints as a blank box. */
const SWAPS: [RegExp, string][] = [
  [/₹\s?/g, 'Rs '],
  [/→/g, 'to'],
  [/−/g, '-'],
  [/[‘’]/g, '’'],
  [/ /g, ' '],
];

export class Doc {
  pdf!: PDFDocument;
  fonts!: Fonts;
  page!: PDFPage;
  /** Distance from the top of the current page. */
  y = M.top;
  private supported!: Set<number>;
  private titles: string[] = [];

  static async create(bytes: FontBytes): Promise<Doc> {
    const d = new Doc();
    d.pdf = await PDFDocument.create();
    d.pdf.registerFontkit(fontkit);
    d.fonts = {
      regular: await d.pdf.embedFont(bytes.regular, { subset: true }),
      bold: await d.pdf.embedFont(bytes.bold, { subset: true }),
      extra: await d.pdf.embedFont(bytes.extra, { subset: true }),
    };
    d.supported = new Set(d.fonts.regular.getCharacterSet());
    d.newPage();
    return d;
  }

  clean(text: string): string {
    let t = text;
    for (const [re, to] of SWAPS) t = t.replace(re, to);
    let out = '';
    for (const ch of t) {
      const cp = ch.codePointAt(0) ?? 0;
      out += cp === 10 || this.supported.has(cp) ? ch : '';
    }
    return out;
  }

  newPage(): void {
    this.page = this.pdf.addPage([A4.w, A4.h]);
    this.y = M.top;
  }

  get bottom(): number {
    return A4.h - M.bottom;
  }

  /** Start a new page unless `h` points still fit on this one. */
  ensure(h: number): void {
    if (this.y + h > this.bottom) this.newPage();
  }

  space(h: number): void {
    this.y += h;
  }

  width(text: string, size: number, font: keyof Fonts = 'regular'): number {
    return this.fonts[font].widthOfTextAtSize(this.clean(text), size);
  }

  wrap(text: string, size: number, maxW: number, font: keyof Fonts = 'regular'): string[] {
    const lines: string[] = [];
    for (const para of this.clean(text).split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const test = line === '' ? word : `${line} ${word}`;
        if (line !== '' && this.fonts[font].widthOfTextAtSize(test, size) > maxW) {
          lines.push(line);
          line = word;
        } else line = test;
      }
      lines.push(line);
    }
    return lines;
  }

  /** Draw one line of text with its top at `top` (from the page top). */
  drawLine(text: string, x: number, top: number, size: number, font: keyof Fonts, color: Color): void {
    this.page.drawText(this.clean(text), { x, y: A4.h - top - size * 0.92, size, font: this.fonts[font], color });
  }

  /** Right-aligned single line. */
  drawRight(text: string, xRight: number, top: number, size: number, font: keyof Fonts, color: Color): void {
    const w = this.width(text, size, font);
    this.drawLine(text, xRight - w, top, size, font, color);
  }

  /** Height a paragraph would take. */
  measure(text: string, o: TextOpts = {}): number {
    const size = o.size ?? 10;
    const lines = this.wrap(text, size, o.width ?? CONTENT_W, o.font ?? 'regular');
    return lines.length * size * (o.lh ?? 1.45);
  }

  /** A paragraph that flows over page breaks line by line. */
  text(text: string, o: TextOpts = {}): void {
    const size = o.size ?? 10;
    const lh = size * (o.lh ?? 1.45);
    const lines = this.wrap(text, size, o.width ?? CONTENT_W, o.font ?? 'regular');
    const widow = Math.min(2, lines.length);
    lines.forEach((ln, i) => {
      // Never leave a single line of a paragraph alone at the bottom of a page.
      this.ensure(i === 0 ? lh * widow : lh);
      this.drawLine(ln, o.x ?? M.left, this.y, size, o.font ?? 'regular', o.color ?? C.ink);
      this.y += lh;
    });
    this.y += o.gapAfter ?? 4;
  }

  /** Section heading. Kept with the next `keepWith` points so it never sits alone at the bottom of a page. */
  h2(title: string, keepWith = 60): void {
    this.ensure(30 + keepWith);
    this.y += 10;
    this.drawLine(title.toUpperCase(), M.left, this.y, 10.5, 'bold', C.teal);
    this.y += 16;
    this.page.drawLine({ start: { x: M.left, y: A4.h - this.y + 3 }, end: { x: A4.w - M.right, y: A4.h - this.y + 3 }, thickness: 0.6, color: C.line });
    this.y += 6;
  }

  rect(x: number, top: number, w: number, h: number, fill: Color, r = 0, border?: Color): void {
    if (r <= 0) {
      this.page.drawRectangle({ x, y: A4.h - top - h, width: w, height: h, color: fill, ...(border ? { borderColor: border, borderWidth: 0.6 } : {}) });
      return;
    }
    const path = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
    this.page.drawSvgPath(path, { x, y: A4.h - top, color: fill, ...(border ? { borderColor: border, borderWidth: 0.6 } : {}) });
  }

  /** A filled box with wrapped text inside. Keeps together on one page. */
  callout(text: string, o: { fill: Color; color?: Color; size?: number; font?: keyof Fonts; title?: string; titleColor?: Color }): void {
    const size = o.size ?? 9.5;
    const pad = 9;
    const lines = this.wrap(text, size, CONTENT_W - pad * 2, o.font ?? 'regular');
    const lh = size * 1.45;
    const titleH = o.title ? size * 1.7 : 0;
    const h = pad * 2 + titleH + lines.length * lh;
    this.ensure(h + 6);
    this.rect(M.left, this.y, CONTENT_W, h, o.fill, 6);
    let t = this.y + pad;
    if (o.title) {
      this.drawLine(o.title, M.left + pad, t, size, 'bold', o.titleColor ?? o.color ?? C.ink);
      t += titleH;
    }
    for (const ln of lines) {
      this.drawLine(ln, M.left + pad, t, size, o.font ?? 'regular', o.color ?? C.ink);
      t += lh;
    }
    this.y += h + 8;
  }

  /**
   * A table with a header row that repeats when it continues on the next page.
   * `cols` are widths in points; `align` is per column.
   */
  table(o: { cols: number[]; head: string[]; rows: { cells: string[]; bold?: boolean; fill?: Color }[]; align?: ('l' | 'r')[]; size?: number; headCont?: string[]; keepTogether?: number }): void {
    const size = o.size ?? 9;
    const pad = 5;
    const align = o.align ?? o.cols.map(() => 'l' as const);
    const rowH = (cells: string[], font: keyof Fonts): number => Math.max(...cells.map((c, i) => this.wrap(c, size, (o.cols[i] ?? 80) - pad * 2, font).length)) * size * 1.35 + pad * 2 - 2;
    const drawRow = (cells: string[], font: keyof Fonts, color: Color, fill?: Color, line = true): void => {
      const h = rowH(cells, font);
      if (fill) this.rect(M.left, this.y, CONTENT_W, h, fill);
      let x = M.left;
      cells.forEach((c, i) => {
        const w = o.cols[i] ?? 80;
        const lines = this.wrap(c, size, w - pad * 2, font);
        lines.forEach((ln, k) => {
          const ty = this.y + pad - 1 + k * size * 1.35;
          if (align[i] === 'r') this.drawRight(ln, x + w - pad, ty, size, font, color);
          else this.drawLine(ln, x + pad, ty, size, font, color);
        });
        x += w;
      });
      if (line) this.page.drawLine({ start: { x: M.left, y: A4.h - this.y - h }, end: { x: M.left + CONTENT_W, y: A4.h - this.y - h }, thickness: 0.5, color: C.line });
      this.y += h;
    };
    let continued = false;
    const head = () => drawRow(continued && o.headCont ? o.headCont : o.head, 'bold', C.muted, C.zebra);
    const rh = (r: { cells: string[]; bold?: boolean }) => rowH(r.cells, r.bold ? 'bold' : 'regular');
    const total = rowH(o.head, 'bold') + o.rows.reduce((t, r) => t + rh(r), 0);
    // A short table stays in one piece; a long one starts with at least its first two rows.
    const need = o.keepTogether !== undefined && total <= o.keepTogether ? total : rowH(o.head, 'bold') + o.rows.slice(0, 2).reduce((t, r) => t + rh(r), 0);
    this.ensure(need + 4);
    head();
    for (const r of o.rows) {
      const font = r.bold ? 'bold' : 'regular';
      const h = rowH(r.cells, font);
      if (this.y + h > this.bottom) {
        this.newPage();
        continued = true;
        head();
      }
      drawRow(r.cells, font, C.ink, r.fill);
    }
    this.y += 6;
  }

  /** Header and footer on every page, once the page count is known. Call last. */
  finish(o: { left: string; right: string; foot: string }): void {
    const pages = this.pdf.getPages();
    pages.forEach((pg, i) => {
      this.page = pg;
      this.drawLine('NRI FinWealth', M.left, 24, 11, 'extra', C.teal);
      this.drawRight(o.right, A4.w - M.right, 26, 8.5, 'regular', C.muted);
      pg.drawLine({ start: { x: M.left, y: A4.h - 44 }, end: { x: A4.w - M.right, y: A4.h - 44 }, thickness: 1.2, color: C.teal });
      pg.drawLine({ start: { x: M.left, y: M.bottom - 8 }, end: { x: A4.w - M.right, y: M.bottom - 8 }, thickness: 0.5, color: C.line });
      const foot = this.wrap(o.foot, 7.5, CONTENT_W - 70, 'regular');
      foot.slice(0, 2).forEach((ln, k) => this.drawLine(ln, M.left, A4.h - M.bottom + 2 + k * 10, 7.5, 'regular', C.muted));
      this.drawRight(`Page ${i + 1} of ${pages.length}`, A4.w - M.right, A4.h - M.bottom + 2, 8, 'bold', C.muted);
    });
  }
}
