import React from 'react';
import { formatCurrency } from '@budget/engine';

/**
 * Three nested rings on the Accounts screen: share of money in banks, share in
 * wallets, and whether any transfers exist. Each ring doubles as a tab button.
 */
export function ConcentricActivityRings({
  totalBankBalance,
  totalWalletBalance,
  transfersCount,
  activeSegment,
  onSelectSegment,
  currencySymbol
}) {
  const total = (totalBankBalance || 0) + (totalWalletBalance || 0);
  const bankPct = total > 0 ? Math.min(100, Math.max(8, Math.round((totalBankBalance / total) * 100))) : 0;
  const walletPct = total > 0 ? Math.min(100, Math.max(8, Math.round((totalWalletBalance / total) * 100))) : 0;
  const transferPct = transfersCount > 0 ? 100 : 0;

  const cBanks = 257.6;
  const cWallets = 188.5;
  const cTransfers = 119.4;

  const offBanks = cBanks - (cBanks * (bankPct / 100));
  const offWallets = cWallets - (cWallets * (walletPct / 100));
  const offTransfers = transferPct > 0 ? 0 : cTransfers;

  return (
    <div className="apple-concentric-container">
      <div className="apple-rings-wrapper">
        <svg className="apple-rings-svg" viewBox="0 0 100 100">
          {/* Outer Track & Ring: Banks (Blue) */}
          <circle cx="50" cy="50" r="41" stroke="var(--cat-blue)" strokeWidth="6.5" className="ring-track" />
          <circle
            cx="50" cy="50" r="41" stroke="var(--cat-blue)" strokeWidth="6.5"
            strokeDasharray={cBanks} strokeDashoffset={offBanks}
            className={`ring-fill ring-clickable ${activeSegment === 'banks' ? 'ring-active' : ''}`}
            onClick={() => onSelectSegment('banks')}
            style={{ color: 'var(--cat-blue)' }}
          />

          {/* Middle Track & Ring: Wallets (Amber) */}
          <circle cx="50" cy="50" r="30" stroke="var(--cat-amber)" strokeWidth="6.5" className="ring-track" />
          <circle
            cx="50" cy="50" r="30" stroke="var(--cat-amber)" strokeWidth="6.5"
            strokeDasharray={cWallets} strokeDashoffset={offWallets}
            className={`ring-fill ring-clickable ${activeSegment === 'wallets' ? 'ring-active' : ''}`}
            onClick={() => onSelectSegment('wallets')}
            style={{ color: 'var(--cat-amber)' }}
          />

          {/* Inner Track & Ring: Transfers (Emerald) */}
          <circle cx="50" cy="50" r="19" stroke="var(--cat-green)" strokeWidth="6.5" className="ring-track" />
          <circle
            cx="50" cy="50" r="19" stroke="var(--cat-green)" strokeWidth="6.5"
            strokeDasharray={cTransfers} strokeDashoffset={offTransfers}
            className={`ring-fill ring-clickable ${activeSegment === 'transfers' ? 'ring-active' : ''}`}
            onClick={() => onSelectSegment('transfers')}
            style={{ color: 'var(--cat-green)' }}
          />
        </svg>
      </div>

      <div className="apple-rings-pills">
        <button
          type="button"
          role="button"
          aria-label="Bank Accounts"
          onClick={() => onSelectSegment('banks')}
          className={`apple-ring-pill banks ${activeSegment === 'banks' ? 'active' : ''}`}
        >
          <span className="apple-ring-dot accounts-box" />
          <span className="tabular-nums">{formatCurrency(totalBankBalance, currencySymbol)}</span>
        </button>

        <button
          type="button"
          role="button"
          aria-label="Wallets"
          onClick={() => onSelectSegment('wallets')}
          className={`apple-ring-pill wallets ${activeSegment === 'wallets' ? 'active' : ''}`}
        >
          <span className="apple-ring-dot accounts-box-2" />
          <span className="tabular-nums">{formatCurrency(totalWalletBalance, currencySymbol)}</span>
        </button>

        <button
          type="button"
          role="button"
          aria-label="Transfers"
          onClick={() => onSelectSegment('transfers')}
          className={`apple-ring-pill transfers ${activeSegment === 'transfers' ? 'active' : ''}`}
        >
          <span className="apple-ring-dot accounts-box-3" />
          <span className="tabular-nums">Net {currencySymbol}0</span>
        </button>
      </div>
    </div>
  );
}
