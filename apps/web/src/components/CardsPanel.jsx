import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatCurrency, formatDisplayDate, toMinorUnits } from '@budget/engine';
import { api } from '../api.js';
import { AnimatedModal } from './AnimatedModal.jsx';
import { AccountSelect } from './AccountSelect.jsx';
import { DatePicker } from './DatePicker.jsx';
import { Button } from './ui/Button.jsx';
import { FloorBreachNotice, anywayLabel } from './FloorBreachNotice.jsx';
import { checkFloor, findCashAccount } from '../utils/floorCheck.js';
import { PlusIcon, CreditCardIcon, EditIcon, AlertTriangleIcon, XIcon } from './Icons.jsx';

const BAND_TONE = {
  comfortable: 'good',
  'on-track': 'good',
  tight: 'warn',
  over: 'bad'
};

const money = (minor, symbol) => formatCurrency(minor || 0, symbol, 100, { decimals: 'auto' });
const toMajorInput = (minor) => (minor ? String(Math.round(minor) / 100) : '');
const dayLabel = (iso) => (iso ? formatDisplayDate(iso, false) : '—');

/**
 * The account type ('bank' | 'wallet') of the account a card's bill is paid from.
 * AccountSelect lists one type at a time, so opening a form with the wrong type
 * shows the wrong list and can switch the pay-from account on save.
 */
export function resolvePayFromType(accountId, bankAccounts = [], wallets = []) {
  if (accountId && wallets.some((w) => String(w.id || w._id) === String(accountId))) return 'wallet';
  if (!accountId && bankAccounts.length === 0 && wallets.length > 0) return 'wallet';
  return 'bank';
}

/** Small ring for the 0-100 Card Payability Score. */
function ScoreRing({ score, band, label }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  return (
    <div className={`cc-score tone-${BAND_TONE[band] || 'good'}`} role="img" aria-label={`Payability score ${score} of 100, ${label}`}>
      <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="28" cy="28" r={r} className="cc-score-track" />
        <circle
          cx="28" cy="28" r={r}
          className="cc-score-arc"
          strokeDasharray={`${c * pct} ${c}`}
          transform="rotate(-90 28 28)"
        />
      </svg>
      <span className="cc-score-value tabular-nums">{score}</span>
    </div>
  );
}

/** Add or edit a card. The bill generation day and due day are always the user's. */
function CardForm({ card = null, bankAccounts, wallets, currencySymbol, onSaved, onCancel }) {
  const isEdit = Boolean(card);
  const firstPayer = bankAccounts.find((b) => b.isPrimary) || bankAccounts[0] || wallets[0] || null;
  const [name, setName] = useState(card?.name || '');
  const [limit, setLimit] = useState(toMajorInput(card?.creditLimit));
  const originalOwed = isEdit ? Math.max(0, -(card?.openingBalance || 0)) : 0;
  const [owed, setOwed] = useState(isEdit ? toMajorInput(originalOwed) : '');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  // Changing what was owed when the card was added shifts every balance since then
  const owedShift = isEdit ? toMinorUnits(owed || 0, 100) - originalOwed : 0;
  const [statementDay, setStatementDay] = useState(card?.statementDay ? String(card.statementDay) : '');
  const [dueDay, setDueDay] = useState(card?.dueDay ? String(card.dueDay) : '');
  const initialPayFrom = card?.payFromAccountId || (firstPayer ? (firstPayer.id || firstPayer._id) : '');
  const [payType, setPayType] = useState(() => resolvePayFromType(initialPayFrom, bankAccounts, wallets));
  const [payFrom, setPayFrom] = useState(initialPayFrom);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e?.preventDefault?.();
    setError('');
    if (!name.trim()) return setError('Give the card a name.');
    const sd = Number(statementDay);
    const dd = Number(dueDay);
    if (!Number.isInteger(sd) || sd < 1 || sd > 31) return setError('Bill generation day must be between 1 and 31.');
    if (!Number.isInteger(dd) || dd < 1 || dd > 31) return setError('Due day must be between 1 and 31.');
    const body = {
      name: name.trim(),
      creditLimit: toMinorUnits(limit || 0, 100),
      statementDay: sd,
      dueDay: dd,
      payFromAccountId: payFrom || null,
      currentOutstanding: toMinorUnits(owed || 0, 100)
    };
    setSaving(true);
    try {
      if (isEdit) await api.updateCard(card.id, body);
      else await api.createCard(body);
      onSaved?.();
    } catch (err) {
      setError(err?.message || 'Could not save the card.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="hl-form" onSubmit={submit} data-testid="card-form">
      <h3 className="hl-modal-title">{isEdit ? 'Edit card' : 'Add a credit card'}</h3>
      <div className="form-group">
        <label className="form-label" htmlFor="cc-name">Card name</label>
        <input id="cc-name" className="input-field" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. HDFC Millennia" />
      </div>
      <div className="hl-row">
        <div className="form-group">
          <label className="form-label" htmlFor="cc-limit">Credit limit ({currencySymbol})</label>
          <input id="cc-limit" className="input-field tabular-nums" type="number" min="0" step="1" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="cc-owed">{isEdit ? 'Owed when added' : 'Owed right now'} ({currencySymbol})</label>
          <input id="cc-owed" className="input-field tabular-nums" type="number" min="0" step="0.01" inputMode="decimal" value={owed} onChange={(e) => setOwed(e.target.value)} placeholder="0" />
          {owedShift !== 0 && (
            <p className="history-warning" role="note" data-testid="card-owed-warning">
              Changing this shifts what the card owed on every day since it was added by{' '}
              <strong className="tabular-nums">{owedShift > 0 ? '+' : '−'}{money(Math.abs(owedShift), currencySymbol)}</strong>.
            </p>
          )}
        </div>
      </div>
      <div className="hl-row">
        <div className="form-group">
          <label className="form-label" htmlFor="cc-sday">Bill generation day</label>
          <input id="cc-sday" className="input-field tabular-nums" type="number" min="1" max="31" value={statementDay} onChange={(e) => setStatementDay(e.target.value)} placeholder="1-31" required />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="cc-dday">Payment due day</label>
          <input id="cc-dday" className="input-field tabular-nums" type="number" min="1" max="31" value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="1-31" required />
        </div>
      </div>
      <p className="hl-hint">On the bill generation day the app adds up this card's spending into a bill for you to confirm. If the due day comes before the bill day, it is due the next month.</p>
      <div className="form-group">
        <label className="form-label">Pay the bill from</label>
        <AccountSelect
          accountType={payType}
          accountId={payFrom}
          onChange={({ accountType, accountId }) => {
            setPayType(accountType);
            setPayFrom(accountId);
          }}
          bankAccounts={bankAccounts}
          wallets={wallets}
          currencySymbol={currencySymbol}
        />
      </div>
      {isEdit && confirmRemove && (
        <div className="inline-confirm" role="alertdialog" aria-label="Remove this card?" data-testid="card-remove-confirm">
          <span>Remove {card.name}? Its history is kept; it stops showing here.</span>
          <div className="inline-confirm-actions">
            <button type="button" className="btn-subtle" onClick={() => setConfirmRemove(false)}>Keep</button>
            <button
              type="button"
              className="btn-primary danger"
              disabled={removing}
              onClick={async () => {
                setRemoving(true);
                setError('');
                try {
                  await api.archiveCard(card.id);
                  onSaved?.();
                } catch (err) {
                  setError(err?.message || 'Could not remove the card.');
                  setConfirmRemove(false);
                } finally {
                  setRemoving(false);
                }
              }}
            >
              {removing ? 'Removing…' : 'Remove'}
            </button>
          </div>
        </div>
      )}
      {error && <div className="hl-error" role="alert">{error}</div>}
      <div className="hl-footer">
        {isEdit && !confirmRemove && (
          <button type="button" className="link-btn danger card-remove-btn" onClick={() => setConfirmRemove(true)}>Remove card</button>
        )}
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" type="submit" disabled={saving}>{saving ? 'Saving…' : (isEdit ? 'Save' : 'Add card')}</Button>
      </div>
    </form>
  );
}

/** Confirm a generated bill, editing it to match the bank's statement if needed. */
function ConfirmBillForm({ card, statement, currencySymbol, onSaved, onCancel }) {
  const [amount, setAmount] = useState(toMajorInput(statement.amount));
  const [minimum, setMinimum] = useState(toMajorInput(statement.minimumDue));
  const [dueDate, setDueDate] = useState(statement.dueDate);
  const [logDiff, setLogDiff] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const minor = toMinorUnits(amount || 0, 100);
  const diff = minor - (statement.computedAmount || 0);

  const payNextRef = React.useRef(false);

  const submit = async (e) => {
    e?.preventDefault?.();
    setError('');
    setSaving(true);
    const payNext = payNextRef.current;
    payNextRef.current = false;
    try {
      await api.confirmCardStatement(statement.id, {
        statementAmount: minor,
        minimumDue: minimum === '' ? null : toMinorUnits(minimum, 100),
        dueDate,
        logChargesDifference: diff !== 0 && logDiff
      });
      onSaved?.({ payNext });
    } catch (err) {
      setError(err?.message || 'Could not confirm the bill.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="hl-form" onSubmit={submit} data-testid="confirm-bill-form">
      <h3 className="hl-modal-title">Confirm {card.name} bill</h3>
      <p className="hl-hint">
        Bill for {dayLabel(statement.cycleStart)} to {dayLabel(statement.cycleEnd)}. The app worked out{' '}
        <strong className="tabular-nums">{money(statement.computedAmount, currencySymbol)}</strong> from your card entries
        ({money(statement.newSpend, currencySymbol)} spent this cycle). Change it if your bank's statement says otherwise.
      </p>
      <div className="hl-row">
        <div className="form-group">
          <label className="form-label" htmlFor="cb-amount">Bill amount ({currencySymbol})</label>
          <input id="cb-amount" className="input-field tabular-nums" type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <span className="field-hint" data-testid="bill-difference">
            {diff === 0
              ? `Matches what the app worked out (${money(statement.computedAmount, currencySymbol)}).`
              : `${diff > 0 ? '+' : '−'}${money(Math.abs(diff), currencySymbol)} vs the app's ${money(statement.computedAmount, currencySymbol)} — ${diff > 0 ? 'fees or interest?' : 'cashback or a reversal?'}`}
          </span>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="cb-min">Minimum due (optional)</label>
          <input id="cb-min" className="input-field tabular-nums" type="number" min="0" step="0.01" inputMode="decimal" value={minimum} onChange={(e) => setMinimum(e.target.value)} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Due date</label>
        <DatePicker compact value={dueDate} onChange={setDueDate} minDate={statement.cycleEnd} required />
      </div>
      {diff !== 0 && (
        <div className="settle-leftover" role="group" aria-label="The difference">
          <button
            type="button"
            className={`choice-card ${logDiff ? 'active' : ''}`}
            aria-pressed={logDiff}
            onClick={() => setLogDiff(true)}
          >
            <span className="choice-card-title">
              Log the {money(Math.abs(diff), currencySymbol)} difference as card {diff > 0 ? 'charges' : 'credit'}
            </span>
            <span className="choice-card-sub">{diff > 0 ? 'Fees or interest' : 'Cashback or a reversal'}, so the card matches the bank.</span>
          </button>
          <button
            type="button"
            className={`choice-card ${!logDiff ? 'active' : ''}`}
            aria-pressed={!logDiff}
            onClick={() => setLogDiff(false)}
          >
            <span className="choice-card-title">Just update the bill</span>
            <span className="choice-card-sub">Card entries stay as they are.</span>
          </button>
        </div>
      )}
      {error && <div className="hl-error" role="alert">{error}</div>}
      <div className="hl-footer">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="ghost" type="submit" disabled={saving} onClick={() => { payNextRef.current = true; }}>
          Confirm &amp; pay
        </Button>
        <Button variant="primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Confirm bill'}</Button>
      </div>
    </form>
  );
}

/** Pay a bill in full, the minimum, or a custom amount, from a bank account or wallet. */
function PayBillForm({ card, bill, bankAccounts, wallets, currencySymbol, simulation = null, onSaved, onCancel }) {
  const [choice, setChoice] = useState('full');
  const [custom, setCustom] = useState('');
  const fallbackPayer = bankAccounts.find((b) => b.isPrimary) || bankAccounts[0] || wallets[0] || null;
  const initialPayFrom = card.payFromAccountId || (fallbackPayer ? (fallbackPayer.id || fallbackPayer._id) : '');
  const [payType, setPayType] = useState(() => resolvePayFromType(initialPayFrom, bankAccounts, wallets));
  const [payFrom, setPayFrom] = useState(initialPayFrom);
  const today = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const [date, setDate] = useState(`${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const amount = choice === 'full' ? bill.remaining : (choice === 'minimum' ? Math.min(bill.remaining, bill.minimumDue || 0) : toMinorUnits(custom || 0, 100));

  const floorCheck = checkFloor(findCashAccount(payFrom, bankAccounts, wallets), amount, { simulation });

  const submit = async (e) => {
    e?.preventDefault?.();
    setError('');
    if (!amount || amount <= 0) return setError('Enter an amount to pay.');
    if (!payFrom) return setError('Choose the account to pay from.');
    setSaving(true);
    try {
      await api.payCardStatement(bill.statementId, { amount, fromAccountId: payFrom, date });
      onSaved?.();
    } catch (err) {
      setError(err?.message || 'Could not record the payment.');
    } finally {
      setSaving(false);
    }
  };

  const options = [
    { key: 'full', label: `Full ${money(bill.remaining, currencySymbol)}` },
    ...(bill.minimumDue ? [{ key: 'minimum', label: `Minimum ${money(Math.min(bill.remaining, bill.minimumDue), currencySymbol)}` }] : []),
    { key: 'custom', label: 'Other amount' }
  ];

  return (
    <form className="hl-form" onSubmit={submit} data-testid="pay-bill-form">
      <h3 className="hl-modal-title">Pay {card.name} bill</h3>
      <p className="hl-hint">Paying moves money from your bank to the card. It isn't counted as spending again: the card purchases already were.</p>
      <div className={`hl-actions ${options.length === 2 ? 'hl-actions-2' : 'cc-actions-3'}`} role="radiogroup" aria-label="How much to pay">
        {options.map((o) => (
          <button key={o.key} type="button" role="radio" aria-checked={choice === o.key} className={`hl-action ${choice === o.key ? 'active' : ''}`} onClick={() => setChoice(o.key)}>
            {o.label}
          </button>
        ))}
      </div>
      {choice === 'custom' && (
        <div className="form-group">
          <label className="form-label" htmlFor="pb-amount">Amount ({currencySymbol})</label>
          <input id="pb-amount" className="input-field tabular-nums" type="number" min="0" step="0.01" inputMode="decimal" value={custom} onChange={(e) => setCustom(e.target.value)} />
        </div>
      )}
      <div className="form-group">
        <label className="form-label">From account</label>
        <AccountSelect
          accountType={payType}
          accountId={payFrom}
          onChange={({ accountType, accountId }) => {
            setPayType(accountType);
            setPayFrom(accountId);
          }}
          bankAccounts={bankAccounts}
          wallets={wallets}
          currencySymbol={currencySymbol}
        />
      </div>
      <div className="form-group">
        <label className="form-label">Date</label>
        <DatePicker compact value={date} onChange={setDate} required />
      </div>
      <FloorBreachNotice check={floorCheck} currencySymbol={currencySymbol} />
      {error && <div className="hl-error" role="alert">{error}</div>}
      <div className="hl-footer">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" type="submit" disabled={saving}>{saving ? 'Saving…' : anywayLabel(`Pay ${money(amount, currencySymbol)}`, floorCheck)}</Button>
      </div>
    </form>
  );
}

/**
 * Credit cards on the Accounts screen (ADR 0070): what is owed, this cycle, the
 * bill to confirm or pay, and the Card Payability Score with what to do about it.
 */
export function CardsPanel({
  bankAccounts = [],
  wallets = [],
  simulationCards = [],
  simulation = null,
  currencySymbol = '₹',
  isReviewMode = false,
  onChanged,
  // In the app, paying a bill opens the entry sheet's Move tab on this card (one payment form)
  onPayBill
}) {
  const [cards, setCards] = useState([]);
  const [modal, setModal] = useState(null); // { kind: 'add'|'edit'|'confirm'|'pay', card, statement?, bill? }
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.getCards();
      const list = Array.isArray(res) ? res : [];
      setCards(list);
      setLoadError('');
      return list;
    } catch (err) {
      setLoadError(err?.message || 'Could not load cards.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const scoreById = useMemo(() => {
    const m = {};
    (simulationCards || []).forEach((c) => {
      if (c?.id) m[c.id] = c.payability || null;
    });
    return m;
  }, [simulationCards]);

  const done = async (opts = {}) => {
    const confirmedCard = modal?.card;
    setModal(null);
    const list = await load();
    onChanged?.();
    // "Confirm & pay": go straight to paying the bill just confirmed
    if (opts?.payNext && confirmedCard) {
      const fresh = (list || []).find((c) => c.id === confirmedCard.id) || confirmedCard;
      if (fresh.openBill) {
        if (onPayBill) onPayBill(fresh, fresh.openBill);
        else setModal({ kind: 'pay', card: fresh, bill: fresh.openBill });
      }
    }
  };

  return (
    <section className="hl-panel cc-panel" aria-labelledby="cc-panel-title" data-testid="cards-panel">
      <div className="hl-panel-head">
        <div>
          <h2 id="cc-panel-title" className="hl-panel-title">Credit cards</h2>
          <p className="hl-panel-sub">Card spending counts on the day you swipe and is set aside from Safe-to-Spend. Paying the bill moves money from your bank and isn't counted again.</p>
        </div>
        {!isReviewMode && (
          <Button size="sm" icon={<PlusIcon size={14} />} onClick={() => setModal({ kind: 'add' })}>Add card</Button>
        )}
      </div>

      {loadError && <div className="hl-error" role="alert">{loadError}</div>}

      {cards.length === 0 ? (
        <p className="hl-empty">No cards yet. Add one to track what you owe and whether you can pay the next bill.</p>
      ) : (
        <ul className="cc-list">
          {cards.map((card) => {
            const score = scoreById[card.id];
            const util = card.creditLimit > 0 ? Math.min(1, card.outstanding / card.creditLimit) : null;
            const draft = card.statements?.find((st) => st.id === card.openBill?.statementId && st.isDraft) || null;
            const bill = card.openBill;
            return (
              <li key={card.id} className="cc-card">
                <div className="cc-card-head">
                  <span className="hl-avatar" aria-hidden="true"><CreditCardIcon size={14} /></span>
                  <div className="cc-card-title">
                    <span className="hl-person-name">{card.name}</span>
                    <span className="hl-person-meta">
                      Bill on day {card.statementDay} · due day {card.dueDay}
                    </span>
                  </div>
                  {!isReviewMode && (
                    <button type="button" className="cc-icon-btn" onClick={() => setModal({ kind: 'edit', card })} aria-label={`Edit ${card.name}`} title="Edit card">
                      <EditIcon size={13} />
                    </button>
                  )}
                </div>

                <div className="cc-owed">
                  <span className="cc-owed-label">Owed now</span>
                  <span className="cc-owed-value tabular-nums">{money(card.outstanding, currencySymbol)}</span>
                  {card.creditLimit > 0 && (
                    <span className="cc-owed-limit tabular-nums">of {money(card.creditLimit, currencySymbol)} limit</span>
                  )}
                </div>
                {util !== null && (
                  <div className={`cc-util ${util > 0.8 ? 'high' : (util > 0.5 ? 'mid' : '')}`} role="img" aria-label={`${Math.round(util * 100)}% of the limit used`}>
                    <div className="cc-util-fill" style={{ width: `${Math.round(util * 100)}%` }} />
                  </div>
                )}

                <dl className="cc-facts">
                  <div><dt>Spent this cycle</dt><dd className="tabular-nums">{money(card.unbilledSoFar, currencySymbol)}</dd></div>
                  <div><dt>Next bill</dt><dd>{dayLabel(card.cycleEnd)}</dd></div>
                  <div><dt>That bill is due</dt><dd>{dayLabel(card.cycleDueDate)}</dd></div>
                </dl>

                {bill && draft && (
                  <div className="cc-banner" role="status">
                    <span>Bill ready: <strong className="tabular-nums">{money(bill.amount, currencySymbol)}</strong>, due {dayLabel(bill.dueDate)}. Check it against your bank.</span>
                    {!isReviewMode && <Button size="sm" variant="primary" onClick={() => setModal({ kind: 'confirm', card, statement: draft })}>Confirm</Button>}
                  </div>
                )}
                {bill && !draft && (
                  <div className={`cc-banner ${bill.isOverdue ? 'overdue' : ''}`} role="status">
                    <span>
                      {bill.isOverdue && <AlertTriangleIcon size={13} />}{' '}
                      {bill.isOverdue ? 'Overdue: ' : 'Bill due '}
                      <strong className="tabular-nums">{money(bill.remaining, currencySymbol)}</strong>
                      {bill.isOverdue ? ` since ${dayLabel(bill.dueDate)}` : ` by ${dayLabel(bill.dueDate)}`}
                      {bill.minimumDue ? ` (minimum ${money(Math.min(bill.minimumDue, bill.remaining), currencySymbol)})` : ''}
                    </span>
                    {!isReviewMode && <Button size="sm" variant="primary" onClick={() => (onPayBill ? onPayBill(card, bill) : setModal({ kind: 'pay', card, bill }))}>Pay bill</Button>}
                  </div>
                )}

                {score && (
                  <div className={`cc-payability tone-${BAND_TONE[score.band] || 'good'}`}>
                    <ScoreRing score={score.score} band={score.band} label={score.bandLabel} />
                    <div className="cc-payability-text">
                      <span className="cc-payability-band">Payability: {score.bandLabel}</span>
                      <p>{score.statement}</p>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AnimatedModal isOpen={Boolean(modal)} onClose={() => setModal(null)} dataTestId="card-modal">
        <button type="button" className="btn-icon modal-corner-close" onClick={() => setModal(null)} aria-label="Close">
          <XIcon size={14} />
        </button>
        {modal?.kind === 'add' && (
          <CardForm bankAccounts={bankAccounts} wallets={wallets} currencySymbol={currencySymbol} onSaved={done} onCancel={() => setModal(null)} />
        )}
        {modal?.kind === 'edit' && (
          <CardForm card={modal.card} bankAccounts={bankAccounts} wallets={wallets} currencySymbol={currencySymbol} onSaved={done} onCancel={() => setModal(null)} />
        )}
        {modal?.kind === 'confirm' && (
          <ConfirmBillForm card={modal.card} statement={modal.statement} currencySymbol={currencySymbol} onSaved={done} onCancel={() => setModal(null)} />
        )}
        {modal?.kind === 'pay' && (
          <PayBillForm card={modal.card} bill={modal.bill} bankAccounts={bankAccounts} wallets={wallets} currencySymbol={currencySymbol} simulation={simulation} onSaved={done} onCancel={() => setModal(null)} />
        )}
      </AnimatedModal>
    </section>
  );
}
