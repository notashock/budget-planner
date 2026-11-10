import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  formatCurrency,
  formatDate,
  getRelativeDay,
  getDateFromRelativeDay
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
  AlertTriangleIcon
} from './Icons.jsx';
import { DatePicker } from './DatePicker.jsx';
import { SearchableItemPicker } from './SearchableItemPicker.jsx';
import { AccountSelect } from './AccountSelect.jsx';
import { api } from '../api.js';

/**
 * Quick increment preset configuration per mode.
 */
const QUICK_INCREMENTS = {
  log: [100, 500, 1000, 2000],
  plan: [100, 500, 1000, 2000],
  income: [500, 1000, 5000, 10000],
  transfer: [500, 1000, 2000, 5000]
};

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
  bankAccounts = [],
  wallets = [],
  currencySymbol = '₹',
  month,
  simulation = null,
  accountSimulations = {}
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
  const [incomeTag, setIncomeTag] = useState('Bonus');
  const [itemType, setItemType] = useState('one-time'); // 'one-time' | 'recurring'
  const [dayOfMonth, setDayOfMonth] = useState(now.getDate() || 1);
  const [priority, setPriority] = useState(0);
  const [isFixed, setIsFixed] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [matchedItemId, setMatchedItemId] = useState('');

  // UI status states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [underSpendData, setUnderSpendData] = useState(null);
  const [floorBreachData, setFloorBreachData] = useState(null);

  // Eligible planned items for matching
  const eligiblePlannedItems = useMemo(
    () => (plannedItems || []).filter((item) => item.type === 'one-time' || item.type === 'recurring'),
    [plannedItems]
  );

  // Candidate match based on entered amount
  const candidateMatch = useMemo(() => {
    if (!amount || isNaN(Number(amount)) || matchedItemId) return null;
    const numAmount = Math.round(Math.abs(Number(amount)) * 100);
    return eligiblePlannedItems.find((item) => !item.isPaid && item.amount === numAmount) || null;
  }, [amount, matchedItemId, eligiblePlannedItems]);

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

  // Initialize or reset state on open / initialItem change
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      isClosingRef.current = false;
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      setUnderSpendData(null);
      setFloorBreachData(null);
      setTransferError('');

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
          setAccountType(isWallet ? 'wallet' : 'bank');
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
          if (initialItem.destinationAccountId) {
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
        } else {
          // Plan mode
          setItemType(initialItem.type === 'recurring' ? 'recurring' : 'one-time');
          setDescription(initialItem.name || initialItem.title || '');
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
        setMode(initialMode || 'log');
        setAmount('');
        setIsRefund(false);
        setTag('Food');
        setIncomeTag('Salary');
        setDescription('');
        setMatchedItemId('');
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

        // Plan defaults
        setItemType('one-time');
        setPriority(0);
        setIsFixed(false);
        setIsPaid(false);
        setDayOfMonth(now.getDate() || 1);
      }
    } else {
      triggerExit();
    }
  }, [isOpen, initialItem, initialMode, month, bankAccounts, wallets, todayStr]);

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
    touchStartScrollTop.current = contentRef.current ? contentRef.current.scrollTop : 0;
    isDraggingSheet.current = false;
  };

  const handleTouchMove = (e) => {
    if (typeof window === 'undefined' || window.innerWidth >= 768 || !contentRef.current) return;
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
          triggerExit();
        } else {
          gsap.to(contentRef.current, { y: 0, duration: 0.18, ease: 'power2.out' });
          if (overlayRef.current) {
            gsap.to(overlayRef.current, { opacity: 1, duration: 0.18, ease: 'power2.out' });
          }
        }
      }
    }
  };

  // Keyboard Escape listener
  useEffect(() => {
    if (!shouldRender) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        triggerExit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shouldRender, triggerExit]);

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
  });

  // Quick Amount Presets
  const handleQuickIncrement = (inc) => {
    const cur = parseFloat(amount) || 0;
    setAmount(String(cur + inc));
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
    setMatchedItemId(id);
    if (id) {
      const selectedItem = eligiblePlannedItems.find((i) => (i._id || i.id) === id);
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
        alert(rec?.explanation || 'No safe date could be found this month without risking floor breach.');
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

  // Mode 1: Log Spending Submission
  const handleTransactionSubmit = async (e, forcedUnderSpendAction = null, bypassFloorCheck = false) => {
    if (e && e.preventDefault) e.preventDefault();
    if (isSubmittingRef.current) return;
    if (!amount || isNaN(Number(amount))) return;

    if (!accountId) {
      alert('Please select an active Bank Account or Wallet');
      return;
    }

    const baseAmount = Math.round(Math.abs(Number(amount)) * 100);
    const finalAmount = isRefund ? -baseAmount : baseAmount;

    // Safety Floor Check
    if (!isRefund && !bypassFloorCheck) {
      const selectedAccount = accountType === 'bank'
        ? bankAccounts.find((b) => (b.id || b._id) === accountId)
        : wallets.find((w) => (w.id || w._id) === accountId);

      if (selectedAccount) {
        const accBal = selectedAccount.currentBalance ?? selectedAccount.balance ?? selectedAccount.openingBalance ?? 0;
        const minBal = selectedAccount.minimumBalance || 0;
        if (minBal > 0 && (accBal - baseAmount) < minBal) {
          setFloorBreachData({
            type: 'spending',
            accountName: selectedAccount.name,
            minimumBalance: minBal,
            projectedBalance: accBal - baseAmount,
            forcedUnderSpendAction
          });
          return;
        }
      }
    }

    // Check under-spend when matched to a planned item
    if (matchedItemId && !isRefund && !forcedUnderSpendAction) {
      const linkedItem = eligiblePlannedItems.find((i) => (i._id || i.id) === matchedItemId);
      if (linkedItem && baseAmount < linkedItem.amount) {
        setUnderSpendData({
          linkedItem,
          spentAmt: baseAmount,
          plannedAmt: linkedItem.amount,
          diffAmt: linkedItem.amount - baseAmount
        });
        return;
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
        plannedItemId: matchedItemId || null,
        accountType,
        accountId,
        bankAccountId: accountType === 'bank' ? accountId : null,
        walletId: accountType === 'wallet' ? accountId : null
      };
      if (forcedUnderSpendAction) {
        await onLogTransaction(txPayload, forcedUnderSpendAction);
      } else {
        await onLogTransaction(txPayload);
      }
      setUnderSpendData(null);
    } catch {
      // Handled in parent
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Mode 2: Log Direct Income Submission
  const handleIncomeSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (isSubmittingRef.current) return;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      alert('Please enter a valid positive income amount');
      return;
    }

    if (!accountId) {
      alert('Please select an active Bank Account or Wallet');
      return;
    }

    const baseAmount = Math.round(Math.abs(Number(amount)) * 100);

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      await onLogTransaction({
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
        walletId: accountType === 'wallet' ? accountId : null
      });
      triggerExit();
    } catch {
      // Handled in parent
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Mode 3: Plan Item Submission
  const handlePlanSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (isSubmittingRef.current) return;
    if (!description.trim()) return;

    if (!accountId) {
      alert('Please select an active Bank Account or Wallet');
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
      bankAccountId: accountType === 'bank' ? accountId : null,
      walletId: accountType === 'wallet' ? accountId : null
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
      await onSaveItem(payload);
    } catch {
      // Handled in parent
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

    if (!accountId || !destAccountId) {
      setTransferError('Both source and destination accounts are required.');
      return;
    }

    if (accountType === destAccountType && accountId === destAccountId) {
      setTransferError('Source and destination accounts must be different.');
      return;
    }

    const xferAmt = Math.round(Number(amount) * 100);

    // Safety Floor Check on source account
    if (!bypassFloorCheck) {
      const sourceAccount = accountType === 'bank'
        ? bankAccounts.find((b) => (b.id || b._id) === accountId)
        : wallets.find((w) => (w.id || w._id) === accountId);

      if (sourceAccount) {
        const sourceBal = sourceAccount.currentBalance ?? sourceAccount.balance ?? sourceAccount.openingBalance ?? 0;
        const sourceMin = sourceAccount.minimumBalance || 0;
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
        destinationType: destAccountType,
        destinationBankAccountId: destAccountType === 'bank' ? destAccountId : null,
        destinationWalletId: destAccountType === 'wallet' ? destAccountId : null,
        note: description.trim()
      };

      if (onCreateTransfer) {
        await onCreateTransfer(payload);
      }
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
    if (mode === 'log') handleTransactionSubmit(e);
    else if (mode === 'income') handleIncomeSubmit(e);
    else if (mode === 'plan') handlePlanSubmit(e);
    else if (mode === 'transfer') handleTransferSubmit(e);
  };

  return (
    <div ref={containerRef}>
      <div
        ref={overlayRef}
        className="modal-overlay"
        onClick={() => triggerExit()}
      >
        <div
          ref={contentRef}
          className={`modal-content ${isExpanded ? 'is-expanded' : ''}`}
          onClick={(e) => e.stopPropagation()}
          onScroll={handleScroll}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ maxWidth: '520px' }}
        >
          {/* Mobile bottom-sheet grab zone & handle */}
          <div className="modal-drag-zone">
            <div className="modal-drag-handle" />
          </div>

          {/* Modal Header & Symmetrical Mode Switcher */}
          <div
            className="modal-header-row"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              marginBottom: '12px'
            }}
          >
            <div className="modal-tab-track" style={{ flex: 1, maxWidth: '440px' }}>
              <div ref={indicatorRef} className="modal-tab-indicator" />
              <button
                ref={logBtnRef}
                type="button"
                className={`modal-tab-btn timeline-filter-btn ${mode === 'log' ? 'active' : ''}`}
                data-active={mode === 'log' ? 'true' : 'false'}
                onClick={() => handleSwitchMode('log')}
                aria-label="Spending"
                title="Log Spending"
                style={{ flex: 1, justifyContent: 'center' }}
              >
                <ZapIcon size={14} />
                <span>Spending</span>
              </button>
              <button
                ref={incomeBtnRef}
                type="button"
                className={`modal-tab-btn timeline-filter-btn ${mode === 'income' ? 'active' : ''}`}
                data-active={mode === 'income' ? 'true' : 'false'}
                onClick={() => handleSwitchMode('income')}
                aria-label="Income"
                title="Log Income"
                style={{ flex: 1, justifyContent: 'center' }}
              >
                <TrendingUpIcon size={14} />
                <span>Income</span>
              </button>
              <button
                ref={planBtnRef}
                type="button"
                className={`modal-tab-btn timeline-filter-btn ${mode === 'plan' ? 'active' : ''}`}
                data-active={mode === 'plan' ? 'true' : 'false'}
                onClick={() => handleSwitchMode('plan')}
                aria-label="Plan Transaction"
                title="Plan Transaction"
                style={{ flex: 1, justifyContent: 'center' }}
              >
                <PlusIcon size={14} />
                <span>Plan</span>
              </button>
              <button
                ref={transferBtnRef}
                type="button"
                className={`modal-tab-btn timeline-filter-btn ${mode === 'transfer' ? 'active' : ''}`}
                data-active={mode === 'transfer' ? 'true' : 'false'}
                onClick={() => handleSwitchMode('transfer')}
                aria-label="Transfer"
                title="Transfer Funds"
                style={{ flex: 1, justifyContent: 'center' }}
              >
                <ArrowRightLeftIcon size={14} />
                <span>Transfer</span>
              </button>
            </div>

            <button
              type="button"
              className="btn-icon modal-close-btn"
              onClick={() => triggerExit()}
              title="Close modal"
              aria-label="Close"
              style={{
                width: '36px',
                height: '36px',
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px'
              }}
            >
              <XIcon size={16} />
            </button>
          </div>

          {/* Transfer Error Alert */}
          {mode === 'transfer' && transferError && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                background: 'var(--text)',
                color: 'var(--bg)',
                fontSize: '12px',
                fontWeight: 600,
                marginBottom: '10px'
              }}
            >
              {transferError}
            </div>
          )}

          {/* =========================================================================
              THE UNIVERSAL 6-SLOT FORM VIEW
              Identical spatial sequence across all 4 modes.
             ========================================================================= */}
          <form
            ref={formRef}
            onSubmit={handleSubmitRouter}
            style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
          >
            {/* ---------------------------------------------------------------------
                SLOT 1: HERO AMOUNT & PRIMARY DIRECTION MODIFIER
               --------------------------------------------------------------------- */}
            <div className="form-group" style={{ margin: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className="form-label" style={{ margin: 0 }}>
                  {mode === 'log' && `Amount (${currencySymbol})`}
                  {mode === 'income' && `Income Amount (${currencySymbol}) *`}
                  {mode === 'plan' && `Planned amount (${currencySymbol})`}
                  {mode === 'transfer' && `Transfer Amount (${currencySymbol}) *`}
                </label>

                {/* Slot 1 Modifier Pill / Segment */}
                {mode === 'log' && (
                  <button
                    type="button"
                    className={`btn-subtle ${isRefund ? 'credit-active-btn' : ''}`}
                    style={{
                      padding: '3px 10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      border: isRefund ? '1px solid var(--text)' : '1px solid var(--border)',
                      background: isRefund ? 'var(--text)' : 'var(--surface)',
                      color: isRefund ? 'var(--bg)' : 'var(--text-secondary)',
                      transition: 'all 0.15s ease',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    onClick={(e) => handleMicroPress(e, () => setIsRefund((prev) => !prev))}
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

                {mode === 'income' && (
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: '4px',
                      background: 'var(--success-subtle, rgba(34, 197, 94, 0.12))',
                      color: 'var(--success)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <TrendingUpIcon size={12} />
                    <span>Direct Inflow</span>
                  </span>
                )}

                {mode === 'plan' && (
                  <div style={{ display: 'inline-flex', borderRadius: '4px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                    <button
                      type="button"
                      className={itemType === 'one-time' ? 'btn-primary' : 'btn-subtle'}
                      onClick={(e) => handleMicroPress(e, () => setItemType('one-time'))}
                      style={{ padding: '3px 8px', fontSize: '11px', borderRadius: 0 }}
                    >
                      One-Time
                    </button>
                    <button
                      type="button"
                      className={itemType === 'recurring' ? 'btn-primary' : 'btn-subtle'}
                      onClick={(e) => handleMicroPress(e, () => setItemType('recurring'))}
                      style={{ padding: '3px 8px', fontSize: '11px', borderRadius: 0 }}
                    >
                      Recurring
                    </button>
                  </div>
                )}

                {mode === 'transfer' && (
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: '4px',
                      background: 'var(--surface-subtle)',
                      color: 'var(--text-secondary)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <ArrowRightLeftIcon size={12} />
                    <span>Zero-Sum</span>
                  </span>
                )}
              </div>

              {/* Big Numerical Amount Input */}
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min={mode === 'transfer' ? '0.01' : undefined}
                required
                autoFocus
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="tabular-nums"
                style={{
                  fontSize: '22px',
                  fontWeight: 700,
                  padding: '10px 14px',
                  color: 'var(--text)',
                  borderColor: isRefund ? 'var(--text)' : undefined,
                  width: '100%'
                }}
              />

              {/* Quick Increment Shortcut Chips */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                {(QUICK_INCREMENTS[mode] || [100, 500, 1000, 2000]).map((inc) => (
                  <button
                    key={`quick-${inc}`}
                    type="button"
                    className="quick-amt-chip"
                    onClick={() => handleQuickIncrement(inc)}
                  >
                    +{inc >= 1000 ? `${inc / 1000}k` : inc}
                  </button>
                ))}
                {amount && (
                  <button
                    type="button"
                    className="quick-amt-chip"
                    onClick={handleQuickClear}
                    style={{ color: 'var(--rose, #f43f5e)', borderColor: 'var(--rose-subtle, rgba(244,63,94,0.2))' }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* ---------------------------------------------------------------------
                SLOT 2: PRIMARY ACCOUNT SELECTOR
               --------------------------------------------------------------------- */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">
                {mode === 'log' && 'Payment Account *'}
                {mode === 'income' && 'Deposited To (Account) *'}
                {mode === 'plan' && 'Dedicated Account *'}
                {mode === 'transfer' && 'Source Account (Outflow) *'}
              </label>

              {hasZeroAccounts ? (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'var(--surface-subtle)',
                    border: '1px solid var(--border)',
                    marginBottom: '4px'
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                    Bank Account Required
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    You must register a bank account before recording transactions.
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ width: '100%', padding: '6px 10px', fontSize: '11px' }}
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
                  currencySymbol={currencySymbol}
                  simulation={simulation}
                  accountSimulations={accountSimulations}
                />
              )}
            </div>

            {/* ---------------------------------------------------------------------
                SLOT 3: CATEGORY / CLASSIFICATION (OR TRANSFER DESTINATION)
               --------------------------------------------------------------------- */}
            <div className="form-group" style={{ margin: 0 }}>
              {mode !== 'transfer' ? (
                <>
                  <label className="form-label">
                    {mode === 'log' && 'Category tag'}
                    {mode === 'income' && 'Income Category / Source'}
                    {mode === 'plan' && 'Category & Classification'}
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {mode === 'income'
                      ? ['Bonus', 'Freelance', 'Investment', 'Other'].map((t) => (
                          <button
                            key={t}
                            type="button"
                            className={incomeTag === t ? 'btn-primary' : 'btn-subtle'}
                            onClick={(e) => handleMicroPress(e, () => setIncomeTag(t))}
                            style={{
                              padding: '5px 12px',
                              fontSize: '11.5px',
                              fontWeight: incomeTag === t ? 600 : 400,
                              borderRadius: '6px',
                              border: incomeTag === t ? undefined : '1px solid var(--border)'
                            }}
                          >
                            {t}
                          </button>
                        ))
                      : ['Food', 'Travel', 'Health', 'Other'].map((t) => (
                          <button
                            key={t}
                            type="button"
                            className={tag === t ? 'btn-primary' : 'btn-subtle'}
                            onClick={(e) => handleMicroPress(e, () => setTag(t))}
                            style={{
                              padding: '5px 12px',
                              fontSize: '11.5px',
                              fontWeight: tag === t ? 600 : 400,
                              borderRadius: '6px',
                              border: tag === t ? undefined : '1px solid var(--border)'
                            }}
                          >
                            {t}
                          </button>
                        ))}
                  </div>
                  {mode === 'income' && (
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '6px' }}>
                      Note: Your primary monthly salary is managed via Link Salary & Safeline. Use this form to record ad-hoc earnings, bonuses, or side income.
                    </span>
                  )}
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label className="form-label" style={{ margin: 0 }}>Destination Account (Inflow) *</label>
                    <button
                      type="button"
                      className="btn-subtle"
                      onClick={handleInvertTransferAccounts}
                      style={{ fontSize: '11px', padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      title="Swap source and destination"
                    >
                      <span>⇅ Invert</span>
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
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">
                {mode === 'plan' ? 'Name / Description *' : 'Description note (optional)'}
              </label>
              <input
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
                onChange={(e) => setDescription(e.target.value)}
                style={{ width: '100%' }}
              />

              {/* Mode-Specific Contextual Details below Description */}

              {/* SPENDING: Candidate match banner & Planned Item Matcher */}
              {mode === 'log' && (
                <div style={{ marginTop: '8px' }}>
                  {candidateMatch && !matchedItemId && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        marginBottom: '8px',
                        background: 'var(--indigo-subtle, rgba(99, 102, 241, 0.08))',
                        border: '1px solid var(--indigo-border, rgba(99, 102, 241, 0.2))',
                        borderRadius: 'var(--radius, 8px)',
                        fontSize: '12px',
                        gap: '8px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
                        <SparklesIcon size={14} style={{ color: 'var(--indigo, #6366f1)', flexShrink: 0 }} />
                        <span style={{ color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          Matches: <strong>{candidateMatch.name}</strong> ({formatCurrency(candidateMatch.amount, currencySymbol)})
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-subtle"
                        onClick={() => handleSelectMatchedItem(candidateMatch._id || candidateMatch.id)}
                        style={{
                          fontSize: '11px',
                          padding: '4px 8px',
                          height: 'auto',
                          color: 'var(--indigo, #6366f1)',
                          borderColor: 'var(--indigo-border, rgba(99, 102, 241, 0.2))',
                          fontWeight: 600,
                          flexShrink: 0
                        }}
                      >
                        Link & Settle
                      </button>
                    </div>
                  )}

                  <SearchableItemPicker
                    items={eligiblePlannedItems}
                    selectedId={matchedItemId}
                    onSelect={handleSelectMatchedItem}
                    currencySymbol={currencySymbol}
                  />

                  <span
                    style={{
                      fontSize: '11px',
                      marginTop: '4px',
                      display: 'block',
                      color: isRefund ? 'var(--success)' : 'var(--text-muted, var(--text-secondary))',
                      fontWeight: isRefund ? 500 : 400
                    }}
                  >
                    {matchedItemId
                      ? isRefund
                        ? 'Applies this refund as a credit to the item, reducing its net cost.'
                        : 'Fulfills and replaces the planned item to prevent double-counting.'
                      : isRefund
                      ? 'Adds this credit/refund directly into your monthly cash reserve.'
                      : 'Logs as unexpected spending, reducing your safe-to-spend allowance.'}
                  </span>
                </div>
              )}

              {/* INCOME: Scheduled Base Salary Info Card */}
              {mode === 'income' && month?.incomeAmount && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'var(--surface-subtle)',
                    border: '1px solid var(--border)',
                    marginTop: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      Scheduled Monthly Salary
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>
                      +{currencySymbol}{(month.incomeAmount / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>
                      Deposit Target:{' '}
                      <strong style={{ color: 'var(--text)' }}>
                        {(() => {
                          const bId = month.salaryBankAccountId?._id || month.salaryBankAccountId;
                          const b = bankAccounts.find((x) => (x._id || x.id) === bId);
                          return b ? b.name : (bId ? 'Assigned Bank' : 'Unassigned');
                        })()}
                      </strong>
                    </span>
                    <span>
                      Day: <strong style={{ color: 'var(--text)' }}>{month.incomeCreditDate || `Day ${month.salaryDepositDay || 1}`}</strong>
                    </span>
                  </div>
                </div>
              )}

              {/* PLAN: Same-Day Priority Selector & Fixed Need Toggle */}
              {mode === 'plan' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                  {/* Same-day priority */}
                  <div>
                    <label className="form-label" style={{ marginBottom: '4px' }}>Same-day priority</label>
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

                  {/* Fixed need toggle */}
                  <div
                    style={{
                      padding: '8px 12px',
                      background: isFixed ? 'var(--surface)' : 'var(--surface-subtle)',
                      borderRadius: 'var(--radius, 8px)',
                      border: isFixed ? '1px solid var(--text)' : '1px solid var(--border)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', margin: 0 }}>
                      <div>
                        <div style={{ fontSize: '12.5px', fontWeight: 600 }}>
                          {isFixed ? 'Fixed expense (auto-carry forward)' : 'Variable expense (flexible)'}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {isFixed
                            ? 'Carries forward to next month automatically on rollover.'
                            : 'Flexible variable expense specific to this cycle.'}
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={isFixed}
                        onChange={(e) => setIsFixed(e.target.checked)}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* TRANSFER: Zero-sum informational note */}
              {mode === 'transfer' && (
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  * Paired transfers are zero-sum on your monthly budget curve ($0 net change to total liquid cash).
                </div>
              )}
            </div>

            {/* ---------------------------------------------------------------------
                SLOT 5: DATE & SCHEDULE SELECTOR
               --------------------------------------------------------------------- */}
            <div className="form-group" style={{ margin: 0 }}>
              {mode === 'plan' && itemType === 'recurring' ? (
                <>
                  <label className="form-label">Day of month (1 - 31)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="31"
                    required
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(Math.max(1, Math.min(31, parseInt(e.target.value, 10) || 1)))}
                  />
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <label className="form-label" style={{ margin: 0 }}>
                      {mode === 'plan' ? 'Planned payment date' : 'Date'}
                    </label>

                    {mode === 'plan' && !isPaid && (
                      <button
                        type="button"
                        className="sparkle-action-link"
                        onClick={handleRecommendDate}
                        disabled={recommending}
                        title="Recommend best safe date based on spending pace, balance, and floor buffer"
                      >
                        <SparklesIcon size={12} className={recommending ? 'sparkle-spin-icon' : ''} />
                        <span>{recommending ? 'Analyzing...' : 'Recommend best date'}</span>
                      </button>
                    )}
                  </div>

                  <DatePicker
                    value={date}
                    onChange={(d) => setDate(d)}
                    placeholder={mode === 'plan' ? 'Leave blank for auto-recommended safe date' : undefined}
                    month={month}
                    required={mode !== 'plan'}
                  />
                </>
              )}
            </div>

            {/* ---------------------------------------------------------------------
                SLOT 6: UNIFIED ACTION FOOTER
               --------------------------------------------------------------------- */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                marginTop: '8px',
                paddingTop: '12px',
                borderTop: '1px solid var(--border)'
              }}
            >
              {/* Left corner: Payment status toggle for Plan mode */}
              {mode === 'plan' ? (
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
                  <span style={{ fontSize: '12px', fontWeight: 600, color: isPaid ? 'var(--text)' : 'var(--text-secondary)' }}>
                    {isPaid ? 'Payment done' : 'Payment pending'}
                  </span>
                </div>
              ) : (
                <div />
              )}

              {/* Right corner: Symmetrical Cancel & Submit Actions */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => triggerExit()}>
                  Cancel
                </button>

                {mode === 'log' && (
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={hasZeroAccounts || isSubmitting}
                    style={{
                      padding: '10px 20px',
                      background: isRefund ? 'var(--success)' : undefined,
                      borderColor: isRefund ? 'var(--success)' : undefined
                    }}
                  >
                    {isSubmitting
                      ? (initialItem ? 'Updating...' : 'Logging...')
                      : (initialItem
                          ? (isRefund ? 'Update credit inflow' : 'Update expense debit')
                          : (isRefund ? 'Log credit inflow' : 'Log expense debit'))}
                  </button>
                )}

                {mode === 'income' && (
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={hasZeroAccounts || isSubmitting}
                    style={{
                      padding: '10px 20px',
                      background: 'var(--success)',
                      borderColor: 'var(--success)'
                    }}
                  >
                    {isSubmitting
                      ? (initialItem ? 'Updating...' : 'Recording...')
                      : (initialItem ? 'Update Income Credit' : 'Record Income')}
                  </button>
                )}

                {mode === 'plan' && (
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={hasZeroAccounts || isSubmitting}
                    style={{ padding: '10px 20px' }}
                  >
                    {isSubmitting
                      ? (initialItem ? 'Updating...' : 'Saving...')
                      : (initialItem
                          ? 'Update planned transaction'
                          : (itemType === 'recurring' ? 'Save recurring item' : 'Save planned item'))}
                  </button>
                )}

                {mode === 'transfer' && (
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={isSubmitting}
                    style={{ padding: '10px 20px' }}
                  >
                    {isSubmitting ? 'Recording...' : 'Record Transfer'}
                  </button>
                )}
              </div>
            </div>
          </form>

          {/* =========================================================================
              SECONDARY DECISION OVERLAYS & INTERCEPTIONS
             ========================================================================= */}

          {/* Safety Floor Breach Warning Card (Satisfies PreFlightSafetyFloor.test.jsx) */}
          {floorBreachData && (
            <div
              data-testid="floor-breach-modal"
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(15, 23, 42, 0.75)',
                backdropFilter: 'blur(5px)',
                zIndex: 1105,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px'
              }}
            >
              <div
                className="modal-content"
                style={{
                  maxWidth: '440px',
                  width: '100%',
                  background: 'var(--surface-elevated, #18181b)',
                  border: '1px solid var(--rose-border, #dc2626)',
                  borderRadius: '12px',
                  padding: '20px',
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <AlertTriangleIcon size={20} color="var(--rose, #ef4444)" />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
                    Safety Floor Warning
                  </h3>
                </div>
                <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  This {floorBreachData.type === 'transfer' ? 'transfer' : 'transaction'} will drop{' '}
                  <strong style={{ color: 'var(--text)' }}>{floorBreachData.accountName}</strong> below your safety floor of{' '}
                  <strong style={{ color: 'var(--rose, #ef4444)' }}>
                    {formatCurrency(floorBreachData.minimumBalance, currencySymbol)}
                  </strong>.
                  <br />
                  Projected balance:{' '}
                  <strong style={{ color: 'var(--rose, #ef4444)' }}>
                    {formatCurrency(floorBreachData.projectedBalance, currencySymbol)}
                  </strong>.
                </p>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn-subtle"
                    onClick={() => setFloorBreachData(null)}
                    style={{ padding: '8px 16px', fontSize: '13px' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      const data = floorBreachData;
                      setFloorBreachData(null);
                      if (data.type === 'transfer') {
                        handleTransferSubmit(null, true);
                      } else {
                        handleTransactionSubmit(null, data.forcedUnderSpendAction, true);
                      }
                    }}
                    style={{
                      padding: '8px 16px',
                      fontSize: '13px',
                      background: 'var(--rose, #dc2626)',
                      borderColor: 'var(--rose, #dc2626)'
                    }}
                  >
                    Confirm Anyway
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Under-Spend Settlement Modal */}
          {underSpendData && (
            <div
              data-testid="under-spend-modal"
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(15, 23, 42, 0.75)',
                backdropFilter: 'blur(5px)',
                zIndex: 1100,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px'
              }}
            >
              <div
                className="modal-content"
                style={{
                  maxWidth: '440px',
                  width: '100%',
                  background: 'var(--surface-elevated, #18181b)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '20px',
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
                }}
              >
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <SparklesIcon size={18} style={{ color: 'var(--indigo, #6366f1)' }} />
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                      Settlement for {underSpendData.linkedItem.name}
                    </h3>
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    You logged spending of{' '}
                    <strong style={{ color: 'var(--text)' }}>{formatCurrency(underSpendData.spentAmt, currencySymbol)}</strong>,
                    which is{' '}
                    <strong style={{ color: 'var(--success)' }}>{formatCurrency(underSpendData.diffAmt, currencySymbol)}</strong>{' '}
                    less than planned ({formatCurrency(underSpendData.plannedAmt, currencySymbol)}).
                    How should the remaining amount be handled?
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() =>
                      handleTransactionSubmit(null, {
                        action: 'release',
                        spentAmt: underSpendData.spentAmt,
                        itemId: underSpendData.linkedItem._id || underSpendData.linkedItem.id
                      })
                    }
                    style={{
                      padding: '12px 14px',
                      textAlign: 'left',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      background: 'var(--success)',
                      borderColor: 'var(--success)'
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: '13px' }}>
                      Release remaining {formatCurrency(underSpendData.diffAmt, currencySymbol)} to balance
                    </span>
                    <span style={{ fontSize: '11px', opacity: 0.85, fontWeight: 400 }}>
                      Frees remaining money into your safe-to-spend allowance and marks item paid.
                    </span>
                  </button>

                  <button
                    type="button"
                    className="btn-subtle"
                    onClick={() =>
                      handleTransactionSubmit(null, {
                        action: 'keep_remainder',
                        spentAmt: underSpendData.spentAmt,
                        remainderAmt: underSpendData.diffAmt,
                        itemId: underSpendData.linkedItem._id || underSpendData.linkedItem.id
                      })
                    }
                    style={{
                      padding: '12px 14px',
                      textAlign: 'left',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: '13px' }}>
                      Keep remainder scheduled ({formatCurrency(underSpendData.diffAmt, currencySymbol)})
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 400 }}>
                      Marks spent amount paid and keeps a new pending item for the remaining expense.
                    </span>
                  </button>

                  <button
                    type="button"
                    className="btn-subtle"
                    onClick={() => setUnderSpendData(null)}
                    style={{ fontSize: '12px', padding: '6px 12px', marginTop: '4px' }}
                  >
                    Back to editing
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default UnifiedEntryModal;
