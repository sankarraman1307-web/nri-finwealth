# NRI FinWealth

Free, private retirement planner for NRIs living in Europe. Netherlands and India first; Belgium, Luxembourg, Germany, Austria, Switzerland, France and the UK are planned.

Live at https://nrifinwealth.com. Everything runs in your browser. No server, no account, no tracking. This is a planning estimate, not financial, tax or legal advice.

## Run it

```
npm install
npm run dev        # local site at http://localhost:5173
npm test           # engine and app tests
npm run build      # production build into dist/
```

## How it is built

- `src/engine`: pure TypeScript planning engine (tax, pensions, Monte Carlo). No React, no network.
- `src/engine/countries`: one folder per country (rules, tax, labels). Adding a country means adding a pack.
- `src/web`: the React interface (form, result slides, recommendations).
- `tests`: hand-checked tax cases and golden profiles.

## Contributing

Tax rules change. If you find a wrong rule or number, open an issue with the source (law text or official page). Corrections from local advisers are especially welcome.

Licence: GNU AGPL-3.0-or-later (see `LICENSE`). You may use and change the code, but if you run a modified version as a website you must publish your changes under the same licence. The name "NRI FinWealth" is not licensed for use by others.

---

## Engine notes (original readme)

```
npm install
npm test            # 75 tests
npm run typecheck
npm run build:bundle   # browser bundle for the mockup (mockup/engine.bundle.js)
```

```ts
import { runPlan, SAMPLE_INPUT } from './src/engine';

const result = runPlan(SAMPLE_INPUT, { paths: 1000, sweep: true, sensitivities: true });
result.monteCarlo.successProbability; // 0.025 -> "2.5% of futures last to 95"
result.expected.margin;               // negative = shortfall, never capped
result.warnings;                      // what the model does not know
```

## Layout

| File | Job |
|---|---|
| `src/engine/rules/nl.ts` | Versioned Dutch rules (Box 1, 30% ruling, Box 3, AOW). Add a year here when the law changes. Unconfirmed values are listed in `unverified` and shown to the user. |
| `src/engine/assumptions.ts` | Per-asset-class returns and volatility, inflation, FX drift. All overridable. |
| `src/engine/tax.ts` | Pure tax functions. |
| `src/engine/simulate.ts` | One yearly step function shared by the expected path and every Monte Carlo path. |
| `src/engine/montecarlo.ts` | Seeded simulation, percentile bands, depletion age. |
| `src/engine/plan.ts` | `runPlan`, required corpus, scores, warnings, sensitivities, retirement-age sweep. |
| `src/legacy/v1.ts` | Faithful port of the v1 maths, bugs included, for comparison tests only. |
| `tests/` | Hand-checked tax cases, one regression test per v1 bug, Monte Carlo statistics, golden profiles. |

## What changed from v1

| v1 behaviour | v2 | Test |
|---|---|---|
| Core living costs never inflated (only lifestyle did) | Inflated in the currency they are paid in | `simulate.test.ts` |
| One 9% return for every asset | Per-asset returns; INR assets earn INR returns | `assumptions.ts`, `montecarlo.test.ts` |
| FX drift only changed the displayed number, never the result | FX is part of the simulation; INR assets pay INR bills | "currency matching" tests |
| Pensions never reduced the drawdown (only the target) | Drawdown is spending minus income | `simulate.test.ts` |
| Pre-retirement deficits ignored | Funded from the portfolio | `simulate.test.ts` |
| AOW set to zero when retiring to India | AOW is paid abroad; accrual stops when you leave NL | `household.test.ts` |
| AOW accrued as if you stayed in NL until 67 | Accrues only while resident | `household.test.ts` |
| Partner's AOW ignored | Counted for both | `plan.test.ts` |
| Child counted 0.5 at age 25 (spec says independent) | Independent at 25 | `household.test.ts` |
| 25-year drawdown, whatever your age | Plans to 95 | `simulate.test.ts` |
| Required corpus = first-year shortfall / 4% | Smallest corpus that lasts to 95 on the expected path | `plan.test.ts` |
| Readiness capped at 100 | Uncapped margin, plus a probability from 1,000 futures | `plan.test.ts` |
| Ruling hard-coded as gross x 0.7 | 30% to 2026, 27% from 2027 (30% if granted before 2024), salary cap | `tax.test.ts` |
| Flat 37% / 49.5% with a 2024 threshold, not indexed | 2026 brackets, indexed yearly | `tax.test.ts` |
| No Box 3 | Deemed-return Box 3 on worldwide assets incl. Indian property, while resident in NL | `tax.test.ts`, `simulate.test.ts` |
| Geography chart omitted EPF | Both charts add up | `plan.test.ts` |
| `monthlyCashOutflow / 12` bug in the summary | Removed with the old summary | n/a |

The same household (the v1 sample) scores **63/100** in v1 and has a **2.5% chance** of lasting to 95 in v2, retiring at 55. At 68 it is 82%.

## Know before you launch

* **Tax numbers need professional review.** Box 1 brackets and rates, the ruling cap, Box 3 parameters and AOW amounts come from published 2026 sources (see `rules/nl.ts`). Items marked `unverified` are estimates: the AOW-age first-bracket rate, the provisional savings return, and every 2027 value other than the ruling rate.
* **Not modelled yet:** Dutch tax credits (heffingskortingen), mortgage interest deduction, Indian income tax and capital gains tax, private healthcare in India, selling Indian property, Box 3 on actual returns (switchable but not final law).
* **India results are optimistic** until Indian tax is added. The engine says so in `warnings`.
* **Golden tests freeze today's behaviour.** Replace them with 10 to 15 profiles reviewed by a Dutch tax adviser and a cross-border planner.
* **Speed:** about 0.1 ms per simulated future. Run it in a Web Worker and debounce input in the product.
