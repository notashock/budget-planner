import React from 'react';
import { formatCurrency, formatDisplayDate } from '@budget/engine';

/**
 * The chart's numbers as a table: one row per day with opening balance, money
 * in, money out, closing balance and the distance to the safety floor.
 * `rows` come from StepLineChart, already filtered to the selected account.
 */
export function BalanceTable({ rows = [], safetyFloor = 0, currentDay = null, currencySymbol = '₹', onSelectDay = null, selectedDay = null }) {
  return (
    <div className="balance-table-wrap">
      <table className="balance-table">
        <caption className="sr-only">Daily balances for the month</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col" className="num">Opening</th>
            <th scope="col" className="num">In</th>
            <th scope="col" className="num">Out</th>
            <th scope="col" className="num">Closing</th>
            {safetyFloor > 0 && <th scope="col" className="num">vs floor</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const vsFloor = r.closing - safetyFloor;
            const classes = [
              r.day === currentDay ? 'is-today' : '',
              r.day === selectedDay ? 'is-selected' : '',
              safetyFloor > 0 && vsFloor < 0 ? 'is-below' : ''
            ].filter(Boolean).join(' ');
            return (
              <tr key={r.day} className={classes}>
                <th scope="row">
                  {onSelectDay ? (
                    <button type="button" className="bt-day" onClick={() => onSelectDay(selectedDay === r.day ? null : r.day)}>
                      {r.date ? formatDisplayDate(r.date, true) : `Day ${r.day}`}
                    </button>
                  ) : (r.date ? formatDisplayDate(r.date, true) : `Day ${r.day}`)}
                  {r.day === currentDay && <span className="bt-today">Today</span>}
                </th>
                <td className="num">{formatCurrency(r.opening, currencySymbol)}</td>
                <td className="num bt-in">{r.inflow > 0 ? `+${formatCurrency(r.inflow, currencySymbol)}` : '–'}</td>
                <td className="num">{r.outflow > 0 ? `-${formatCurrency(r.outflow, currencySymbol)}` : '–'}</td>
                <td className="num bt-closing">{formatCurrency(r.closing, currencySymbol)}</td>
                {safetyFloor > 0 && (
                  <td className={`num ${vsFloor < 0 ? 'bt-below' : ''}`}>
                    {vsFloor < 0 ? `${formatCurrency(Math.abs(vsFloor), currencySymbol)} under` : `${formatCurrency(vsFloor, currencySymbol)} above`}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
