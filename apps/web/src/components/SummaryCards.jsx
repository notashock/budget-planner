import React from 'react';
import {
  formatCurrency,
  formatCurrencyWhole,
  formatDisplayDate,
  getNetPosition,
  splitInvestments,
  splitPaidAndPlanned,
  getHeadroom
} from '@budget/engine';
import {
  TrendingUpIcon,
  TrendingDownIcon,
  WalletIcon,
  ShieldAlertIcon
} from './Icons.jsx';
import { StatTile } from './ui/StatTile.jsx';
import { Chip } from './ui/Chip.jsx';

const formatPercent = (ratio) => `${Math.round(ratio * 100)}%`;

/**
 * KPI strip for the month, built around net position:
 * Income · Expenses (paid vs still planned) · Net & savings rate · Lowest point
 * (with headroom against the safety floor). Today's balance lives in the
 * Month Health hero, so it is not repeated here.
 */
export function DetailedKpiGrid({
  incomeAmount = 0,
  incomeCreditDay = 1,
  events = [],
  totalExpenses,
  lowestBalance = 0,
  lowestDate = '',
  pastBreach = null,
  safetyFloor = 0,
  currencySymbol = '₹',
  isSalaryCredited = false,
  salaryCreditedDate = null,
  month = null,
  canEditSalary = false
}) {
  const isCreditEffective = isSalaryCredited || Boolean(
    salaryCreditedDate && month && salaryCreditedDate < `${month.year}-${String(month.month).padStart(2, '0')}-01`
  );

  const { paid, planned } = splitPaidAndPlanned(events);
  const totalOutflow = totalExpenses !== undefined && totalExpenses !== null
    ? totalExpenses
    : paid + planned;

  const { invested } = splitInvestments(events);
  const { net, savingsRate, savedAndInvested } = getNetPosition(incomeAmount, totalOutflow, { invested });
  const headroom = getHeadroom(lowestBalance, safetyFloor);
  const floorBreached = headroom.status === 'breached';

  return (
    <div className="detailed-kpi-grid summary-grid">
      <StatTile
        label="Monthly income"
        icon={<TrendingUpIcon size={13} strokeWidth={2.4} />}
        iconTone="income"
        value={formatCurrencyWhole(incomeAmount, currencySymbol)}
        chips={canEditSalary && isCreditEffective ? <Chip tone="good">Credited</Chip> : null}
        subtext={canEditSalary && isCreditEffective
          ? `Credited on ${salaryCreditedDate ? formatDisplayDate(salaryCreditedDate, true) : `day ${incomeCreditDay}`}`
          : `Credited on day ${incomeCreditDay}`}
      />

      <StatTile
        label="Total expenses"
        icon={<TrendingDownIcon size={13} strokeWidth={2.4} />}
        iconTone="expense"
        value={formatCurrencyWhole(totalOutflow, currencySymbol)}
        subtext={paid + planned > 0
          ? <>{formatCurrency(paid, currencySymbol)} paid · {formatCurrency(planned, currencySymbol)} planned</>
          : 'Nothing planned yet'}
      />

      <StatTile
        label="Projected net"
        icon={<WalletIcon size={13} strokeWidth={2.2} />}
        iconTone={net < 0 ? 'expense' : 'balance'}
        tone={net < 0 ? 'negative' : 'neutral'}
        valueClassName={net < 0 ? 'text-breached' : 'text-net-positive'}
        value={<>{net > 0 ? '+' : ''}{formatCurrencyWhole(net, currencySymbol)}</>}
        subtext={savingsRate === null
          ? 'No income recorded'
          : invested > 0
            ? `${formatCurrencyWhole(savedAndInvested, currencySymbol)} saved & invested · ${formatPercent(Math.max(0, savingsRate))} of income`
            : net >= 0
              ? `${formatPercent(savingsRate)} of income saved`
              : `Spending ${formatPercent(Math.abs(savingsRate))} more than income`}
      />

      <StatTile
        label="Lowest balance"
        icon={<ShieldAlertIcon size={13} strokeWidth={2.2} />}
        iconTone={floorBreached ? 'breach' : 'lowest'}
        tone={floorBreached ? 'breached' : 'neutral'}
        valueClassName={floorBreached ? 'text-breached' : ''}
        value={formatCurrencyWhole(lowestBalance, currencySymbol)}
        chips={floorBreached
          ? <Chip tone="critical">Below floor</Chip>
          : pastBreach
            ? (
              <Chip tone="warning" title={`Dropped to ${formatCurrency(pastBreach.balance, currencySymbol)}`}>
                Dipped below on {pastBreach.date ? formatDisplayDate(pastBreach.date, false) : 'an earlier day'}
              </Chip>
            )
            : null}
        subtext={<>
          {lowestDate ? formatDisplayDate(lowestDate, true) : 'No date'}
          {safetyFloor > 0 && (
            <>
              {' · '}
              {formatCurrency(Math.abs(headroom.amount), currencySymbol)} {floorBreached ? 'under' : 'above'} floor
            </>
          )}
        </>}
      />
    </div>
  );
}

export function IrregularHeroCards({ metrics = {}, currencySymbol = '₹' }) {
  const {
    smoothedMonthlyIncome = 0,
    trailing12mIncome = 0,
    currentBalance = 0,
    avgMonthlySpending = 0,
    trailing12mSpending = 0,
    monthsOfHistory = 12
  } = metrics || {};

  const periodLabel = `Last ${monthsOfHistory} month${monthsOfHistory === 1 ? '' : 's'}`;

  const { net, savingsRate } = getNetPosition(trailing12mIncome, trailing12mSpending);

  return (
    <div className="irr-hero-grid">
      <div className="summary-card kpi-card">
        <span className="summary-label">Smoothed income</span>
        <span className="summary-value text-net-positive">
          {formatCurrencyWhole(smoothedMonthlyIncome, currencySymbol)}<span className="irr-unit"> / mo</span>
        </span>
        <span className="kpi-subtext">{periodLabel}: {formatCurrency(trailing12mIncome, currencySymbol)}</span>
      </div>

      <div className="summary-card kpi-card">
        <span className="summary-label">Avg monthly spending</span>
        <span className="summary-value">
          {formatCurrencyWhole(avgMonthlySpending, currencySymbol)}<span className="irr-unit"> / mo</span>
        </span>
        <span className="kpi-subtext">{periodLabel}: {formatCurrency(trailing12mSpending, currencySymbol)}</span>
      </div>

      <div className={`summary-card kpi-card ${net < 0 ? 'kpi-card-negative' : ''}`}>
        <span className="summary-label">Savings rate</span>
        <span className={`summary-value ${net < 0 ? 'text-breached' : ''}`}>
          {savingsRate === null ? '—' : `${Math.round(savingsRate * 100)}%`}
        </span>
        <span className="kpi-subtext">
          {savingsRate === null
            ? `No income in the last ${monthsOfHistory} month${monthsOfHistory === 1 ? '' : 's'}`
            : `${net >= 0 ? '+' : ''}${formatCurrency(net, currencySymbol)} kept over ${monthsOfHistory} month${monthsOfHistory === 1 ? '' : 's'}`}
        </span>
      </div>

      <div className="summary-card kpi-card">
        <span className="summary-label">Total liquid balance</span>
        <span className="summary-value">{formatCurrencyWhole(currentBalance, currencySymbol)}</span>
        <span className="kpi-subtext">Across all accounts</span>
      </div>
    </div>
  );
}

/**
 * Quarter-by-quarter income vs spending as paired bars (two series, one
 * shared scale), with net printed in text. The table below it carries the
 * exact figures for screen readers and anyone who prefers numbers.
 */
export function QuarterlyBars({ quarters = [], currencySymbol = '₹' }) {
  if (!quarters || quarters.length === 0) return null;
  const max = quarters.reduce((m, q) => Math.max(m, q.income || 0, q.spending || 0), 0) || 1;

  return (
    <div className="qbars" aria-hidden="true">
      <ul className="cat-legend">
        <li><span className="cat-swatch qbar-income" />Income</li>
        <li><span className="cat-swatch qbar-spending" />Spending</li>
      </ul>
      {quarters.map((q) => (
        <div key={q.key} className="qbar-row">
          <span className="qbar-label">{q.key}</span>
          <span className="qbar-pair">
            <span className="qbar qbar-income" style={{ width: `${((q.income || 0) / max) * 100}%` }} />
            <span className="qbar qbar-spending" style={{ width: `${((q.spending || 0) / max) * 100}%` }} />
          </span>
          <span className={`qbar-net tabular-nums ${q.net >= 0 ? 'net-in' : 'net-out'}`}>
            {q.net >= 0 ? '+' : ''}{formatCurrency(q.net, currencySymbol)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function QuarterlyBreakdownTable({ quarters = [], currencySymbol = '₹' }) {
  if (!quarters || quarters.length === 0) {
    return (
      <div className="irr-empty">
        <p>No quarterly transaction history found yet.</p>
        <p className="kpi-subtext">Transactions you log will be automatically aggregated by quarter and year.</p>
      </div>
    );
  }

  return (
    <>
      <QuarterlyBars quarters={quarters} currencySymbol={currencySymbol} />
      <div className="irr-table-wrap">
        <table className="irr-table">
          <thead>
            <tr>
              <th scope="col">Period</th>
              <th scope="col">Income</th>
              <th scope="col">Spending</th>
              <th scope="col">Net savings</th>
            </tr>
          </thead>
          <tbody>
            {quarters.map((q) => (
              <tr key={q.key}>
                <td className="irr-period">{q.key}</td>
                <td className="tabular-nums text-net-positive">+{formatCurrency(q.income, currencySymbol)}</td>
                <td className="tabular-nums">-{formatCurrency(q.spending, currencySymbol)}</td>
                <td className={`tabular-nums irr-net ${q.net >= 0 ? 'text-net-positive' : 'text-breached'}`}>
                  {q.net >= 0 ? '+' : ''}{formatCurrency(q.net, currencySymbol)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
