import React, { useState } from 'react';
import { api } from '../api.js';
import { formatCurrency } from '@budget/engine';

export function AssistantScreen({
  settings,
  onToggleAi,
  simulation,
  month,
  onSaveParsedItem,
  currencySymbol = '₹'
}) {
  const isEnabled = settings?.aiAssistantEnabled === true;

  const [promptText, setPromptText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [draftItem, setDraftItem] = useState(null);

  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState(null);
  const [explainError, setExplainError] = useState('');

  const handleParse = async (e) => {
    e.preventDefault();
    if (!promptText.trim()) return;

    setParsing(true);
    setParseError('');
    setDraftItem(null);

    try {
      const res = await api.parseText(promptText);
      setDraftItem(res.item);
    } catch (err) {
      setParseError(err.message || 'Failed to parse text into budget item');
    } finally {
      setParsing(false);
    }
  };

  const handleConfirmDraft = () => {
    if (!draftItem) return;
    onSaveParsedItem(draftItem);
    setDraftItem(null);
    setPromptText('');
  };

  const handleExplain = async () => {
    if (!simulation) return;

    setExplaining(true);
    setExplainError('');
    setExplanation(null);

    try {
      const timelineSummary = {
        endingBalance: simulation.endingBalance,
        lowestBalance: simulation.lowestBalance,
        lowestDate: simulation.lowestDate,
        floorBreached: simulation.floorBreached,
        events: simulation.events.map((e) => ({
          date: e.date,
          label: e.label,
          amount: e.amount,
          balanceAfter: e.balanceAfter,
          itemType: e.itemType
        }))
      };

      const res = await api.explainTimeline(timelineSummary, month.safetyFloor);
      setExplanation(res);
    } catch (err) {
      setExplainError(err.message || 'Failed to generate timeline explanation');
    } finally {
      setExplaining(false);
    }
  };

  if (!isEnabled) {
    return (
      <div className="screen-content">
        <h2>AI assistant</h2>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="card-header">
            <span className="card-title">Assistant is disabled</span>
          </div>
          <p style={{ color: 'var(--text-secondary)' }}>
            The AI assistant is strictly optional and off by default. When turned off, zero financial data leaves the server.
          </p>
          <p style={{ color: 'var(--text-secondary)' }}>
            When enabled, it parses natural language descriptions into draft budget items (which you review before saving) and provides suggestions on how to resolve safety floor breaches.
          </p>
          <div style={{ marginTop: '8px' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={() => onToggleAi(true)}
            >
              Enable AI assistant
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2>AI assistant</h2>
        <button
          type="button"
          className="btn-subtle"
          onClick={() => onToggleAi(false)}
          style={{ fontSize: '12px', color: 'var(--danger)' }}
        >
          Disable assistant
        </button>
      </div>

      {/* Feature 1: Natural Language Text to Draft Item */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Convert text to budget item</span>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
          Describe an expense in plain language. The assistant converts it into a draft item for your review before saving.
        </p>

        <form onSubmit={handleParse} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <textarea
            rows="2"
            placeholder="e.g. Internet bill of 999 on the 15th every month, or groceries 2500 on day 5"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn-primary" disabled={parsing || !promptText.trim()}>
              {parsing ? (
                <>
                  <span className="btn-spinner" style={{ marginRight: '8px' }} />
                  <span>Parsing item...</span>
                </>
              ) : (
                'Parse into item'
              )}
            </button>
          </div>
        </form>

        {parsing && (
          <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="skeleton-pulse" style={{ height: '14px', width: '45%' }} />
            <div className="skeleton-pulse" style={{ height: '36px', width: '100%' }} />
          </div>
        )}

        {parseError && (
          <div style={{ marginTop: '10px', color: 'var(--danger)', fontSize: '12px' }}>
            Error: {parseError}
          </div>
        )}

        {/* Draft Confirmation Card */}
        {draftItem && (
          <div
            style={{
              marginTop: '14px',
              padding: '12px',
              background: 'var(--surface-subtle)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '13px' }}>Review draft item before saving</div>
            <div style={{ fontSize: '13px' }}>
              <strong>Name:</strong> {draftItem.name} ({draftItem.type})
            </div>

            <div style={{ fontSize: '13px' }}>
              <strong>Amount:</strong> {formatCurrency(draftItem.amount, currencySymbol)} on day {draftItem.day || draftItem.dayOfMonth}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
              <button type="button" onClick={() => setDraftItem(null)}>
                Discard
              </button>
              <button type="button" className="btn-primary" onClick={handleConfirmDraft}>
                Confirm and save item
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Feature 2: Explain Timeline & Suggest Fixes */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Timeline analysis & suggestions</span>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
          Analyzes the deterministic engine output and provides actionable suggestions if your safety floor is breached.
        </p>

        <button
          type="button"
          className="btn-primary"
          onClick={handleExplain}
          disabled={explaining || !simulation}
        >
          {explaining ? (
            <>
              <span className="btn-spinner" style={{ marginRight: '8px' }} />
              <span>Analyzing timeline...</span>
            </>
          ) : (
            'Analyze timeline'
          )}
        </button>

        {explaining && (
          <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="skeleton-pulse" style={{ height: '16px', width: '60%' }} />
            <div className="skeleton-pulse" style={{ height: '14px', width: '90%' }} />
            <div className="skeleton-pulse" style={{ height: '14px', width: '75%' }} />
          </div>
        )}

        {explainError && (
          <div style={{ marginTop: '10px', color: 'var(--danger)', fontSize: '12px' }}>
            Error: {explainError}
          </div>
        )}

        {explanation && (
          <div
            style={{
              marginTop: '14px',
              padding: '12px',
              background: 'var(--surface-subtle)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '13px' }}>
              {explanation.summary}
            </div>

            {explanation.suggestions && explanation.suggestions.length > 0 && (
              <ul style={{ paddingLeft: '18px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {explanation.suggestions.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
