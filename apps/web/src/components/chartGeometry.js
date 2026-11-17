/**
 * Geometry and labelling helpers for the balance chart (StepLineChart.jsx).
 * Pure functions, so they can be unit-tested without rendering.
 */

// Compact axis labels in the Indian system, matching the en-IN amounts shown
// everywhere else: full figures under ₹10,000, then k (thousand), L (lakh)
// and Cr (crore). Values are in minor units (paise).
export function formatChartTick(val, symbol) {
  const major = Math.abs(val) / 100;
  const sign = val < 0 ? '-' : '';
  const compact = (n) => String(Math.round(n * 10) / 10);

  if (major >= 10000000) return `${sign}${symbol}${compact(major / 10000000)}Cr`;
  if (major >= 100000) return `${sign}${symbol}${compact(major / 100000)}L`;
  if (major >= 10000) return `${sign}${symbol}${compact(major / 1000)}k`;
  return `${sign}${symbol}${Math.round(major).toLocaleString('en-IN')}`;
}

/**
 * Step-after path through daily points: a balance holds its level for the whole
 * day and only changes when money moves, so each segment is horizontal to the
 * next day, then vertical to that day's balance. Points must be sorted by x.
 */
export function getStepPath(points) {
  if (!points || points.length === 0) return '';
  const f = (n) => n.toFixed(1);
  let d = `M ${f(points[0].x)} ${f(points[0].y)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` H ${f(points[i].x)} V ${f(points[i].y)}`;
  }
  return d;
}

/** The step path closed down to a baseline, for the area under the line. */
export function getStepAreaPath(points, baselineY) {
  if (!points || points.length === 0) return '';
  const f = (n) => n.toFixed(1);
  return `${getStepPath(points)} V ${f(baselineY)} H ${f(points[0].x)} Z`;
}

/** Round a step size to 1, 2 or 5 × 10ⁿ. */
function niceStep(rawStep) {
  if (!(rawStep > 0)) return 1;
  const exp = Math.floor(Math.log10(rawStep));
  const base = 10 ** exp;
  const frac = rawStep / base;
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return nice * base;
}

/**
 * Round axis ticks that cover [min, max]: about `count` intervals, each a
 * 1/2/5 × 10ⁿ step, starting at a multiple of the step. Values are in paise,
 * so steps land on round rupee amounts (₹500, ₹2,000, ₹50k …) for any balance
 * of ₹10 or more.
 */
export function niceTicks(min, max, count = 4) {
  let lo = Number(min) || 0;
  let hi = Number(max) || 0;
  if (hi < lo) [lo, hi] = [hi, lo];
  if (hi === lo) hi = lo + 100;
  const step = niceStep((hi - lo) / Math.max(1, count));
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = start; v <= end + step / 2; v += step) {
    ticks.push(Math.round(v));
  }
  return ticks;
}

/**
 * Contiguous runs of days below the floor, as [{ startDay, endDay, startDate, endDate, deepest }].
 */
export function findBreachRuns(dailyBalances, floor) {
  const runs = [];
  if (!(floor > 0)) return runs;
  let cur = null;
  (dailyBalances || []).forEach((d) => {
    if (d.balance < floor) {
      if (!cur) {
        cur = { startDay: d.day, endDay: d.day, startDate: d.date, endDate: d.date, deepest: d.balance };
      } else {
        cur.endDay = d.day;
        cur.endDate = d.date;
        cur.deepest = Math.min(cur.deepest, d.balance);
      }
    } else if (cur) {
      runs.push(cur);
      cur = null;
    }
  });
  if (cur) runs.push(cur);
  return runs;
}
