/**
 * Form fixtures (dev only, not part of the app bundle): renders each entry and
 * edit form with mock data so layout, spacing and control sizes can be checked
 * at any width without a server or a login.
 *
 *   npm run dev --workspace=@budget/web, then open
 *   /form-fixtures.html?form=<name>[&theme=dark]
 *
 * Network calls fail quietly (no API server); forms that load data show their
 * empty state.
 */
import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import '../styles/index.css';
import { UnifiedEntryModal } from '../components/UnifiedEntryModal.jsx';
import { AnimatedModal } from '../components/AnimatedModal.jsx';
import { HeldLentForm } from '../components/HeldLentForm.jsx';
import { CardsPanel } from '../components/CardsPanel.jsx';

const bankAccounts = [
  { id: 'b1', _id: 'b1', name: 'HDFC Salary', isPrimary: true, openingBalance: 4230000, minimumBalance: 1000000 },
  { id: 'b2', _id: 'b2', name: 'SBI Savings', openingBalance: 1250000, minimumBalance: 0 }
];
const wallets = [{ id: 'w1', _id: 'w1', name: 'Cash Wallet', openingBalance: 120000 }];
const month = { year: 2026, month: 11, incomeAmount: 8500000, incomeCreditDate: '2026-11-30', salaryBankAccountId: 'b1' };
const plannedItems = [
  { _id: 'p1', id: 'p1', type: 'one-time', name: 'Rent', amount: 1500000, day: 5, isPaid: false },
  { _id: 'p2', id: 'p2', type: 'recurring', name: 'Internet', amount: 99900, dayOfMonth: 12, isPaid: false }
];

const creditCards = [
  { id: 'c1', name: 'HDFC Millennia', outstanding: 1845000, openBill: { statementId: 's1', remaining: 1210000, minimumDue: 60500, dueDate: '2026-12-05' } },
  { id: 'c2', name: 'Amazon Pay ICICI', outstanding: 230000, openBill: null }
];

const EDIT_ITEMS = {
  'edit-spend': { _id: 't1', id: 't1', origin: 'spot', status: 'successful', title: 'Groceries', amount: 125000, date: '2026-11-15', category: 'Food', accountId: 'b1' },
  'edit-plan': { _id: 'p2', id: 'p2', type: 'recurring', name: 'Internet', amount: 99900, dayOfMonth: 12, category: 'Utilities', accountId: 'b1', status: 'planned' }
};

const FORMS = {
  spend: { kind: 'entry', mode: 'log' },
  income: { kind: 'entry', mode: 'income' },
  plan: { kind: 'entry', mode: 'plan' },
  transfer: { kind: 'entry', mode: 'transfer' },
  held: { kind: 'entry', mode: 'held' },
  'move-card': { kind: 'entry', mode: 'transfer', preset: { moveTarget: 'card', cardId: 'c1' } },
  'edit-spend': { kind: 'entry', mode: 'log', edit: true },
  'edit-plan': { kind: 'entry', mode: 'plan', edit: true },
  'held-form': { kind: 'held' },
  cards: { kind: 'cards' },
  // The app's real layering: sticky header, screens inside <main class="app-box-3">,
  // fixed bottom nav. A modal opened from a screen must cover all three.
  stacking: { kind: 'stacking' },
  'stacking-entry': { kind: 'stacking', entry: true }
};

function Fixture() {
  const params = new URLSearchParams(window.location.search);
  const name = params.get('form') || 'spend';
  const theme = params.get('theme');
  if (theme) document.documentElement.setAttribute('data-theme', theme);
  const form = FORMS[name] || FORMS.spend;
  const [open, setOpen] = useState(true);
  const noop = async () => {};

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', padding: 16 }}>
      <nav aria-label="Fixtures" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {Object.keys(FORMS).map((k) => (
          <a key={k} href={`?form=${k}${theme ? `&theme=${theme}` : ''}`} style={{ color: k === name ? 'var(--text)' : 'var(--text-secondary)' }}>{k}</a>
        ))}
        <button type="button" onClick={() => setOpen(true)}>Reopen</button>
      </nav>

      {form.kind === 'entry' && (
        <UnifiedEntryModal
          isOpen={open}
          onClose={() => setOpen(false)}
          initialMode={form.mode}
          initialItem={form.edit ? EDIT_ITEMS[name] : null}
          initialPreset={form.preset || null}
          creditCards={creditCards}
          onSettleTransaction={noop}
          onDeleteEntry={noop}
          onLogTransaction={noop}
          onSaveItem={noop}
          onCreateTransfer={noop}
          plannedItems={plannedItems}
          bankAccounts={bankAccounts}
          wallets={wallets}
          month={month}
        />
      )}

      {form.kind === 'held' && (
        <AnimatedModal isOpen={open} onClose={() => setOpen(false)}>
          <HeldLentForm bankAccounts={bankAccounts} wallets={wallets} month={month} initialAction="lend" onCancel={() => setOpen(false)} />
        </AnimatedModal>
      )}

      {form.kind === 'stacking' && (
        <div className="app-shell">
          <header className="app-header" data-testid="fixture-header" style={{ height: 56 }}>Header</header>
          <main className="app-box-3" style={{ minHeight: 600 }}>
            <p>Screen content</p>
            {!form.entry && (
              <AnimatedModal isOpen={open} onClose={() => setOpen(false)} dataTestId="screen-modal">
                <HeldLentForm bankAccounts={bankAccounts} wallets={wallets} month={month} initialAction="lend" onCancel={() => setOpen(false)} />
              </AnimatedModal>
            )}
          </main>
          <nav className="bottom-nav" data-testid="fixture-nav">Bottom nav</nav>
          {form.entry && (
            <UnifiedEntryModal
              isOpen={open}
              onClose={() => setOpen(false)}
              initialMode="log"
              onLogTransaction={noop}
              onSaveItem={noop}
              bankAccounts={bankAccounts}
              wallets={wallets}
              month={month}
            />
          )}
        </div>
      )}

      {form.kind === 'cards' && (
        <CardsPanel bankAccounts={bankAccounts} wallets={wallets} />
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Fixture />);
