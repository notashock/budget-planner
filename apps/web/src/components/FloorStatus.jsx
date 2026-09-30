import React from 'react';
import { formatCurrency, formatDisplayDate } from '@budget/engine';

export function FloorStatus({
  floorBreached = false,
  lowestBalance = 0,
  lowestDate = '',
  safetyFloor = 0,
  currencySymbol = '₹'
}) {
  const formattedLowestDate = lowestDate ? formatDisplayDate(lowestDate, true) : 'N/A';

  if (floorBreached) {
    const deficit = safetyFloor - lowestBalance;
    return (
      <div className="floor-banner breached">
        <div>
          <div className="floor-banner-title">
            Safety floor breached
          </div>
          <div className="floor-banner-desc">
            Balance drops to {formatCurrency(lowestBalance, currencySymbol)} on {formattedLowestDate}, breaching your {formatCurrency(safetyFloor, currencySymbol)} safety floor by {formatCurrency(deficit, currencySymbol)}.
          </div>
        </div>
      </div>
    );
  }

  const margin = lowestBalance - safetyFloor;
  return (
    <div className="floor-banner safe">
      <div>
        <div className="floor-banner-title">
          Safety floor maintained
        </div>
        <div className="floor-banner-desc">
          Lowest balance is {formatCurrency(lowestBalance, currencySymbol)} on {formattedLowestDate}, safely {formatCurrency(margin, currencySymbol)} above your safety floor.
        </div>
      </div>
    </div>
  );
}
