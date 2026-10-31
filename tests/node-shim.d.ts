// Just enough of Node for the report test to read the font files and optionally save the PDFs.
declare module 'node:fs' {
  export function readFileSync(path: string): Uint8Array;
  export function writeFileSync(path: string, data: Uint8Array): void;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
}
declare const process: { env: Record<string, string | undefined> };
