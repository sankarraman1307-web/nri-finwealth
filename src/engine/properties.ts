import type { PlanInput, Property } from './types';

/**
 * The properties of a plan. If `properties` is given it is used as it is. Otherwise the older
 * single-home fields are turned into a list, so older inputs keep working.
 */
export function propertiesOf(input: PlanInput): Property[] {
  if (input.properties) return input.properties;
  const list: Property[] = [];
  if (input.dutchHomeValue > 0 || input.dutchMortgage > 0)
    list.push({
      id: 'nl-home',
      country: 'nl',
      use: 'home',
      value: input.dutchHomeValue,
      ...(input.dutchMortgageYearsLeft > 0 && (input.dutchMortgage > 0 || input.dutchMortgageMonthlyPayment > 0)
        ? { loan: { balance: input.dutchMortgage, paymentMonthly: input.dutchMortgageMonthlyPayment, yearsLeft: input.dutchMortgageYearsLeft } }
        : {}),
      ...(input.dutchHomeSellAtAge !== undefined ? { sellAtAge: input.dutchHomeSellAtAge, rentAfterSaleMonthly: input.dutchHomeRentAfterSaleMonthly ?? 0 } : {}),
    });
  if (input.inRealEstate > 0 || input.inMortgage > 0)
    list.push({
      id: 'in-property',
      country: 'in',
      use: 'empty',
      value: input.inRealEstate,
      costBasis: input.inPropertyCostBasis ?? 0,
      ...(input.inMortgageYearsLeft > 0 && (input.inMortgage > 0 || input.inMortgageMonthlyPayment > 0)
        ? { loan: { balance: input.inMortgage, paymentMonthly: input.inMortgageMonthlyPayment, yearsLeft: input.inMortgageYearsLeft } }
        : {}),
      ...(input.inPropertySellAtAge !== undefined ? { sellAtAge: input.inPropertySellAtAge } : {}),
    });
  return list;
}

/** What you still owe on the property's loan after t years. Assumed to fall in a straight line to zero. */
export function loanBalance(p: Property, t: number): number {
  if (!p.loan || p.loan.yearsLeft <= 0) return 0;
  return p.loan.balance * Math.max(0, 1 - t / p.loan.yearsLeft);
}

/** The home you live in in the Netherlands is outside Box 3. Every other property is part of it. */
export const inBox3 = (p: Property): boolean => !(p.country === 'nl' && p.use === 'home');

/** True once the plan has sold this property (from the start of the sale year onward). */
export const isSold = (p: Property, age: number): boolean => p.sellAtAge !== undefined && p.value > 0 && age >= p.sellAtAge;

/** Value today in euros. */
export const valueEur = (p: Property, eurToInr: number): number => (p.country === 'in' ? p.value / eurToInr : p.value);

/** Monthly Dutch loan payments still running t years from now, ignoring sales. */
export function nlLoanPaymentsMonthly(input: PlanInput, t: number): number {
  let sum = 0;
  for (const p of propertiesOf(input)) if (p.country === 'nl' && p.loan && t < p.loan.yearsLeft) sum += p.loan.paymentMonthly;
  return sum;
}
