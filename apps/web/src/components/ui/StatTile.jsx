import React from 'react';

/**
 * One headline figure with the same skeleton everywhere:
 * label row (optional icon badge), value, then a footer of chips and a subtext line.
 *
 * tone: 'neutral' | 'negative' | 'breached' tints the card edge and value.
 * iconTone: class suffix for the icon badge (income, expense, balance, lowest, breach).
 */
export function StatTile({
  label,
  value,
  icon = null,
  iconTone = 'balance',
  tone = 'neutral',
  valueClassName = '',
  chips = null,
  subtext = null,
  className = ''
}) {
  const toneClass = tone === 'negative' ? 'kpi-card-negative' : tone === 'breached' ? 'kpi-card-breached' : '';
  return (
    <div className={['summary-card', 'kpi-card', toneClass, className].filter(Boolean).join(' ')}>
      <div className="kpi-card-header">
        <div className="kpi-title-with-icon">
          {icon && (
            <span className={`kpi-icon-badge kpi-${iconTone}`} aria-hidden="true">
              {icon}
            </span>
          )}
          <span className="summary-label">{label}</span>
        </div>
      </div>
      <span className={['summary-value', valueClassName].filter(Boolean).join(' ')}>{value}</span>
      {(chips || subtext) && (
        <div className="kpi-footer">
          {chips}
          {subtext && <span className="kpi-subtext">{subtext}</span>}
        </div>
      )}
    </div>
  );
}
