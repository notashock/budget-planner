import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  formatCurrency,
  formatDate,
  formatDisplayDate,
  getRelativeDay,
  getDateFromRelativeDay,
  getRefundableRemaining
} from '@budget/engine';
import {
  XIcon,
  ZapIcon,
  PlusIcon,
  ArrowRightLeftIcon,
  TrendingUpIcon,
  SparklesIcon,
  CheckCircleIcon,
  BuildingLibraryIcon,
  WalletIcon,
  AlertTriangleIcon,
  CalendarIcon,
  LockIcon
} from './Icons.jsx';
import { DatePicker } from './DatePicker.jsx';
import { HeldLentForm } from './HeldLentForm.jsx';
import { SettleForm } from './SettleForm.jsx';
import { ConsequenceLine } from './ConsequenceLine.jsx';
import { suggestCategory } from '../utils/categorySuggest.js';
import { findBillMatch, detectDuplicateSalary, detectPersonHint } from '../utils/entryAssists.js';
import {
  lastAccountFor,
  rememberAccount,
  lastTransferPair,
  rememberTransferPair,
  rememberCategory
} from '../utils/entryMemory.js';
import { SearchableItemPicker } from './SearchableItemPicker.jsx';
import { AccountSelect } from './AccountSelect.jsx';
import { api } from '../api.js';

/** Spend and plan categories (the pills; also what suggestions may pick). */
export const SPEND_CATEGORIES = ['Food', 'Travel', 'Utilities', 'Health', 'Other'];

/**
 * Quick amounts per mode. Tapping one sets the amount (it no longer adds to it).
 */
const QUICK_INCREMENTS = {
  log: [100, 500, 1000, 2000],
  plan: [100, 500, 1000, 2000],
  income: [500, 1000, 5000, 10000],
  transfer: [500, 1000, 2000, 5000]
};

/**
 * Ad-hoc income sources offered as pills. Salary is deliberately not one of them:
 * the salary schedule is the only source of salary, so logging it here would
 * count it twice.
 */
export const INCOME_CATEGORIES = ['Bonus', 'Freelance', 'Investment', 'Other'];

/** Income source selected when the Income form opens: always one of the pills. */
export const DEFAULT_INCOME_TAG = 'Other';

/**
 * Unified Entry Modal with Universal 6-Slot Form Geometry
 * and Zero-Loss Shared State Continuity.
 */
export function UnifiedEntryModal({
  isOpen,
  onClose,
  onLogTransaction,
  onSaveItem,
  onCreateTransfer,
  onOpenAddBank,
  initialItem = null,
  initialMode = 'log', // 'log' | 'income' | 'plan' | 'transfer'
  plannedItems = [],
  // Recorded transactions: a refund can be linked to the spend it reverses (ADR 0062)
  transactions = [],
  bankAccounts = [],
  wallets = [],
  currencySymbol = '₹',
  month,
  simulation = null,
  accountSimulations = {},
  onHeldLentSaved,
  // Settle a planned bill (mark as paid): (billId, { amount, date, accountId, remainder })
  onSettleTransaction,
  // Optional starting point, e.g. { sourceAccountId } from an account's "Transfer" button,
  // { moveTarget: 'card', cardId } from a card's "Pay bill", or { heldLent: {...} } to log
  // a held/lent entry again with the same details
  initialPreset = null,
  // Delete the record being edited: (initialItem) => Promise
  onDeleteEntry,
  // Change the type of the record being edited: (initialItem, targetMode, carriedValues)
  onConvertEntry,
  // Open the salary schedule (the duplicate-salary guard points there)
  onOpenSalarySchedule,
  creditCards = []
}) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isExpanded, setIsExpanded] = useState(false);
  const [mode, setMode] = useState(initialMode); // 'log' | 'income' | 'plan' | 'transfer'

  // Primary accounts precalculation
  const primaryBank = useMemo(
    () => bankAccounts.find((b) => b.isPrimary) || bankAccounts[0],
    [bankAccounts]
  );
  const primaryWallet = useMemo(
    () => wallets.find((w) => w.isPrimary) || wallets[0],
    [wallets]
  );

  // Today string for date defaults
  const now = new Date();
  const todayStr = useMemo(() => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }, []);

  // =========================================================================
  // CONTINUOUS SHARED STATE ENGINE
  // All 4 forms bind directly to this shared state model so switching tabs
  // preserves 100% of user input with zero loss ("zero input fetching").
  // =========================================================================
  const [amount, setAmount] = useState('');
  const [accountType, setAccountType] = useState('bank');
  const [accountId, setAccountId] = useState('');
  const [destAccountType, setDestAccountType] = useState('wallet');
  const [destAccountId, setDestAccountId] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayStr);

  // Contextual Modifiers & Classifications
  const [isRefund, setIsRefund] = useState(false);
  const [tag, setTag] = useState('Food');
  const [incomeTag, setIncomeTag] = useState(DEFAULT_INCOME_TAG);
  const [itemType, setItemType] = useState('one-time'); // 'one-time' | 'recurring'
  const [dayOfMonth, setDayOfMonth] = useState(now.getDate() || 1);
  const [priority, setPriority] = useState(0);
  const [isFixed, setIsFixed] = useState(true);
  const [isPaid, setIsPaid] = useState(false);
  const [matchedItemId, setMatchedItemId] = useState('');
  // Refund: the spent transaction it gives money back for
  const [refundTargetId, setRefundTargetId] = useState('');
  const [cascadeScope, setCascadeScope] = useState('single'); // 'single' | 'all_future'
  const [updateSalaryTemplate, setUpdateSalaryTemplate] = useState(false);
  const [showVariableInfo, setShowVariableInfo] = useState(false);
  // Category suggestion: stops once the user picks a category themselves
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [tagSuggested, setTagSuggested] = useState(false);
  // "Discard this entry?" before closing a half-filled form
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Editing: the values the record opened with, to show what is changing
  const [editSnapshot, setEditSnapshot] = useState(null);
  const [snapshotPending, setSnapshotPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Smart assists
  const [personFunds, setPersonFunds] = useState([]);
  const [dismissedAssists, setDismissedAssists] = useState({});
  const [personPreset, setPersonPreset] = useState(null);
  const [showConvert, setShowConvert] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Entries saved with "Save & add another" since the sheet opened
  const [session, setSession] = useState({ count: 0, total: 0 });
  const againRef = useRef(false);
  const amountInputRef = useRef(null);

  // UI status states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [transferError, setTransferError] = useState('');
  // Move tab: where the money goes ('account' = between my accounts, 'card' = pay a card bill, 'person' = held/lent)
  const [moveTarget, setMoveTarget] = useState('account');
  const [cardId, setCardId] = useState('');
  // Settle view: the planned bill a new spend turned out to be
  const [settleItem, setSettleItem] = useState(null);
  const [settleSubmitting, setSettleSubmitting] = useState(false);
  const [settleError, setSettleError] = useState('');
  // Inline form error (replaces alert())
  const [formError, setFormError] = useState('');
  const [floorBreachData, setFloorBreachData] = useState(null);

  // Earliest date a planned item may use: the first day of the month being planned
  const planMinDate = month?.year && month?.month
    ? `${month.year}-${String(month.month).padStart(2, '0')}-01`
    : `${todayStr.slice(0, 7)}-01`;

  const selectedCard = (creditCards || []).find((c) => String(c.id || c._id) === String(cardId)) || null;

  // Refund targets: recorded spends (not income, transfers, held/lent or other refunds), newest first
  const PASS_THROUGH_ORIGINS = ['held_in', 'held_return', 'lent_out', 'lent_repaid'];
  const refundTargets = useMemo(() => {
    const editingId = initialItem ? String(initialItem.id || initialItem._id) : null;
    return (transactions || [])
      .filter((t) => {
        if (!t) return false;
        const id = String(t.id || t._id || '');
        if (!id || id === editingId) return false;
        const isSpent = t.status === 'successful' || (!t.status && t.origin === 'spot');
        return isSpent
          && Number(t.amount) > 0
          && !t.isIncome
          && t.direction !== 'income'
          && t.origin !== 'transfer'
          && !t.isTransfer
          && t.origin !== 'salary'
          && !PASS_THROUGH_ORIGINS.includes(t.origin);
      })
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .slice(0, 100)
      .map((t) => {
        // What is left after the refunds already linked to this spend (not counting the one being edited)
        const remaining = getRefundableRemaining(t, transactions, { excludeId: editingId });
        return {
          _id: String(t.id || t._id),
          name: t.title || t.name || t.description || t.category || 'Spend',
          paid: Math.abs(Number(t.amount) || 0),
          remaining,
          amount: remaining,
          date: t.date,
          category: t.category || t.tag,
          accountId: t.accountId || t.bankAccountId?._id || t.bankAccountId || t.walletId?._id || t.walletId || ''
        };
      });
  }, [transactions, initialItem]); // eslint-disable-line react-hooks/exhaustive-deps
  const refundTarget = refundTargets.find((t) => t._id === String(refundTargetId)) || null;
  // Fully refunded spends can't take another refund, so the picker leaves them out
  const refundPickerItems = useMemo(
    () => refundTargets.filter((t) => t.remaining > 0 || t._id === String(refundTargetId)),
    [refundTargets, refundTargetId]
  );

  // Eligible planned items for matching
  const eligiblePlannedItems = useMemo(
    () => (plannedItems || []).filter((item) => item.type === 'one-time' || item.type === 'recurring'),
    [plannedItems]
  );

  // Candidate match based on entered amount
  // A new spend that looks like a planned bill: amount within 10% or the bill's
  // name in the description, and the bill overdue or due within 7 days
  const candidateMatch = useMemo(() => {
    if (matchedItemId || isRefund) return null;
    const match = findBillMatch(eligiblePlannedItems, {
      amount: Math.round(Math.abs(Number(amount) || 0) * 100),
      description,
      today: todayStr,
      year: month?.year,
      month: month?.month
    });
    return match ? match.item : null;
  }, [amount, description, isRefund, matchedItemId, eligiblePlannedItems, todayStr, month]);

  // DOM and Animation Refs
  const containerRef = useRef(null);
  const overlayRef = useRef(null);
  const contentRef = useRef(null);
  const formRef = useRef(null);
  const indicatorRef = useRef(null);
  const isClosingRef = useRef(false);
  const isSubmittingRef = useRef(false);

  // Tab button refs
  const logBtnRef = useRef(null);
  const incomeBtnRef = useRef(null);
  const planBtnRef = useRef(null);
  const transferBtnRef = useRef(null);

  // Touch gesture tracking for mobile bottom-sheet
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const touchStartScrollTop = useRef(0);
  const isDraggingSheet = useRef(false);
  // A touch that starts inside an open dropdown list scrolls that list, never the sheet
  const touchInDropdown = useRef(false);

  // Initialize or reset state on open / initialItem change
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      isClosingRef.current = false;
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      setFormError('');
      setConfirmDiscard(false);
      setConfirmDelete(false);
      setDismissedAssists({});
      setPersonPreset(null);
      setShowConvert(false);
      setEditSnapshot(null);
      setSnapshotPending(Boolean(initialItem));
      setSession({ count: 0, total: 0 });
      setCategoryTouched(Boolean(initialItem));
      setTagSuggested(false);
      setSettleItem(null);
      setSettleError('');
      setMoveTarget('account');
      setFloorBreachData(null);
      setTransferError('');
      setCascadeScope('single');
      setUpdateSalaryTemplate(false);

      if (initialItem) {
        const isIncomeItem = initialItem.type === 'income' || initialItem.direction === 'income' || Boolean(initialItem.isIncome);
        const isTransferItem = initialItem.origin === 'transfer' || Boolean(initialItem.isTransfer);
        const isExpenseTx = initialItem.origin === 'spot' || initialItem.direction === 'expense';

        const resolvedMode = isIncomeItem
          ? 'income'
          : (isTransferItem
            ? 'transfer'
            : (isExpenseTx
              ? 'log'
              : (initialMode || 'plan')));
        setMode(resolvedMode);

        // Deduce account attribution without hardcoding to primaryBank
        const targetAccountId = initialItem.accountId || initialItem.bankAccountId?._id || initialItem.bankAccountId || initialItem.walletId?._id || initialItem.walletId;
        if (targetAccountId) {
          const isWallet = (wallets || []).some((w) => (w._id || w.id) === targetAccountId);
          const isCard = !isWallet && (creditCards || []).some((c) => String(c._id || c.id) === String(targetAccountId));
          setAccountType(isCard ? 'credit_card' : (isWallet ? 'wallet' : 'bank'));
          setAccountId(targetAccountId);
        } else {
          const initAcctType = (initialItem.accountType === 'wallet' || initialItem.walletId) ? 'wallet' : 'bank';
          setAccountType(initAcctType);
          const bId = (initAcctType === 'bank' ? (primaryBank?._id || primaryBank?.id || '') : '');
          const wId = (initAcctType === 'wallet' ? (primaryWallet?._id || primaryWallet?.id || '') : '');
          setAccountId(initAcctType === 'bank' ? bId : wId);
        }

        if (resolvedMode === 'income') {
          setAmount(initialItem.amount ? (Math.abs(initialItem.amount) / 100).toString() : '');
          setDescription(initialItem.title || initialItem.name || initialItem.description || '');
          setIncomeTag(initialItem.category || initialItem.tag || 'Salary');
          setDate(initialItem.date || todayStr);
        } else if (resolvedMode === 'transfer') {
          setAmount(initialItem.amount ? (Math.abs(initialItem.amount) / 100).toString() : '');
          setDescription(initialItem.note || initialItem.description || '');
          setDate(initialItem.date || todayStr);
          if (initialItem.destinationAccountId && creditCards.some((c) => String(c.id || c._id) === String(initialItem.destinationAccountId))) {
            // A transfer into a card is a bill payment
            setMoveTarget('card');
            setCardId(initialItem.destinationAccountId);
          } else if (initialItem.destinationAccountId) {
            const destIsWallet = (wallets || []).some((w) => (w._id || w.id) === initialItem.destinationAccountId);
            setDestAccountType(destIsWallet ? 'wallet' : 'bank');
            setDestAccountId(initialItem.destinationAccountId);
          }
        } else if (resolvedMode === 'log') {
          setAmount(initialItem.amount ? (Math.abs(initialItem.amount) / 100).toString() : '');
          setDescription(initialItem.title || initialItem.name || initialItem.description || '');
          setTag(initialItem.category || initialItem.tag || 'Food');
          setDate(initialItem.date || todayStr);
          setIsRefund(Number(initialItem.amount) < 0);
          setMatchedItemId(Number(initialItem.amount) < 0 ? '' : (initialItem.plannedItemId || initialItem.legacyItemId || ''));
          setRefundTargetId(initialItem.refundTargetTransactionId || '');
        } else {
          // Plan mode
          setItemType(initialItem.type === 'recurring' ? 'recurring' : 'one-time');
          setDescription(initialItem.name || initialItem.title || '');
          // Load the stored category; otherwise saving an edit overwrites it with stale state
          setTag(initialItem.category || initialItem.tag || 'Other');
          setPriority(initialItem.priority ?? 0);
          setIsFixed(Boolean(initialItem.isFixed));
          setIsPaid(Boolean(initialItem.isPaid));

          const year = month?.year || now.getFullYear();
          const monthNum = month?.month || (now.getMonth() + 1);

          if (initialItem.type === 'recurring') {
            setAmount(initialItem.amount ? (Math.abs(initialItem.amount) / 100).toString() : '');
            setDayOfMonth(initialItem.dayOfMonth || 1);
          } else {
            setAmount(initialItem.amount ? (Math.abs(initialItem.amount) / 100).toString() : '');
            if (typeof initialItem.day === 'number' && initialItem.day < 0) {
              setDate(initialItem.date || getDateFromRelativeDay(initialItem.day, year, monthNum));
            } else {
              setDate(initialItem.date || formatDate(year, monthNum, initialItem.day || 1));
            }
          }
        }
      } else {
        // 'held' is the Move tab's "With a person" (Held & Lent is a move, not a separate tab)
        setMode(initialMode === 'held' ? 'transfer' : (initialMode || 'log'));
        setMoveTarget(initialMode === 'held' ? 'person' : (initialPreset?.moveTarget || 'account'));
        setCardId(initialPreset?.cardId || creditCards[0]?.id || creditCards[0]?._id || '');
        setAmount('');
        setIsRefund(false);
        setTag('Food');
        setIncomeTag(DEFAULT_INCOME_TAG);
        setDescription('');
        setMatchedItemId('');
        setRefundTargetId('');
        setDate(todayStr);

        // Account attribution defaults
        if (primaryBank) {
          setAccountType('bank');
          setAccountId(primaryBank._id || primaryBank.id || '');
        } else if (primaryWallet) {
          setAccountType('wallet');
          setAccountId(primaryWallet._id || primaryWallet.id || '');
        } else {
          setAccountType('bank');
          setAccountId('');
        }

        // Transfer destination defaults
        if (primaryWallet) {
          setDestAccountType('wallet');
          setDestAccountId(primaryWallet._id || primaryWallet.id || '');
        } else if (bankAccounts[1]) {
          setDestAccountType('bank');
          setDestAccountId(bankAccounts[1]._id || bankAccounts[1].id || '');
        } else {
          setDestAccountType('wallet');
          setDestAccountId(wallets[0]?._id || wallets[0]?.id || '');
        }

        // Remembered accounts: the last one used for this kind of entry
        const startMode = initialMode === 'held' ? 'transfer' : (initialMode || 'log');
        const usable = (entry, allowCards) => {
          if (!entry) return false;
          const pool = entry.accountType === 'wallet' ? wallets
            : (entry.accountType === 'credit_card' ? (allowCards ? creditCards : []) : bankAccounts);
          return (pool || []).some((a) => String(a._id || a.id) === String(entry.accountId));
        };
        if (startMode === 'transfer') {
          const pair = lastTransferPair();
          if (pair && usable(pair.source, false) && usable(pair.destination, false)
            && String(pair.source.accountId) !== String(pair.destination.accountId)) {
            setAccountType(pair.source.accountType);
            setAccountId(pair.source.accountId);
            setDestAccountType(pair.destination.accountType);
            setDestAccountId(pair.destination.accountId);
          }
        } else {
          const remembered = lastAccountFor(startMode);
          if (usable(remembered, startMode === 'log' || startMode === 'plan')) {
            setAccountType(remembered.accountType);
            setAccountId(remembered.accountId);
          }
        }

        // Preset: logging a held/lent entry again, or changing an entry's type, with the details it had
        if (initialPreset?.heldLent || initialPreset?.carry) {
          const hl = initialPreset.heldLent || initialPreset.carry;
          if (hl.amount) setAmount(String(Math.abs(Number(hl.amount)) / 100));
          if (hl.date) setDate(hl.date);
          if (hl.note) setDescription(hl.note);
          if (hl.category && SPEND_CATEGORIES.includes(hl.category)) {
            setTag(hl.category);
            setCategoryTouched(true);
          }
          if (hl.accountId) {
            const hlIsWallet = (wallets || []).some((w) => String(w._id || w.id) === String(hl.accountId));
            setAccountType(hlIsWallet ? 'wallet' : 'bank');
            setAccountId(hl.accountId);
          }
        }

        // Preset source (an account's own "Transfer" button)
        if (initialPreset?.sourceAccountId) {
          const sid = String(initialPreset.sourceAccountId);
          const srcIsWallet = (wallets || []).some((w) => String(w._id || w.id) === sid);
          setAccountType(srcIsWallet ? 'wallet' : 'bank');
          setAccountId(sid);
          const other = [...bankAccounts.map((b) => ({ t: 'bank', id: b._id || b.id })), ...wallets.map((w) => ({ t: 'wallet', id: w._id || w.id }))]
            .find((a) => String(a.id) !== sid && (srcIsWallet ? a.t === 'bank' : a.t === 'wallet'))
            || [...bankAccounts.map((b) => ({ t: 'bank', id: b._id || b.id })), ...wallets.map((w) => ({ t: 'wallet', id: w._id || w.id }))]
              .find((a) => String(a.id) !== sid);
          if (other) {
            setDestAccountType(other.t);
            setDestAccountId(other.id);
          }
        }

        // Plan defaults
        setItemType('one-time');
        setPriority(0);
        setIsFixed(true);
        setIsPaid(false);
        setDayOfMonth(now.getDate() || 1);
        setShowVariableInfo(false);
      }
    } else {
      triggerExit();
    }
  }, [isOpen, initialItem, initialMode, initialPreset, month, bankAccounts, wallets, todayStr]);

  useEffect(() => {
    if (!isOpen || initialItem || typeof api.getPersonFunds !== 'function') return undefined;
    let alive = true;
    Promise.resolve(api.getPersonFunds())
      .then((res) => { if (alive) setPersonFunds(Array.isArray(res?.funds) ? res.funds : []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [isOpen, initialItem]);

  // Take the snapshot on the render after the init effect has applied the record's values
  useEffect(() => {
    if (!snapshotPending) return;
    setEditSnapshot({
      amount: String(amount || ''), date, accountId: String(accountId || ''), destAccountId: String(destAccountId || ''),
      description, tag, incomeTag, itemType, dayOfMonth: Number(dayOfMonth) || 1, priority: Number(priority) || 0,
      isFixed, isPaid, isRefund
    });
    setSnapshotPending(false);
  }, [snapshotPending]); // eslint-disable-line react-hooks/exhaustive-deps

  // Click outside and escape key to dismiss variable info popover
  useEffect(() => {
    if (!showVariableInfo) return;
    const handleClickOutside = () => setShowVariableInfo(false);
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setShowVariableInfo(false);
    };
    window.addEventListener('click', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showVariableInfo]);

  const { contextSafe } = useGSAP({ scope: containerRef });

  // Update sliding segmented pill position
  const updateTabIndicator = useCallback((targetMode, immediate = false) => {
    if (!indicatorRef.current) return;
    let targetEl = logBtnRef.current;
    if (targetMode === 'income') targetEl = incomeBtnRef.current;
    else if (targetMode === 'plan') targetEl = planBtnRef.current;
    else if (targetMode === 'transfer') targetEl = transferBtnRef.current;
    if (!targetEl) return;

    const { offsetLeft, offsetWidth } = targetEl;

    if (immediate) {
      gsap.set(indicatorRef.current, { x: offsetLeft, width: offsetWidth });
    } else {
      gsap.to(indicatorRef.current, {
        x: offsetLeft,
        width: offsetWidth,
        duration: 0.22,
        ease: 'power2.out'
      });
    }
  }, []);

  // Exit animation execution
  const triggerExit = contextSafe((onDone) => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const tl = gsap.timeline({
      onComplete: () => {
        setShouldRender(false);
        isClosingRef.current = false;
        setIsExpanded(false);
        if (typeof onDone === 'function') onDone();
        onClose?.();
      }
    });

    if (contentRef.current) {
      tl.to(
        contentRef.current,
        {
          y: isMobile ? '100%' : 16,
          scale: isMobile ? 1 : 0.985,
          opacity: isMobile ? 1 : 0,
          duration: 0.18,
          ease: 'power2.in'
        },
        0
      );
    }

    if (overlayRef.current) {
      tl.to(
        overlayRef.current,
        { opacity: 0, duration: 0.18, ease: 'power2.in' },
        0
      );
    }
  });

  // Entrance animation on mount
  useGSAP(() => {
    if (!shouldRender || isClosingRef.current) return;

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    gsap.killTweensOf([overlayRef.current, contentRef.current]);

    if (overlayRef.current) {
      gsap.fromTo(
        overlayRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.24, ease: 'power2.out' }
      );
    }

    if (contentRef.current) {
      gsap.fromTo(
        contentRef.current,
        {
          y: isMobile ? '100%' : 18,
          scale: isMobile ? 1 : 0.985,
          opacity: isMobile ? 1 : 0
        },
        {
          y: 0,
          scale: 1,
          opacity: 1,
          duration: 0.28,
          ease: 'power3.out'
        }
      );
    }

    requestAnimationFrame(() => {
      updateTabIndicator(mode, true);
    });
  }, { dependencies: [shouldRender], scope: containerRef });

  // Re-measure the tab indicator when the tab strip changes size (web font
  // loading, container-query layout, rotation); measuring once on open can leave
  // it half a tab off.
  useEffect(() => {
    if (!shouldRender || typeof ResizeObserver === 'undefined') return undefined;
    const track = indicatorRef.current?.parentElement;
    if (!track) return undefined;
    const observer = new ResizeObserver(() => updateTabIndicator(mode, true));
    observer.observe(track);
    track.querySelectorAll('.modal-tab-btn').forEach((btn) => observer.observe(btn));
    return () => observer.disconnect();
  }, [shouldRender, mode, updateTabIndicator]);

  // Mode change animation & indicator sync
  useGSAP(() => {
    if (!shouldRender) return;
    updateTabIndicator(mode, false);
  }, { dependencies: [mode], scope: containerRef });

  // Smooth scroll handler
  const handleScroll = (e) => {
    if (typeof window === 'undefined' || window.innerWidth >= 768) return;
    if (e.target.scrollTop > 10 && !isExpanded) {
      setIsExpanded(true);
    }
  };

  // Touch gesture physics for mobile sheet
  const handleTouchStart = (e) => {
    if (typeof window === 'undefined' || window.innerWidth >= 768) return;
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
    touchInDropdown.current = Boolean(e.target.closest?.('.app-dropdown-menu, .datepicker-popover, [role="listbox"]'));
    // Drag the sheet down only when whatever is under the finger is scrolled to its top
    let scroller = e.target;
    while (scroller && scroller !== contentRef.current && !(scroller.scrollHeight > scroller.clientHeight && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) {
      scroller = scroller.parentElement;
    }
    touchStartScrollTop.current = (scroller || contentRef.current)?.scrollTop ?? 0;
    isDraggingSheet.current = false;
  };

  const handleTouchMove = (e) => {
    if (typeof window === 'undefined' || window.innerWidth >= 768 || !contentRef.current) return;
    if (touchInDropdown.current) return;
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - touchStartY.current;

    if (!isExpanded && deltaY < -12) {
      setIsExpanded(true);
    }

    if ((touchStartScrollTop.current <= 0 && deltaY > 0) || isDraggingSheet.current) {
      isDraggingSheet.current = true;
      if (e.cancelable) e.preventDefault();
      const clampedY = gsap.utils.clamp(0, window.innerHeight, deltaY);
      gsap.set(contentRef.current, { y: clampedY });
      const progress = gsap.utils.clamp(0, 1, 1 - clampedY / 320);
      if (overlayRef.current) {
        gsap.set(overlayRef.current, { opacity: progress });
      }
    }
  };

  const handleTouchEnd = (e) => {
    if (!contentRef.current || typeof window === 'undefined' || window.innerWidth >= 768) return;

    if (isDraggingSheet.current) {
      isDraggingSheet.current = false;
      const currentY = e.changedTouches[0].clientY;
      const deltaY = currentY - touchStartY.current;
      const elapsed = Date.now() - touchStartTime.current;
      const velocity = deltaY / (elapsed || 1);

      if (isExpanded) {
        if (deltaY > 50 || (velocity > 0.4 && deltaY > 20)) {
          setIsExpanded(false);
          gsap.to(contentRef.current, { y: 0, duration: 0.18, ease: 'power2.out' });
          if (overlayRef.current) {
            gsap.to(overlayRef.current, { opacity: 1, duration: 0.18, ease: 'power2.out' });
          }
        } else {
          gsap.to(contentRef.current, { y: 0, duration: 0.18, ease: 'power2.out' });
          if (overlayRef.current) {
            gsap.to(overlayRef.current, { opacity: 1, duration: 0.18, ease: 'power2.out' });
          }
        }
      } else {
        if (deltaY > 80 || (velocity > 0.45 && deltaY > 25)) {
          if (isDirty) {
            // Snap back and ask instead of throwing the entry away
            gsap.to(contentRef.current, { y: 0, duration: 0.18, ease: 'power2.out' });
            if (overlayRef.current) gsap.to(overlayRef.current, { opacity: 1, duration: 0.18, ease: 'power2.out' });
            setConfirmDiscard(true);
          } else {
            triggerExit();
          }
        } else {
          gsap.to(contentRef.current, { y: 0, duration: 0.18, ease: 'power2.out' });
          if (overlayRef.current) {
            gsap.to(overlayRef.current, { opacity: 1, duration: 0.18, ease: 'power2.out' });
          }
        }
      }
    }
  };

  // User-initiated close (backdrop, Esc, X, Cancel, swipe): ask first if a new entry has content
  const isDirty = !initialItem && !settleItem && (String(amount || '').trim() !== '' || description.trim() !== '');
  const requestClose = () => {
    if (isDirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    setConfirmDiscard(false);
    triggerExit();
  };

  // Keyboard Escape listener
  useEffect(() => {
    if (!shouldRender) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (confirmDiscard) {
          setConfirmDiscard(false);
          return;
        }
        requestClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // Clean up GSAP tweens on unmount
  useEffect(() => {
    return () => {
      if (contentRef.current) gsap.killTweensOf(contentRef.current);
      if (overlayRef.current) gsap.killTweensOf(overlayRef.current);
      if (indicatorRef.current) gsap.killTweensOf(indicatorRef.current);
    };
  }, []);

  // Tactile micro-press feedback
  const handleMicroPress = contextSafe((e, callback) => {
    if (e?.currentTarget) {
      gsap.timeline()
        .to(e.currentTarget, { scale: 0.95, duration: 0.05, ease: 'power1.in' })
        .to(e.currentTarget, { scale: 1, duration: 0.12, ease: 'power2.out' });
    }
    if (callback) callback();
  });

  // Mode switch without wiping shared input state
  const handleSwitchMode = contextSafe((newMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    setTransferError('');
    setFormError('');
    // A card can pay for spending and planned bills only; elsewhere fall back
    if (accountType === 'credit_card' && newMode !== 'log' && newMode !== 'plan') {
      const fallback = lastAccountFor(newMode);
      const pool = fallback?.accountType === 'wallet' ? wallets : bankAccounts;
      if (fallback && fallback.accountType !== 'credit_card' && pool.some((a) => String(a._id || a.id) === String(fallback.accountId))) {
        setAccountType(fallback.accountType);
        setAccountId(fallback.accountId);
      } else if (primaryBank) {
        setAccountType('bank');
        setAccountId(primaryBank._id || primaryBank.id || '');
      } else if (primaryWallet) {
        setAccountType('wallet');
        setAccountId(primaryWallet._id || primaryWallet.id || '');
      }
    }
  });

  // Quick Amount Presets
  const handleQuickIncrement = (value) => {
    setAmount(String(value));
    amountInputRef.current?.focus?.();
  };

  // Description typed: suggest a category until the user picks one
  const handleDescriptionChange = (value) => {
    setDescription(value);
    if ((mode === 'log' || mode === 'plan') && !categoryTouched) {
      const suggested = suggestCategory(value, { allowed: SPEND_CATEGORIES });
      if (suggested) {
        setTag(suggested);
        setTagSuggested(true);
      }
    }
  };

  // After a successful save: remember choices for next time
  const rememberEntry = (entryMode) => {
    if (entryMode === 'transfer') {
      if (moveTarget === 'account') {
        rememberTransferPair({ accountType, accountId }, { accountType: destAccountType, accountId: destAccountId });
      }
      return;
    }
    rememberAccount(entryMode, accountType, accountId);
    if ((entryMode === 'log' || entryMode === 'plan') && description.trim()) {
      rememberCategory(description, tag);
    }
  };

  // "Save & add another": keep the mode, date and account; clear the rest
  const resetForNextEntry = (savedMinor) => {
    setSession((prev) => ({ count: prev.count + 1, total: prev.total + Math.abs(savedMinor || 0) }));
    setAmount('');
    setDescription('');
    setMatchedItemId('');
    setIsRefund(false);
    setCategoryTouched(false);
    setTagSuggested(false);
    setTag('Food');
    setFormError('');
    setFloorBreachData(null);
    requestAnimationFrame?.(() => amountInputRef.current?.focus?.());
  };

  const canAddAnother = !initialItem && (mode === 'log' || mode === 'income' || mode === 'plan');

  // What an edit changes, for the summary line ("Amount ₹500 → ₹450 · Date 12 Nov → 11 Nov")
  const editChanges = (() => {
    if (!initialItem || !editSnapshot) return [];
    const money = (v) => (v === '' || v === null || v === undefined ? '' : formatCurrency(Math.round(Number(v) * 100), currencySymbol));
    const day = (d) => (d ? formatDisplayDate(d, false) : '');
    const accountName = (id) => {
      const all = [...bankAccounts, ...wallets, ...creditCards];
      return all.find((a) => String(a._id || a.id) === String(id))?.name || '';
    };
    const out = [];
    const push = (label, from, to) => { if (String(from) !== String(to)) out.push({ label, from, to }); };
    push('Amount', money(editSnapshot.amount), money(amount));
    if (mode === 'plan' && itemType === 'recurring') push('Day', editSnapshot.dayOfMonth, Number(dayOfMonth) || 1);
    else push('Date', day(editSnapshot.date), day(date));
    push(mode === 'transfer' ? 'From' : 'Account', accountName(editSnapshot.accountId), accountName(accountId));
    if (mode === 'transfer') push('To', accountName(editSnapshot.destAccountId), accountName(destAccountId));
    push(mode === 'plan' ? 'Name' : 'Note', editSnapshot.description.trim(), description.trim());
    if (mode === 'log' || mode === 'plan') push('Category', editSnapshot.tag, tag);
    if (mode === 'income') push('Source', editSnapshot.incomeTag, incomeTag);
    if (mode === 'log') push('Type', editSnapshot.isRefund ? 'Refund' : 'Spend', isRefund ? 'Refund' : 'Spend');
    if (mode === 'plan') {
      push('Repeat', editSnapshot.itemType === 'recurring' ? 'Monthly' : 'Once', itemType === 'recurring' ? 'Monthly' : 'Once');
      push('Priority', ['High', 'Medium', 'Low'][editSnapshot.priority] || '', ['High', 'Medium', 'Low'][Number(priority) || 0] || '');
      push('Rollover', editSnapshot.isFixed ? 'Fixed' : 'Variable', isFixed ? 'Fixed' : 'Variable');
      push('Status', editSnapshot.isPaid ? 'Paid' : 'Pending', isPaid ? 'Paid' : 'Pending');
    }
    return out;
  })();

  const submitAndAddAnother = () => {
    if (!canAddAnother || !formRef.current) return;
    againRef.current = true;
    if (typeof formRef.current.requestSubmit === 'function') formRef.current.requestSubmit();
    else formRef.current.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  };

  const handleQuickClear = () => {
    setAmount('');
  };

  // Invert transfer accounts
  const handleInvertTransferAccounts = () => {
    const prevSourceType = accountType;
    const prevSourceId = accountId;
    setAccountType(destAccountType);
    setAccountId(destAccountId);
    setDestAccountType(prevSourceType);
    setDestAccountId(prevSourceId);
  };

  // Matched planned item selection
  const handleSelectMatchedItem = (id) => {
    const linked = id ? eligiblePlannedItems.find((i) => (i._id || i.id) === id) : null;
    // A new spend that pays a planned bill is a settlement: one flow, the Settle form
    if (linked && !initialItem && !isRefund && onSettleTransaction) {
      setSettleError('');
      setSettleItem(linked);
      return;
    }
    setMatchedItemId(id);
    if (id) {
      const selectedItem = linked;
      if (selectedItem && selectedItem.accountType && selectedItem.accountType !== 'unassigned') {
        setAccountType(selectedItem.accountType);
        if (selectedItem.accountType === 'bank') {
          const bankId = selectedItem.bankAccountId?._id || selectedItem.bankAccountId || '';
          if (bankId) setAccountId(bankId);
        } else if (selectedItem.accountType === 'wallet') {
          const walletId = selectedItem.walletId?._id || selectedItem.walletId || '';
          if (walletId) setAccountId(walletId);
        }
      }
    }
  };

  const handleSettleSubmit = async (payment) => {
    if (!settleItem || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSettleSubmitting(true);
    setSettleError('');
    try {
      await onSettleTransaction(settleItem._id || settleItem.id, payment);
      triggerExit();
    } catch (err) {
      setSettleError(err?.message || 'Could not mark this bill as paid.');
    } finally {
      isSubmittingRef.current = false;
      setSettleSubmitting(false);
    }
  };

  // Smart date recommendation for planned item
  const handleRecommendDate = async () => {
    const amt = Math.round(Number(amount || 0) * 100);
    const year = month?.year || new Date().getFullYear();
    const monthNum = month?.month || (new Date().getMonth() + 1);
    setRecommending(true);
    try {
      const rec = await api.recommendPurchaseDate(year, monthNum, amt > 0 ? amt : 1000);
      if (rec?.recommendedDate) {
        setDate(rec.recommendedDate);
      } else {
        setFormError(rec?.explanation || 'No safe date this month keeps you above your safety floor.');
      }
    } catch {
      const nowObj = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const isCurrentMonth = Number(year) === nowObj.getFullYear() && Number(monthNum) === (nowObj.getMonth() + 1);
      const safeFutureDay = isCurrentMonth ? Math.min(nowObj.getDate() + 1, 28) : 1;
      setDate(`${year}-${pad(monthNum)}-${pad(safeFutureDay)}`);
    } finally {
      setRecommending(false);
    }
  };

  // =========================================================================
  // SUBMISSION LOGIC
  // =========================================================================

  // Resolve live balance from authoritative simulation, with safe fallback to opening/current balance
  const getAccountLiveBalance = useCallback((acc) => {
    if (!acc) return 0;
    const idCandidates = [acc.id, acc._id].filter(Boolean).map(String);
    for (const aId of idCandidates) {
      if (accountSimulations?.[aId]?.todayBalance !== undefined) {
        return accountSimulations[aId].todayBalance;
      }
      if (simulation?.accounts?.[aId]?.todayBalance !== undefined) {
        return simulation.accounts[aId].todayBalance;
      }
    }
    if (typeof acc.currentBalance === 'number' && acc.currentBalance !== 0) {
      return acc.currentBalance;
    }
    if (typeof acc.balance === 'number' && acc.balance !== 0) {
      return acc.balance;
    }
    return acc.openingBalance ?? acc.currentBalance ?? acc.balance ?? 0;
  }, [accountSimulations, simulation]);

  const getAccountMinimumBalance = useCallback((acc) => {
    if (!acc) return 0;
    const idCandidates = [acc.id, acc._id].filter(Boolean).map(String);
    for (const aId of idCandidates) {
      if (accountSimulations?.[aId]?.minimumBalance !== undefined) {
        return Number(accountSimulations[aId].minimumBalance) || 0;
      }
      if (simulation?.accounts?.[aId]?.minimumBalance !== undefined) {
        return Number(simulation.accounts[aId].minimumBalance) || 0;
      }
    }
    return Number(acc.minimumBalance || acc.safetyFloor || 0);
  }, [accountSimulations, simulation]);

  // Mode 1: Log Spending Submission
  const handleTransactionSubmit = async (e, bypassFloorCheck = false, again = false) => {
    if (e && e.preventDefault) e.preventDefault();
    if (isSubmittingRef.current) return;
    if (!amount || isNaN(Number(amount))) return;
    setFormError('');

    if (!accountId) {
      setFormError('Choose the account you paid from.');
      return;
    }

    const baseAmount = Math.round(Math.abs(Number(amount)) * 100);
    const finalAmount = isRefund ? -baseAmount : baseAmount;

    // Refunds linked to one spend can't add up to more than was paid
    if (isRefund && refundTarget && baseAmount > refundTarget.remaining) {
      setFormError(refundTarget.remaining > 0
        ? `Only ${formatCurrency(refundTarget.remaining, currencySymbol)} of ${refundTarget.name} is left to refund.`
        : `${refundTarget.name} is already fully refunded.`);
      return;
    }

    // Safety Floor Check
    if (!isRefund && !bypassFloorCheck) {
      const selectedAccount = accountType === 'bank'
        ? bankAccounts.find((b) => String(b.id || b._id) === String(accountId))
        : wallets.find((w) => String(w.id || w._id) === String(accountId));

      if (selectedAccount) {
        const accBal = getAccountLiveBalance(selectedAccount);
        const minBal = getAccountMinimumBalance(selectedAccount);
        const existingDebit = initialItem ? Math.abs(Number(initialItem.amount || 0)) : 0;
        const netDebitChange = baseAmount - existingDebit;
        if (minBal > 0 && (accBal - netDebitChange) < minBal) {
          setFloorBreachData({
            type: 'spending',
            accountName: selectedAccount.name,
            minimumBalance: minBal,
            projectedBalance: accBal - netDebitChange,
            again
          });
          return;
        }
      }
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      const txPayload = {
        amount: finalAmount,
        tag,
        category: tag,
        note: description.trim(),
        title: description.trim() || tag || 'Expense',
        name: description.trim() || tag || 'Expense',
        date,
        plannedItemId: isRefund ? null : (matchedItemId || null),
        accountType,
        accountId,
        bankAccountId: accountType === 'bank' ? accountId : null,
        walletId: accountType === 'wallet' ? accountId : null,
        cascadeScope
      };
      // A new refund can say which spend it gives money back for (the server only sets this on create)
      if (isRefund && refundTargetId && !initialItem) txPayload.refundTargetTransactionId = refundTargetId;
      // Only "Save & add another" passes options, so normal saves call the handler as before
      if (again) await onLogTransaction(txPayload, { keepOpen: true });
      else await onLogTransaction(txPayload);
      rememberEntry('log');
      if (again) resetForNextEntry(finalAmount);
    } catch (err) {
      setFormError(err?.message || 'Could not save this spend. Please try again.');
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Mode 2: Log Direct Income Submission
  const handleIncomeSubmit = async (e, again = false) => {
    if (e && e.preventDefault) e.preventDefault();
    if (isSubmittingRef.current) return;
    setFormError('');
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setFormError('Enter an amount above zero.');
      return;
    }

    if (!accountId) {
      setFormError('Choose the account the money came into.');
      return;
    }

    const baseAmount = Math.round(Math.abs(Number(amount)) * 100);

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      const incomePayload = {
        amount: baseAmount,
        isIncome: true,
        tag: incomeTag,
        category: incomeTag,
        note: description.trim(),
        title: description.trim() || incomeTag || 'Income',
        name: description.trim() || incomeTag || 'Income',
        date,
        plannedItemId: null,
        accountType,
        accountId,
        bankAccountId: accountType === 'bank' ? accountId : null,
        walletId: accountType === 'wallet' ? accountId : null,
        updateSalaryTemplate
      };
      if (again) await onLogTransaction(incomePayload, { keepOpen: true });
      else await onLogTransaction(incomePayload);
      rememberEntry('income');
      if (again) resetForNextEntry(baseAmount);
      else triggerExit();
    } catch (err) {
      setFormError(err?.message || 'Could not save this income. Please try again.');
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Mode 3: Plan Item Submission
  const handlePlanSubmit = async (e, again = false) => {
    if (e && e.preventDefault) e.preventDefault();
    if (isSubmittingRef.current) return;
    if (!description.trim()) return;
    setFormError('');

    if (!accountId) {
      setFormError('Choose the account this bill is paid from.');
      return;
    }

    let finalDate = date;
    const year = month?.year || new Date().getFullYear();
    const monthNum = month?.month || (new Date().getMonth() + 1);

    if (itemType === 'one-time' && !finalDate && !isPaid) {
      try {
        const amt = Math.round(Number(amount || 0) * 100);
        const rec = await api.recommendPurchaseDate(year, monthNum, amt > 0 ? amt : 1000);
        if (rec?.recommendedDate) {
          finalDate = rec.recommendedDate;
        } else {
          const nowObj = new Date();
          const pad = (n) => String(n).padStart(2, '0');
          const isCurrentMonth = Number(year) === nowObj.getFullYear() && Number(monthNum) === (nowObj.getMonth() + 1);
          const safeFutureDay = isCurrentMonth ? Math.min(nowObj.getDate() + 1, 28) : 1;
          finalDate = `${year}-${pad(monthNum)}-${pad(safeFutureDay)}`;
        }
      } catch {
        const nowObj = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const isCurrentMonth = Number(year) === nowObj.getFullYear() && Number(monthNum) === (nowObj.getMonth() + 1);
        const safeFutureDay = isCurrentMonth ? Math.min(nowObj.getDate() + 1, 28) : 1;
        finalDate = `${year}-${pad(monthNum)}-${pad(safeFutureDay)}`;
      }
    }

    const payload = {
      type: itemType,
      name: description.trim(),
      priority: Number(priority) || 0,
      isPaid,
      isFixed,
      accountType,
      accountId,
      bankAccountId: accountType === 'bank' ? accountId : null,
      walletId: accountType === 'wallet' ? accountId : null,
      cascadeScope,
      category: tag,
      tag
    };

    if (itemType === 'one-time') {
      payload.amount = Math.round(Number(amount || 0) * 100);
      const relativeDay = finalDate ? getRelativeDay(finalDate, year, monthNum) : 1;
      payload.day = relativeDay;
      payload.date = finalDate;
    } else if (itemType === 'recurring') {
      payload.amount = Math.round(Number(amount || 0) * 100);
      payload.dayOfMonth = Number(dayOfMonth) || 1;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      if (again) await onSaveItem(payload, { keepOpen: true });
      else await onSaveItem(payload);
      rememberEntry('plan');
      if (again) resetForNextEntry(payload.amount);
    } catch (err) {
      setFormError(err?.message || 'Could not save this bill. Please try again.');
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Mode 4: Transfer Submission
  const handleTransferSubmit = async (e, bypassFloorCheck = false) => {
    if (e && e.preventDefault) e.preventDefault();
    if (isSubmittingRef.current) return;
    setTransferError('');

    if (!amount || Number(amount) <= 0) {
      setTransferError('Please enter a valid transfer amount.');
      return;
    }

    // Paying a card is a transfer into the card (ADR 0070)
    const toCard = moveTarget === 'card';
    const destType = toCard ? 'credit_card' : destAccountType;
    const destId = toCard ? cardId : destAccountId;

    if (toCard && !destId) {
      setTransferError('Choose the card to pay.');
      return;
    }

    if (!accountId || !destId) {
      setTransferError('Both source and destination accounts are required.');
      return;
    }

    if (accountType === destType && String(accountId) === String(destId)) {
      setTransferError('Source and destination accounts must be different.');
      return;
    }

    const xferAmt = Math.round(Number(amount) * 100);

    // Safety Floor Check on source account
    if (!bypassFloorCheck) {
      const sourceAccount = accountType === 'bank'
        ? bankAccounts.find((b) => String(b.id || b._id) === String(accountId))
        : wallets.find((w) => String(w.id || w._id) === String(accountId));

      if (sourceAccount) {
        const sourceBal = getAccountLiveBalance(sourceAccount);
        const sourceMin = getAccountMinimumBalance(sourceAccount);
        if (sourceMin > 0 && (sourceBal - xferAmt) < sourceMin) {
          setFloorBreachData({
            type: 'transfer',
            accountName: sourceAccount.name,
            minimumBalance: sourceMin,
            projectedBalance: sourceBal - xferAmt
          });
          return;
        }
      }
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      const payload = {
        date,
        amount: xferAmt,
        sourceType: accountType,
        sourceBankAccountId: accountType === 'bank' ? accountId : null,
        sourceWalletId: accountType === 'wallet' ? accountId : null,
        sourceAccountId: accountId,
        destinationType: destType,
        destinationBankAccountId: destType === 'bank' ? destId : null,
        destinationWalletId: destType === 'wallet' ? destId : null,
        destinationAccountId: destId,
        note: description.trim() || (toCard ? `${selectedCard?.name || 'Card'} bill` : ''),
        description: description.trim() || (toCard ? `${selectedCard?.name || 'Card'} bill` : '')
      };

      if (initialItem) {
        payload.id = initialItem.transferId || initialItem.id || initialItem._id;
      }

      if (onCreateTransfer) {
        await onCreateTransfer(payload);
      }
      rememberEntry('transfer');
      triggerExit();
    } catch (err) {
      setTransferError(err.message || 'Failed to record transfer.');
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  if (!shouldRender) return null;

  const hasZeroAccounts = bankAccounts.length === 0 && wallets.length === 0;

  // Active form submit router
  const handleSubmitRouter = (e) => {
    const again = againRef.current && canAddAnother;
    againRef.current = false;
    if (mode === 'log') handleTransactionSubmit(e, false, again);
    else if (mode === 'income') handleIncomeSubmit(e, again);
    else if (mode === 'plan') handlePlanSubmit(e, again);
    else if (mode === 'transfer') handleTransferSubmit(e);
  };

  const sheetTitle = settleItem ? 'Mark paid'
    : (mode === 'transfer' && moveTarget === 'person') ? 'Held & Lent'
    : mode === 'log' ? `${initialItem ? 'Edit' : 'New'} ${isRefund ? 'refund' : 'spend'}`
    : mode === 'income' ? `${initialItem ? 'Edit' : 'New'} income`
    : mode === 'plan' ? (initialItem ? 'Edit plan' : (itemType === 'recurring' ? 'New recurring bill' : 'New plan'))
    : initialItem ? 'Edit transfer' : (moveTarget === 'card' ? 'Pay a card' : 'Move money');
  const showFormAction = !settleItem && !(mode === 'transfer' && moveTarget === 'person');
  const sheetAction = isSubmitting
    ? (initialItem ? 'Saving…' : 'Adding…')
    : (initialItem ? 'Save' : (mode === 'transfer' && moveTarget === 'card' ? `Pay ${selectedCard?.name || 'card'}` : 'Add'));

  // Rendered on <body> so no parent stacking context can put it under the
  // header or bottom nav; its order comes from --z-modal.
  const modal = (
    <div ref={containerRef}>
      <div
        ref={overlayRef}
        className="modal-overlay"
        onClick={() => requestClose()}
      >
        <div
          ref={contentRef}
          className={`modal-content ${isExpanded ? 'is-expanded' : ''} entry-box`}
          onClick={(e) => e.stopPropagation()}
          onScroll={handleScroll}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Mobile bottom-sheet grab zone & handle */}
          <div className="modal-drag-zone">
            <div className="modal-drag-handle" />
          </div>

          {/* Sheet top bar: Cancel, what this is, and the one action */}
          <div className="sheet-topbar">
            <button type="button" className="sheet-topbar-btn" onClick={() => requestClose()}>Cancel</button>
            <h2 className="sheet-topbar-title">{sheetTitle}</h2>
            {showFormAction ? (
              <button
                type="submit"
                form="entry-sheet-form"
                className={`sheet-topbar-btn is-primary ${mode === 'log' && isRefund ? 'is-positive' : ''}`}
                disabled={(mode !== 'transfer' && hasZeroAccounts) || isSubmitting}
              >
                {sheetAction}
              </button>
            ) : <span className="sheet-topbar-btn" aria-hidden="true" />}
          </div>

          {/* Modal Header & Symmetrical Mode Switcher */}
          <div
            className="modal-header-row entry-row"
          >
            {initialItem ? (
              <div className="entry-row-2">
                <div
                  role="button"
                  aria-label={mode === 'income' ? 'Income' : (mode === 'log' ? 'Spending' : (mode === 'transfer' ? 'Transfer' : 'Plan Transaction'))}
                  data-active="true"
                  className={`entry-edit-type is-${mode}`}
                >
                  {mode === 'log' && <ZapIcon size={14} />}
                  {mode === 'income' && <TrendingUpIcon size={14} />}
                  {mode === 'plan' && <PlusIcon size={14} />}
                  {mode === 'transfer' && <ArrowRightLeftIcon size={14} />}
                  <span>
                    {mode === 'log' && (isRefund ? 'Editing Credit / Refund' : 'Editing Settled Expense')}
                    {mode === 'income' && (initialItem.origin === 'salary' ? 'Editing Salary Credit' : 'Editing Income Credit')}
                    {mode === 'plan' && (initialItem.type === 'recurring' ? 'Editing Recurring Commitment' : 'Editing Planned Commitment')}
                    {mode === 'transfer' && 'Editing Transfer'}
                  </span>
                  <span className="entry-note"
                    title="Type is locked during edit to maintain ledger consistency"
                  >
                    <LockIcon size={11} /> Type Locked
                  </span>
                </div>
              </div>
            ) : (
              <div className="modal-tab-track entry-box-2">
                <div ref={indicatorRef} className="modal-tab-indicator" />
                <button
                  ref={logBtnRef}
                  type="button"
                  className={`modal-tab-btn timeline-filter-btn ${mode === 'log' ? 'active' : ''} entry-btn`}
                  data-active={mode === 'log' ? 'true' : 'false'}
                  onClick={() => handleSwitchMode('log')}
                  aria-label="Spending"
                  title="Log Spending"
                >
                  <ZapIcon size={14} />
                  <span>Spending</span>
                </button>
                <button
                  ref={incomeBtnRef}
                  type="button"
                  className={`modal-tab-btn timeline-filter-btn ${mode === 'income' ? 'active' : ''} entry-btn`}
                  data-active={mode === 'income' ? 'true' : 'false'}
                  onClick={() => handleSwitchMode('income')}
                  aria-label="Income"
                  title="Log Income"
                >
                  <TrendingUpIcon size={14} />
                  <span>Income</span>
                </button>
                <button
                  ref={planBtnRef}
                  type="button"
                  className={`modal-tab-btn timeline-filter-btn ${mode === 'plan' ? 'active' : ''} entry-btn`}
                  data-active={mode === 'plan' ? 'true' : 'false'}
                  onClick={() => handleSwitchMode('plan')}
                  aria-label="Plan Transaction"
                  title="Plan Transaction"
                >
                  <PlusIcon size={14} />
                  <span>Plan</span>
                </button>
                <button
                  ref={transferBtnRef}
                  type="button"
                  className={`modal-tab-btn timeline-filter-btn ${mode === 'transfer' ? 'active' : ''} entry-btn`}
                  data-active={mode === 'transfer' ? 'true' : 'false'}
                  onClick={() => handleSwitchMode('transfer')}
                  aria-label="Move"
                  title="Move money: between your accounts, to a card, or with a person"
                >
                  <ArrowRightLeftIcon size={14} />
                  <span>Move</span>
                </button>
              </div>
            )}

          </div>

          {confirmDiscard && (
            <div className="discard-confirm" role="alertdialog" aria-label="Discard this entry?" data-testid="discard-confirm">
              <span>Discard this entry?</span>
              <div className="discard-confirm-actions">
                <button type="button" className="btn-subtle" onClick={() => setConfirmDiscard(false)} autoFocus>Keep editing</button>
                <button type="button" className="btn-primary discard-confirm-discard" onClick={() => { setConfirmDiscard(false); triggerExit(); }}>Discard</button>
              </div>
            </div>
          )}

          {session.count > 0 && (
            <p className="entry-session" data-testid="entry-session">
              {session.count} added · {formatCurrency(session.total, currencySymbol)}
            </p>
          )}

          {/* Move: where the money goes */}
          {mode === 'transfer' && !initialItem && !settleItem && (
            <div className="move-target-row">
              <div className="entry-segment move-target" role="group" aria-label="Move money">
                {[
                  ['account', 'My accounts'],
                  ['card', 'Pay a card'],
                  ['person', 'A person']
                ].filter(([key]) => key !== 'card' || creditCards.length > 0).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={`entry-segment-btn ${moveTarget === key ? 'active' : ''}`}
                    aria-pressed={moveTarget === key}
                    onClick={() => {
                      setMoveTarget(key);
                      setTransferError('');
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* =========================================================================
              THE UNIVERSAL 6-SLOT FORM VIEW
              Identical spatial sequence across all 4 modes.
             ========================================================================= */}
          {settleItem ? (
            <div className="modal-form-scroll-body">
              <p className="field-hint settle-intro">This pays a planned bill, so it is marked paid instead of logged as new spending.</p>
              <SettleForm
                bill={settleItem}
                bankAccounts={bankAccounts}
                wallets={wallets}
                creditCards={creditCards}
                currencySymbol={currencySymbol}
                simulation={simulation}
                initialAmount={amount}
                initialAccountId={accountId}
                onSubmit={handleSettleSubmit}
                onCancel={() => {
                  setSettleItem(null);
                  setMatchedItemId('');
                }}
                cancelLabel="Log as new spend"
                submitting={settleSubmitting}
                error={settleError}
                submitLabel="Mark paid"
              />
            </div>
          ) : mode === 'transfer' && moveTarget === 'person' ? (
            <div className="modal-form-scroll-body hl-modal-body">
              <HeldLentForm
                initialAction={personPreset?.action || initialPreset?.heldLent?.action || 'hold'}
                initialFundId={personPreset?.fundId || initialPreset?.heldLent?.fundId || ''}
                initialPersonName={personPreset?.personName || ''}
                bankAccounts={bankAccounts}
                wallets={wallets}
                currencySymbol={currencySymbol}
                month={month}
                simulation={simulation}
                accountSimulations={accountSimulations}
                transactions={transactions}
                initialValues={{ amount, date, note: description, accountId }}
                onValuesChange={(values) => {
                  setAmount(values.amount);
                  setDate(values.date);
                  setDescription(values.note);
                  setAccountType(values.accountType);
                  setAccountId(values.accountId);
                }}
                onSaved={(saved) => {
                  onHeldLentSaved?.(saved);
                  triggerExit();
                }}
              />
            </div>
          ) : (
          <form className="entry-stack"
            id="entry-sheet-form"
            ref={formRef}
            onSubmit={handleSubmitRouter}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canAddAnother) {
                e.preventDefault();
                submitAndAddAnother();
              }
            }}
          >
            <div className="modal-form-scroll-body">
              {/* ---------------------------------------------------------------------
                  SLOT 1: HERO AMOUNT & PRIMARY DIRECTION MODIFIER
                 --------------------------------------------------------------------- */}
              <div className="form-group entry-box-3">
                <div className="entry-row-3">
                  <div className="entry-row-4">
                    <label className="form-label entry-box-3">
                      {mode === 'log' && `Amount (${currencySymbol})`}
                      {mode === 'income' && `Income Amount (${currencySymbol}) *`}
                      {mode === 'plan' && `Planned amount (${currencySymbol})`}
                      {mode === 'transfer' && `Transfer Amount (${currencySymbol}) *`}
                    </label>

                    {mode === 'plan' && !isPaid && itemType !== 'recurring' && (
                      <button
                        type="button"
                        className="sparkle-action-link entry-btn-3"
                        onClick={handleRecommendDate}
                        disabled={recommending}
                        title="Recommend best safe date based on spending pace, balance, and floor buffer"
                      >
                        <SparklesIcon size={11} className={recommending ? 'sparkle-spin-icon' : ''} />
                        <span>{recommending ? 'Analyzing...' : 'Auto date'}</span>
                      </button>
                    )}
                  </div>

                  {/* Slot 1 Modifier Pill / Segment */}
                  {mode === 'log' && (
                    <button
                      type="button"
                      className={`entry-toggle ${isRefund ? 'is-on credit-active-btn' : ''}`}
                      aria-pressed={isRefund}
                      onClick={(e) => handleMicroPress(e, () => {
                        setIsRefund((prev) => !prev);
                        // Refunds link to a past spend, spends to a planned bill: switching clears the other link
                        setMatchedItemId('');
                        setRefundTargetId('');
                      })}
                    >
                      {isRefund ? (
                        <>
                          <CheckCircleIcon size={12} />
                          <span>Credit / Refund</span>
                        </>
                      ) : (
                        'Expense Debit'
                      )}
                    </button>
                  )}

                  {mode === 'plan' && (
                    <div className="entry-segment" role="group" aria-label="Repeat">
                      <button
                        type="button"
                        className={`entry-segment-btn ${itemType === 'one-time' ? 'active' : ''}`}
                        aria-pressed={itemType === 'one-time'}
                        onClick={(e) => handleMicroPress(e, () => setItemType('one-time'))}
                      >
                        One-Time
                      </button>
                      <button
                        type="button"
                        className={`entry-segment-btn ${itemType === 'recurring' ? 'active' : ''}`}
                        aria-pressed={itemType === 'recurring'}
                        onClick={(e) => handleMicroPress(e, () => setItemType('recurring'))}
                      >
                        Recurring
                      </button>
                    </div>
                  )}

                </div>

                {/* Hero Amount & Date Side-by-Side Grid */}
                <div className="modal-amount-date-grid">
                  <div className="modal-amount-dock">
                    <span className="modal-amount-prefix">{currencySymbol}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={mode === 'transfer' ? '0.01' : undefined}
                      required
                      autoFocus
                      ref={amountInputRef}
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="tabular-nums modal-amount-input entry-text"
                    />
                    {amount && (
                      <button
                        type="button"
                        className="modal-amount-clear-btn"
                        onClick={handleQuickClear}
                        title="Clear amount"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {/* Docked Date Companion */}
                  {mode === 'plan' && itemType === 'recurring' ? (
                    <div className="modal-day-stepper-dock" title="Day of month (1 - 31)">
                      <CalendarIcon size={14} color="var(--text-secondary)" />
                      <span>Day</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        max="31"
                        required
                        value={dayOfMonth}
                        onChange={(e) => setDayOfMonth(Math.max(1, Math.min(31, parseInt(e.target.value, 10) || 1)))}
                      />
                    </div>
                  ) : (
                    <DatePicker
                      compact
                      value={date}
                      onChange={(d) => setDate(d)}
                      placeholder="Date"
                      month={month}
                      required={mode !== 'plan'}
                      // Plans may be dated earlier this month (an unpaid bill shows as overdue);
                      // anything already paid or received can't be in the future.
                      minDate={mode === 'plan' ? planMinDate : null}
                      maxDate={mode === 'plan' ? null : todayStr}
                    />
                  )}
                </div>

                {/* Quick Increment Shortcut Chips & Compact Variable Checkbox */}
                <div className="modal-pills-row">
                  <div className="modal-pills-left">
                    {(QUICK_INCREMENTS[mode] || [100, 500, 1000, 2000]).map((inc) => (
                      <button
                        key={`quick-${inc}`}
                        type="button"
                        className="quick-amt-chip"
                        onClick={() => handleQuickIncrement(inc)}
                      >
                        {inc >= 1000 ? `${inc / 1000}k` : inc}
                      </button>
                    ))}
                  </div>

                  {/* Mode = Plan: Compact Variable Checkbox + Info Icon */}
                  {mode === 'plan' && (
                    <div
                      className={`modal-variable-pill ${!isFixed ? 'active' : ''} ${showVariableInfo ? 'has-popover-open' : ''}`}
                      onClick={() => setIsFixed((prev) => !prev)}
                      role="checkbox"
                      aria-checked={!isFixed}
                      title={!isFixed ? 'Variable expense (click to make Fixed)' : 'Fixed expense (click to make Variable)'}
                    >
                      <input
                        type="checkbox"
                        checked={!isFixed}
                        onChange={(e) => setIsFixed(!e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                        className="modal-variable-checkbox"
                        aria-label="Variable expense"
                      />
                      <span>Variable</span>
                      <button
                        type="button"
                        className="variable-info-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowVariableInfo((prev) => !prev);
                        }}
                        title="About Variable vs Fixed expenses"
                        aria-label="About Variable vs Fixed expenses"
                      >
                        ℹ
                      </button>

                      {/* Interactive Micro-Popover */}
                      {showVariableInfo && (
                        <div
                          className="variable-info-popover"
                          onClick={(e) => e.stopPropagation()}
                          role="tooltip"
                        >
                          <div className="variable-info-header">
                            <span className="variable-info-title">Expense Rollover Mode</span>
                            <button
                              type="button"
                              className="variable-info-close"
                              onClick={() => setShowVariableInfo(false)}
                              aria-label="Close info"
                            >
                              <XIcon size={14} />
                            </button>
                          </div>

                          <div className="variable-info-item">
                            <div className="variable-badge fixed">Fixed (Default)</div>
                            <p className="variable-info-desc">
                              Automatically carries forward into next month's safe-to-spend allowance on rollover.
                            </p>
                          </div>

                          <div className="variable-info-item">
                            <div className="variable-badge variable">Variable</div>
                            <p className="variable-info-desc">
                              One-time commitment for this month only; drops automatically upon rollover.
                            </p>
                          </div>

                          <button
                            type="button"
                            className="variable-info-gotit"
                            onClick={() => setShowVariableInfo(false)}
                          >
                            Got it
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

            {/* ---------------------------------------------------------------------
                SLOT 2: PRIMARY ACCOUNT SELECTOR
               --------------------------------------------------------------------- */}
            <div className="form-group entry-box-3">
              <label className="form-label">
                {mode === 'log' && 'Payment Account *'}
                {mode === 'income' && 'Deposited To (Account) *'}
                {mode === 'plan' && 'Dedicated Account *'}
                {mode === 'transfer' && (moveTarget === 'card' ? 'Pay from *' : 'Source Account (Outflow) *')}
              </label>

              {hasZeroAccounts ? (
                <div className="entry-box-4"
                >
                  <div className="entry-note-3">
                    Bank Account Required
                  </div>
                  <div className="entry-note-4">
                    You must register a bank account before recording transactions.
                  </div>
                  <button
                    type="button"
                    className="btn-primary entry-btn-4"
                    onClick={() => {
                      triggerExit(() => {
                        onOpenAddBank?.();
                      });
                    }}
                  >
                    + Add Bank Account
                  </button>
                </div>
              ) : (
                <AccountSelect
                  accountType={accountType}
                  accountId={accountId}
                  onChange={({ accountType: newType, accountId: newId }) => {
                    setAccountType(newType);
                    setAccountId(newId);
                  }}
                  bankAccounts={bankAccounts}
                  wallets={wallets}
                  creditCards={mode === 'log' || mode === 'plan' ? creditCards : []}
                  currencySymbol={currencySymbol}
                  simulation={simulation}
                  accountSimulations={accountSimulations}
                />
              )}
            </div>

            {/* ---------------------------------------------------------------------
                SLOT 3: CATEGORY / CLASSIFICATION (OR TRANSFER DESTINATION)
               --------------------------------------------------------------------- */}
            <div className="form-group entry-box-3">
              {mode !== 'transfer' ? (
                <>
                  <label className="form-label">
                    {mode === 'log' && 'Category tag'}
                    {(mode === 'log' || mode === 'plan') && tagSuggested && <span className="field-suggested"> · suggested</span>}
                    {mode === 'income' && 'Income Category / Source'}
                    {mode === 'plan' && 'Category & Classification'}
                  </label>
                  <div className="category-pill-grid">
                    {mode === 'income'
                      ? INCOME_CATEGORIES.map((t) => (
                          <button
                            key={t}
                            type="button"
                            className={`category-pill-btn ${incomeTag === t ? 'btn-primary' : 'btn-subtle'}`}
                            aria-pressed={incomeTag === t}
                            onClick={(e) => handleMicroPress(e, () => setIncomeTag(t))}
                          >
                            {t}
                          </button>
                        ))
                      : SPEND_CATEGORIES.map((t) => (
                          <button
                            key={t}
                            type="button"
                            className={`category-pill-btn ${tag === t ? 'btn-primary' : 'btn-subtle'}`}
                            aria-pressed={tag === t}
                            onClick={(e) => handleMicroPress(e, () => { setTag(t); setCategoryTouched(true); setTagSuggested(false); })}
                          >
                            {t}
                          </button>
                        ))}
                  </div>
                  {mode === 'income' && (
                    <span className="entry-note-5">
                      Note: Your primary monthly salary is managed in Salary schedule. Use this form to record ad-hoc earnings, bonuses, or side income.
                    </span>
                  )}
                </>
              ) : moveTarget === 'card' ? (
                <>
                  <label className="form-label">Card to pay *</label>
                  <div className="move-card-list" role="group" aria-label="Card to pay">
                    {creditCards.map((c) => {
                      const id = c.id || c._id;
                      const bill = c.openBill;
                      const active = String(cardId) === String(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          className={`choice-card ${active ? 'active' : ''}`}
                          aria-pressed={active}
                          onClick={() => setCardId(id)}
                        >
                          <span className="choice-card-title">{c.name}</span>
                          <span className="choice-card-sub">
                            Owes {formatCurrency(c.outstanding || 0, currencySymbol)}
                            {bill && bill.remaining > 0 ? ` · bill ${formatCurrency(bill.remaining, currencySymbol)}${bill.dueDate ? ` due ${formatDisplayDate(bill.dueDate, false)}` : ''}` : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {selectedCard && (
                    <div className="move-bill-chips">
                      {selectedCard.openBill?.remaining > 0 && (
                        <button type="button" className="quick-amt-chip" onClick={() => setAmount(String(selectedCard.openBill.remaining / 100))}>
                          Bill {formatCurrency(selectedCard.openBill.remaining, currencySymbol)}
                        </button>
                      )}
                      {selectedCard.openBill?.minimumDue > 0 && (
                        <button type="button" className="quick-amt-chip" onClick={() => setAmount(String(Math.min(selectedCard.openBill.minimumDue, selectedCard.openBill.remaining) / 100))}>
                          Minimum {formatCurrency(Math.min(selectedCard.openBill.minimumDue, selectedCard.openBill.remaining), currencySymbol)}
                        </button>
                      )}
                      {selectedCard.outstanding > 0 && (
                        <button type="button" className="quick-amt-chip" onClick={() => setAmount(String(selectedCard.outstanding / 100))}>
                          All owed {formatCurrency(selectedCard.outstanding, currencySymbol)}
                        </button>
                      )}
                    </div>
                  )}
                  <span className="field-hint">Paying a card moves money from your account to the card. It isn't counted as spending again.</span>
                </>
              ) : (
                <>
                  <div className="entry-row-8">
                    <label className="form-label entry-box-3">Destination Account (Inflow) *</label>
                    <button
                      type="button"
                      className="btn-subtle modal-conduit-swap-btn entry-btn-5"
                      onClick={(e) => {
                        const icon = e.currentTarget.querySelector('.modal-conduit-swap-icon');
                        if (icon) {
                          icon.style.transform = icon.style.transform === 'rotate(180deg)' ? 'rotate(0deg)' : 'rotate(180deg)';
                        }
                        handleInvertTransferAccounts();
                      }}
                      title="Swap source and destination"
                    >
                      <span className="modal-conduit-swap-icon">⇅</span>
                      <span>Invert</span>
                    </button>
                  </div>
                  <AccountSelect
                    accountType={destAccountType}
                    accountId={destAccountId}
                    onChange={({ accountType: newType, accountId: newId }) => {
                      setDestAccountType(newType);
                      setDestAccountId(newId);
                    }}
                    bankAccounts={bankAccounts}
                    wallets={wallets}
                    currencySymbol={currencySymbol}
                    simulation={simulation}
                    accountSimulations={accountSimulations}
                  />
                </>
              )}
            </div>

            {/* ---------------------------------------------------------------------
                SLOT 4: DESCRIPTION & CONTEXTUAL DETAILS
               --------------------------------------------------------------------- */}
            <div className="form-group entry-box-3">
              <label className="form-label">
                {mode === 'plan' ? 'Name / Description *' : 'Description note (optional)'}
              </label>
              <input className="entry-box-5"
                type="text"
                required={mode === 'plan'}
                placeholder={
                  mode === 'log'
                    ? 'e.g. Grocery, Metro pass, Doctor checkup'
                    : mode === 'income'
                    ? 'e.g. Monthly salary payout, client invoice, dividends'
                    : mode === 'plan'
                    ? 'e.g. Rent, Electricity, Groceries'
                    : 'e.g. ATM withdrawal, emergency savings, envelope funding'
                }
                value={description}
                onChange={(e) => handleDescriptionChange(e.target.value)}
              />

              {/* Mode-Specific Contextual Details below Description */}

              {/* SPENDING: Candidate match banner & Planned Item Matcher */}
              {mode === 'log' && (
                <div className="entry-box-6">
                  {isRefund && initialItem ? (
                    // The link is set when the refund is created; it can't be changed afterwards
                    <p className="field-hint" data-testid="refund-link-readonly">
                      {refundTarget
                        ? <>Refund for <strong>{refundTarget.name}</strong> ({formatCurrency(refundTarget.paid, currencySymbol)}{refundTarget.date ? `, ${formatDisplayDate(refundTarget.date, false)}` : ''}).</>
                        : (initialItem.refundTargetTransactionId ? 'Linked to an earlier spend.' : 'Not linked to a spend.')}
                    </p>
                  ) : isRefund ? (
                    <SearchableItemPicker
                      items={refundPickerItems}
                      selectedId={refundTargetId}
                      onSelect={(id) => {
                        setRefundTargetId(id);
                        const target = refundTargets.find((t) => t._id === id);
                        if (!target) return;
                        // Same category and account as the spend being refunded, unless already chosen
                        if (!categoryTouched && SPEND_CATEGORIES.includes(target.category)) {
                          setTag(target.category);
                          setTagSuggested(false);
                        }
                        const pools = { bank: bankAccounts, wallet: wallets, credit_card: creditCards };
                        const found = Object.entries(pools).find(([, list]) => (list || []).some((a) => String(a._id || a.id) === String(target.accountId)));
                        if (found) {
                          setAccountType(found[0]);
                          setAccountId(target.accountId);
                        }
                        if (!description.trim()) setDescription(`Refund: ${target.name}`);
                      }}
                      currencySymbol={currencySymbol}
                      placeholder="Not linked to a spend"
                      noneLabel="Not linked"
                      noneSub="A credit not tied to one spend"
                      searchPlaceholder="Search your spends..."
                      emptyText="No spends match"
                      showDate
                      ariaLabel="Refund for"
                    />
                  ) : (
                    <SearchableItemPicker
                      items={eligiblePlannedItems}
                      selectedId={matchedItemId}
                      onSelect={handleSelectMatchedItem}
                      currencySymbol={currencySymbol}
                    />
                  )}

                  <span className={`field-hint ${isRefund ? 'is-positive' : ''}`} data-testid="link-hint">
                    {isRefund
                      ? (refundTarget
                          ? (Math.round(Math.abs(Number(amount) || 0) * 100) > refundTarget.remaining
                              ? (refundTarget.remaining < refundTarget.paid
                                  ? `More than the ${formatCurrency(refundTarget.remaining, currencySymbol)} left to refund on ${refundTarget.name} (${formatCurrency(refundTarget.paid, currencySymbol)} paid).`
                                  : `More than the ${formatCurrency(refundTarget.paid, currencySymbol)} you paid for ${refundTarget.name}.`)
                              : `Gives back money for ${refundTarget.name}: its net cost becomes ${formatCurrency(Math.max(0, refundTarget.remaining - Math.round(Math.abs(Number(amount) || 0) * 100)), currencySymbol)}.`)
                          : 'Adds this credit back to your spending money. Link the spend it refunds to keep its category right.')
                      : (matchedItemId
                          ? 'Fulfills and replaces the planned item to prevent double-counting.'
                          : 'Logs as unexpected spending, reducing your safe-to-spend allowance.')}
                  </span>
                </div>
              )}

              {/* INCOME: Scheduled Base Salary Info Card */}
              {mode === 'income' && month?.incomeAmount && (
                <div className="entry-stack-2"
                >
                  <div className="entry-row-11">
                    <span className="entry-note-6">
                      Scheduled Monthly Salary
                    </span>
                    <span className="entry-text-3">
                      +{currencySymbol}{(month.incomeAmount / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="entry-row-12">
                    <span>
                      Deposit Target:{' '}
                      <strong className="entry-text-4">
                        {(() => {
                          const bId = month.salaryBankAccountId?._id || month.salaryBankAccountId;
                          const b = bankAccounts.find((x) => (x._id || x.id) === bId);
                          return b ? b.name : (bId ? 'Assigned Bank' : 'Unassigned');
                        })()}
                      </strong>
                    </span>
                    <span>
                      Day: <strong className="entry-text-4">{month.incomeCreditDate || `Day ${month.salaryDepositDay || 1}`}</strong>
                    </span>
                  </div>
                </div>
              )}

              {/* PLAN: Same-Day Priority Selector & Fixed Need Toggle */}
              {mode === 'plan' && (
                <div className="entry-stack-3">
                  {/* Same-day priority */}
                  <div>
                    <label className="form-label entry-label">Same-day priority</label>
                    <div className="priority-selector">
                      {[
                        { label: 'High', value: 0, bars: 3 },
                        { label: 'Medium', value: 1, bars: 2 },
                        { label: 'Low', value: 2, bars: 1 }
                      ].map((tier) => {
                        const isSelected = (Number(priority) || 0) === tier.value;
                        return (
                          <button
                            key={tier.value}
                            type="button"
                            className={`priority-option-btn ${isSelected ? 'selected' : ''}`}
                            onClick={(e) => handleMicroPress(e, () => setPriority(tier.value))}
                          >
                            <span className="priority-bars-icon" aria-hidden="true">
                              <span className={`priority-bar bar-1 ${tier.bars >= 1 ? 'active' : ''}`} />
                              <span className={`priority-bar bar-2 ${tier.bars >= 2 ? 'active' : ''}`} />
                              <span className={`priority-bar bar-3 ${tier.bars >= 3 ? 'active' : ''}`} />
                            </span>
                            <span>{tier.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* TRANSFER: Zero-sum informational note */}
              {mode === 'transfer' && (
                <div className="entry-note-7">
                  Moving money between your own accounts doesn't change your total cash.
                </div>
              )}
            </div>

            {/* Recurrence Scope Selector for Recurring Planned Item Edit */}
              {initialItem && mode === 'plan' && (initialItem.type === 'recurring' || itemType === 'recurring') && editChanges.length > 0 && (
                <div className="entry-box-7">
                  <label className="form-label entry-label-2">Recurrence Update Scope</label>
                  <div className="entry-grid">
                    <button
                      type="button"
                      className={`choice-card ${cascadeScope === 'single' ? 'active active-scope' : ''}`}
                      aria-pressed={cascadeScope === 'single'}
                      onClick={() => setCascadeScope('single')}
                    >
                      <span className="choice-card-title">This month only</span>
                      <span className="choice-card-sub">One-time override</span>
                    </button>
                    <button
                      type="button"
                      className={`choice-card ${cascadeScope === 'all_future' ? 'active active-scope' : ''}`}
                      aria-pressed={cascadeScope === 'all_future'}
                      onClick={() => setCascadeScope('all_future')}
                    >
                      <span className="choice-card-title">This & all future</span>
                      <span className="choice-card-sub">Update baseline</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Salary Template Sync for Salary Income Edit */}
              {initialItem && mode === 'income' && (initialItem.origin === 'salary' || incomeTag === 'Salary') && (
                <div className={`choice-card is-static ${updateSalaryTemplate ? 'active' : ''}`}>
                  <label className="entry-label-3">
                    <div>
                      <div className="choice-card-title">
                        Update monthly salary template
                      </div>
                      <div className="entry-note-10">
                        Applies this salary amount to upcoming months' safe-to-spend projections.
                      </div>
                    </div>
                    <input className="entry-box-8"
                      type="checkbox"
                      checked={updateSalaryTemplate}
                      onChange={(e) => setUpdateSalaryTemplate(e.target.checked)}
                    />
                  </label>
                </div>
              )}
            </div>

            {!initialItem && (() => {
              // One assist at a time: bill > salary > person
              const minor = Math.round(Math.abs(Number(amount) || 0) * 100);
              if (mode === 'log' && candidateMatch && !matchedItemId && !dismissedAssists.bill) {
                return (
                  <div className="assist-banner" data-testid="assist-bill">
                    <SparklesIcon size={14} />
                    <span>
                      Paying <strong>{candidateMatch.name || candidateMatch.title}</strong>
                      {' '}({formatCurrency(Math.abs(candidateMatch.plannedAmount ?? candidateMatch.amount ?? 0), currencySymbol)})?
                    </span>
                    <div className="assist-actions">
                      <button type="button" className="btn-subtle" onClick={() => setDismissedAssists((d) => ({ ...d, bill: true }))}>No</button>
                      <button type="button" className="btn-primary" onClick={() => handleSelectMatchedItem(candidateMatch._id || candidateMatch.id)}>
                        Yes, settle it
                      </button>
                    </div>
                  </div>
                );
              }
              const salary = mode === 'income' && !dismissedAssists.salary
                ? detectDuplicateSalary({ description, amount: minor, month })
                : null;
              if (salary) {
                return (
                  <div className="assist-banner tone-warn" data-testid="assist-salary">
                    <AlertTriangleIcon size={14} />
                    <span>
                      Your <strong>{formatCurrency(salary.amount, currencySymbol)}</strong> salary
                      {salary.date ? ` on ${formatDisplayDate(salary.date, false)}` : ''} is already in the plan. Logging it here counts it twice.
                    </span>
                    <div className="assist-actions">
                      <button type="button" className="btn-subtle" onClick={() => setDismissedAssists((d) => ({ ...d, salary: true }))}>
                        It's extra income
                      </button>
                      {onOpenSalarySchedule && (
                        <button type="button" className="btn-primary" onClick={() => { setConfirmDiscard(false); triggerExit(() => onOpenSalarySchedule()); }}>
                          Update salary instead
                        </button>
                      )}
                    </div>
                  </div>
                );
              }
              const flow = mode === 'income' || (mode === 'log' && isRefund) ? 'in' : 'out';
              const hint = (mode === 'log' || mode === 'income') && !dismissedAssists.person
                ? detectPersonHint({ description, flow, funds: personFunds })
                : null;
              if (hint) {
                const who = hint.personName || 'someone';
                const question = {
                  hold: `Is this ${who === 'someone' ? "someone's" : `${who}'s`} money to keep?`,
                  repaid: `Is ${who} paying back money you lent?`,
                  lend: `Lending this to ${who}?`,
                  return: `Giving back ${who === 'someone' ? "someone's" : `${who}'s`} money?`
                }[hint.action];
                return (
                  <div className="assist-banner" data-testid="assist-person">
                    <SparklesIcon size={14} />
                    <span>{question} It wouldn't count as {flow === 'in' ? 'income' : 'spending'}.</span>
                    <div className="assist-actions">
                      <button type="button" className="btn-subtle" onClick={() => setDismissedAssists((d) => ({ ...d, person: true }))}>No</button>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => {
                          setPersonPreset({ action: hint.action, fundId: hint.fund?.id || '', personName: hint.fund ? '' : hint.personName });
                          setMode('transfer');
                          setMoveTarget('person');
                        }}
                      >
                        Track as {hint.action === 'hold' || hint.action === 'return' ? 'held' : 'lent'}
                      </button>
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            {(() => {
              // Live "After this: ..." line for the account the entry touches
              if (mode === 'plan') return null;
              const isTransfer = mode === 'transfer';
              const pools = { bank: bankAccounts, wallet: wallets, credit_card: creditCards };
              const acc = (pools[accountType] || []).find((a) => String(a._id || a.id) === String(accountId));
              const flow = mode === 'income' || (mode === 'log' && isRefund) ? 'in' : 'out';
              if (isTransfer && accountType === 'credit_card') return null;
              return (
                <ConsequenceLine
                  account={acc}
                  accountType={accountType}
                  amount={Math.round(Math.abs(Number(amount) || 0) * 100)}
                  flow={flow}
                  simulation={simulation}
                  accountSimulations={accountSimulations}
                  currencySymbol={currencySymbol}
                />
              );
            })()}

            {/* Safety floor: confirm inline before saving (PreFlightSafetyFloor.test.jsx) */}
            {floorBreachData && (
              <div className="floor-confirm"
                data-testid="floor-breach-modal"
                role="alertdialog"
                aria-label="Safety floor warning"
              >
                <div className="floor-confirm-body">
                  <div className="entry-row-15">
                    <AlertTriangleIcon size={20} color="var(--rose)" />
                    <h3 className="entry-heading">
                      Safety Floor Warning
                    </h3>
                  </div>
                  <p className="entry-text-5">
                    This {floorBreachData.type === 'transfer' ? 'transfer' : 'transaction'} will drop{' '}
                    <strong className="entry-text-4">{floorBreachData.accountName}</strong> below your safety floor of{' '}
                    <strong className="entry-text-6">
                      {formatCurrency(floorBreachData.minimumBalance, currencySymbol)}
                    </strong>.
                    <br />
                    Projected balance:{' '}
                    <strong className="entry-text-6">
                      {formatCurrency(floorBreachData.projectedBalance, currencySymbol)}
                    </strong>.
                  </p>
                  <div className="entry-row-16">
                    <button
                      type="button"
                      className="btn-subtle entry-btn-9"
                      onClick={() => setFloorBreachData(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn-primary entry-btn-10"
                      onClick={() => {
                        const data = floorBreachData;
                        setFloorBreachData(null);
                        if (data.type === 'transfer') {
                          handleTransferSubmit(null, true);
                        } else {
                          handleTransactionSubmit(null, true, data.again);
                        }
                      }}
                    >
                      Confirm Anyway
                    </button>
                  </div>
                </div>
              </div>
            )}

            {initialItem && (
              <div className="edit-summary" data-testid="edit-summary">
                <p className="edit-summary-text">
                  {editChanges.length === 0
                    ? 'No changes yet'
                    : <>Changing: {editChanges.map((c, i) => (
                        <span key={c.label} className="edit-change">
                          {i > 0 && ' · '}{c.label} <span className="edit-from">{c.from || '—'}</span> → <strong>{c.to || '—'}</strong>
                        </span>
                      ))}</>}
                </p>
                <div className="edit-summary-actions">
                  {onConvertEntry && (mode === 'log' || mode === 'income') && !confirmDelete && (
                    <button type="button" className="link-btn" aria-expanded={showConvert} onClick={() => setShowConvert((v) => !v)}>
                      Change type
                    </button>
                  )}
                  {onDeleteEntry && !confirmDelete && (
                    <button type="button" className="link-btn danger" onClick={() => setConfirmDelete(true)}>Delete</button>
                  )}
                </div>
              </div>
            )}

            {initialItem && showConvert && (
              <div className="inline-confirm convert-menu" role="group" aria-label="Change type to" data-testid="convert-menu">
                <span>Change this {mode === 'income' ? 'income' : 'spend'} to:</span>
                <div className="inline-confirm-actions">
                  {[
                    ['log', 'Spend'],
                    ['income', 'Income'],
                    ['transfer', 'Move']
                  ].filter(([target]) => target !== mode).map(([target, label]) => (
                    <button
                      key={target}
                      type="button"
                      className="btn-subtle"
                      onClick={() => {
                        setShowConvert(false);
                        onConvertEntry(initialItem, target, {
                          amount: Math.round(Math.abs(Number(amount) || 0) * 100),
                          date,
                          note: description.trim(),
                          accountId,
                          category: tag
                        });
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <span className="field-hint">The {mode === 'income' ? 'income' : 'spend'} is replaced once the new entry is saved.</span>
              </div>
            )}

            {initialItem && confirmDelete && (
              <div className="inline-confirm" role="alertdialog" aria-label="Delete this entry?" data-testid="delete-confirm">
                <span>Delete this {mode === 'transfer' ? 'transfer' : (mode === 'plan' ? 'planned bill' : (mode === 'income' ? 'income' : 'spend'))}? This can't be undone.</span>
                <div className="inline-confirm-actions">
                  <button type="button" className="btn-subtle" onClick={() => setConfirmDelete(false)}>Keep</button>
                  <button
                    type="button"
                    className="btn-primary danger"
                    disabled={deleting}
                    onClick={async () => {
                      setDeleting(true);
                      setFormError('');
                      try {
                        await onDeleteEntry(initialItem);
                        triggerExit();
                      } catch (err) {
                        setFormError(err?.message || 'Could not delete. Please try again.');
                        setConfirmDelete(false);
                      } finally {
                        setDeleting(false);
                      }
                    }}
                  >
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            )}

            {(formError || (mode === 'transfer' && transferError)) && (
              <div className="form-error" role="alert">{formError || transferError}</div>
            )}

            {/* ---------------------------------------------------------------------
                SLOT 6: UNIFIED ACTION FOOTER (FIXED DOCKED FOOTER)
               --------------------------------------------------------------------- */}
            {(mode === 'plan' || canAddAnother) && (
            <div className="modal-footer-row">
              {/* Left corner: a new bill that's already paid is a spend; editing keeps the paid toggle */}
              {mode === 'plan' && !initialItem ? (
                <button type="button" className="link-btn" onClick={() => handleSwitchMode('log')}>
                  Already paid? Log it as spend
                </button>
              ) : mode === 'plan' ? (
                <div
                  className="recurring-toggle-switch"
                  onClick={() => setIsPaid((prev) => !prev)}
                  title={isPaid ? 'Payment done - click to toggle pending' : 'Payment pending - click to mark done'}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setIsPaid((prev) => !prev);
                    }
                  }}
                >
                  <div className={`recurring-toggle-track ${isPaid ? 'active' : ''}`}>
                    <div className="recurring-toggle-thumb" />
                  </div>
                  <span className={`recurring-toggle-label ${isPaid ? 'is-on' : ''}`}>
                    {isPaid ? 'Payment done' : 'Payment pending'}
                  </span>
                </div>
              ) : (
                <div />
              )}

              {canAddAnother && (
                <button
                  type="button"
                  className="btn-subtle entry-add-another"
                  onClick={submitAndAddAnother}
                  disabled={hasZeroAccounts || isSubmitting}
                  title="Ctrl + Enter (⌘ + Enter on Mac)"
                >
                  Add &amp; log another
                </button>
              )}
            </div>
            )}
          </form>
          )}

          {/* =========================================================================
              SECONDARY DECISION OVERLAYS & INTERCEPTIONS
             ========================================================================= */}


        </div>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? modal : createPortal(modal, document.body);
}

export default UnifiedEntryModal;
