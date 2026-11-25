import React, { useCallback, useEffect, useState } from 'react';
import { formatCurrency, formatDisplayDate, toMinorUnits } from '@budget/engine';
import { api } from '../api.js';
import { HeldLentForm } from './HeldLentForm.jsx';
import { AnimatedModal } from './AnimatedModal.jsx';
import { DatePicker } from './DatePicker.jsx';
import { ActionMenu } from './ActionMenu.jsx';
import { Button } from './ui/Button.jsx';
import { UserIcon } from './Icons.jsx';

const VERB = {
  held_in: 'Received to hold',
  held_return: 'Returned',
  lent_out: 'Lent',
  lent_repaid: 'Paid back'
};
const isIn = (t) => t.origin === 'held_in' || t.origin === 'lent_repaid';

/** Edit a person's name, note and expected settle date. */
function PersonForm({ fund, month, onSaved, onCancel }) {
  const [name, setName] = useState(fund.personName || '');
  const [note, setNote] = useState(fund.note || '');
  const [expected, setExpected] = useState(fund.expectedSettleDate || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await api.updatePersonFund(fund.id, { personName: name.trim(), note: note.trim(), expectedSettleDate: expected || null });
      await onSaved();
    } catch (err) {
      setError(err?.message || 'Could not save.');
      setSaving(false);
    }
  };
  return (
    <form autoComplete="off" className="hl-form" onSubmit={submit}>
      <h3 className="hl-modal-title">Edit {fund.personName}</h3>
      <div className="form-group">
        <label className="form-label" htmlFor="hl-edit-name">Name</label>
        <input autoComplete="off" id="hl-edit-name" type="text" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="hl-edit-note">Note</label>
        <input autoComplete="off" id="hl-edit-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
      </div>
      <div className="form-group">
        <span className="form-label">{fund.direction === 'held' ? 'Give back by' : 'Back by'}</span>
        <DatePicker compact value={expected} onChange={setExpected} month={month} placeholder="No date" />
      </div>
      {error && <div className="hl-error" role="alert">{error}</div>}
      <div className="hl-form-actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" type="submit" disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save'}</Button>
      </div>
    </form>
  );
}

/** Edit one entry's amount and date (its direction stays the same). */
function EntryForm({ entry, currencySymbol, month, onSaved, onCancel }) {
  const [amount, setAmount] = useState(String(Math.abs(entry.amount) / 100));
  const [date, setDate] = useState(entry.date || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const minor = toMinorUnits(amount);
    if (saving || !(minor > 0)) return;
    setSaving(true);
    setError('');
    try {
      await api.updateTransaction(entry.id, { amount: Math.sign(entry.amount || 1) * minor, date });
      await onSaved();
    } catch (err) {
      setError(err?.message || 'Could not save.');
      setSaving(false);
    }
  };
  return (
    <form autoComplete="off" className="hl-form" onSubmit={submit}>
      <h3 className="hl-modal-title">Edit “{VERB[entry.origin] || entry.name}”</h3>
      <div className="form-group">
        <label className="form-label" htmlFor="hl-entry-amount">Amount ({currencySymbol})</label>
        <input autoComplete="off" id="hl-entry-amount" type="number" inputMode="decimal" step="0.01" min="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="form-group">
        <span className="form-label">Date</span>
        <DatePicker compact value={date} onChange={setDate} month={month} required />
      </div>
      {error && <div className="hl-error" role="alert">{error}</div>}
      <div className="hl-form-actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </div>
    </form>
  );
}

/** One line, the destructive action in red, Cancel (redesign §5.1). */
function ConfirmDelete({ title, body, onConfirm, onCancel }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
    } catch (err) {
      setError(err?.message || 'Could not delete.');
      setBusy(false);
    }
  };
  return (
    <div className="hl-form">
      <h3 className="hl-modal-title">{title}</h3>
      <p className="hl-confirm-body">{body}</p>
      {error && <div className="hl-error" role="alert">{error}</div>}
      <div className="hl-form-actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="danger" onClick={go} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</Button>
      </div>
    </div>
  );
}

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
  onChanged,
  // Bumped by the Accounts ＋ menu to open a new entry
  addRequest = 0
}) {
  const [data, setData] = useState({ funds: [], totals: { held: 0, lent: 0 } });
  const [showSettled, setShowSettled] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [entries, setEntries] = useState({});
  // { kind: 'entry', action, fundId } | { kind: 'person', fund } | { kind: 'deletePerson', fund }
  // | { kind: 'editEntry', entry } | { kind: 'deleteEntry', entry }
  const [modal, setModal] = useState(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (addRequest) setModal({ kind: 'entry', action: 'hold', fundId: '' });
  }, [addRequest]);

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

  const loadEntries = async (fundId) => {
    try {
      const full = await api.getPersonFund(fundId);
      setEntries((prev) => ({ ...prev, [fundId]: full?.entries || [] }));
    } catch {
      setEntries((prev) => ({ ...prev, [fundId]: [] }));
    }
  };

  const toggle = (fund) => {
    if (expanded === fund.id) {
      setExpanded(null);
      return;
    }
    setExpanded(fund.id);
    loadEntries(fund.id);
  };

  // After any change: reload the list, keep the open person open with fresh entries
  const handleSaved = async () => {
    setModal(null);
    setEntries({});
    await load();
    if (expanded) await loadEntries(expanded);
    onChanged?.();
  };

  const money = (v) => formatCurrency(v, currencySymbol, 100, { decimals: 'auto' });
  const open = data.funds.filter((f) => f.status !== 'settled');
  const settled = data.funds.filter((f) => f.status === 'settled');
  const visible = showSettled ? data.funds : open;
  const today = new Date().toISOString().slice(0, 10);
  const totals = [
    data.totals.held > 0 && `You hold ${money(data.totals.held)} for others (kept out of Safe-to-Spend)`,
    data.totals.lent > 0 && `others owe you ${money(data.totals.lent)}`
  ].filter(Boolean).join(' · ');

  return (
    <section className="acct-section hl-panel" aria-labelledby="hl-panel-title" data-testid="people-panel">
      <h2 id="hl-panel-title" className="acct-section-title">People</h2>

      {loadError && <div className="hl-error" role="alert">{loadError}</div>}

      {visible.length === 0 ? (
        <div className="acct-inset acct-empty">
          {data.funds.length > 0 ? <span>Everything is settled.</span> : isReviewMode ? <span>No one</span> : (
            <button type="button" className="acct-empty-add" onClick={() => setModal({ kind: 'entry', action: 'hold', fundId: '' })}>
              + Money you hold for someone or lent out
            </button>
          )}
        </div>
      ) : (
        <ul className="acct-inset hl-list">
          {visible.map((f) => {
            const isHeld = f.direction === 'held';
            const isOpen = expanded === f.id;
            const isSettled = f.status === 'settled';
            const late = !isSettled && f.expectedSettleDate && f.expectedSettleDate < today;
            const caption = isSettled
              ? 'Settled'
              : `${isHeld ? 'You hold their money' : 'Owes you'}${f.expectedSettleDate ? ` · ${isHeld ? 'give back by' : 'back by'} ${formatDisplayDate(f.expectedSettleDate, false)}` : ''}`;
            const list = (entries[f.id] || []).filter((t) => t.status !== 'cancelled');
            return (
              <li key={f.id} className={`hl-person ${isSettled ? 'settled' : ''}`}>
                <button type="button" className="acct-row" onClick={() => toggle(f)} aria-expanded={isOpen}>
                  <span className="acct-row-icon person" aria-hidden="true"><UserIcon size={16} /></span>
                  <span className="acct-row-main">
                    <span className="acct-row-title">{f.personName}</span>
                    <span className="acct-row-caption"><span className={`acct-row-caption-text${late ? ' tone-bad' : ''}`}>{caption}</span></span>
                  </span>
                  <span className={`acct-row-balance tabular-nums hl-person-amount ${isHeld ? 'held' : 'lent'}`}>{money(Math.max(0, f.outstanding))}</span>
                  <span className={`acct-row-chev${isOpen ? ' open' : ''}`} aria-hidden="true">›</span>
                </button>
                {isOpen && (
                  <div className="acct-row-body">
                    {!isReviewMode && (
                      <div className="acct-row-actions">
                        {isHeld ? (
                          <>
                            {f.outstanding > 0 && (
                              <Button size="sm" variant="primary" onClick={() => setModal({ kind: 'entry', action: 'return', fundId: f.id })}>Return money</Button>
                            )}
                            <Button size="sm" onClick={() => setModal({ kind: 'entry', action: 'hold', fundId: f.id })}>Received more</Button>
                          </>
                        ) : (
                          <>
                            {f.outstanding > 0 && (
                              <Button size="sm" variant="primary" onClick={() => setModal({ kind: 'entry', action: 'repaid', fundId: f.id })}>Got money back</Button>
                            )}
                            <Button size="sm" onClick={() => setModal({ kind: 'entry', action: 'lend', fundId: f.id })}>Lent more</Button>
                          </>
                        )}
                        <ActionMenu
                          label={`More actions for ${f.personName}`}
                          items={[
                            { label: 'Edit details', onClick: () => setModal({ kind: 'person', fund: f }) },
                            { label: 'Delete person', danger: true, onClick: () => setModal({ kind: 'deletePerson', fund: f }) }
                          ]}
                        />
                      </div>
                    )}
                    {f.note && <p className="hl-person-note">{f.note}</p>}
                    <ul className="hl-entries">
                      {list.map((t) => (
                        <li key={t.id} className="hl-entry">
                          <span className="hl-entry-main">
                            <span>{VERB[t.origin] || t.name}{t.status === 'planned' ? ' (planned)' : ''}</span>
                            <span className="hl-entry-date">{formatDisplayDate(t.date, false)}</span>
                          </span>
                          <span className="tabular-nums">{isIn(t) ? '+' : '−'}{money(Math.abs(t.amount))}</span>
                          {!isReviewMode && (
                            <ActionMenu
                              label={`Actions for ${VERB[t.origin] || t.name} on ${formatDisplayDate(t.date, false)}`}
                              items={[
                                { label: 'Edit', onClick: () => setModal({ kind: 'editEntry', entry: t }) },
                                { label: 'Delete', danger: true, onClick: () => setModal({ kind: 'deleteEntry', entry: t }) }
                              ]}
                            />
                          )}
                        </li>
                      ))}
                      {!entries[f.id] && <li className="hl-entry hl-entry-loading">Loading…</li>}
                      {entries[f.id] && list.length === 0 && <li className="hl-entry hl-entry-loading">No entries yet.</li>}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {totals && <p className="acct-section-foot">{totals.charAt(0).toUpperCase() + totals.slice(1)}. Never counted as income or spending.</p>}
      {settled.length > 0 && (
        <button type="button" className="hl-toggle-settled" onClick={() => setShowSettled((v) => !v)}>
          {showSettled ? 'Hide settled' : `Show settled (${settled.length})`}
        </button>
      )}

      <AnimatedModal isOpen={Boolean(modal)} onClose={() => setModal(null)} dataTestId="held-lent-modal">
        {modal?.kind === 'entry' && (
          <>
            <h3 className="hl-modal-title">Held &amp; Lent money</h3>
            <HeldLentForm
              key={`${modal.action}-${modal.fundId}`}
              initialAction={modal.action}
              initialFundId={modal.fundId}
              bankAccounts={bankAccounts}
              wallets={wallets}
              currencySymbol={currencySymbol}
              month={month}
              simulation={simulation}
              transactions={transactions}
              onSaved={handleSaved}
              onCancel={() => setModal(null)}
            />
          </>
        )}
        {modal?.kind === 'person' && (
          <PersonForm fund={modal.fund} month={month} onSaved={handleSaved} onCancel={() => setModal(null)} />
        )}
        {modal?.kind === 'editEntry' && (
          <EntryForm entry={modal.entry} currencySymbol={currencySymbol} month={month} onSaved={handleSaved} onCancel={() => setModal(null)} />
        )}
        {modal?.kind === 'deletePerson' && (
          <ConfirmDelete
            title={`Delete ${modal.fund.personName}?`}
            body={modal.fund.entryCount > 0
              ? 'Their entries are deleted too, and every balance they touched goes back. This can’t be undone.'
              : 'This can’t be undone.'}
            onCancel={() => setModal(null)}
            onConfirm={async () => {
              await api.deletePersonFund(modal.fund.id, { withEntries: true });
              setExpanded(null);
              await handleSaved();
            }}
          />
        )}
        {modal?.kind === 'deleteEntry' && (
          <ConfirmDelete
            title={`Delete “${VERB[modal.entry.origin] || modal.entry.name}” of ${money(Math.abs(modal.entry.amount))}?`}
            body="The account balance it moved goes back. This can’t be undone."
            onCancel={() => setModal(null)}
            onConfirm={async () => {
              await api.deleteTransaction(modal.entry.id);
              await handleSaved();
            }}
          />
        )}
      </AnimatedModal>
    </section>
  );
}
