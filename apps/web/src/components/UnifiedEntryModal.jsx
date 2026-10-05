import React, { useState, useEffect, useRef, useCallback } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  formatCurrency,
  formatDate,
  getRelativeDay,
  getDateFromRelativeDay
} from '@budget/engine';
import {
  ZapIcon,
  PlusIcon,
  TagIcon,
  CalendarIcon,
  RefreshIcon,
  CheckCircleIcon,
  SparklesIcon,
  ArrowRightLeftIcon,
  BuildingLibraryIcon,
  WalletIcon,
  TrendingUpIcon
} from './Icons.jsx';
import { SearchableItemPicker } from './SearchableItemPicker.jsx';
import { DatePicker } from './DatePicker.jsx';
import { CustomSelect } from './CustomSelect.jsx';
import { api } from '../api.js';

gsap.registerPlugin(useGSAP);

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
  month
}) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isExpanded, setIsExpanded] = useState(false);
  const isClosingRef = useRef(false);

  const containerRef = useRef(null);
  const overlayRef = useRef(null);
  const contentRef = useRef(null);
  const logBtnRef = useRef(null);
  const incomeBtnRef = useRef(null);
  const planBtnRef = useRef(null);
  const transferBtnRef = useRef(null);
  const indicatorRef = useRef(null);
  const formRef = useRef(null);

  // Gesture tracking refs for mobile 2-stage bottom-to-top slider
  const touchStartY = useRef(0);
  const touchStartScrollTop = useRef(0);
  const isDraggingSheet = useRef(false);
  const touchStartTime = useRef(0);

  const [mode, setMode] = useState('log'); // 'log' | 'income' | 'plan' | 'transfer'

  // --- Income State ---
  const [incAmount, setIncAmount] = useState('');
  const [incDate, setIncDate] = useState('');
  const [incTag, setIncTag] = useState('Salary');
  const [incNote, setIncNote] = useState('');
  const [incAccountType, setIncAccountType] = useState('bank');
  const [incBankAccountId, setIncBankAccountId] = useState('');
  const [incWalletId, setIncWalletId] = useState('');

  // --- Transaction State ---
  const [txAmount, setTxAmount] = useState('');
  const [isRefund, setIsRefund] = useState(false);
  const [tag, setTag] = useState('Food');
  const [note, setNote] = useState('');
  const [matchedItemId, setMatchedItemId] = useState('');
  const [txDate, setTxDate] = useState('');
  const [txAccountType, setTxAccountType] = useState('unassigned');
  const [txBankAccountId, setTxBankAccountId] = useState('');
  const [txWalletId, setTxWalletId] = useState('');

  // --- Plan Item State ---
  const [itemType, setItemType] = useState('one-time');
  const [itemName, setItemName] = useState('');
  const [priority, setPriority] = useState(0);
  const [itemAmount, setItemAmount] = useState('');
  const [itemDate, setItemDate] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [isFixed, setIsFixed] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [itemAccountType, setItemAccountType] = useState('unassigned');
  const [itemBankAccountId, setItemBankAccountId] = useState('');
  const [itemWalletId, setItemWalletId] = useState('');

  // --- Transfer State ---
  const [transferDate, setTransferDate] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferSourceType, setTransferSourceType] = useState('bank');
  const [transferSourceId, setTransferSourceId] = useState('');
  const [transferDestType, setTransferDestType] = useState('wallet');
  const [transferDestId, setTransferDestId] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [transferError, setTransferError] = useState('');

  // Lock outer background body scroll while the sheet is rendered
  useEffect(() => {
    if (shouldRender) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [shouldRender]);

  // Sync internal render state with isOpen prop
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      isClosingRef.current = false;
      setIsExpanded(false);
    } else if (shouldRender && !isClosingRef.current) {
      triggerExit();
    }
  }, [isOpen]);

  // Form initialization
  useEffect(() => {
    if (!isOpen) return;

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    setIsExpanded(false);
    setTransferError('');

    // Precalculate primary accounts
    const primaryBank = bankAccounts.find((b) => b.isPrimary) || bankAccounts[0];
    const primaryWallet = wallets.find((w) => w.isPrimary) || wallets[0];

    if (initialItem) {
      setMode('plan');
      setItemType(initialItem.type === 'recurring' ? 'recurring' : 'one-time');
      setItemName(initialItem.name);
      setPriority(initialItem.priority ?? 0);
      setIsFixed(Boolean(initialItem.isFixed));
      setIsPaid(Boolean(initialItem.isPaid));
      const initAcctType = (initialItem.accountType === 'wallet' || initialItem.walletId) ? 'wallet' : 'bank';
      setItemAccountType(initAcctType);
      const bId = initialItem.bankAccountId?._id || initialItem.bankAccountId || (initAcctType === 'bank' ? (primaryBank?._id || primaryBank?.id || '') : '');
      const wId = initialItem.walletId?._id || initialItem.walletId || (initAcctType === 'wallet' ? (primaryWallet?._id || primaryWallet?.id || '') : '');
      setItemBankAccountId(bId);
      setItemWalletId(wId);

      const year = month?.year || now.getFullYear();
      const monthNum = month?.month || (now.getMonth() + 1);

      if (initialItem.type === 'recurring') {
        setItemAmount((initialItem.amount / 100).toString());
        setDayOfMonth(initialItem.dayOfMonth || 1);
      } else {
        setItemAmount(initialItem.amount ? (initialItem.amount / 100).toString() : '');
        if (typeof initialItem.day === 'number' && initialItem.day < 0) {
          setItemDate(initialItem.date || getDateFromRelativeDay(initialItem.day, year, monthNum));
        } else {
          setItemDate(initialItem.date || formatDate(year, monthNum, initialItem.day || 1));
        }
      }
    } else {
      setMode(initialMode || 'log');
      setTxAmount('');
      setIsRefund(false);
      setTag('Food');
      setNote('');
      setMatchedItemId('');
      setTxDate(todayStr);

      if (primaryBank) {
        setTxAccountType('bank');
        setTxBankAccountId(primaryBank._id || primaryBank.id || '');
        setTxWalletId('');
      } else if (primaryWallet) {
        setTxAccountType('wallet');
        setTxWalletId(primaryWallet._id || primaryWallet.id || '');
        setTxBankAccountId('');
      } else {
        setTxAccountType('bank');
        setTxBankAccountId('');
        setTxWalletId('');
      }

      setItemType('one-time');
      setItemName('');
      setPriority(0);
      setIsFixed(false);
      setIsPaid(false);
      setItemAmount('');
      setItemDate('');
      setDayOfMonth(now.getDate() || 1);
      if (primaryBank) {
        setItemAccountType('bank');
        setItemBankAccountId(primaryBank._id || primaryBank.id || '');
        setItemWalletId('');
      } else if (primaryWallet) {
        setItemAccountType('wallet');
        setItemWalletId(primaryWallet._id || primaryWallet.id || '');
        setItemBankAccountId('');
      } else {
        setItemAccountType('bank');
        setItemBankAccountId('');
        setItemWalletId('');
      }

      // Transfer defaults
      setTransferDate(todayStr);
      setTransferAmount('');
      setTransferNote('');
      setTransferSourceType(primaryBank ? 'bank' : (wallets[0] ? 'wallet' : 'bank'));
      setTransferSourceId(primaryBank?._id || primaryBank?.id || bankAccounts[0]?._id || '');
      setTransferDestType(primaryWallet ? 'wallet' : (bankAccounts[1] ? 'bank' : 'wallet'));
      setTransferDestId(primaryWallet?._id || primaryWallet?.id || wallets[0]?._id || '');

      // Income defaults
      setIncAmount('');
      setIncDate(todayStr);
      setIncTag('Salary');
      setIncNote('');
      const salaryBankId = month?.salaryBankAccountId?._id || month?.salaryBankAccountId;
      if (salaryBankId && bankAccounts.some((b) => (b._id || b.id) === salaryBankId)) {
        setIncAccountType('bank');
        setIncBankAccountId(salaryBankId);
        setIncWalletId('');
      } else if (primaryBank) {
        setIncAccountType('bank');
        setIncBankAccountId(primaryBank._id || primaryBank.id || '');
        setIncWalletId('');
      } else if (primaryWallet) {
        setIncAccountType('wallet');
        setIncWalletId(primaryWallet._id || primaryWallet.id || '');
        setIncBankAccountId('');
      } else {
        setIncAccountType('bank');
        setIncBankAccountId('');
        setIncWalletId('');
      }
    }
  }, [isOpen, initialItem, initialMode, month, bankAccounts, wallets]);

  const { contextSafe } = useGSAP({ scope: containerRef });

  // Update sliding segmented pill position
  const updateTabIndicator = useCallback((targetMode, immediate = false) => {
    if (!indicatorRef.current) return;
    let activeBtn = logBtnRef.current;
    if (targetMode === 'income') activeBtn = incomeBtnRef.current;
    else if (targetMode === 'plan') activeBtn = planBtnRef.current;
    else if (targetMode === 'transfer') activeBtn = transferBtnRef.current;
    if (!activeBtn) return;

    const track = activeBtn.parentElement;
    if (!track) return;

    const trackRect = track.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    const targetX = btnRect.left - trackRect.left;
    const targetWidth = btnRect.width;

    if (immediate) {
      gsap.set(indicatorRef.current, { x: targetX, width: targetWidth });
    } else {
      gsap.to(indicatorRef.current, {
        x: targetX,
        width: targetWidth,
        duration: 0.22,
        ease: 'power2.out'
      });
    }
  }, []);

  // Exit animation execution
  const triggerExit = contextSafe((onDone) => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
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
        {
          opacity: 0,
          duration: 0.18,
          ease: 'power2.in'
        },
        0
      );
    }
  });

  // Entrance animation on mount
  useGSAP(() => {
    if (!shouldRender || isClosingRef.current) return;

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
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

    if (formRef.current) {
      const items = formRef.current.children;
      if (items.length) {
        gsap.fromTo(
          items,
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, stagger: 0.02, duration: 0.22, delay: 0.04, ease: 'power2.out', clearProps: 'transform' }
        );
      }
    }
  }, { dependencies: [shouldRender], scope: containerRef });

  // Mode change animation & indicator sync
  useGSAP(() => {
    if (!shouldRender) return;

    updateTabIndicator(mode, false);

    if (formRef.current) {
      const items = formRef.current.children;
      if (items.length) {
        gsap.fromTo(
          items,
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, stagger: 0.02, duration: 0.2, ease: 'power2.out', clearProps: 'transform' }
        );
      }
    }
  }, { dependencies: [mode], scope: containerRef });

  // Scroll handler: elevate sheet to higher viewport on scroll
  const handleScroll = (e) => {
    if (!isExpanded && e.currentTarget.scrollTop > 4) {
      setIsExpanded(true);
    }
  };

  // Touch gesture drag & 2-stage height transitions
  const handleTouchStart = (e) => {
    if (!contentRef.current) return;
    touchStartY.current = e.touches[0].clientY;
    touchStartScrollTop.current = contentRef.current.scrollTop;
    isDraggingSheet.current = false;
    touchStartTime.current = Date.now();
  };

  const handleTouchMove = (e) => {
    if (!contentRef.current) return;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    if (!isMobile) return;

    const currentY = e.touches[0].clientY;
    const deltaY = currentY - touchStartY.current;

    // Upward drag lifts the sheet to expanded stage
    if (!isExpanded && deltaY < -12) {
      setIsExpanded(true);
    }

    // Trigger downward drag when at top of scroll
    if ((touchStartScrollTop.current <= 0 && deltaY > 0) || isDraggingSheet.current) {
      isDraggingSheet.current = true;
      if (e.cancelable) e.preventDefault();

      // Clamp y >= 0 via gsap.utils.clamp: prevents sheet from ever translating above the top viewport edge
      const clampedY = gsap.utils.clamp(0, window.innerHeight, deltaY);
      gsap.set(contentRef.current, { y: clampedY });
      const progress = gsap.utils.clamp(0, 1, 1 - clampedY / 320);
      if (overlayRef.current) {
        gsap.set(overlayRef.current, { opacity: progress });
      }
    }
  };

  const handleTouchEnd = (e) => {
    if (!contentRef.current) return;

    if (isDraggingSheet.current) {
      isDraggingSheet.current = false;
      const currentY = e.changedTouches[0].clientY;
      const deltaY = currentY - touchStartY.current;
      const elapsed = Date.now() - touchStartTime.current;
      const velocity = deltaY / (elapsed || 1);

      if (isExpanded) {
        // From Expanded state: downward swipe drops back to resting stage
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
        // From Resting state: downward swipe past 80px dismisses sheet
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

  // Clean up active tweens on unmount
  useEffect(() => {
    return () => {
      if (contentRef.current) gsap.killTweensOf(contentRef.current);
      if (overlayRef.current) gsap.killTweensOf(overlayRef.current);
      if (indicatorRef.current) gsap.killTweensOf(indicatorRef.current);
    };
  }, []);

  const handleSwitchMode = contextSafe((newMode) => {
    if (newMode === mode) return;
    setMode(newMode);
  });

  const handleMicroPress = contextSafe((e, callback) => {
    if (e?.currentTarget) {
      gsap.timeline()
        .to(e.currentTarget, { scale: 0.94, duration: 0.06, ease: 'power1.in' })
        .to(e.currentTarget, { scale: 1, duration: 0.12, ease: 'power2.out' });
    }
    if (callback) callback();
  });

  const handleSelectTag = (t, e) => {
    handleMicroPress(e, () => setTag(t));
  };

  const handleSelectPriority = (val, e) => {
    handleMicroPress(e, () => setPriority(val));
  };

  const handleSelectItemType = (t, e) => {
    handleMicroPress(e, () => setItemType(t));
  };

  const handleToggleRefund = (e) => {
    handleMicroPress(e, () => setIsRefund((prev) => !prev));
  };

  const handleTogglePayment = (e) => {
    handleMicroPress(e, () => handleTogglePaidStatus(!isPaid));
  };

  const handleSelectMatchedItem = (id) => {
    setMatchedItemId(id);
    if (id) {
      const selectedItem = eligiblePlannedItems.find((i) => (i._id || i.id) === id);
      if (selectedItem && selectedItem.accountType && selectedItem.accountType !== 'unassigned') {
        setTxAccountType(selectedItem.accountType);
        if (selectedItem.accountType === 'bank') {
          const bankId = selectedItem.bankAccountId?._id || selectedItem.bankAccountId || '';
          if (bankId) {
            setTxBankAccountId(bankId);
            setTxWalletId('');
          }
        } else if (selectedItem.accountType === 'wallet') {
          const walletId = selectedItem.walletId?._id || selectedItem.walletId || '';
          if (walletId) {
            setTxWalletId(walletId);
            setTxBankAccountId('');
          }
        }
      }
    }
  };

  const handleTransactionSubmit = (e) => {
    e.preventDefault();
    if (!txAmount || isNaN(Number(txAmount))) return;

    const hasAccount = (txAccountType === 'bank' && txBankAccountId) || (txAccountType === 'wallet' && txWalletId);
    if (!hasAccount) {
      alert('Please select an active Bank Account or Wallet');
      return;
    }

    const baseAmount = Math.round(Math.abs(Number(txAmount)) * 100);
    const finalAmount = isRefund ? -baseAmount : baseAmount;

    onLogTransaction({
      amount: finalAmount,
      tag,
      note: note.trim(),
      date: txDate,
      plannedItemId: matchedItemId || null,
      accountType: txAccountType,
      bankAccountId: txAccountType === 'bank' ? txBankAccountId : null,
      walletId: txAccountType === 'wallet' ? txWalletId : null
    });
  };

  const handleIncomeSubmit = (e) => {
    e.preventDefault();
    if (!incAmount || isNaN(Number(incAmount)) || Number(incAmount) <= 0) {
      alert('Please enter a valid positive income amount');
      return;
    }

    const hasAccount = (incAccountType === 'bank' && incBankAccountId) || (incAccountType === 'wallet' && incWalletId);
    if (!hasAccount) {
      alert('Please select an active Bank Account or Wallet');
      return;
    }

    const baseAmount = Math.round(Math.abs(Number(incAmount)) * 100);

    onLogTransaction({
      amount: baseAmount,
      isIncome: true,
      tag: incTag,
      note: incNote.trim(),
      date: incDate,
      plannedItemId: null,
      accountType: incAccountType,
      bankAccountId: incAccountType === 'bank' ? incBankAccountId : null,
      walletId: incAccountType === 'wallet' ? incWalletId : null
    });
  };

  const handleTogglePaidStatus = (newPaid) => {
    setIsPaid(newPaid);
    if (newPaid && !itemDate) {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      setItemDate(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
    } else if (!newPaid && !initialItem) {
      setItemDate('');
    }
  };

  const handleRecommendDate = async () => {
    const amt = Math.round(Number(itemAmount || 0) * 100);
    const year = month?.year || new Date().getFullYear();
    const monthNum = month?.month || (new Date().getMonth() + 1);
    setRecommending(true);
    try {
      const rec = await api.recommendPurchaseDate(year, monthNum, amt > 0 ? amt : 1000);
      if (rec?.recommendedDate) {
        setItemDate(rec.recommendedDate);
      } else {
        alert(rec?.explanation || 'No safe date could be found this month without risking floor breach.');
      }
    } catch (err) {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      setItemDate(`${year}-${pad(monthNum)}-01`);
    } finally {
      setRecommending(false);
    }
  };

  const handleItemSubmit = async (e) => {
    e.preventDefault();
    if (!itemName.trim()) return;

    const hasAccount = (itemAccountType === 'bank' && itemBankAccountId) || (itemAccountType === 'wallet' && itemWalletId);
    if (!hasAccount) {
      alert('Please select an active Bank Account or Wallet');
      return;
    }

    let finalDate = itemDate;
    const year = month?.year || new Date().getFullYear();
    const monthNum = month?.month || (new Date().getMonth() + 1);

    if (itemType === 'one-time' && !finalDate && !isPaid) {
      try {
        const amt = Math.round(Number(itemAmount || 0) * 100);
        const rec = await api.recommendPurchaseDate(year, monthNum, amt > 0 ? amt : 1000);
        if (rec?.recommendedDate) {
          finalDate = rec.recommendedDate;
        } else {
          const pad = (n) => String(n).padStart(2, '0');
          finalDate = `${year}-${pad(monthNum)}-01`;
        }
      } catch (err) {
        const pad = (n) => String(n).padStart(2, '0');
        finalDate = `${year}-${pad(monthNum)}-01`;
      }
    }

    const payload = {
      type: itemType,
      name: itemName.trim(),
      priority: Number(priority) || 0,
      isPaid,
      accountType: itemAccountType,
      bankAccountId: itemAccountType === 'bank' ? itemBankAccountId : null,
      walletId: itemAccountType === 'wallet' ? itemWalletId : null
    };

    if (itemType === 'one-time') {
      payload.amount = Math.round(Number(itemAmount || 0) * 100);
      const relativeDay = finalDate ? getRelativeDay(finalDate, year, monthNum) : 1;
      payload.day = relativeDay;
      payload.date = finalDate;
    } else if (itemType === 'recurring') {
      payload.amount = Math.round(Number(itemAmount || 0) * 100);
      payload.dayOfMonth = Number(dayOfMonth) || 1;
      payload.isFixed = isFixed;
    }

    onSaveItem(payload);
  };

  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    setTransferError('');

    if (!transferAmount || Number(transferAmount) <= 0) {
      setTransferError('Please enter a valid transfer amount.');
      return;
    }

    if (!transferSourceId || !transferDestId) {
      setTransferError('Both source and destination accounts are required.');
      return;
    }

    if (transferSourceType === transferDestType && transferSourceId === transferDestId) {
      setTransferError('Source and destination accounts must be different.');
      return;
    }

    try {
      const payload = {
        date: transferDate,
        amount: Math.round(Number(transferAmount) * 100),
        sourceType: transferSourceType,
        sourceBankAccountId: transferSourceType === 'bank' ? transferSourceId : null,
        sourceWalletId: transferSourceType === 'wallet' ? transferSourceId : null,
        destinationType: transferDestType,
        destinationBankAccountId: transferDestType === 'bank' ? transferDestId : null,
        destinationWalletId: transferDestType === 'wallet' ? transferDestId : null,
        note: transferNote.trim()
      };

      if (onCreateTransfer) {
        await onCreateTransfer(payload);
      }
      triggerExit();
    } catch (err) {
      setTransferError(err.message || 'Failed to record transfer.');
    }
  };

  if (!shouldRender) return null;

  const eligiblePlannedItems = (plannedItems || []).filter(
    (item) => item.type === 'one-time' || item.type === 'recurring'
  );

  const currentYear = month?.year || new Date().getFullYear();
  const currentMonthNum = month?.month || (new Date().getMonth() + 1);

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
          onFocusCapture={() => setIsExpanded(true)}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Mobile bottom-sheet grab zone & handle */}
          <div className="modal-drag-zone">
            <div className="modal-drag-handle" />
          </div>

          {/* Header & Mode Switcher */}
          <div className="modal-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
            <div className="modal-tab-track">
              {!initialItem && (
                <>
                  <div ref={indicatorRef} className="modal-tab-indicator" />
                  <button
                    ref={logBtnRef}
                    type="button"
                    className={`modal-tab-btn ${mode === 'log' ? 'active' : ''}`}
                    onClick={() => handleSwitchMode('log')}
                    aria-label="Spending"
                    title="Log Spending"
                  >
                    <ZapIcon size={12} />
                    <span>Spending</span>
                  </button>
                  <button
                    ref={incomeBtnRef}
                    type="button"
                    className={`modal-tab-btn ${mode === 'income' ? 'active' : ''}`}
                    onClick={() => handleSwitchMode('income')}
                    aria-label="Income"
                    title="Log Income"
                  >
                    <TrendingUpIcon size={12} />
                    <span>Income</span>
                  </button>
                  <button
                    ref={planBtnRef}
                    type="button"
                    className={`modal-tab-btn ${mode === 'plan' ? 'active' : ''}`}
                    onClick={() => handleSwitchMode('plan')}
                    aria-label="Plan"
                    title="Plan Budget Item"
                  >
                    <PlusIcon size={12} />
                    <span>Plan</span>
                  </button>
                  <button
                    ref={transferBtnRef}
                    type="button"
                    className={`modal-tab-btn ${mode === 'transfer' ? 'active' : ''}`}
                    onClick={() => handleSwitchMode('transfer')}
                    aria-label="Transfer"
                    title="Transfer Funds"
                  >
                    <ArrowRightLeftIcon size={12} />
                    <span>Transfer</span>
                  </button>
                </>
              )}
              {initialItem && (
                <span style={{ fontSize: '13px', fontWeight: 600, padding: '4px 8px' }}>
                  Edit Planned Item
                </span>
              )}
            </div>
            <button
              type="button"
              className="btn-icon modal-close-btn"
              onClick={() => triggerExit()}
              title="Close modal"
              aria-label="Close"
              style={{ fontSize: '13px', width: '28px', height: '28px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}
            >
              ✕
            </button>
          </div>

          {/* MODE 1: LOG SPENDING / ACTUAL TRANSACTION */}
          {mode === 'log' && (
            <form
              ref={formRef}
              onSubmit={handleTransactionSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              {/* Amount & Credit / Refund Toggle */}
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label className="form-label">Amount ({currencySymbol})</label>
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
                    onClick={handleToggleRefund}
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
                </div>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  required
                  autoFocus
                  placeholder="0.00"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  className="tabular-nums"
                  style={{
                    fontSize: '22px',
                    fontWeight: 700,
                    padding: '10px 14px',
                    color: 'var(--text)',
                    borderColor: isRefund ? 'var(--text)' : undefined
                  }}
                />
              </div>

              {/* Account Attribution (Mandatory per ADR 0035) */}
              {bankAccounts.length === 0 && wallets.length === 0 ? (
                <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'var(--surface-subtle)', border: '1px solid var(--border)', marginBottom: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                    Bank Account Required
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    You must register a bank account before logging transactions.
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
                <div className="form-group">
                  <label className="form-label">Payment Account *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: (bankAccounts.length > 0 && wallets.length > 0) ? '120px 1fr' : '1fr', gap: '8px' }}>
                    {bankAccounts.length > 0 && wallets.length > 0 && (
                      <CustomSelect
                        value={txAccountType}
                        onChange={(e) => {
                          const newType = e.target.value;
                          setTxAccountType(newType);
                          if (newType === 'bank') {
                            const primaryBank = bankAccounts.find((b) => b.isPrimary) || bankAccounts[0];
                            setTxBankAccountId(primaryBank?._id || primaryBank?.id || '');
                            setTxWalletId('');
                          } else if (newType === 'wallet') {
                            const primaryWallet = wallets.find((w) => w.isPrimary) || wallets[0];
                            setTxWalletId(primaryWallet?._id || primaryWallet?.id || '');
                            setTxBankAccountId('');
                          }
                        }}
                        options={[
                          { value: 'bank', label: 'Bank', icon: <BuildingLibraryIcon size={13} /> },
                          { value: 'wallet', label: 'Wallet', icon: <WalletIcon size={13} /> }
                        ]}
                      />
                    )}

                    {txAccountType === 'bank' && (
                      <CustomSelect
                        value={txBankAccountId}
                        onChange={(e) => setTxBankAccountId(e.target.value)}
                        placeholder="Select Bank Account"
                        options={bankAccounts.map((b) => ({
                          value: b._id || b.id,
                          label: b.name + (b.accountNumberMasked ? ` (••${b.accountNumberMasked})` : ''),
                          icon: <BuildingLibraryIcon size={13} />,
                          sublabel: formatCurrency(b.openingBalance ?? 0, currencySymbol)
                        }))}
                      />
                    )}

                    {txAccountType === 'wallet' && (
                      <CustomSelect
                        value={txWalletId}
                        onChange={(e) => setTxWalletId(e.target.value)}
                        placeholder="Select Wallet"
                        options={wallets.map((w) => ({
                          value: w._id || w.id,
                          label: w.name,
                          icon: <WalletIcon size={13} />,
                          badge: w.walletType,
                          sublabel: formatCurrency(w.openingBalance ?? 0, currencySymbol)
                        }))}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Category Tag Pills */}
              <div className="form-group">
                <label className="form-label">Category tag</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                  {['Food', 'Travel', 'Health', 'Other'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={tag === t ? 'btn-primary' : 'btn-subtle'}
                      onClick={(e) => handleSelectTag(t, e)}
                      style={{
                        padding: '8px 4px',
                        fontSize: '12px',
                        fontWeight: tag === t ? 600 : 400,
                        border: tag === t ? undefined : '1px solid var(--border)'
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Note / Description */}
              <div className="form-group">
                <label className="form-label">Description note (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Grocery, Metro pass, Doctor checkup"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              {/* Match Planned Item */}
              <div className="form-group">
                <label className="form-label">Match to planned item (optional)</label>
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
                    color: isRefund ? 'var(--success)' : 'var(--text-muted)',
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

              {/* Date Input */}
              <div className="form-group">
                <label className="form-label">Date</label>
                <DatePicker
                  value={txDate}
                  onChange={(d) => setTxDate(d)}
                  month={month}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button type="button" onClick={() => triggerExit()}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={bankAccounts.length === 0 && wallets.length === 0}
                  style={{
                    padding: '10px 20px',
                    background: isRefund ? 'var(--success)' : undefined,
                    borderColor: isRefund ? 'var(--success)' : undefined
                  }}
                >
                  {isRefund ? 'Log credit inflow' : 'Log expense debit'}
                </button>
              </div>
            </form>
          )}

          {/* MODE: LOG DIRECT / AD-HOC INCOME */}
          {mode === 'income' && (
            <form
              ref={formRef}
              onSubmit={handleIncomeSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              {/* Scheduled Base Salary Info Card */}
              {month?.incomeAmount ? (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'var(--surface-subtle)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      Scheduled Monthly Salary
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>
                      +{currencySymbol}{(month.incomeAmount / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>
                      Deposit Target:{' '}
                      <strong style={{ color: 'var(--text)' }}>
                        {(() => {
                          const bId = month.salaryBankAccountId?._id || month.salaryBankAccountId;
                          const b = bankAccounts.find((x) => (x._id || x.id) === bId);
                          return b ? b.name : (bId ? 'Assigned Bank' : 'Unassigned (Unified Only)');
                        })()}
                      </strong>
                    </span>
                    <span>
                      Scheduled Day:{' '}
                      <strong style={{ color: 'var(--text)' }}>
                        {month.incomeCreditDate || `Day ${month.salaryDepositDay || 1}`}
                      </strong>
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'var(--surface-subtle)',
                    border: '1px dashed var(--border)',
                    fontSize: '12px',
                    color: 'var(--text-secondary)'
                  }}
                >
                  No scheduled base salary configured for this month. Log any earnings or salary receipt below.
                </div>
              )}

              {/* Income Amount */}
              <div className="form-group">
                <label className="form-label">Income Amount ({currencySymbol}) *</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  required
                  autoFocus
                  placeholder="0.00"
                  value={incAmount}
                  onChange={(e) => setIncAmount(e.target.value)}
                  className="tabular-nums"
                  style={{
                    fontSize: '22px',
                    fontWeight: 700,
                    padding: '10px 14px',
                    color: 'var(--text)',
                    borderColor: 'var(--border)'
                  }}
                />
              </div>

              {/* Destination Account */}
              {bankAccounts.length === 0 && wallets.length === 0 ? (
                <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'var(--surface-subtle)', border: '1px solid var(--border)', marginBottom: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                    Bank Account Required
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    You must register a bank account before logging income.
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
                <div className="form-group">
                  <label className="form-label">Deposited To (Account) *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: (bankAccounts.length > 0 && wallets.length > 0) ? '120px 1fr' : '1fr', gap: '8px' }}>
                    {bankAccounts.length > 0 && wallets.length > 0 && (
                      <CustomSelect
                        value={incAccountType}
                        onChange={(e) => {
                          const newType = e.target.value;
                          setIncAccountType(newType);
                          if (newType === 'bank') {
                            const defaultBank = (month?.salaryBankAccountId ? bankAccounts.find((b) => (b._id || b.id) === (month.salaryBankAccountId?._id || month.salaryBankAccountId)) : null) || bankAccounts.find((b) => b.isPrimary) || bankAccounts[0];
                            setIncBankAccountId(defaultBank?._id || defaultBank?.id || '');
                            setIncWalletId('');
                          } else if (newType === 'wallet') {
                            const primaryWallet = wallets.find((w) => w.isPrimary) || wallets[0];
                            setIncWalletId(primaryWallet?._id || primaryWallet?.id || '');
                            setIncBankAccountId('');
                          }
                        }}
                        options={[
                          { value: 'bank', label: 'Bank', icon: <BuildingLibraryIcon size={13} /> },
                          { value: 'wallet', label: 'Wallet', icon: <WalletIcon size={13} /> }
                        ]}
                      />
                    )}

                    {incAccountType === 'bank' && (
                      <CustomSelect
                        value={incBankAccountId}
                        onChange={(e) => setIncBankAccountId(e.target.value)}
                        placeholder="Select Bank Account"
                        options={bankAccounts.map((b) => ({
                          value: b._id || b.id,
                          label: b.name + (b.accountNumberMasked ? ` (••${b.accountNumberMasked})` : ''),
                          icon: <BuildingLibraryIcon size={13} />,
                          sublabel: formatCurrency(b.openingBalance ?? 0, currencySymbol)
                        }))}
                      />
                    )}

                    {incAccountType === 'wallet' && (
                      <CustomSelect
                        value={incWalletId}
                        onChange={(e) => setIncWalletId(e.target.value)}
                        placeholder="Select Wallet"
                        options={wallets.map((w) => ({
                          value: w._id || w.id,
                          label: w.name,
                          icon: <WalletIcon size={13} />,
                          badge: w.walletType,
                          sublabel: formatCurrency(w.openingBalance ?? 0, currencySymbol)
                        }))}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Income Category / Source */}
              <div className="form-group">
                <label className="form-label">Income Category / Source</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {['Salary', 'Freelance', 'Bonus', 'Investment', 'Other'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={incTag === t ? 'btn-primary' : 'btn-subtle'}
                      onClick={(e) => handleMicroPress(e, () => setIncTag(t))}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: incTag === t ? 600 : 400,
                        border: incTag === t ? undefined : '1px solid var(--border)'
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date */}
              <div className="form-group">
                <label className="form-label">Receipt Date</label>
                <DatePicker
                  value={incDate}
                  onChange={(d) => setIncDate(d)}
                  month={month}
                  required
                />
              </div>

              {/* Note / Memo */}
              <div className="form-group">
                <label className="form-label">Note / Payer Reference (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Monthly salary payout, client invoice, dividends"
                  value={incNote}
                  onChange={(e) => setIncNote(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button type="button" onClick={() => triggerExit()}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={bankAccounts.length === 0 && wallets.length === 0}
                  style={{
                    padding: '10px 20px',
                    background: 'var(--success)',
                    borderColor: 'var(--success)'
                  }}
                >
                  Record Income
                </button>
              </div>
            </form>
          )}

          {/* MODE 2: PLAN BUDGET ITEM */}
          {mode === 'plan' && (
            <form
              ref={formRef}
              onSubmit={handleItemSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              {/* Item Type Switcher: 2-way toggle */}
              <div className="form-group">
                <label className="form-label">Item type</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                  {[
                    { id: 'one-time', label: 'One-Time' },
                    { id: 'recurring', label: 'Recurring' }
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={itemType === t.id ? 'btn-primary' : 'btn-subtle'}
                      onClick={(e) => handleSelectItemType(t.id, e)}
                      style={{
                        padding: '8px 4px',
                        fontSize: '12px',
                        fontWeight: itemType === t.id ? 600 : 400,
                        border: itemType === t.id ? undefined : '1px solid var(--border)'
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <div className="form-group">
                <label className="form-label">Name / Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rent, Electricity, Groceries"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                />
              </div>

              {/* Amount for One-Time & Recurring */}
              <div className="form-group">
                <label className="form-label">Planned amount ({currencySymbol})</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={itemAmount}
                  onChange={(e) => setItemAmount(e.target.value)}
                  style={{ fontSize: '18px', fontWeight: 600 }}
                />
              </div>

              {/* Same-Day Priority Tiers */}
              <div className="form-group">
                <label className="form-label">Same-day priority</label>
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
                        onClick={(e) => handleSelectPriority(tier.value, e)}
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

              {/* Dedicated Account (Mandatory per ADR 0035) */}
              {bankAccounts.length === 0 && wallets.length === 0 ? (
                <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'var(--surface-subtle)', border: '1px solid var(--border)', marginBottom: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                    Bank Account Required
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    You must register a bank account before scheduling planned items.
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
                <div className="form-group">
                  <label className="form-label">Dedicated Account *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: (bankAccounts.length > 0 && wallets.length > 0) ? '120px 1fr' : '1fr', gap: '8px' }}>
                    {bankAccounts.length > 0 && wallets.length > 0 && (
                      <CustomSelect
                        value={itemAccountType}
                        onChange={(e) => {
                          const newType = e.target.value;
                          setItemAccountType(newType);
                          if (newType === 'bank') {
                            const primaryBank = bankAccounts.find((b) => b.isPrimary) || bankAccounts[0];
                            setItemBankAccountId(primaryBank?._id || primaryBank?.id || '');
                            setItemWalletId('');
                          } else if (newType === 'wallet') {
                            const primaryWallet = wallets.find((w) => w.isPrimary) || wallets[0];
                            setItemWalletId(primaryWallet?._id || primaryWallet?.id || '');
                            setItemBankAccountId('');
                          }
                        }}
                        options={[
                          { value: 'bank', label: 'Bank', icon: <BuildingLibraryIcon size={13} /> },
                          { value: 'wallet', label: 'Wallet', icon: <WalletIcon size={13} /> }
                        ]}
                      />
                    )}

                    {itemAccountType === 'bank' && (
                      <CustomSelect
                        value={itemBankAccountId}
                        onChange={(e) => setItemBankAccountId(e.target.value)}
                        placeholder="Select Bank Account"
                        options={bankAccounts.map((b) => ({
                          value: b._id || b.id,
                          label: b.name + (b.accountNumberMasked ? ` (••${b.accountNumberMasked})` : ''),
                          icon: <BuildingLibraryIcon size={13} />,
                          sublabel: formatCurrency(b.openingBalance ?? 0, currencySymbol)
                        }))}
                      />
                    )}

                    {itemAccountType === 'wallet' && (
                      <CustomSelect
                        value={itemWalletId}
                        onChange={(e) => setItemWalletId(e.target.value)}
                        placeholder="Select Wallet"
                        options={wallets.map((w) => ({
                          value: w._id || w.id,
                          label: w.name,
                          icon: <WalletIcon size={13} />,
                          badge: w.walletType,
                          sublabel: formatCurrency(w.openingBalance ?? 0, currencySymbol)
                        }))}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* One-Time Date Picker */}
              {itemType === 'one-time' && (
                <div className="form-group">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <label className="form-label" style={{ margin: 0 }}>Planned payment date</label>
                    {!isPaid && (
                      <button
                        type="button"
                        className="sparkle-action-link"
                        onClick={handleRecommendDate}
                        disabled={recommending}
                        title="Recommend best safe date based on spending pace, balance, and floor buffer"
                      >
                        <SparklesIcon size={12} className={recommending ? 'sparkle-spin-icon' : ''} />
                        <span>{recommending ? 'Analyzing cash flow...' : 'Recommend best date'}</span>
                      </button>
                    )}
                  </div>
                  <DatePicker
                    value={itemDate}
                    onChange={(d) => setItemDate(d)}
                    placeholder="Leave blank for auto-recommended safe date"
                    month={month}
                  />
                  {!itemDate && !isPaid && (
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                      Payment pending: date left blank. Application will assign best date on save or click "Recommend best date".
                    </span>
                  )}
                </div>
              )}

              {/* Recurring Day & Fixed Rollover Toggle */}
              {itemType === 'recurring' && (
                <>
                  <div className="form-group">
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
                  </div>

                  <div
                    style={{
                      padding: '10px 12px',
                      background: isFixed ? 'var(--surface)' : 'var(--surface-subtle)',
                      borderRadius: 'var(--radius)',
                      border: isFixed ? '1px solid var(--text)' : '1px solid var(--border)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={isFixed}
                        onChange={(e) => setIsFixed(e.target.checked)}
                      />
                      <span style={{ fontSize: '13px', fontWeight: 500 }}>
                        Fixed recurring (auto-carry forward on month rollover)
                      </span>
                    </label>
                  </div>
                </>
              )}

              {/* Modal Footer with Payment Status on Left Corner and Actions on Right */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  marginTop: '16px',
                  paddingTop: '12px',
                  borderTop: '1px solid var(--border)'
                }}
              >
                {/* Left corner: Payment Done Toggle Switch */}
                <div
                  className="recurring-toggle-switch"
                  onClick={handleTogglePayment}
                  title={isPaid ? 'Payment done - click to toggle pending' : 'Payment pending - click to mark done'}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleTogglePayment(e);
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

                {/* Right corner: Cancel & Save */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={() => triggerExit()}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={bankAccounts.length === 0 && wallets.length === 0}
                    style={{ padding: '8px 18px' }}
                  >
                    {initialItem ? 'Update planned item' : 'Save planned item'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* MODE 3: TRANSFER */}
          {mode === 'transfer' && (
            <form
              ref={formRef}
              onSubmit={handleTransferSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              {transferError && (
                <div style={{ padding: '8px 12px', borderRadius: '6px', background: 'var(--text)', color: 'var(--bg)', fontSize: '12px', fontWeight: 600 }}>
                  {transferError}
                </div>
              )}

              {/* Transfer Amount (Hero) */}
              <div className="form-group">
                <label className="form-label">Transfer Amount ({currencySymbol}) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  autoFocus
                  placeholder="0.00"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  className="tabular-nums"
                  style={{
                    fontSize: '22px',
                    fontWeight: 700,
                    padding: '10px 14px',
                    color: 'var(--text)'
                  }}
                />
              </div>

              {/* Source Account */}
              <div className="form-group">
                <label className="form-label">Source Account (Outflow) *</label>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px' }}>
                  <CustomSelect
                    value={transferSourceType}
                    onChange={(e) => {
                      const newType = e.target.value;
                      setTransferSourceType(newType);
                      if (newType === 'bank') {
                        setTransferSourceId(bankAccounts[0]?._id || bankAccounts[0]?.id || '');
                      } else {
                        setTransferSourceId(wallets[0]?._id || wallets[0]?.id || '');
                      }
                    }}
                    options={[
                      ...(bankAccounts.length > 0 ? [{ value: 'bank', label: 'Bank', icon: <BuildingLibraryIcon size={13} /> }] : []),
                      ...(wallets.length > 0 ? [{ value: 'wallet', label: 'Wallet', icon: <WalletIcon size={13} /> }] : [])
                    ]}
                  />

                  <CustomSelect
                    value={transferSourceId}
                    onChange={(e) => setTransferSourceId(e.target.value)}
                    placeholder="Select Source Account"
                    options={transferSourceType === 'bank' ? (
                      bankAccounts.map((b) => ({
                        value: b._id || b.id,
                        label: b.name + (b.accountNumberMasked ? ` (••${b.accountNumberMasked})` : ''),
                        icon: <BuildingLibraryIcon size={13} />,
                        sublabel: formatCurrency(b.openingBalance ?? 0, currencySymbol)
                      }))
                    ) : (
                      wallets.map((w) => ({
                        value: w._id || w.id,
                        label: w.name,
                        icon: <WalletIcon size={13} />,
                        badge: w.walletType,
                        sublabel: formatCurrency(w.openingBalance ?? 0, currencySymbol)
                      }))
                    )}
                  />
                </div>
              </div>

              {/* Destination Account */}
              <div className="form-group">
                <label className="form-label">Destination Account (Inflow) *</label>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px' }}>
                  <CustomSelect
                    value={transferDestType}
                    onChange={(e) => {
                      const newType = e.target.value;
                      setTransferDestType(newType);
                      if (newType === 'bank') {
                        setTransferDestId(bankAccounts[0]?._id || bankAccounts[0]?.id || '');
                      } else {
                        setTransferDestId(wallets[0]?._id || wallets[0]?.id || '');
                      }
                    }}
                    options={[
                      ...(wallets.length > 0 ? [{ value: 'wallet', label: 'Wallet', icon: <WalletIcon size={13} /> }] : []),
                      ...(bankAccounts.length > 0 ? [{ value: 'bank', label: 'Bank', icon: <BuildingLibraryIcon size={13} /> }] : [])
                    ]}
                  />

                  <CustomSelect
                    value={transferDestId}
                    onChange={(e) => setTransferDestId(e.target.value)}
                    placeholder="Select Destination Account"
                    options={transferDestType === 'bank' ? (
                      bankAccounts.map((b) => ({
                        value: b._id || b.id,
                        label: b.name + (b.accountNumberMasked ? ` (••${b.accountNumberMasked})` : ''),
                        icon: <BuildingLibraryIcon size={13} />,
                        sublabel: formatCurrency(b.openingBalance ?? 0, currencySymbol)
                      }))
                    ) : (
                      wallets.map((w) => ({
                        value: w._id || w.id,
                        label: w.name,
                        icon: <WalletIcon size={13} />,
                        badge: w.walletType,
                        sublabel: formatCurrency(w.openingBalance ?? 0, currencySymbol)
                      }))
                    )}
                  />
                </div>
              </div>

              {/* Transfer Date */}
              <div className="form-group">
                <label className="form-label">Transfer Date *</label>
                <DatePicker
                  value={transferDate}
                  onChange={(d) => setTransferDate(d)}
                  month={month}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Note / Reference (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. ATM withdrawal, emergency savings, envelope funding"
                  value={transferNote}
                  onChange={(e) => setTransferNote(e.target.value)}
                />
              </div>

              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                * Paired transfers are zero-sum on your monthly budget curve ($0 net change to total liquid cash).
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button type="button" onClick={() => triggerExit()}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Record Transfer
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
