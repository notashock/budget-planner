import React, { useCallback, useEffect, useState } from 'react';
import { formatCurrency, formatDisplayDate } from '@budget/engine';
import { api } from '../api.js';
import { HeldLentForm } from './HeldLentForm.jsx';
import { AnimatedModal } from './AnimatedModal.jsx';
import { Button } from './ui/Button.jsx';
import { PlusIcon, UserIcon, ChevronDownIcon, ChevronUpIcon } from './Icons.jsx';

const VERB = {
  held_in: 'Received to hold',
  held_return: 'Returned',
  lent_out: 'Lent',
  lent_repaid: 'Paid back'
};

/**
 * People: money you hold for others and money others owe you (ADR 0069).
 * Neither side is income or expense. Money you hold is ring-fenced out of
 * Safe-to-Spend until you give it back.
 */
export function PeoplePanel({
  bankAccounts = [],
  transactions = [],
  wallets = [],
  currencySymbol = '₹',
  month = null,
  simulation = null,
  isReviewMode = false,
  onChanged
}) {
  const [data, setData] = useState({ funds: [], totals: { held: 0, lent: 0 } });
  const [showSettled, setShowSettled] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [entries, setEntries] = useState({});
  const [form, setForm] = useState(null); // { action, fundId }
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.getPersonFunds();
      setData({ funds: res?.funds || [], totals: res?.totals || { held: 0, lent: 0 } });
      setLoadError('');
    } catch (err) {
      setLoadError(err?.message || 'Could not load people.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (fund) => {
    if (expanded === fund.id) {
      setExpanded(null);
      return;
    }
    setExpanded(fund.id);
    try {
      const full = await api.getPersonFund(fund.id);
      setEntries((prev) => ({ ...prev, [fund.id]: full?.entries || [] }));
    } catch {
      setEntries((prev) => ({ ...prev, [fund.id]: [] }));
    }
  };

  const handleSaved = async () => {
    setForm(null);
    setEntries({});
    setExpanded(null);
    await load();
    onChanged?.();
  };

  const open = data.funds.filter((f) => f.status !== 'settled');
  const settled = data.funds.filter((f) => f.status === 'settled');
  const visible = showSettled ? data.funds : open;

  return (
    <section className="hl-panel" aria-labelledby="hl-panel-title" data-testid="people-panel">
      <div className="hl-panel-head">
        <div>
          <h2 id="hl-panel-title" className="hl-panel-title">Held &amp; Lent</h2>
          <p className="hl-panel-sub">Money that isn&rsquo;t yours, or is yours with someone else. Never counted as income or spending.</p>
        </div>
        {!isReviewMode && (
          <Button size="sm" icon={<PlusIcon size={14} />} onClick={() => setForm({ action: 'hold', fundId: '' })}>
            New entry
          </Button>
        )}
      </div>

      <div className="hl-totals">
        <div className="hl-total">
          <span className="hl-total-label">You hold for others</span>
          <span className="hl-total-value tabular-nums">{formatCurrency(data.totals.held, currencySymbol, 100, { decimals: 'auto' })}</span>
          <span className="hl-total-note">Kept out of Safe-to-Spend</span>
        </div>
        <div className="hl-total">
          <span className="hl-total-label">Others owe you</span>
          <span className="hl-total-value tabular-nums">{formatCurrency(data.totals.lent, currencySymbol, 100, { decimals: 'auto' })}</span>
          <span className="hl-total-note">Not counted until it&rsquo;s back</span>
        </div>
      </div>

      {loadError && <div className="hl-error" role="alert">{loadError}</div>}

      {visible.length === 0 ? (
        <p className="hl-empty">
          {data.funds.length === 0
            ? 'Nothing here yet. Use “New entry” when you hold money for someone or lend some out.'
            : 'Everything is settled.'}
        </p>
      ) : (
        <ul className="hl-list">
          {visible.map((f) => {
            const isHeld = f.direction === 'held';
            const isOpen = expanded === f.id;
            return (
              <li key={f.id} className={`hl-person ${f.status === 'settled' ? 'settled' : ''}`}>
                <button type="button" className="hl-person-row" onClick={() => toggle(f)} aria-expanded={isOpen}>
                  <span className="hl-avatar" aria-hidden="true"><UserIcon size={14} /></span>
                  <span className="hl-person-main">
                    <span className="hl-person-name">{f.personName}</span>
                    <span className="hl-person-meta">
                      {f.status === 'settled'
                        ? 'Settled'
                        : (isHeld ? 'You hold their money' : 'Owes you')}
                      {f.lastActivityDate ? ` · ${formatDisplayDate(f.lastActivityDate, false)}` : ''}
                    </span>
                    {f.status !== 'settled' && f.expectedSettleDate && (
                      <span className={`hl-person-expected ${f.expectedSettleDate < new Date().toISOString().slice(0, 10) ? 'late' : ''}`}>
                        {isHeld ? 'Give back by ' : 'Back by '}{formatDisplayDate(f.expectedSettleDate, false)}
                      </span>
                    )}
                  </span>
                  <span className={`hl-person-amount tabular-nums ${isHeld ? 'held' : 'lent'}`}>
                    {formatCurrency(Math.max(0, f.outstanding), currencySymbol, 100, { decimals: 'auto' })}
                  </span>
                  {isOpen ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
                </button>
                {isOpen && (
                  <div className="hl-person-body">
                    {!isReviewMode && (
                      <div className="hl-person-actions">
                        {isHeld ? (
                          <>
                            {f.outstanding > 0 && (
                              <Button size="sm" variant="primary" onClick={() => setForm({ action: 'return', fundId: f.id })}>Return money</Button>
                            )}
                            <Button size="sm" onClick={() => setForm({ action: 'hold', fundId: f.id })}>Received more</Button>
                          </>
                        ) : (
                          <>
                            {f.outstanding > 0 && (
                              <Button size="sm" variant="primary" onClick={() => setForm({ action: 'repaid', fundId: f.id })}>Got money back</Button>
                            )}
                            <Button size="sm" onClick={() => setForm({ action: 'lend', fundId: f.id })}>Lent more</Button>
                          </>
                        )}
                      </div>
                    )}
                    <ul className="hl-entries">
                      {(entries[f.id] || []).filter((t) => t.status !== 'cancelled').map((t) => (
                        <li key={t.id} className="hl-entry">
                          <span>{VERB[t.origin] || t.name}{t.status === 'planned' ? ' (planned)' : ''}</span>
                          <span className="hl-entry-date">{formatDisplayDate(t.date, false)}</span>
                          <span className="tabular-nums">
                            {(t.origin === 'held_in' || t.origin === 'lent_repaid') ? '+' : '−'}
                            {formatCurrency(Math.abs(t.amount), currencySymbol, 100, { decimals: 'auto' })}
                          </span>
                        </li>
                      ))}
                      {!entries[f.id] && <li className="hl-entry hl-entry-loading">Loading…</li>}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {settled.length > 0 && (
        <button type="button" className="hl-toggle-settled" onClick={() => setShowSettled((v) => !v)}>
          {showSettled ? 'Hide settled' : `Show settled (${settled.length})`}
        </button>
      )}

      <AnimatedModal isOpen={Boolean(form)} onClose={() => setForm(null)} dataTestId="held-lent-modal">
        {form && (
          <>
          <h3 className="hl-modal-title">Held &amp; Lent money</h3>
          <HeldLentForm
            key={`${form.action}-${form.fundId}`}
            initialAction={form.action}
            initialFundId={form.fundId}
            bankAccounts={bankAccounts}
            wallets={wallets}
            currencySymbol={currencySymbol}
            month={month}
            simulation={simulation}
            transactions={transactions}
            onSaved={handleSaved}
            onCancel={() => setForm(null)}
          />
          </>
        )}
      </AnimatedModal>
    </section>
  );
}
