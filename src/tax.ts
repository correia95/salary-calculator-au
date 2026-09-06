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
  /** Annual gross bonus (cash, before tax). Employer super is added on top at 12%. */
  bonus?: number;
  /** Other annual taxable income (interest, dividends, rent, side work). No super. */
  otherIncome?: number;
}

export interface TaxResult {
  grossSalary: number; // annual base salary (taxable), before tax, excluding super
  bonus: number; // annual gross bonus included in the estimate
  otherIncome: number; // other annual taxable income included in the estimate
  taxableIncome: number; // grossSalary + bonus + otherIncome
  superContribution: number; // annual employer super guarantee (on salary + bonus)
  totalPackage: number; // grossSalary + bonus + super
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
  /** After-tax value of the bonus (extra take-home vs. the same inputs without the bonus). */
  bonusTakeHome: number;
  averageTaxRate: number; // totalTax / taxableIncome
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

interface TaxBreakdown {
  incomeTax: number;
  litoApplied: number;
  medicareLevy: number;
  medicareLevySurcharge: number;
  helpRepayment: number;
  totalTax: number;
}

/** All tax and levies payable on a given taxable income for the chosen inputs. */
function taxOn(taxable: number, input: TaxInput, brackets: Bracket[]): TaxBreakdown {
  const isResident = input.residency === 'resident';
  const rawIncomeTax = bracketTax(taxable, brackets);
  const lito = isResident ? calcLito(taxable) : 0;
  const incomeTax = Math.max(0, rawIncomeTax - lito);
  const medicareLevy = isResident ? calcMedicareLevy(taxable) : 0;
  const medicareLevySurcharge = isResident
    ? calcMLS(taxable, input.privateHospitalCover)
    : 0;
  const helpRepayment = calcHelpRepayment(taxable, input.hasHelpDebt);
  return {
    incomeTax,
    litoApplied: rawIncomeTax - incomeTax,
    medicareLevy,
    medicareLevySurcharge,
    helpRepayment,
    totalTax: incomeTax + medicareLevy + medicareLevySurcharge + helpRepayment,
  };
}

export function calculate(input: TaxInput): TaxResult {
  const annualInput = Math.max(0, input.amount) * PERIODS_PER_YEAR[input.period];
  const bonus = Math.max(0, input.bonus ?? 0);
  const otherIncome = Math.max(0, input.otherIncome ?? 0);

  const grossSalary =
    input.basis === 'includesSuper'
      ? annualInput / (1 + SUPER_GUARANTEE_RATE)
      : annualInput;

  const employmentCash = grossSalary + bonus;
  const superContribution = employmentCash * SUPER_GUARANTEE_RATE;
  const taxableIncome = employmentCash + otherIncome;
  const totalPackage = employmentCash + superContribution;

  const brackets = input.residency === 'resident' ? RESIDENT_BRACKETS : NON_RESIDENT_BRACKETS;

  const t = taxOn(taxableIncome, input, brackets);
  const takeHomeAnnual = taxableIncome - t.totalTax;

  // After-tax value of the bonus = extra take-home vs. the same inputs without it.
  const withoutBonus = taxOn(grossSalary + otherIncome, input, brackets);
  const bonusTakeHome = bonus > 0 ? bonus - (t.totalTax - withoutBonus.totalTax) : 0;

  return {
    grossSalary,
    bonus,
    otherIncome,
    taxableIncome,
    superContribution,
    totalPackage,
    incomeTax: t.incomeTax,
    lito: t.litoApplied,
    medicareLevy: t.medicareLevy,
    medicareLevySurcharge: t.medicareLevySurcharge,
    helpRepayment: t.helpRepayment,
    totalTax: t.totalTax,
    takeHomeAnnual,
    takeHomeMonthly: takeHomeAnnual / 12,
    takeHomeFortnightly: takeHomeAnnual / 26,
    takeHomeWeekly: takeHomeAnnual / 52,
    bonusTakeHome,
    averageTaxRate: taxableIncome > 0 ? t.totalTax / taxableIncome : 0,
    marginalTaxRate: marginalRate(taxableIncome, brackets, input.residency),
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
