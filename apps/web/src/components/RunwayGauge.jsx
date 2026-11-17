import React from 'react';
import { formatCurrency, getRunwayBand } from '@budget/engine';
import { CheckCircleIcon, AlertTriangleIcon, ShieldAlertIcon } from './Icons.jsx';

const BAND_ICON = {
  healthy: CheckCircleIcon,
  building: AlertTriangleIcon,
  low: ShieldAlertIcon
};

const BAND_NOTE = {
  healthy: 'A full emergency fund: six months or more of average spending.',
  building: 'Building toward a full emergency fund of six months.',
  low: 'Under three months of cover. Building this up is the first priority.'
};

/**
 * Emergency runway on a months scale with the 3- and 6-month planning
 * benchmarks drawn as bands. The marker shows where current balances land.
 */
export function RunwayGauge({
  runwayMonths = 0,
  isIndefinite = false,
  currentBalance = 0,
  avgMonthlySpending = 0,
  currencySymbol = '₹'
}) {
  const band = getRunwayBand(isIndefinite ? Infinity : runwayMonths);
  const Icon = BAND_ICON[band.key];

  const months = isIndefinite ? null : Math.max(0, Number(runwayMonths) || 0);
  const scaleMax = Math.max(9, Math.min(24, Math.ceil((months || 0) + 1)));
  const markerPct = months === null ? 100 : Math.min(100, (months / scaleMax) * 100);
  const pct = (m) => `${(m / scaleMax) * 100}%`;

  return (
    <section className="summary-card runway-card" aria-labelledby="runway-title">
      <div className="pic-head">
        <h3 id="runway-title" className="pic-title">Emergency runway</h3>
        <span className={`runway-status band-${band.key}`}>
          <Icon size={12} />
          <span>{band.label}</span>
        </span>
      </div>

      <div className="runway-figure">
        <span className="runway-value">{months === null ? 'Indefinite' : months.toFixed(1)}</span>
        {months !== null && <span className="runway-unit">months</span>}
      </div>

      <div
        className="runway-gauge"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={scaleMax}
        aria-valuenow={months === null ? scaleMax : Math.min(months, scaleMax)}
        aria-label={months === null
          ? 'Runway indefinite: no spending recorded'
          : `Runway ${months.toFixed(1)} months; benchmarks at 3 and 6 months`}
      >
        <span className="runway-band band-low" style={{ left: 0, width: pct(3) }} />
        <span className="runway-band band-building" style={{ left: pct(3), width: pct(3) }} />
        <span className="runway-band band-healthy" style={{ left: pct(6), width: `calc(100% - ${pct(6)})` }} />
        <span className="runway-marker" style={{ left: `${markerPct}%` }} />
      </div>
      <div className="runway-scale" aria-hidden="true">
        <span style={{ left: 0 }}>0</span>
        <span style={{ left: pct(3) }}>3 mo</span>
        <span style={{ left: pct(6) }}>6 mo</span>
        <span style={{ left: '100%' }}>{scaleMax} mo</span>
      </div>

      <p className="pic-note">
        {months === null
          ? 'No spending recorded yet, so balances are not being drawn down.'
          : <>{formatCurrency(currentBalance, currencySymbol)} covers {months.toFixed(1)} months of average spending ({formatCurrency(avgMonthlySpending, currencySymbol)}/mo). {BAND_NOTE[band.key]}</>}
      </p>
    </section>
  );
}
