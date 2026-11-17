import React from 'react';

/**
 * The same page heading on every screen: one <h1> and a one-line subtitle.
 * Screens keep their own action buttons beside it.
 */
export function PageTitle({ title, subtitle = null, className = '' }) {
  return (
    <div className={`page-title-group ${className}`.trim()}>
      <h1 className="page-title">{title}</h1>
      {subtitle && <p className="page-subtitle">{subtitle}</p>}
    </div>
  );
}
