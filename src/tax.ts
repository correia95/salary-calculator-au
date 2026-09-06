// Australian income tax engine — 2026-27 financial year (1 July 2026 – 30 June 2027).
// Sources: ATO individual income tax rates, Medicare levy thresholds, LITO, and the
// marginal HELP/HECS repayment system legislated from 2025-26. All figures are
// estimates for general information only — not tax advice.

export type Residency = 'resident' | 'non-resident';
export type PayPeriod = 'annual' | 'monthly' | 'fortnightly' | 'weekly';

export const TAX_YEAR = '2026-27';
export const SUPER_GUARANTEE_RATE = 0.12;

export interface Bracket {
  /** Tax applies to each dollar earned ABOVE this threshold, up to the next bracket. */
  min: number;
  rate: number;
}

const RESIDENT_BRACKETS: Bracket[] = [
  { min: 0, rate: 0 },
  { min: 18_200, rate: 0.15 },
  { min: 45_000, rate: 0.3 },
  { min: 135_000, rate: 0.37 },
  { min: 190_000, rate: 0.45 },
];

const NON_RESIDENT_BRACKETS: Bracket[] = [
  { min: 0, rate: 0.3 },
  { min: 135_000, rate: 0.37 },
  { min: 190_000, rate: 0.45 },
];

// Medicare levy (2%) — single low-income thresholds with a 10% shade-in band.
const MEDICARE_RATE = 0.02;
const MEDICARE_LOWER = 28_011;
const MEDICARE_UPPER = 35_014;
const MEDICARE_SHADE_RATE = 0.1;

// Medicare Levy Surcharge — single income tiers (applies without private hospital cover).
const MLS_TIERS: { min: number; rate: number }[] = [
  { min: 0, rate: 0 },
  { min: 105_000, rate: 0.01 },
  { min: 123_000, rate: 0.0125 },
  { min: 164_000, rate: 0.015 },
];

// HELP / HECS — marginal repayment system, 2026-27 thresholds.
const HELP_FREE = 69_528;
const HELP_TIER2 = 129_717;
const HELP_TIER2_BASE = 9_028; // (129,717 − 69,528) × 15%

export interface TaxInput {
  /** The figure the user typed, in the units of `basis`. */
  amount: number;
  /** Whether `amount` already includes employer super, or is the cash salary before super. */
  basis: 'excludesSuper' | 'includesSuper';
  period: PayPeriod;
  residency: Residency;
  hasHelpDebt: boolean;
  /** If false and income is high enough, the Medicare Levy Surcharge is added. */
  privateHospitalCover: boolean;
}

export interface TaxResult {
  grossSalary: number; // annual cash salary (taxable), before tax, excluding super
  superContribution: number; // annual employer super guarantee
  totalPackage: number; // grossSalary + super
  incomeTax: number; // after LITO
  lito: number; // offset actually applied
  medicareLevy: number;
  medicareLevySurcharge: number;
  helpRepayment: number;
  totalTax: number; // incomeTax + medicare + MLS + HELP
  takeHomeAnnual: number;
  takeHomeMonthly: number;
  takeHomeFortnightly: number;
  takeHomeWeekly: number;
  averageTaxRate: number; // totalTax / grossSalary
  marginalTaxRate: number; // top marginal rate incl. 2% medicare where relevant
}

const PERIODS_PER_YEAR: Record<PayPeriod, number> = {
  annual: 1,
  monthly: 12,
  fortnightly: 26,
  weekly: 52,
};

export function bracketTax(taxable: number, brackets: Bracket[]): number {
  let tax = 0;
  for (let i = 0; i < brackets.length; i++) {
    const { min, rate } = brackets[i];
    if (taxable <= min) break;
    const next = i + 1 < brackets.length ? brackets[i + 1].min : Infinity;
    tax += (Math.min(taxable, next) - min) * rate;
  }
  return tax;
}

/** Low Income Tax Offset — residents only. Non-refundable; reduces income tax, not the levy. */
export function calcLito(taxable: number): number {
  if (taxable <= 37_500) return 700;
  if (taxable <= 45_000) return 700 - (taxable - 37_500) * 0.05;
  if (taxable <= 66_667) return Math.max(0, 325 - (taxable - 45_000) * 0.015);
  return 0;
}

export function calcMedicareLevy(taxable: number): number {
  if (taxable <= MEDICARE_LOWER) return 0;
  if (taxable <= MEDICARE_UPPER) return (taxable - MEDICARE_LOWER) * MEDICARE_SHADE_RATE;
  return taxable * MEDICARE_RATE;
}

export function calcMLS(taxable: number, privateHospitalCover: boolean): number {
  if (privateHospitalCover) return 0;
  let rate = 0;
  for (const tier of MLS_TIERS) {
    if (taxable >= tier.min) rate = tier.rate;
  }
  return taxable * rate;
}

export function calcHelpRepayment(taxable: number, hasHelpDebt: boolean): number {
  if (!hasHelpDebt || taxable <= HELP_FREE) return 0;
  if (taxable <= HELP_TIER2) return (taxable - HELP_FREE) * 0.15;
  return HELP_TIER2_BASE + (taxable - HELP_TIER2) * 0.17;
}

function marginalRate(taxable: number, brackets: Bracket[], residency: Residency): number {
  let rate = 0;
  for (const b of brackets) {
    if (taxable > b.min) rate = b.rate;
  }
  if (residency === 'resident' && taxable > MEDICARE_UPPER) rate += MEDICARE_RATE;
  return rate;
}

export function calculate(input: TaxInput): TaxResult {
  const annualInput = Math.max(0, input.amount) * PERIODS_PER_YEAR[input.period];

  const grossSalary =
    input.basis === 'includesSuper'
      ? annualInput / (1 + SUPER_GUARANTEE_RATE)
      : annualInput;
  const superContribution = grossSalary * SUPER_GUARANTEE_RATE;
  const totalPackage = grossSalary + superContribution;

  const taxable = grossSalary; // no deductions or other income assumed
  const brackets = input.residency === 'resident' ? RESIDENT_BRACKETS : NON_RESIDENT_BRACKETS;

  const rawIncomeTax = bracketTax(taxable, brackets);
  const lito = input.residency === 'resident' ? calcLito(taxable) : 0;
  const incomeTax = Math.max(0, rawIncomeTax - lito);
  const litoApplied = rawIncomeTax - incomeTax;

  const medicareLevy = input.residency === 'resident' ? calcMedicareLevy(taxable) : 0;
  const medicareLevySurcharge =
    input.residency === 'resident' ? calcMLS(taxable, input.privateHospitalCover) : 0;
  const helpRepayment = calcHelpRepayment(taxable, input.hasHelpDebt);

  const totalTax = incomeTax + medicareLevy + medicareLevySurcharge + helpRepayment;
  const takeHomeAnnual = grossSalary - totalTax;

  return {
    grossSalary,
    superContribution,
    totalPackage,
    incomeTax,
    lito: litoApplied,
    medicareLevy,
    medicareLevySurcharge,
    helpRepayment,
    totalTax,
    takeHomeAnnual,
    takeHomeMonthly: takeHomeAnnual / 12,
    takeHomeFortnightly: takeHomeAnnual / 26,
    takeHomeWeekly: takeHomeAnnual / 52,
    averageTaxRate: grossSalary > 0 ? totalTax / grossSalary : 0,
    marginalTaxRate: marginalRate(taxable, brackets, input.residency),
  };
}

export function formatCurrency(n: number, decimals = 0): string {
  return n.toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPercent(n: number): string {
  return (n * 100).toLocaleString('en-AU', { maximumFractionDigits: 1 }) + '%';
}
