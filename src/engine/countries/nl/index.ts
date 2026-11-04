import { definePack } from '../types';
import type { NlRulesYear } from './rules';
import { getNlRules, knownRuleYears, RULES_AS_OF } from './rules';
import { box3ActualTax, box3DeemedTax, nlPensionTax, nlWageTax } from './tax';

/** The Netherlands: the reference country pack. */
export const NL_PACK = definePack<NlRulesYear>({
  id: 'nl',
  name: 'Netherlands',
  status: 'live',
  currency: { code: 'EUR', symbol: '€' },
  rulesAsOf: RULES_AS_OF,
  labels: { statePension: 'AOW', wealthTax: 'Box 3', foreignWorkerRegime: '30% ruling' },
  rulesFor: getNlRules,
  knownYears: knownRuleYears,
  tax: {
    wage: nlWageTax,
    pension: nlPensionTax,
    wealthCurrent: box3DeemedTax,
    wealthProposed: box3ActualTax,
  },
});
