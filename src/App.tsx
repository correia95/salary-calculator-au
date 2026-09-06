import { useEffect, useMemo, useState } from 'react';
import {
  calculate,
  formatCurrency,
  formatPercent,
  PayPeriod,
  Residency,
  TAX_YEAR,
  TaxInput,
} from './tax';

const PERIOD_LABELS: Record<PayPeriod, string> = {
  annual: 'per year',
  monthly: 'per month',
  fortnightly: 'per fortnight',
  weekly: 'per week',
};

interface FormState {
  amount: string;
  period: PayPeriod;
  basis: 'excludesSuper' | 'includesSuper';
  residency: Residency;
  hasHelpDebt: boolean;
  privateHospitalCover: boolean;
}

const DEFAULT_STATE: FormState = {
  amount: '90000',
  period: 'annual',
  basis: 'excludesSuper',
  residency: 'resident',
  hasHelpDebt: false,
  privateHospitalCover: true,
};

function readInitialState(): FormState {
  const params = new URLSearchParams(window.location.search);
  const fromParams = (): Partial<FormState> => {
    const out: Partial<FormState> = {};
    if (params.has('amount')) out.amount = params.get('amount') || '';
    const p = params.get('period');
    if (p && ['annual', 'monthly', 'fortnightly', 'weekly'].includes(p)) out.period = p as PayPeriod;
    const b = params.get('basis');
    if (b === 'inc') out.basis = 'includesSuper';
    if (b === 'exc') out.basis = 'excludesSuper';
    const r = params.get('res');
    if (r === 'non') out.residency = 'non-resident';
    if (r === 'res') out.residency = 'resident';
    if (params.get('help') === '1') out.hasHelpDebt = true;
    if (params.get('phc') === '0') out.privateHospitalCover = false;
    return out;
  };

  let stored: Partial<FormState> = {};
  try {
    const raw = localStorage.getItem('salary-calc-au');
    if (raw) stored = JSON.parse(raw);
  } catch {
    /* ignore */
  }

  return { ...DEFAULT_STATE, ...stored, ...fromParams() };
}

export default function App() {
  const [state, setState] = useState<FormState>(readInitialState);
  const [copied, setCopied] = useState(false);

  const numericAmount = parseFloat(state.amount.replace(/[^0-9.]/g, '')) || 0;

  const input: TaxInput = useMemo(
    () => ({
      amount: numericAmount,
      basis: state.basis,
      period: state.period,
      residency: state.residency,
      hasHelpDebt: state.hasHelpDebt,
      privateHospitalCover: state.privateHospitalCover,
    }),
    [numericAmount, state.basis, state.period, state.residency, state.hasHelpDebt, state.privateHospitalCover],
  );

  const result = useMemo(() => calculate(input), [input]);

  useEffect(() => {
    try {
      localStorage.setItem('salary-calc-au', JSON.stringify(state));
    } catch {
      /* ignore */
    }
    const params = new URLSearchParams();
    params.set('amount', String(Math.round(numericAmount)));
    params.set('period', state.period);
    params.set('basis', state.basis === 'includesSuper' ? 'inc' : 'exc');
    params.set('res', state.residency === 'non-resident' ? 'non' : 'res');
    if (state.hasHelpDebt) params.set('help', '1');
    if (!state.privateHospitalCover) params.set('phc', '0');
    window.history.replaceState(null, '', `?${params.toString()}`);
    setCopied(false);
  }, [state, numericAmount]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((s) => ({ ...s, [key]: value }));

  const takeHomeByPeriod: Record<PayPeriod, number> = {
    annual: result.takeHomeAnnual,
    monthly: result.takeHomeMonthly,
    fortnightly: result.takeHomeFortnightly,
    weekly: result.takeHomeWeekly,
  };

  const breakdown = [
    { label: 'Gross salary', value: result.grossSalary, kind: 'gross' as const },
    { label: 'Income tax', value: -result.incomeTax, kind: 'tax' as const },
    { label: 'Medicare levy', value: -result.medicareLevy, kind: 'tax' as const },
    ...(result.medicareLevySurcharge > 0
      ? [{ label: 'Medicare levy surcharge', value: -result.medicareLevySurcharge, kind: 'tax' as const }]
      : []),
    ...(result.helpRepayment > 0
      ? [{ label: 'HELP / HECS repayment', value: -result.helpRepayment, kind: 'tax' as const }]
      : []),
  ];

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'My take-home pay', url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      }
    } catch {
      /* user cancelled */
    }
  };

  const barSegments = [
    { label: 'Take-home', value: Math.max(0, result.takeHomeAnnual), cls: 'seg-home' },
    { label: 'Income tax', value: result.incomeTax, cls: 'seg-tax' },
    { label: 'Medicare', value: result.medicareLevy + result.medicareLevySurcharge, cls: 'seg-medicare' },
    { label: 'HELP', value: result.helpRepayment, cls: 'seg-help' },
  ].filter((s) => s.value > 0);
  const barTotal = barSegments.reduce((a, s) => a + s.value, 0) || 1;

  return (
    <div className="app">
      <header className="hero">
        <h1>Australian Take-Home Pay Calculator</h1>
        <p className="tagline">
          See exactly what lands in your bank account after tax, Medicare and HECS — {TAX_YEAR}{' '}
          financial year.
        </p>
      </header>

      <main className="grid">
        <section className="card form" aria-label="Your details">
          <label className="field">
            <span className="field-label">Your salary</span>
            <div className="amount-row">
              <span className="prefix">$</span>
              <input
                inputMode="decimal"
                autoComplete="off"
                aria-label="Salary amount"
                value={state.amount}
                onChange={(e) => set('amount', e.target.value)}
                placeholder="90,000"
              />
              <select
                aria-label="Pay period"
                value={state.period}
                onChange={(e) => set('period', e.target.value as PayPeriod)}
              >
                <option value="annual">/ year</option>
                <option value="monthly">/ month</option>
                <option value="fortnightly">/ fortnight</option>
                <option value="weekly">/ week</option>
              </select>
            </div>
          </label>

          <fieldset className="field">
            <legend className="field-label">Does this figure include super?</legend>
            <div className="segmented">
              <button
                type="button"
                className={state.basis === 'excludesSuper' ? 'active' : ''}
                onClick={() => set('basis', 'excludesSuper')}
              >
                Salary + super
              </button>
              <button
                type="button"
                className={state.basis === 'includesSuper' ? 'active' : ''}
                onClick={() => set('basis', 'includesSuper')}
              >
                Total package
              </button>
            </div>
            <p className="hint">
              Most job ads quote salary <em>plus</em> super. Choose "Total package" only if the
              number already has the 12% super baked in.
            </p>
          </fieldset>

          <fieldset className="field">
            <legend className="field-label">Residency for tax purposes</legend>
            <div className="segmented">
              <button
                type="button"
                className={state.residency === 'resident' ? 'active' : ''}
                onClick={() => set('residency', 'resident')}
              >
                Resident
              </button>
              <button
                type="button"
                className={state.residency === 'non-resident' ? 'active' : ''}
                onClick={() => set('residency', 'non-resident')}
              >
                Non-resident
              </button>
            </div>
          </fieldset>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={state.hasHelpDebt}
              onChange={(e) => set('hasHelpDebt', e.target.checked)}
            />
            <span>I have a HELP / HECS study debt</span>
          </label>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={!state.privateHospitalCover}
              onChange={(e) => set('privateHospitalCover', !e.target.checked)}
            />
            <span>I don't have private hospital cover</span>
          </label>
        </section>

        <section className="card result" aria-label="Your take-home pay" aria-live="polite">
          <div className="headline">
            <span className="headline-label">Your take-home pay</span>
            <span className="headline-amount">{formatCurrency(takeHomeByPeriod[state.period])}</span>
            <span className="headline-period">{PERIOD_LABELS[state.period]}</span>
          </div>

          <div className="mini-grid">
            <div>
              <span>{formatCurrency(result.takeHomeMonthly)}</span>
              <small>per month</small>
            </div>
            <div>
              <span>{formatCurrency(result.takeHomeFortnightly)}</span>
              <small>per fortnight</small>
            </div>
            <div>
              <span>{formatCurrency(result.takeHomeWeekly)}</span>
              <small>per week</small>
            </div>
          </div>

          {barSegments.length > 0 && (
            <div className="bar" role="img" aria-label="Where your salary goes">
              {barSegments.map((s) => (
                <span
                  key={s.label}
                  className={s.cls}
                  style={{ width: `${(s.value / barTotal) * 100}%` }}
                  title={`${s.label}: ${formatCurrency(s.value)}`}
                />
              ))}
            </div>
          )}

          <table className="breakdown">
            <tbody>
              {breakdown.map((row) => (
                <tr key={row.label} className={row.kind}>
                  <th scope="row">{row.label}</th>
                  <td>{formatCurrency(row.value)}</td>
                </tr>
              ))}
              {result.lito > 0 && (
                <tr className="offset">
                  <th scope="row">Low income tax offset</th>
                  <td>{formatCurrency(result.lito)}</td>
                </tr>
              )}
              <tr className="total">
                <th scope="row">Take-home pay</th>
                <td>{formatCurrency(result.takeHomeAnnual)}</td>
              </tr>
              <tr className="super">
                <th scope="row">Super paid by employer</th>
                <td>{formatCurrency(result.superContribution)}</td>
              </tr>
            </tbody>
          </table>

          <div className="rates">
            <div>
              <strong>{formatPercent(result.averageTaxRate)}</strong>
              <small>average tax rate</small>
            </div>
            <div>
              <strong>{formatPercent(result.marginalTaxRate)}</strong>
              <small>marginal rate on your next dollar</small>
            </div>
          </div>

          <button type="button" className="share" onClick={share}>
            {copied ? 'Link copied ✓' : 'Share this result'}
          </button>
        </section>
      </main>

      <p className="disclaimer">
        Estimates for the {TAX_YEAR} financial year using standard ATO rates for a full-year
        resident with no other income or deductions. Ignores tax offsets other than LITO, the
        low-income Medicare reduction for families, and payroll rounding. General information
        only — not tax advice.
      </p>
    </div>
  );
}
