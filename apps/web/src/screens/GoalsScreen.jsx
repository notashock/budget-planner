import React, { useState, useEffect, useMemo, useRef } from 'react';
import { formatCurrency, formatDisplayDate, evaluateGoalsWithReservation } from '@budget/engine';
import { PlusIcon, AlertTriangleIcon, CheckCircleIcon, CalendarIcon, XIcon } from '../components/Icons.jsx';
import { ScreenHeader } from '../components/ScreenHeader.jsx';
import { AnimatedModal } from '../components/AnimatedModal.jsx';
import { GoalEditForm } from '../components/GoalEditForm.jsx';
import { ActionMenu } from '../components/ActionMenu.jsx';

const PAST = new Set(['completed', 'achieved', 'cancelled', 'dropped']);
const idOf = (g) => g._id || g.id;
const priorityLabel = (p) => (p === 0 ? 'High' : p === 1 ? 'Medium' : 'Low');

/**
 * Goals (redesign §4.4): a "Ready to buy" shelf (fits this month without dropping below the
 * minimum), then Saving, Scheduled and Later lists. ＋ opens the new-goal sheet; a row opens
 * the goal's own page with its one action.
 */
export function GoalsScreen({
  month,
  goals = [],
  items = [],
  transactions = [],
  simulation = null,
  bankAccounts = [],
  wallets = [],
  isReviewMode = false,
  onCreateGoal,
  onConvertGoalToItem,
  onDeferGoal,
  onReactivateGoal,
  onDeleteGoal,
  onUpdateGoal
}) {
  const [editingGoal, setEditingGoal] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [showPast, setShowPast] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [goalName, setGoalName] = useState('');
  const [goalAmount, setGoalAmount] = useState('');
  const [priority, setPriority] = useState(0);
  const [goalError, setGoalError] = useState('');
  const [goalSubmitting, setGoalSubmitting] = useState(false);
  const goalSubmittingRef = useRef(false);
  const [actingGoalId, setActingGoalId] = useState(null);
  const actingGoalIdRef = useRef(null);

  const allAccounts = [...bankAccounts, ...wallets];
  const primaryBank = bankAccounts.find((b) => b.isPrimary) || bankAccounts[0];
  const defaultSourceKey = primaryBank ? `bank_${idOf(primaryBank)}` : (wallets[0] ? `wallet_${idOf(wallets[0])}` : '');
  const [fundingSourceKey, setFundingSourceKey] = useState(defaultSourceKey);

  useEffect(() => {
    if (!fundingSourceKey && defaultSourceKey) setFundingSourceKey(defaultSourceKey);
  }, [defaultSourceKey]);

  const currencySymbol = month?.currencySymbol || '₹';
  const money = (v) => formatCurrency(v, currencySymbol);

  // Each goal checked against the running balance, in priority order
  const evaluatedGoals = useMemo(() => {
    if (!month) return goals;
    return evaluateGoalsWithReservation({
      settings: {
        openingBalance: month.openingBalance,
        incomeAmount: month.incomeAmount,
        incomeCreditDate: month.incomeCreditDate,
        incomeCreditDay: month.incomeCreditDay,
        safetyFloor: month.safetyFloor,
        unplannedAllowance: simulation?.safeVelocity?.freeSurplus || 0,
        currentDay: new Date().getDate(),
        scale: 100
      },
      items,
      month: { year: month.year, month: month.month },
      goals,
      transactions,
      transfers: simulation?.transfers || [],
      accounts: [
        ...bankAccounts.map((b) => ({ ...b, type: 'bank' })),
        ...wallets.map((w) => ({ ...w, type: 'wallet' }))
      ]
    });
  }, [goals, month, items, transactions, simulation, bankAccounts, wallets]);

  const kindOf = (g) => {
    if (PAST.has(g.status)) return 'past';
    if (g.status === 'scheduled' || g.status === 'ready') return 'scheduled';
    if (g.status === 'deferred') return 'later';
    return g.recommendation?.feasible && g.recommendation?.recommendedDate ? 'ready' : 'saving';
  };
  const groups = { ready: [], saving: [], scheduled: [], later: [], past: [] };
  evaluatedGoals.forEach((g) => groups[kindOf(g)].push(g));
  const openGoal = openId ? evaluatedGoals.find((g) => String(idOf(g)) === String(openId)) : null;

  const fundingName = (g) => {
    const fid = g.fundingAccountId || g.fundingBankAccountId?._id || g.fundingBankAccountId || g.fundingWalletId?._id || g.fundingWalletId;
    return allAccounts.find((a) => String(idOf(a)) === String(fid))?.name || null;
  };

  const captionFor = (g) => {
    const rec = g.recommendation;
    switch (kindOf(g)) {
      case 'ready': return `Safe from ${formatDisplayDate(rec.recommendedDate, true)}`;
      case 'saving': return rec?.projectedFloorDeficit ? `${money(Math.abs(rec.projectedFloorDeficit))} short this month` : "Doesn't fit this month";
      case 'scheduled': return 'In this month’s plan';
      case 'later': return g.deferredReason || 'Deferred to next month';
      default: return g.status === 'dropped' || g.status === 'cancelled' ? 'Dropped' : 'Bought';
    }
  };

  const handleAction = async (actionFn, goalId) => {
    if (actingGoalIdRef.current || !actionFn) return;
    actingGoalIdRef.current = goalId;
    setActingGoalId(goalId);
    try {
      await actionFn(goalId);
    } finally {
      actingGoalIdRef.current = null;
      setActingGoalId(null);
    }
  };

  const handleAddGoal = async (e, requestClose) => {
    e.preventDefault();
    if (goalSubmittingRef.current || !goalName.trim() || !goalAmount || isNaN(Number(goalAmount))) return;
    goalSubmittingRef.current = true;
    setGoalSubmitting(true);
    setGoalError('');
    try {
      const payload = { name: goalName.trim(), targetAmount: Math.round(Number(goalAmount) * 100), priority: Number(priority) || 0 };
      if (fundingSourceKey.startsWith('bank_')) {
        payload.fundingSourceType = 'bank';
        payload.fundingBankAccountId = fundingSourceKey.slice(5);
      } else if (fundingSourceKey.startsWith('wallet_')) {
        payload.fundingSourceType = 'wallet';
        payload.fundingWalletId = fundingSourceKey.slice(7);
      }
      await onCreateGoal?.(payload);
      setGoalName('');
      setGoalAmount('');
      setPriority(0);
      if (typeof requestClose === 'function') requestClose(); else setNewOpen(false);
    } catch (err) {
      setGoalError(err?.message || 'Could not save this goal. Please try again.');
    } finally {
      goalSubmittingRef.current = false;
      setGoalSubmitting(false);
    }
  };

  const goalList = (title, list) => (list.length === 0 ? null : (
    <section className="acct-section" aria-label={title}>
      <h2 className="acct-section-title">{title}</h2>
      <ul className="acct-inset">
        {list.map((g) => (
          <li key={idOf(g)}>
            <button type="button" className={`acct-row goal-row goal-${kindOf(g)}`} onClick={() => setOpenId(idOf(g))}>
              <span className="acct-row-main">
                <span className="acct-row-title">{g.name}</span>
                <span className="acct-row-caption"><span className="acct-row-caption-text">{captionFor(g)}</span></span>
              </span>
              <span className="acct-row-balance tabular-nums">{money(g.targetAmount)}</span>
              <span className="acct-row-chev" aria-hidden="true">›</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  ));

  const renderGoalPage = (g) => {
    const kind = kindOf(g);
    const rec = g.recommendation;
    const id = idOf(g);
    const busy = actingGoalId === id;
    const primaryAction = isReviewMode ? null
      : kind === 'ready' ? { label: busy ? 'Scheduling…' : 'Schedule', fn: onConvertGoalToItem }
        : kind === 'saving' ? { label: busy ? 'Deferring…' : 'Defer to next month', fn: onDeferGoal }
          : kind === 'later' && onReactivateGoal ? { label: busy ? 'Reactivating…' : 'Reactivate', fn: onReactivateGoal }
            : null;
    const menu = [];
    if (onUpdateGoal) menu.push({ label: 'Edit goal', onClick: () => setEditingGoal(g) });
    if (onDeleteGoal) menu.push({ label: 'Delete', danger: true, onClick: () => { setOpenId(null); onDeleteGoal(id); } });
    return (
      <div className="acct-page" data-testid="goal-page">
        <button type="button" className="acct-back" onClick={() => setOpenId(null)}>‹ Goals</button>
        <ScreenHeader
          title={g.name}
          actions={!isReviewMode && menu.length > 0 && <ActionMenu label={`More actions for ${g.name}`} items={menu} />}
        />
        <section className="acct-hero" aria-label="Price">
          <div className="acct-hero-value tabular-nums">{money(g.targetAmount)}</div>
          <p className="acct-hero-caption">{priorityLabel(g.priority)} priority</p>
        </section>

        <div className={`goal-verdict goal-verdict-${kind}`} role="note">
          {kind === 'ready' && <><CalendarIcon size={14} /><span>Fits this month. Safe to buy from <strong>{formatDisplayDate(rec.recommendedDate, true)}</strong>{rec.savingsBuffer ? <>, keeping <strong className="tabular-nums">{money(rec.savingsBuffer)}</strong> spare</> : null}.</span></>}
          {kind === 'saving' && <><AlertTriangleIcon size={14} /><span>Doesn&rsquo;t fit this month{rec?.projectedFloorDeficit ? <>: it would take you <strong className="tabular-nums">{money(Math.abs(rec.projectedFloorDeficit))}</strong> below your minimum{rec.lowestDate ? ` on ${formatDisplayDate(rec.lowestDate, true)}` : ''}</> : null}.</span></>}
          {kind === 'scheduled' && <><CheckCircleIcon size={14} /><span>Scheduled in this month&rsquo;s plan.</span></>}
          {kind === 'later' && <><AlertTriangleIcon size={14} /><span>{g.deferredReason || 'Deferred to next month.'}</span></>}
          {kind === 'past' && <><CheckCircleIcon size={14} /><span>{captionFor(g)}.</span></>}
        </div>

        <ul className="acct-inset">
          <li className="acct-kv"><span>Pay from</span><span>{fundingName(g) || 'Primary account'}</span></li>
          {g.targetDate && <li className="acct-kv"><span>Wanted by</span><span className="tabular-nums">{formatDisplayDate(g.targetDate, true)}</span></li>}
        </ul>

        {primaryAction && (
          <button type="button" className="btn-primary goal-page-action" disabled={busy} onClick={() => handleAction(primaryAction.fn, id)}>
            {primaryAction.label}
          </button>
        )}
      </div>
    );
  };

  const hasCurrent = groups.ready.length + groups.saving.length + groups.scheduled.length + groups.later.length > 0;

  return (
    <div className="screen-content">
      {openGoal ? renderGoalPage(openGoal) : (
        <>
          <ScreenHeader
            title="Goals"
            actions={(
              <>
                {!isReviewMode && (
                  <button type="button" className="action-menu-trigger acct-add-btn" aria-label="New goal" onClick={() => { setGoalError(''); setNewOpen(true); }}>
                    <PlusIcon size={16} />
                  </button>
                )}
                {groups.past.length > 0 && (
                  <ActionMenu
                    label="Goal options"
                    items={[{ label: showPast ? 'Hide past goals' : 'Past goals', onClick: () => setShowPast((v) => !v) }]}
                  />
                )}
              </>
            )}
          />
          {isReviewMode && <span className="review-badge-tag goal-review-tag">Review Archive</span>}

          {groups.ready.length > 0 && (
            <section className="acct-section" aria-label="Ready to buy">
              <h2 className="acct-section-title">Ready to buy</h2>
              <div className="goal-shelf">
                {groups.ready.map((g) => (
                  <button type="button" key={idOf(g)} className="goal-shelf-card" onClick={() => setOpenId(idOf(g))}>
                    <span className="goal-shelf-name">{g.name}</span>
                    <span className="goal-shelf-amount tabular-nums">{money(g.targetAmount)}</span>
                    <span className="goal-shelf-caption">{captionFor(g)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {goalList('Saving', groups.saving)}
          {goalList('Scheduled', groups.scheduled)}
          {goalList('Later', groups.later)}
          {showPast && goalList('Past goals', groups.past)}

          {!hasCurrent && !(showPast && groups.past.length) && (
            <div className="acct-inset acct-empty">
              {isReviewMode ? <span>No purchase goals this month</span> : (
                <button type="button" className="acct-empty-add" onClick={() => { setGoalError(''); setNewOpen(true); }}>+ Add something you want to buy</button>
              )}
            </div>
          )}
        </>
      )}

      <AnimatedModal isOpen={newOpen} onClose={() => setNewOpen(false)} maxWidth="440px" dataTestId="goal-new-modal">
        {({ requestClose }) => (
          <>
            <div className="accounts-row-10">
              <h3 className="accounts-heading">New goal</h3>
              <button type="button" className="btn-icon" onClick={() => requestClose()} title="Close" aria-label="Close"><XIcon size={14} /></button>
            </div>
            <form className="goals-stack-2" onSubmit={(e) => handleAddGoal(e, requestClose)}>
              <div className="form-group">
                <label className="form-label" htmlFor="goal-new-name">What do you want to buy?</label>
                <input id="goal-new-name" type="text" required placeholder="e.g. Noise Cancelling Headphones, Laptop" value={goalName} onChange={(e) => setGoalName(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="goal-new-price">Price ({currencySymbol})</label>
                <input id="goal-new-price" type="number" inputMode="decimal" step="0.01" required placeholder="0.00" value={goalAmount} onChange={(e) => setGoalAmount(e.target.value)} />
              </div>
              {allAccounts.length > 0 && (
                <div className="form-group">
                  <label className="form-label" htmlFor="goal-new-account">Funding Account *</label>
                  <select id="goal-new-account" value={fundingSourceKey} onChange={(e) => setFundingSourceKey(e.target.value)} required>
                    {bankAccounts.map((b) => <option key={idOf(b)} value={`bank_${idOf(b)}`}>Bank: {b.name} {b.isPrimary ? '[Primary]' : ''}</option>)}
                    {wallets.map((w) => <option key={idOf(w)} value={`wallet_${idOf(w)}`}>Wallet: {w.name}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group">
                <span className="form-label">Priority</span>
                <div className="goals-grid-2" role="group" aria-label="Priority">
                  {[0, 1, 2].map((p) => (
                    <button key={p} type="button" aria-pressed={priority === p} className={`timeline-filter-btn ${priority === p ? 'active' : ''} goals-btn`} onClick={() => setPriority(p)}>
                      {priorityLabel(p)}
                    </button>
                  ))}
                </div>
              </div>
              {goalError && <div className="hl-error" role="alert">{goalError}</div>}
              <button type="submit" className="btn-primary goals-btn-2" disabled={goalSubmitting || !goalName || !goalAmount}>
                <PlusIcon size={14} />
                <span>{goalSubmitting ? 'Evaluating...' : 'Set purchase goal'}</span>
              </button>
            </form>
          </>
        )}
      </AnimatedModal>

      <AnimatedModal isOpen={Boolean(editingGoal)} onClose={() => setEditingGoal(null)} maxWidth="440px" dataTestId="goal-edit-modal">
        {editingGoal && (
          <GoalEditForm
            goal={editingGoal}
            bankAccounts={bankAccounts}
            wallets={wallets}
            currencySymbol={currencySymbol}
            onCancel={() => setEditingGoal(null)}
            onSubmit={async (updates) => {
              await onUpdateGoal(idOf(editingGoal), updates);
              setEditingGoal(null);
            }}
          />
        )}
      </AnimatedModal>
    </div>
  );
}
