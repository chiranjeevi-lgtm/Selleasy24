'use client';

import { useMemo, useState } from 'react';

/**
 * EMI and eligibility calculators.
 *
 * Pure client-side arithmetic — no API calls, no session, no PII leaves the
 * device. Deliberate: this is a lead magnet and a decision tool, not a data
 * collection funnel. When Phase 5 financing partnerships land, we can pass
 * the inputs into a partner API on submit; today the tool stands alone.
 *
 * FOIR (Fixed Obligations to Income Ratio) is the bank-standard cap on how
 * much of a borrower's income can go to EMIs. HDFC / ICICI / SBI all use
 * 50-60% depending on income slab; we use 55% as a reasonable middle number
 * for salaried borrowers earning ₹1-3 L/month. If we later differentiate by
 * income slab, this is where that logic lands.
 */

const DEFAULT_FOIR = 0.55;

interface EMIResult {
  emi: number;
  totalInterest: number;
  totalRepayment: number;
}

function computeEMI(principal: number, annualRatePct: number, months: number): EMIResult {
  if (principal <= 0 || months <= 0) {
    return { emi: 0, totalInterest: 0, totalRepayment: 0 };
  }
  if (annualRatePct === 0) {
    const emi = principal / months;
    return { emi, totalInterest: 0, totalRepayment: principal };
  }
  const r = annualRatePct / 12 / 100;
  const emi = (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  const totalRepayment = emi * months;
  return { emi, totalInterest: totalRepayment - principal, totalRepayment };
}

interface AmortizationYear {
  year: number;
  principal: number;
  interest: number;
  balance: number;
}

function computeAmortization(
  principal: number,
  annualRatePct: number,
  months: number,
): AmortizationYear[] {
  if (principal <= 0 || months <= 0) return [];
  const r = annualRatePct / 12 / 100;
  const { emi } = computeEMI(principal, annualRatePct, months);
  const yearly: AmortizationYear[] = [];
  let balance = principal;
  let yearPrincipal = 0;
  let yearInterest = 0;

  for (let m = 1; m <= months; m++) {
    const interestPortion = r === 0 ? 0 : balance * r;
    const principalPortion = emi - interestPortion;
    yearInterest += interestPortion;
    yearPrincipal += principalPortion;
    balance = Math.max(0, balance - principalPortion);
    if (m % 12 === 0 || m === months) {
      yearly.push({
        year: Math.ceil(m / 12),
        principal: yearPrincipal,
        interest: yearInterest,
        balance,
      });
      yearPrincipal = 0;
      yearInterest = 0;
    }
  }
  return yearly;
}

function computeEligibility(
  monthlyIncome: number,
  existingEmis: number,
  annualRatePct: number,
  months: number,
): { maxLoan: number; maxEMI: number } {
  const maxEMI = Math.max(0, monthlyIncome * DEFAULT_FOIR - existingEmis);
  if (maxEMI <= 0 || months <= 0) return { maxLoan: 0, maxEMI: 0 };
  if (annualRatePct === 0) return { maxLoan: maxEMI * months, maxEMI };
  const r = annualRatePct / 12 / 100;
  const maxLoan = (maxEMI * (Math.pow(1 + r, months) - 1)) / (r * Math.pow(1 + r, months));
  return { maxLoan, maxEMI };
}

function formatINR(amount: number): string {
  if (!Number.isFinite(amount)) return '₹0';
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

function formatCompactINR(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '₹0';
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(2)} Cr`;
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(2)} L`;
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

// --------------------------------------------------------------------------
// Shared input primitives
// --------------------------------------------------------------------------

interface SliderInputProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  formatValue: (n: number) => string;
  onChange: (n: number) => void;
  suffix?: string;
}

function SliderInput({
  label,
  value,
  min,
  max,
  step,
  formatValue,
  onChange,
  suffix,
}: SliderInputProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-[0.875rem] font-medium text-ink">{label}</label>
        <span className="tabular text-[0.9375rem] font-semibold text-verify">
          {formatValue(value)}
          {suffix && <span className="ml-1 text-[0.75rem] font-normal text-muted">{suffix}</span>}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-action"
      />
      <div className="mt-1 flex justify-between text-[0.6875rem] text-faint">
        <span>{formatValue(min)}</span>
        <span>{formatValue(max)}</span>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// EMI Calculator
// --------------------------------------------------------------------------

interface EMIDefaults {
  /** Loan amount slider starting value (rupees). */
  principal?: number;
  /** Annual interest rate percentage. */
  rate?: number;
  /** Tenure in years. */
  years?: number;
}

export function EMICalculator({ defaults }: { defaults?: EMIDefaults } = {}) {
  // Clamp any provided default to the slider's own range so an unusual
  // input from a personalised profile doesn't push the slider off-screen.
  const initialPrincipal = defaults?.principal
    ? Math.max(500_000, Math.min(100_000_000, defaults.principal))
    : 5_000_000;

  const [principal, setPrincipal] = useState(initialPrincipal);
  const [rate, setRate] = useState(defaults?.rate ?? 8.5);
  const [years, setYears] = useState(defaults?.years ?? 20);

  const months = years * 12;
  const result = useMemo(() => computeEMI(principal, rate, months), [principal, rate, months]);
  const amortization = useMemo(
    () => computeAmortization(principal, rate, months),
    [principal, rate, months],
  );

  const principalPct = result.totalRepayment > 0 ? (principal / result.totalRepayment) * 100 : 0;
  const interestPct = 100 - principalPct;

  return (
    <div className="rounded-card bg-surface p-6 shadow-card ring-1 ring-line sm:p-8">
      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-6">
          <SliderInput
            label="Loan amount"
            value={principal}
            min={500_000}
            max={100_000_000}
            step={100_000}
            formatValue={formatCompactINR}
            onChange={setPrincipal}
          />
          <SliderInput
            label="Interest rate"
            value={rate}
            min={6}
            max={15}
            step={0.05}
            formatValue={(n) => n.toFixed(2)}
            suffix="% p.a."
            onChange={setRate}
          />
          <SliderInput
            label="Tenure"
            value={years}
            min={1}
            max={30}
            step={1}
            formatValue={(n) => `${n}`}
            suffix={years === 1 ? 'year' : 'years'}
            onChange={setYears}
          />
        </div>

        <div className="rounded-card bg-canvas-deep p-6">
          <p className="label text-faint">Monthly EMI</p>
          <p className="mt-2 tabular display text-[2.25rem] text-ink sm:text-[2.75rem]">
            {formatINR(result.emi)}
          </p>

          <dl className="mt-6 space-y-2.5 border-t border-line pt-4 text-[0.875rem]">
            <div className="flex items-baseline justify-between">
              <dt className="text-muted">Principal</dt>
              <dd className="tabular font-medium text-ink">{formatCompactINR(principal)}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-muted">Total interest</dt>
              <dd className="tabular font-medium text-ink">
                {formatCompactINR(result.totalInterest)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-line pt-2.5">
              <dt className="font-semibold text-ink">Total repayment</dt>
              <dd className="tabular font-semibold text-ink">
                {formatCompactINR(result.totalRepayment)}
              </dd>
            </div>
          </dl>

          <div className="mt-6">
            <p className="label text-faint">Principal vs interest</p>
            <div
              aria-label={`Principal is ${principalPct.toFixed(0)}% and interest is ${interestPct.toFixed(0)}% of total repayment`}
              className="mt-2 flex h-3 overflow-hidden rounded-full bg-line-soft"
            >
              <div
                className="bg-action transition-all duration-300"
                style={{ width: `${principalPct}%` }}
              />
              <div
                className="bg-verify transition-all duration-300"
                style={{ width: `${interestPct}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[0.75rem]">
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2 w-2 rounded-sm bg-action" />
                <span className="text-muted">Principal {principalPct.toFixed(0)}%</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2 w-2 rounded-sm bg-verify" />
                <span className="text-muted">Interest {interestPct.toFixed(0)}%</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {amortization.length > 0 && (
        <details className="mt-8 group">
          <summary className="inline-flex cursor-pointer items-center gap-2 rounded-control border border-line bg-surface px-3.5 py-2 text-[0.875rem] font-medium text-ink transition-colors hover:border-muted">
            <span>Show year-by-year breakdown</span>
            <svg
              viewBox="0 0 12 12"
              aria-hidden="true"
              className="h-2.5 w-2.5 transition-transform group-open:rotate-180"
            >
              <path
                d="M1.5 4 6 8.5 10.5 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </summary>

          <div className="mt-4 overflow-hidden rounded-card border border-line">
            <table className="w-full">
              <thead className="bg-canvas-deep">
                <tr>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted"
                  >
                    Year
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-right text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted"
                  >
                    Principal paid
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-right text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted"
                  >
                    Interest paid
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-right text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted"
                  >
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody className="bg-surface">
                {amortization.map((row, i) => (
                  <tr key={row.year} className={i === 0 ? '' : 'border-t border-line-soft'}>
                    <th scope="row" className="px-4 py-2.5 text-left text-[0.875rem] font-medium text-ink">
                      {row.year}
                    </th>
                    <td className="tabular px-4 py-2.5 text-right text-[0.875rem] text-ink">
                      {formatCompactINR(row.principal)}
                    </td>
                    <td className="tabular px-4 py-2.5 text-right text-[0.875rem] text-muted">
                      {formatCompactINR(row.interest)}
                    </td>
                    <td className="tabular px-4 py-2.5 text-right text-[0.875rem] font-medium text-ink">
                      {formatCompactINR(row.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Eligibility Calculator
// --------------------------------------------------------------------------

interface EligibilityDefaults {
  monthlyIncome?: number;
  existingEmis?: number;
  rate?: number;
  years?: number;
}

export function EligibilityCalculator({
  defaults,
}: { defaults?: EligibilityDefaults } = {}) {
  const initialIncome = defaults?.monthlyIncome
    ? Math.max(30_000, Math.min(2_000_000, defaults.monthlyIncome))
    : 150_000;

  const [monthlyIncome, setMonthlyIncome] = useState(initialIncome);
  const [existingEmis, setExistingEmis] = useState(defaults?.existingEmis ?? 0);
  const [rate, setRate] = useState(defaults?.rate ?? 8.5);
  const [years, setYears] = useState(defaults?.years ?? 20);

  const months = years * 12;
  const result = useMemo(
    () => computeEligibility(monthlyIncome, existingEmis, rate, months),
    [monthlyIncome, existingEmis, rate, months],
  );

  return (
    <div className="rounded-card bg-surface p-6 shadow-card ring-1 ring-line sm:p-8">
      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-6">
          <SliderInput
            label="Your monthly income"
            value={monthlyIncome}
            min={30_000}
            max={2_000_000}
            step={5_000}
            formatValue={formatCompactINR}
            onChange={setMonthlyIncome}
          />
          <SliderInput
            label="Existing monthly EMIs"
            value={existingEmis}
            min={0}
            max={500_000}
            step={1_000}
            formatValue={formatCompactINR}
            onChange={setExistingEmis}
          />
          <SliderInput
            label="Expected interest rate"
            value={rate}
            min={6}
            max={15}
            step={0.05}
            formatValue={(n) => n.toFixed(2)}
            suffix="% p.a."
            onChange={setRate}
          />
          <SliderInput
            label="Tenure"
            value={years}
            min={1}
            max={30}
            step={1}
            formatValue={(n) => `${n}`}
            suffix={years === 1 ? 'year' : 'years'}
            onChange={setYears}
          />
        </div>

        <div className="rounded-card bg-canvas-deep p-6">
          <p className="label text-faint">You could borrow up to</p>
          <p className="mt-2 tabular display text-[2.25rem] text-ink sm:text-[2.75rem]">
            {formatCompactINR(result.maxLoan)}
          </p>

          <dl className="mt-6 space-y-2.5 border-t border-line pt-4 text-[0.875rem]">
            <div className="flex items-baseline justify-between">
              <dt className="text-muted">Maximum monthly EMI</dt>
              <dd className="tabular font-medium text-ink">{formatINR(result.maxEMI)}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-muted">Assumed income cap (FOIR)</dt>
              <dd className="tabular font-medium text-ink">
                {(DEFAULT_FOIR * 100).toFixed(0)}%
              </dd>
            </div>
          </dl>

          <p className="mt-6 border-t border-line pt-4 text-[0.75rem] leading-relaxed text-faint">
            Indicative only. Lenders check credit score, employment stability,
            and property valuation. Actual eligibility can differ by ±20%.
            Speak to a lender before making a booking commitment.
          </p>
        </div>
      </div>
    </div>
  );
}
