import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { formatCurrency, formatDisplayDate } from '@budget/engine';

/**
 * Computes a smooth monotonic cubic spline path (Fritsch-Carlson algorithm).
 * Guarantees zero overshoot/undershoot on steep slopes, eliminating unnatural upward/downward bulges.
 */
function getMonotoneCubicSplinePath(points) {
  const n = points.length;
  if (n === 0) return '';
  if (n === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  if (n === 2) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)} ${points[1].y.toFixed(1)}`;
  }

  // 1. Calculate secant slopes
  const dxs = [];
  const dys = [];
  const slopes = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    dxs.push(dx);
    dys.push(dy);
    slopes.push(dx === 0 ? 0 : dy / dx);
  }

  // 2. Initialize tangents
  const m = new Array(n);
  m[0] = slopes[0];
  for (let i = 1; i < n - 1; i++) {
    if (slopes[i - 1] * slopes[i] <= 0) {
      m[i] = 0;
    } else {
      m[i] = (slopes[i - 1] + slopes[i]) / 2;
    }
  }
  m[n - 1] = slopes[n - 2];

  // 3. Fritsch-Carlson monotonicity check & scale
  for (let i = 0; i < n - 1; i++) {
    if (dys[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
    } else {
      const alpha = m[i] / slopes[i];
      const beta = m[i + 1] / slopes[i];
      if (alpha < 0) m[i] = 0;
      if (beta < 0) m[i + 1] = 0;
      const s = alpha * alpha + beta * beta;
      if (s > 9) {
        const tau = 3 / Math.sqrt(s);
        m[i] = tau * alpha * slopes[i];
        m[i + 1] = tau * beta * slopes[i];
      }
    }
  }

  // 4. Build SVG Cubic Bezier Path
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const dx = dxs[i];

    const cp1x = p1.x + dx / 3;
    const cp1y = p1.y + (m[i] * dx) / 3;
    const cp2x = p2.x - dx / 3;
    const cp2y = p2.y - (m[i + 1] * dx) / 3;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  return d;
}

export function formatChartTick(val, symbol) {
  const major = Math.abs(val) / 100;
  const sign = val < 0 ? '-' : '';

  if (major >= 1000000) {
    const formatted = (major / 1000000).toFixed(1).replace(/\.0$/, '');
    return `${sign}${symbol}${formatted}m`;
  }
  if (major >= 10000) {
    const formatted = (major / 1000).toFixed(1).replace(/\.0$/, '');
    return `${sign}${symbol}${formatted}k`;
  }
  return `${sign}${symbol}${Math.round(major)}`;
}

/**
 * Interactive SVG Step Line Balance Chart.
 * Displays daily running balance across the month, supports relative negative pre-month days (-1, -2),
 * and provides interactive tooltips synchronized with timeline selection.
 */
export function StepLineChart({
  dailyBalances = [],
  events = [],
  safetyFloor = 0,
  currencySymbol = '₹',
  floorBreached = false,
  lowestDate = '',
  selectedDay = null,
  onSelectDay = null,
  currentDay = null,
  onOpenReview = null,
  bankAccounts = [],
  wallets = [],
  selectedAccountId = 'all',
  selectedAccount = null,
  safeDailyRate = null
}) {
  const [hoveredDay, setHoveredDay] = useState(null);
  const [hoveredPointId, setHoveredPointId] = useState(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const containerRef = useRef(null);
  // Measured drawing area: the SVG is drawn at its real pixel size (viewBox matches),
  // so text stays legible and the chart fills its card at every breakpoint.
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [fillHeight, setFillHeight] = useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1024px)').matches
  );

  const hasChartData = Array.isArray(dailyBalances) && dailyBalances.length > 0;

  // Measure synchronously before paint (and on window resize), and keep a
  // ResizeObserver for container-only changes such as the sidebar or grid reflowing.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const apply = (w, h) => {
      const next = { w: Math.round(w), h: Math.round(h) };
      setSize((prev) => (Math.abs(prev.w - next.w) > 1 || Math.abs(prev.h - next.h) > 1 ? next : prev));
    };
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0) apply(r.width, r.height);
    };
    measure();
    window.addEventListener('resize', measure);
    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((entries) => {
        const r = entries[0]?.contentRect;
        if (r && r.width > 0) apply(r.width, r.height);
      });
      ro.observe(el);
    }
    return () => {
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, [hasChartData]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setFillHeight(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const isFilteringAccount = selectedAccountId && selectedAccountId !== 'all';
  const normSelectedId = String(selectedAccountId || '');
  const alt1 = String(selectedAccount?._id || '');
  const alt2 = String(selectedAccount?.id || '');
  const alt3 = String(selectedAccount?.altId || '');

  const matchesSelectedAccount = (ev) => {
    if (!isFilteringAccount) return true;
    if (!ev) return false;

    const checkMatch = (val) => {
      if (!val) return false;
      const s = String(val._id || val.id || val);
      return s === normSelectedId || (alt1 && s === alt1) || (alt2 && s === alt2) || (alt3 && s === alt3);
    };

    if (checkMatch(ev.bankAccountId) || checkMatch(ev.walletId) || checkMatch(ev.accountId)) return true;
    if (checkMatch(ev.sourceBankAccountId) || checkMatch(ev.sourceWalletId) || checkMatch(ev.sourceAccountId)) return true;
    if (checkMatch(ev.destinationBankAccountId) || checkMatch(ev.destinationWalletId) || checkMatch(ev.destinationAccountId)) return true;
    if (ev.accountBalances) {
      if (ev.accountBalances[normSelectedId] !== undefined) return true;
      if (alt1 && ev.accountBalances[alt1] !== undefined) return true;
      if (alt2 && ev.accountBalances[alt2] !== undefined) return true;
      if (alt3 && ev.accountBalances[alt3] !== undefined) return true;
    }
    return false;
  };

  const getEventBalance = (ev, fallbackBalance) => {
    if (!ev) return fallbackBalance;
    if (!isFilteringAccount) {
      return (typeof ev.balanceAfter === 'number' && !isNaN(ev.balanceAfter))
        ? ev.balanceAfter
        : ((typeof ev.displayBalance === 'number' && !isNaN(ev.displayBalance)) ? ev.displayBalance : fallbackBalance);
    }

    // 1. Precise snapshot from accountBalances map
    if (ev.accountBalances) {
      if (ev.accountBalances[normSelectedId] !== undefined) return ev.accountBalances[normSelectedId];
      if (alt1 && ev.accountBalances[alt1] !== undefined) return ev.accountBalances[alt1];
      if (alt2 && ev.accountBalances[alt2] !== undefined) return ev.accountBalances[alt2];
      if (alt3 && ev.accountBalances[alt3] !== undefined) return ev.accountBalances[alt3];
    }

    // 2. Transfers
    if (ev.itemType === 'transfer') {
      const sBank = String(ev.sourceBankAccountId?._id || ev.sourceBankAccountId?.id || ev.sourceBankAccountId || ev.sourceAccountId || '');
      const sWall = String(ev.sourceWalletId?._id || ev.sourceWalletId?.id || ev.sourceWalletId || '');
      if ((sBank && (sBank === normSelectedId || sBank === alt1 || sBank === alt2)) || (sWall && (sWall === normSelectedId || sWall === alt1 || sWall === alt2))) {
        if (typeof ev.sourceAccountBalanceAfter === 'number' && !isNaN(ev.sourceAccountBalanceAfter)) {
          return ev.sourceAccountBalanceAfter;
        }
      }
      const dBank = String(ev.destinationBankAccountId?._id || ev.destinationBankAccountId?.id || ev.destinationBankAccountId || ev.destinationAccountId || '');
      const dWall = String(ev.destinationWalletId?._id || ev.destinationWalletId?.id || ev.destinationWalletId || '');
      if ((dBank && (dBank === normSelectedId || dBank === alt1 || dBank === alt2)) || (dWall && (dWall === normSelectedId || dWall === alt1 || dWall === alt2))) {
        if (typeof ev.destinationAccountBalanceAfter === 'number' && !isNaN(ev.destinationAccountBalanceAfter)) {
          return ev.destinationAccountBalanceAfter;
        }
      }
    }

    // 3. Direct account balance properties
    if (typeof ev.accountBalanceAfter === 'number' && !isNaN(ev.accountBalanceAfter)) {
      return ev.accountBalanceAfter;
    }
    if (typeof ev.displayBalance === 'number' && !isNaN(ev.displayBalance)) {
      return ev.displayBalance;
    }

    // 4. If ev.globalBalanceAfter is set, ev.balanceAfter is already mapped to account balance
    if (ev.globalBalanceAfter !== undefined && typeof ev.balanceAfter === 'number' && !isNaN(ev.balanceAfter)) {
      return ev.balanceAfter;
    }

    return fallbackBalance;
  };

  // Fast account lookup for tooltip account identification
  const accountMap = useMemo(() => {
    const map = new Map();
    (bankAccounts || []).forEach((b) => {
      const id = b.id || b._id;
      if (id) map.set(String(id), { name: b.name, type: 'Bank' });
    });
    (wallets || []).forEach((w) => {
      const id = w.id || w._id;
      if (id) map.set(String(id), { name: w.name, type: 'Wallet' });
    });
    return map;
  }, [bankAccounts, wallets]);

  const getEventAccountInfo = (ev) => {
    if (!ev) return null;
    const accId = ev.bankAccountId || ev.walletId || ev.accountId || ev.sourceBankAccountId || ev.sourceWalletId;
    const idStr = accId ? String(accId._id || accId.id || accId) : null;
    if (idStr && accountMap.has(idStr)) {
      return accountMap.get(idStr);
    }
    if (ev.sourceBankAccountId || ev.destinationBankAccountId) {
      const dId = ev.destinationBankAccountId ? String(ev.destinationBankAccountId._id || ev.destinationBankAccountId.id || ev.destinationBankAccountId) : null;
      if (dId && accountMap.has(dId)) return accountMap.get(dId);
    }
    if (ev.isSalary) {
      const primaryBank = (bankAccounts || []).find((b) => b.isPrimary) || (bankAccounts || [])[0];
      if (primaryBank) return { name: primaryBank.name, type: 'Bank' };
    }
    return null;
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile((prev) => (prev !== mobile ? mobile : prev));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!dailyBalances || dailyBalances.length === 0) {
    return (
      <div className="card" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        No balance history available for this month.
      </div>
    );
  }

  // Memoize all expensive SVG curve paths, scales, and tick coordinates to run at 60fps during hover
  const chartData = useMemo(() => {
    // Collect all balance values across daily snapshots, intraday intermediate events, and timeline events
    const allBalances = [
      ...dailyBalances.map((d) => d.balance),
      safetyFloor,
      1000
    ];

    dailyBalances.forEach((point) => {
      const rawDayEvents = (point.intradayEvents && point.intradayEvents.length > 0)
        ? point.intradayEvents
        : (events || []).filter((e) => e.day === point.day || e.date === point.date);

      const dayEvents = isFilteringAccount
        ? rawDayEvents.filter(matchesSelectedAccount)
        : rawDayEvents;

      dayEvents.forEach((ev) => {
        const bal = getEventBalance(ev, point.balance);
        if (typeof bal === 'number' && !isNaN(bal)) {
          allBalances.push(bal);
        }
      });
    });

    const filteredEvents = isFilteringAccount
      ? (events || []).filter(matchesSelectedAccount)
      : (events || []);

    filteredEvents.forEach((e) => {
      const bal = getEventBalance(e, null);
      if (typeof bal === 'number' && !isNaN(bal)) {
        allBalances.push(bal);
      }
    });

    const actualMin = Math.min(...allBalances);
    const minVal = actualMin < 0 ? actualMin : 0;
    const maxVal = Math.max(...allBalances);

    // Y-axis minimum starts from 0 (or lower if debt / negative balance), never above 0.
    // 12% headroom removes clipping on high peaks, intraday step-ups, and curved bezier arcs.
    const range = maxVal - minVal || 1000;
    const yMin = minVal < 0 ? minVal - range * 0.04 : 0;
    const yMax = maxVal + range * 0.12;

    // Format y-axis tick values (top, middle, bottom)
    const yTicks = [
      { val: yMax, label: formatChartTick(yMax, currencySymbol) },
      { val: (yMax + yMin) / 2, label: formatChartTick((yMax + yMin) / 2, currencySymbol) },
      { val: yMin, label: formatChartTick(yMin, currencySymbol) }
    ];

    // Dynamically calculate left padding based on longest tick label length
    const maxTickLen = Math.max(...yTicks.map((t) => t.label.length), 4);
    const basePadding = isMobile ? 68 : 76;
    const paddingLeft = Math.max(basePadding, Math.round(maxTickLen * 8.5 + 18));

    // Dynamic SVG dimensions: larger and taller on mobile for enhanced visual presence and touch usability
    const measuredW = size.w > 0 ? size.w : (isMobile ? 540 : 600);
    const width = Math.max(300, measuredW);
    const height = fillHeight && size.h > 0
      ? Math.max(240, Math.min(560, size.h))
      : Math.max(220, Math.min(300, Math.round(width * 0.58)));
    const paddingRight = 18;
    const paddingTop = 26;
    const paddingBottom = 32;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const minDay = dailyBalances[0].day;
    const maxDay = dailyBalances[dailyBalances.length - 1].day;
    const totalDaySpan = maxDay - minDay || 1;

    const getX = (day, frac = 0) => {
      return paddingLeft + (((day + frac) - minDay) / totalDaySpan) * chartWidth;
    };

    const getY = (val) => {
      const norm = (val - yMin) / (yMax - yMin || 1);
      const rawY = height - paddingBottom - norm * chartHeight;
      // Strictly clamp to chart coordinate box: guarantees zero overflow outside component view area
      return Math.max(paddingTop + 6, Math.min(height - paddingBottom, rawY));
    };

    // Build smooth monotonic curved spline path with zero overshoot,
    // including fractional intraday transaction steps
    const points = [];
    dailyBalances.forEach((point) => {
      const rawDayEvents = (point.intradayEvents && point.intradayEvents.length > 0)
        ? point.intradayEvents
        : (events || []).filter((e) => e.day === point.day || e.date === point.date);

      const dayEvents = isFilteringAccount
        ? rawDayEvents.filter(matchesSelectedAccount)
        : rawDayEvents;

      if (dayEvents.length > 1) {
        // Multiple transactions on same day: generate intermediate steps with fractional offsets
        const n = dayEvents.length;
        dayEvents.forEach((ev, idx) => {
          // Spread across +/- 0.35 of a day
          const frac = -0.35 + ((idx + 1) / (n + 1)) * 0.7;
          const evBal = getEventBalance(ev, point.balance);
          points.push({
            x: getX(point.day, frac),
            y: getY(evBal),
            day: point.day,
            date: point.date,
            balance: evBal,
            isIntermediate: true,
            event: ev,
            eventId: ev.transactionId || ev.itemId || `${point.day}-${idx}`
          });
        });
      } else {
        const singleEv = dayEvents[0] || null;
        const singleBal = singleEv ? getEventBalance(singleEv, point.balance) : point.balance;
        points.push({
          x: getX(point.day, 0),
          y: getY(singleBal),
          day: point.day,
          date: point.date,
          balance: singleBal,
          isIntermediate: false,
          event: singleEv,
          eventId: singleEv?.transactionId || singleEv?.itemId || `${point.day}-0`
        });
      }
    });

    const pathD = getMonotoneCubicSplinePath(points);
    let areaD = '';

    if (points.length > 0) {
      const baselineY = getY(yMin);
      areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${baselineY.toFixed(1)} L ${points[0].x.toFixed(1)} ${baselineY.toFixed(1)} Z`;
    }

    // Dual-phase paths: Realized (history up to Today) vs Projected (future days reflecting planned transactions)
    let realizedPathD = '';
    let projectedPathD = '';
    if (typeof currentDay === 'number' && currentDay >= minDay && currentDay <= maxDay) {
      const realizedPts = points.filter((p) => p.day <= currentDay);
      const projectedPts = points.filter((p) => p.day >= currentDay);
      if (realizedPts.length > 1) {
        realizedPathD = getMonotoneCubicSplinePath(realizedPts);
      } else if (realizedPts.length === 1) {
        realizedPathD = `M ${realizedPts[0].x.toFixed(1)} ${realizedPts[0].y.toFixed(1)}`;
      }
      if (projectedPts.length > 1) {
        projectedPathD = getMonotoneCubicSplinePath(projectedPts);
      }
    }

    const floorY = getY(safetyFloor);

  // Adaptive X Ticks with Collision Pruning
  // Prioritizes: pre-month day (if any), Day 1 (month start), and maxDay (month end)
  const candidateDays = [];
  if (minDay < 0) {
    candidateDays.push(minDay);
  }
  candidateDays.push(1);
  [5, 10, 15, 20, 25].forEach((d) => {
    if (d > minDay && d < maxDay) {
      candidateDays.push(d);
    }
  });
  if (!candidateDays.includes(maxDay)) {
    candidateDays.push(maxDay);
  }

  // Enforce minimum 42px clearance between adjacent labels to prevent overlapping
  const prunedXTicks = [];
  candidateDays.forEach((day) => {
    const x = getX(day);

    // If candidate is not the last day, avoid collision with maxDay
    if (day !== maxDay && Math.abs(getX(maxDay) - x) < 38) {
      return;
    }

    if (prunedXTicks.length === 0) {
      prunedXTicks.push(day);
    } else {
      const prevX = getX(prunedXTicks[prunedXTicks.length - 1]);
      if (x - prevX >= 40) {
        prunedXTicks.push(day);
      }
    }
  });

    // Guarantee maxDay is represented at the month-end boundary
    if (!prunedXTicks.includes(maxDay)) {
      if (prunedXTicks.length > 0 && Math.abs(getX(maxDay) - getX(prunedXTicks[prunedXTicks.length - 1])) < 38) {
        prunedXTicks[prunedXTicks.length - 1] = maxDay;
      } else {
        prunedXTicks.push(maxDay);
      }
    }

    return {
      minDay,
      maxDay,
      width,
      height,
      paddingLeft,
      paddingRight,
      paddingTop,
      paddingBottom,
      chartWidth,
      chartHeight,
      getX,
      getY,
      points,
      pathD,
      realizedPathD,
      projectedPathD,
      areaD,
      floorY,
      yTicks,
      prunedXTicks
    };
  }, [dailyBalances, safetyFloor, currencySymbol, isMobile, currentDay, size.w, size.h, fillHeight]);

  const {
    minDay,
    maxDay,
    width,
    height,
    paddingLeft,
    paddingRight,
    paddingTop,
    paddingBottom,
    chartWidth,
    chartHeight,
    getX,
    getY,
    points,
    pathD,
    realizedPathD,
    projectedPathD,
    areaD,
    floorY,
    yTicks,
    prunedXTicks
  } = chartData;

  // Days with planned commitments (transactions/events)
  const plannedDaySet = useMemo(() => {
    const set = new Set();
    (events || []).forEach((e) => {
      if (e.isPlannedTransaction || (!e.isActual && e.amount < 0 && e.itemType !== 'income')) {
        set.add(e.day);
      }
    });
    return set;
  }, [events]);

  // Income events get their own marker (▲) so paydays read differently from bills
  const isIncomePoint = (pt) => Boolean(pt?.event && (pt.event.amount > 0) && pt.event.itemType !== 'transfer');
  const hasIncomeMarkers = points.some(isIncomePoint);

  const lastPoint = points.length ? points[points.length - 1] : null;
  const firstPoint = points.length ? points[0] : null;
  const lowestPoint = points.reduce((min, p) => (!min || p.balance < min.balance ? p : min), null);
  const chartSummary = lastPoint && firstPoint && lowestPoint
    ? `Balance starts at ${formatCurrency(firstPoint.balance, currencySymbol)} and is projected to end the month at ${formatCurrency(lastPoint.balance, currencySymbol)}. `
      + `Lowest point ${formatCurrency(lowestPoint.balance, currencySymbol)}${lowestPoint.date ? ` on ${formatDisplayDate(lowestPoint.date, true)}` : ''}, `
      + (safetyFloor > 0
        ? (lowestPoint.balance < safetyFloor
          ? `${formatCurrency(safetyFloor - lowestPoint.balance, currencySymbol)} below the safety floor.`
          : `${formatCurrency(lowestPoint.balance - safetyFloor, currencySymbol)} above the safety floor.`)
        : 'no safety floor set.')
    : '';

  // Active point for tooltip inspection (can be specific intraday event point or day point)
  const activeDay = hoveredDay !== null ? hoveredDay : selectedDay;
  const activePoint = hoveredPointId !== null
    ? points.find((p) => p.eventId === hoveredPointId)
    : (activeDay !== null ? (points.find((p) => p.day === activeDay && !p.isIntermediate) || points.find((p) => p.day === activeDay)) : null);

  const activeDayObj = activePoint ? dailyBalances.find((d) => d.day === activePoint.day) : null;
  const activeIndex = activeDayObj ? dailyBalances.indexOf(activeDayObj) : -1;
  const prevPoint = activeIndex > 0 ? dailyBalances[activeIndex - 1] : null;
  const isBreached = activePoint ? activePoint.balance < safetyFloor : false;

  // Day calculations: opening balance, spending on that day, and closing balance
  const closingBalance = activePoint ? activePoint.balance : 0;
  const rawDayEvents = activePoint
    ? ((activeDayObj && activeDayObj.intradayEvents && activeDayObj.intradayEvents.length > 0)
        ? activeDayObj.intradayEvents
        : (events || []).filter((e) => e.day === activePoint.day || e.date === activePoint.date))
    : [];

  const dayEvents = isFilteringAccount
    ? rawDayEvents.filter(matchesSelectedAccount)
    : rawDayEvents;

  const eventSpend = dayEvents.reduce((sum, e) => {
    return e.amount < 0 ? sum + Math.abs(e.amount) : sum;
  }, 0);

  let openingBalance = closingBalance;
  if (prevPoint) {
    openingBalance = prevPoint.balance;
  } else if (dayEvents.length > 0) {
    const netChange = dayEvents.reduce((sum, e) => sum + (e.amount || 0), 0);
    openingBalance = closingBalance - netChange;
  }

  let daySpend = eventSpend;
  if (daySpend === 0 && prevPoint && prevPoint.balance > closingBalance) {
    daySpend = prevPoint.balance - closingBalance;
  }

  // Active event on intermediate points (or single event for the day)
  const activeEvent = activePoint?.event || (dayEvents.length === 1 ? dayEvents[0] : null);
  const activeAccount = getEventAccountInfo(activeEvent);

  // Tooltip geometry
  const tooltipWidth = 224;
  const tooltipHeight = activeEvent
    ? (activeAccount ? (isBreached ? 142 : 124) : (isBreached ? 122 : 106))
    : (isBreached ? 96 : 84);
  let tooltipX = activePoint ? activePoint.x - tooltipWidth / 2 : 0;
  if (tooltipX < 6) tooltipX = 6;
  if (tooltipX + tooltipWidth > width - 6) tooltipX = width - tooltipWidth - 6;

  let tooltipY = activePoint ? activePoint.y - tooltipHeight - 12 : 0;
  if (tooltipY < 6) {
    tooltipY = activePoint ? activePoint.y + 12 : 6;
  }
  if (tooltipY + tooltipHeight > height - 6) {
    tooltipY = height - tooltipHeight - 6;
  }

  const todayPoint = typeof currentDay === 'number' ? dailyBalances.find((p) => p.day === currentDay) : null;

  // ---- Day insights: hovered day, else selected day, else today, else month-end ----
  // Strict attribution for the day panel: when an event names its account(s),
  // only those count. The balance snapshot (accountBalances) lists every
  // account, so it is used only for events with no account ids at all.
  const belongsToSelectedAccount = (ev) => {
    if (!isFilteringAccount) return true;
    const ids = [
      ev.bankAccountId, ev.walletId, ev.accountId,
      ev.sourceBankAccountId, ev.sourceWalletId, ev.sourceAccountId,
      ev.destinationBankAccountId, ev.destinationWalletId, ev.destinationAccountId
    ].filter(Boolean).map((v) => String(v._id || v.id || v));
    if (ids.length === 0) return matchesSelectedAccount(ev);
    return ids.some((id) => id === normSelectedId || (alt1 && id === alt1) || (alt2 && id === alt2) || (alt3 && id === alt3));
  };

  const eventsForDay = (pt) => {
    if (!pt) return [];
    const raw = (pt.intradayEvents && pt.intradayEvents.length > 0)
      ? pt.intradayEvents
      : (events || []).filter((e) => e.day === pt.day || e.date === pt.date);
    return raw.filter(belongsToSelectedAccount);
  };
  const dayOutflow = (evts) => evts.reduce((sum, e) => (e.amount < 0 && e.itemType !== 'transfer' ? sum + Math.abs(e.amount) : sum), 0);

  const insightDayNum = hoveredDay ?? selectedDay ?? (todayPoint ? todayPoint.day : dailyBalances[dailyBalances.length - 1]?.day);
  const insightIdx = dailyBalances.findIndex((d) => d.day === insightDayNum);
  const insightPt = insightIdx >= 0 ? dailyBalances[insightIdx] : null;
  let insight = null;
  if (insightPt) {
    const evts = eventsForDay(insightPt);
    const inflow = evts.reduce((sum, e) => (e.amount > 0 && e.itemType !== 'transfer' ? sum + e.amount : sum), 0);
    const outflow = dayOutflow(evts);
    const prevBal = insightIdx > 0
      ? dailyBalances[insightIdx - 1].balance
      : insightPt.balance - evts.reduce((sum, e) => sum + (e.amount || 0), 0);
    const change = insightPt.balance - prevBal;
    const headroom = insightPt.balance - safetyFloor;

    // Biggest outflow day across the month (for context)
    let maxOut = 0;
    dailyBalances.forEach((d) => { maxOut = Math.max(maxOut, dayOutflow(eventsForDay(d))); });
    const unplannedOut = evts.reduce((sum, e) => (e.amount < 0 && e.itemType === 'unplanned-transaction' ? sum + Math.abs(e.amount) : sum), 0);

    const flags = [];
    if (insightPt.date && insightPt.date === lowestDate) flags.push({ key: 'low', text: 'Lowest point of the month' });
    if (evts.some((e) => e.isSalary || e.itemType === 'salary')) flags.push({ key: 'pay', text: 'Payday' });
    if (outflow > 0 && outflow === maxOut) flags.push({ key: 'big', text: 'Biggest spending day' });
    if (safetyFloor > 0 && headroom < 0) flags.push({ key: 'breach', text: `${formatCurrency(Math.abs(headroom), currencySymbol)} below floor` });
    if (typeof safeDailyRate === 'number' && safeDailyRate > 0 && unplannedOut > safeDailyRate) {
      flags.push({ key: 'pace', text: `${formatCurrency(unplannedOut - safeDailyRate, currencySymbol)} over the daily safe amount` });
    }

    const phase = typeof currentDay === 'number'
      ? (insightPt.day === currentDay ? 'Today' : insightPt.day > currentDay ? 'Projected' : 'Actual')
      : null;

    insight = { pt: insightPt, evts, inflow, outflow, change, headroom, flags, phase };
  }

  const nearestDayFromClientX = (clientX) => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    if (!rect.width) return null;
    const relX = ((clientX - rect.left) / rect.width) * width;
    let closestDay = dailyBalances[0]?.day ?? 1;
    let minDistance = Infinity;
    dailyBalances.forEach((pt) => {
      const dist = Math.abs(getX(pt.day) - relX);
      if (dist < minDistance) {
        minDistance = dist;
        closestDay = pt.day;
      }
    });
    return closestDay;
  };

  const handleMouseMove = (e) => {
    if (hoveredPointId) return; // a specific intraday pin is being inspected
    const day = nearestDayFromClientX(e.clientX);
    if (day !== null && day !== hoveredDay) setHoveredDay(day);
  };

  const handleTouch = (e) => {
    if (!e.touches || e.touches.length === 0 || !containerRef.current) return;
    const touch = e.touches[0];
    const rect = containerRef.current.getBoundingClientRect();
    if (!rect.width) return;
    const touchX = touch.clientX - rect.left;
    const relX = (touchX / rect.width) * width;

    let closestDay = dailyBalances[0]?.day ?? 1;
    let minDistance = Infinity;

    dailyBalances.forEach((pt) => {
      const px = getX(pt.day);
      const dist = Math.abs(px - relX);
      if (dist < minDistance) {
        minDistance = dist;
        closestDay = pt.day;
      }
    });

    setHoveredDay(closestDay);
    onSelectDay?.(closestDay);
  };

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: '6px', marginBottom: '2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="card-title">Daily balance timeline</span>
          {selectedDay !== null && (
            <span
              className="selected-day-tag tabular-nums"
              style={{
                fontSize: '11.5px',
                padding: '2px 8px',
                background: 'var(--text)',
                color: 'var(--bg)',
                borderRadius: 'var(--radius-pill)',
                cursor: 'pointer',
                fontWeight: 600
              }}
              onClick={() => onSelectDay?.(null)}
              title="Click to clear day filter"
            >
              Day {selectedDay} &times;
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
          <ul className="chart-legend" aria-label="Chart legend">
            <li><span className="chart-key key-actual" aria-hidden="true" />{projectedPathD ? 'Actual' : 'Balance'}</li>
            {projectedPathD && (
              <li><span className="chart-key key-projected" aria-hidden="true" />Projected</li>
            )}
            {hasIncomeMarkers && (
              <li><span className="chart-key key-income" aria-hidden="true" />Income</li>
            )}
            {plannedDaySet.size > 0 && (
              <li><span className="chart-key key-bill" aria-hidden="true" />Planned bill</li>
            )}
            {safetyFloor > 0 && (
              <li><span className="chart-key key-floor" aria-hidden="true" /><span>{`Floor: ${formatCurrency(safetyFloor, currencySymbol)}`}</span></li>
            )}
          </ul>
          {onOpenReview && (
            <button
              type="button"
              className="btn-secondary"
              onClick={onOpenReview}
              style={{
                padding: '3px 9px',
                fontSize: '11.5px',
                fontWeight: 600,
                borderRadius: 'var(--radius)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                marginLeft: '4px'
              }}
              title="Review Month Performance"
            >
              Review Month
            </button>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className="chart-container"
        style={{ position: 'relative', touchAction: 'pan-y', width: '100%', overflow: 'hidden' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setHoveredDay(null); setHoveredPointId(null); }}
        onTouchStart={handleTouch}
        onTouchMove={handleTouch}
        onTouchEnd={() => setHoveredDay(null)}
        onTouchCancel={() => setHoveredDay(null)}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          className={`chart-svg ${fillHeight ? 'chart-svg-fill' : ''}`}
          preserveAspectRatio="none"
          style={{ overflow: 'visible', userSelect: 'none', display: 'block', maxWidth: '100%' }}
        >
          {/* Defs for soft ambient curve glow & modern area gradient */}
          <defs>
            <linearGradient id="monochromeCurveGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--text)" stopOpacity="0.16" />
              <stop offset="60%" stopColor="var(--text)" stopOpacity="0.04" />
              <stop offset="100%" stopColor="var(--text)" stopOpacity="0.0" />
            </linearGradient>
            <filter id="chartCurveGlow" x="-10%" y="-20%" width="120%" height="150%">
              <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="var(--text)" floodOpacity="0.15" />
            </filter>
          </defs>

          {/* Plot background: clicking anywhere selects the nearest day */}
          <rect
            x={paddingLeft}
            y={paddingTop}
            width={chartWidth}
            height={chartHeight}
            fill="transparent"
            style={{ cursor: 'crosshair' }}
            onClick={(e) => {
              const day = nearestDayFromClientX(e.clientX);
              if (day !== null) onSelectDay?.(selectedDay === day ? null : day);
            }}
          />

          {/* Subtle Horizontal Grid lines */}
          {yTicks.map((t, idx) => (
            <g key={idx}>
              <line
                x1={paddingLeft}
                y1={getY(t.val)}
                x2={width - paddingRight}
                y2={getY(t.val)}
                stroke="var(--border)"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.45"
              />
              <text
                x={paddingLeft - 8}
                y={getY(t.val) + 4}
                textAnchor="end"
                className="chart-axis-text"
                style={{ fontSize: '11px', fontWeight: 500, fill: 'var(--text-muted)' }}
              >
                {t.label}
              </text>
            </g>
          ))}

          {/* Dashed Safety Floor Line */}
          <line
            x1={paddingLeft}
            y1={floorY}
            x2={width - paddingRight}
            y2={floorY}
            stroke={floorBreached ? 'var(--rose, #f43f5e)' : 'var(--text-muted)'}
            strokeWidth="1.5"
            strokeDasharray="4 4"
            opacity={floorBreached ? 0.85 : 0.45}
          />
          {/* Floor label sits at the left end; the right end carries the month-end value */}
          <text
            x={paddingLeft + 4}
            y={floorY - 6}
            textAnchor="start"
            style={{
              fontSize: '10.5px',
              fill: floorBreached ? 'var(--rose, #f43f5e)' : 'var(--text-secondary)',
              fontWeight: 600
            }}
          >
            {`Safety floor: ${formatCurrency(safetyFloor, currencySymbol)}`}
          </text>

          {/* Below-floor zone: makes "danger" a place on the chart, not just a number */}
          {safetyFloor > 0 && floorY < height - paddingBottom && (
            <rect
              x={paddingLeft}
              y={floorY}
              width={chartWidth}
              height={Math.max(0, height - paddingBottom - floorY)}
              fill="var(--rose)"
              opacity={floorBreached ? 0.1 : 0.05}
            />
          )}

          {/* Smooth area fill under the curve */}
          {areaD && (
            <path d={areaD} fill="url(#monochromeCurveGrad)" />
          )}

          {/* Crisp Today Indicator Line & Glow Badge */}
          {todayPoint && (
            <g className="chart-today-group">
              <line
                x1={getX(todayPoint.day)}
                y1={paddingTop}
                x2={getX(todayPoint.day)}
                y2={height - paddingBottom}
                stroke="var(--text-secondary)"
                strokeWidth="1.5"
                strokeDasharray="3 3"
                opacity="0.8"
              />
              <rect
                x={getX(todayPoint.day) - 22}
                y={paddingTop - 13}
                width="44"
                height="15"
                rx="3.5"
                fill="var(--text)"
                filter="drop-shadow(0 2px 4px rgba(0, 0, 0, 0.25))"
              />
              <text
                x={getX(todayPoint.day)}
                y={paddingTop - 2}
                textAnchor="middle"
                fill="var(--bg)"
                style={{ fontSize: '9.5px', fontWeight: 800, letterSpacing: '0.04em' }}
              >
                TODAY
              </text>
            </g>
          )}

          {/* Active / Hovered Point Guideline */}
          {activePoint && (
            <line
              x1={getX(activePoint.day)}
              y1={paddingTop}
              x2={getX(activePoint.day)}
              y2={height - paddingBottom}
              stroke="var(--text-secondary)"
              strokeWidth="1"
              strokeDasharray="2 2"
              opacity="0.6"
            />
          )}

          {/* Dual-Phase Curved Line Paths: Solid Realized vs Dashed Projected */}
          {realizedPathD && projectedPathD ? (
            <>
              {/* Realized History Line up to Today with Ambient Glow */}
              <path
                d={realizedPathD}
                fill="none"
                stroke="var(--text)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#chartCurveGlow)"
              />
              {/* Future Projection Line reflecting Planned Commitments */}
              <path
                d={projectedPathD}
                fill="none"
                stroke="var(--text-secondary)"
                strokeWidth="2.2"
                strokeDasharray="4 4"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.85"
              />
            </>
          ) : (
            <path
              d={pathD}
              fill="none"
              stroke="var(--text)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#chartCurveGlow)"
            />
          )}

          {/* Data Points (supports multiple same-day transaction pins) */}
          {points.map((pt) => {
            const isLowest = pt.date === lowestDate;
            const isSelected = selectedDay === pt.day;
            const isHovered = hoveredPointId === pt.eventId || (hoveredDay === pt.day && !hoveredPointId);
            const isPlannedDay = plannedDaySet.has(pt.day);
            const x = pt.x;
            const y = pt.y;

            return (
              <g key={pt.eventId}>
                {/* Visual circle dot */}
                {isLowest ? (
                  <circle
                    cx={x}
                    cy={y}
                    r={isSelected || isHovered ? '6' : '5'}
                    fill="var(--surface)"
                    stroke="var(--text)"
                    strokeWidth="2.5"
                  />
                ) : isIncomePoint(pt) ? (
                  <path
                    d={`M ${x} ${y - (isSelected || isHovered ? 7 : 5.5)} L ${x + (isSelected || isHovered ? 6.5 : 5)} ${y + (isSelected || isHovered ? 4.5 : 3.5)} L ${x - (isSelected || isHovered ? 6.5 : 5)} ${y + (isSelected || isHovered ? 4.5 : 3.5)} Z`}
                    fill="var(--positive)"
                    stroke="var(--surface)"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                ) : (isPlannedDay || pt.event?.isPlannedTransaction) ? (
                  <>
                    <circle
                      cx={x}
                      cy={y}
                      r={isSelected || isHovered ? '6.5' : (pt.isIntermediate ? '4.5' : '5')}
                      fill="var(--surface)"
                      stroke="var(--indigo)"
                      strokeWidth={isSelected || isHovered ? '2.5' : '1.8'}
                    />
                    <circle
                      cx={x}
                      cy={y}
                      r={isSelected || isHovered ? '3' : '2'}
                      fill="var(--indigo)"
                    />
                  </>
                ) : (
                  <circle
                    cx={x}
                    cy={y}
                    r={isSelected || isHovered ? '5' : (pt.isIntermediate ? '3' : '2.5')}
                    fill={isSelected || isHovered ? 'var(--text)' : 'var(--text-secondary)'}
                    opacity={isSelected || isHovered ? '1' : '0.55'}
                    stroke={isSelected || isHovered ? 'var(--surface)' : 'none'}
                    strokeWidth={isSelected || isHovered ? '1.5' : '0'}
                  />
                )}

                {/* Invisible hit-box circle for click/hover/tap */}
                <circle
                  cx={x}
                  cy={y}
                  r={pt.isIntermediate ? '14' : '18'}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => {
                    setHoveredPointId(pt.eventId);
                    setHoveredDay(pt.day);
                  }}
                  onMouseLeave={() => {
                    setHoveredPointId(null);
                    setHoveredDay(null);
                  }}
                  onClick={() => onSelectDay?.(selectedDay === pt.day ? null : pt.day)}
                />
              </g>
            );
          })}

          {/* Month-end value at the end of the line (the projection's answer) */}
          {lastPoint && (
            <text
              x={lastPoint.x - 4}
              y={Math.max(paddingTop + 4, lastPoint.y - 10)}
              textAnchor="end"
              className="chart-endpoint-label"
              style={{ fontSize: '11px', fontWeight: 600, fill: 'var(--text)' }}
            >
              {`${projectedPathD ? 'Month-end ' : ''}${formatChartTick(lastPoint.balance, currencySymbol)}`}
            </text>
          )}

          {/* X Axis ticks: pruned for clarity and zero collisions */}
          {prunedXTicks.map((day) => {
            const point = dailyBalances.find((p) => p.day === day);
            const isSelected = selectedDay === day;
            const isNegative = day < 0;

            let labelText = `${day}`;
            if (isNegative && point) {
              labelText = formatDisplayDate(point.date, false);
            } else if (day === 1 && point) {
              labelText = formatDisplayDate(point.date, false);
            }

            // Smart textAnchor to prevent boundary clipping on edges
            const isLeftEdge = day === minDay;
            const isRightEdge = day === maxDay;
            const textAnchor = isLeftEdge ? (isNegative ? 'start' : 'middle') : isRightEdge ? 'end' : 'middle';

            return (
              <text
                key={day}
                x={getX(day)}
                y={height - 8}
                textAnchor={textAnchor}
                className="chart-axis-text"
                style={{
                  fill: isSelected ? 'var(--text)' : isNegative ? 'var(--text)' : undefined,
                  fontWeight: isSelected || isNegative ? 600 : 500,
                  fontSize: '11.5px',
                  cursor: 'pointer'
                }}
                onClick={() => onSelectDay?.(selectedDay === day ? null : day)}
              >
                {labelText}
              </text>
            );
          })}

          {/* Interactive Floating Tooltip */}
          {activePoint && (
            <g transform={`translate(${tooltipX}, ${tooltipY})`} style={{ pointerEvents: 'none' }}>
              <rect
                width={tooltipWidth}
                height={tooltipHeight}
                rx="8"
                fill="var(--surface)"
                stroke="var(--border)"
                strokeWidth="1"
                filter="drop-shadow(0 4px 14px rgba(0, 0, 0, 0.12))"
              />
              {/* Header: Date */}
              <text
                x="12"
                y="17"
                fill="var(--text-secondary)"
                style={{ fontSize: '11px', fontWeight: 600 }}
              >
                {activePoint.day < 0
                  ? `${formatDisplayDate(activePoint.date, true)} (Day ${activePoint.day})`
                  : formatDisplayDate(activePoint.date, true)}
              </text>

              {/* Active Transaction specific details (if an intraday transaction pin is hovered) */}
              {activeEvent ? (
                <>
                  <text
                    x="12"
                    y="35"
                    fill="var(--text)"
                    style={{ fontSize: '11.5px', fontWeight: 600 }}
                  >
                    {(activeEvent.name || activeEvent.description || activeEvent.label || 'Transaction').slice(0, 16)}
                  </text>
                  <text
                    x={tooltipWidth - 12}
                    y="35"
                    textAnchor="end"
                    className="tabular-nums"
                    fill={activeEvent.amount < 0 ? 'var(--text)' : 'var(--emerald, #10b981)'}
                    style={{ fontSize: '12px', fontWeight: 700 }}
                  >
                    {activeEvent.amount < 0 ? `-${formatCurrency(Math.abs(activeEvent.amount), currencySymbol)}` : `+${formatCurrency(activeEvent.amount, currencySymbol)}`}
                  </text>

                  {/* Account Name & Type (Bank / Wallet) */}
                  {activeAccount && (
                    <>
                      <text
                        x="12"
                        y="52"
                        fill="var(--text-secondary)"
                        style={{ fontSize: '11px', fontWeight: 500 }}
                      >
                        Account:
                      </text>
                      <text
                        x={tooltipWidth - 12}
                        y="52"
                        textAnchor="end"
                        fill="var(--text-secondary)"
                        style={{ fontSize: '11.5px', fontWeight: 600 }}
                      >
                        {activeAccount.name.slice(0, 16)} ({activeAccount.type})
                      </text>
                    </>
                  )}

                  {/* Balance After this transaction */}
                  <text
                    x="12"
                    y={activeAccount ? 70 : 52}
                    fill="var(--text-secondary)"
                    style={{ fontSize: '11px', fontWeight: 500 }}
                  >
                    Balance:
                  </text>
                  <text
                    x={tooltipWidth - 12}
                    y={activeAccount ? 70 : 52}
                    textAnchor="end"
                    className="tabular-nums"
                    fill="var(--text)"
                    style={{ fontSize: '12px', fontWeight: 600 }}
                  >
                    {formatCurrency(activePoint.balance, currencySymbol)}
                  </text>

                  {/* Day Closing Balance */}
                  <text
                    x="12"
                    y={activeAccount ? 88 : 69}
                    fill="var(--text-secondary)"
                    style={{ fontSize: '11px', fontWeight: 500 }}
                  >
                    Day End:
                  </text>
                  <text
                    x={tooltipWidth - 12}
                    y={activeAccount ? 88 : 69}
                    textAnchor="end"
                    className="tabular-nums"
                    fill="var(--text-secondary)"
                    style={{ fontSize: '11.5px', fontWeight: 600 }}
                  >
                    {formatCurrency(closingBalance, currencySymbol)}
                  </text>
                </>
              ) : (
                <>
                  {/* Opening Balance */}
                  <text
                    x="12"
                    y="35"
                    fill="var(--text-secondary)"
                    style={{ fontSize: '11.5px', fontWeight: 500 }}
                  >
                    Opening:
                  </text>
                  <text
                    x={tooltipWidth - 12}
                    y="35"
                    textAnchor="end"
                    className="tabular-nums"
                    fill="var(--text)"
                    style={{ fontSize: '12px', fontWeight: 600 }}
                  >
                    {formatCurrency(openingBalance, currencySymbol)}
                  </text>

                  {/* Day Spending */}
                  <text
                    x="12"
                    y="52"
                    fill="var(--text-secondary)"
                    style={{ fontSize: '11.5px', fontWeight: 500 }}
                  >
                    Spending:
                  </text>
                  <text
                    x={tooltipWidth - 12}
                    y="52"
                    textAnchor="end"
                    className="tabular-nums"
                    fill={daySpend > 0 ? 'var(--text)' : 'var(--text-secondary)'}
                    style={{ fontSize: '12px', fontWeight: 600 }}
                  >
                    {daySpend > 0 ? `-${formatCurrency(daySpend, currencySymbol)}` : formatCurrency(0, currencySymbol)}
                  </text>

                  {/* Closing Balance */}
                  <text
                    x="12"
                    y="69"
                    fill="var(--text-secondary)"
                    style={{ fontSize: '11.5px', fontWeight: 500 }}
                  >
                    Closing:
                  </text>
                  <text
                    x={tooltipWidth - 12}
                    y="69"
                    textAnchor="end"
                    className="tabular-nums"
                    fill="var(--text)"
                    style={{ fontSize: '12px', fontWeight: 700 }}
                  >
                    {formatCurrency(closingBalance, currencySymbol)}
                  </text>
                </>
              )}

              {/* Floor Breached Warning */}
              {isBreached && (
                <text
                  x="12"
                  y={activeEvent ? (activeAccount ? 106 : 88) : 87}
                  fill="var(--danger)"
                  style={{ fontSize: '10.5px', fontWeight: 600 }}
                >
                  ▲ Floor breached
                </text>
              )}
            </g>
          )}
        </svg>
        {chartSummary && <p className="sr-only">{chartSummary}</p>}
      </div>

      {insight && (
        <div className="day-insight" aria-live="polite">
          <div className="di-head">
            <span className="di-date">
              {insight.pt.date ? formatDisplayDate(insight.pt.date, true) : `Day ${insight.pt.day}`}
            </span>
            {insight.phase && <span className={`di-phase phase-${insight.phase.toLowerCase()}`}>{insight.phase}</span>}
            <span className="di-hint">
              {hoveredDay !== null ? 'Hovering' : selectedDay !== null ? 'Selected day' : 'Hover or tap the chart to inspect a day'}
            </span>
          </div>

          <dl className="di-stats">
            <div className="di-stat">
              <dt>Closing balance</dt>
              <dd className="tabular-nums">{formatCurrency(insight.pt.balance, currencySymbol)}</dd>
            </div>
            <div className="di-stat">
              <dt>Change from day before</dt>
              <dd className={`tabular-nums ${insight.change > 0 ? 'di-up' : insight.change < 0 ? 'di-down' : ''}`}>
                {insight.change > 0 ? '▲ +' : insight.change < 0 ? '▼ ' : ''}{formatCurrency(insight.change, currencySymbol)}
              </dd>
            </div>
            <div className="di-stat">
              <dt>Money in / out</dt>
              <dd className="tabular-nums">
                <span className="di-up">+{formatCurrency(insight.inflow, currencySymbol)}</span>
                {' / '}
                <span>-{formatCurrency(insight.outflow, currencySymbol)}</span>
              </dd>
            </div>
            <div className="di-stat">
              <dt>{safetyFloor > 0 ? 'Room above floor' : 'Safety floor'}</dt>
              <dd className={`tabular-nums ${safetyFloor > 0 && insight.headroom < 0 ? 'di-down' : ''}`}>
                {safetyFloor > 0 ? formatCurrency(insight.headroom, currencySymbol) : 'Not set'}
              </dd>
            </div>
          </dl>

          {insight.flags.length > 0 && (
            <ul className="di-flags">
              {insight.flags.map((f) => (
                <li key={f.key} className={`di-flag flag-${f.key}`}>{f.text}</li>
              ))}
            </ul>
          )}

          {insight.evts.length > 0 ? (
            <ul className="di-events">
              {insight.evts.slice(0, 4).map((e, i) => (
                <li key={`${e.transactionId || e.itemId || e.label}-${i}`} className="di-event">
                  <span className="di-event-name">{e.label || e.name || 'Entry'}</span>
                  <span className={`di-event-amt tabular-nums ${e.amount > 0 ? 'di-up' : ''}`}>
                    {e.itemType === 'transfer' && !isFilteringAccount
                      ? `⇄ ${formatCurrency(e.transferAmount || 0, currencySymbol)}`
                      : `${e.amount > 0 ? '+' : ''}${formatCurrency(e.amount, currencySymbol)}`}
                  </span>
                </li>
              ))}
              {insight.evts.length > 4 && <li className="di-more">+{insight.evts.length - 4} more in the timeline</li>}
            </ul>
          ) : (
            <p className="di-quiet">No money moved on this day.</p>
          )}
        </div>
      )}
    </div>
  );
}
