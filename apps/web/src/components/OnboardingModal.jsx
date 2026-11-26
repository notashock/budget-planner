import React, { useState, useMemo } from 'react';
import { api } from '../api.js';
import { DatePicker } from './DatePicker.jsx';
import {
  BuildingLibraryIcon,
  WalletIcon,
  CheckIcon,
  CalendarIcon,
  TrendingUpIcon,
  SparklesIcon,
  ShieldAlertIcon,
  ChevronLeftIcon,
  CheckCircleIcon
} from './Icons.jsx';

function getTodayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const FEATURES = [
  { icon: SparklesIcon, title: 'Know what’s safe to spend', desc: 'One number for today, after every bill still to come.' },
  { icon: CalendarIcon, title: 'See bills before they’re due', desc: 'Your month laid out day by day, from payday on.' },
  { icon: ShieldAlertIcon, title: 'Keep a minimum balance', desc: 'A warning before any plan would take you below it.' }
];

const INCOME_OPTIONS = [
  { id: 'salary', label: 'Regular salary', desc: 'The same amount around the same day each month' },
  { id: 'irregular', label: 'Variable or freelance', desc: 'Income that changes; track your runway instead' },
  { id: 'both', label: 'Both', desc: 'A salary plus extra income now and then' }
];

const ACCOUNT_KINDS = [
  { value: 'salary', label: 'Salary' },
  { value: 'savings', label: 'Savings' },
  { value: 'checking', label: 'Checking' },
  { value: 'other', label: 'Other' }
];


/**
 * First-run setup in Apple's setup-assistant style: one question per page,
 * large title, grouped inset fields and one primary button at the bottom.
 * Same pages and API calls as the mobile app's OnboardingScreen.
 */
export function OnboardingModal({ currencySymbol = '₹', onCompleted }) {
  const todayIso = useMemo(() => getTodayIso(), []);
  const [step, setStep] = useState('welcome');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [accountType, setAccountType] = useState('bank');
  const [accountName, setAccountName] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [openingBalanceDate, setOpeningBalanceDate] = useState(todayIso);
  const [createdAccount, setCreatedAccount] = useState(null);

  const [incomeMode, setIncomeMode] = useState('salary');
  const [accountSubtype, setAccountSubtype] = useState('salary');
  const [salaryAmount, setSalaryAmount] = useState('');
  const [salaryCreditDate, setSalaryCreditDate] = useState(todayIso);
  const [result, setResult] = useState(null);

  const creditDay = useMemo(() => {
    const parts = (salaryCreditDate || '').split('-');
    return parts.length === 3 ? parseInt(parts[2], 10) || 1 : 1;
  }, [salaryCreditDate]);

  const go = (s) => { setError(''); setStep(s); };
  const back = { account: 'welcome', income: 'account', salary: 'income' }[step];
  const progress = { account: 1, income: 2, salary: 3 }[step];
  const totalSteps = incomeMode === 'irregular' ? 2 : 3;

  const run = async (fn) => {
    setError('');
    setLoading(true);
    try {
      await fn();
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const submitAccount = (e) => {
    e.preventDefault();
    if (!accountName.trim()) {
      setError('Please provide an account name.');
      return;
    }
    run(async () => {
      const openingMinor = openingBalance ? Math.round(Number(openingBalance) * 100) : 0;
      if (createdAccount) {
        // Came back to fix the account: update it rather than add a second one
        const updated = await api.updateBankAccount(createdAccount.id, {
          name: accountName.trim(),
          openingBalance: openingMinor,
          openingBalanceDate: openingBalanceDate || todayIso
        });
        setCreatedAccount({ ...createdAccount, ...(updated || {}) });
      } else {
        const account = await api.createAccount({
          name: accountName.trim(),
          type: accountType,
          accountType: accountType === 'wallet' ? 'digital' : 'salary',
          openingBalance: openingMinor,
          openingBalanceDate: openingBalanceDate || todayIso,
          isPrimary: true
        });
        setCreatedAccount(account);
        if (openingBalanceDate && openingBalanceDate <= todayIso) setSalaryCreditDate(openingBalanceDate);
      }
      setStep('income');
    });
  };

  const submitIncome = (e) => {
    e.preventDefault();
    if (incomeMode !== 'irregular') {
      go('salary');
      return;
    }
    run(async () => {
      await api.updateSettings({ incomeMode: 'irregular' });
      setResult({ incomeMode: 'irregular', account: createdAccount });
      setStep('done');
    });
  };

  const submitSalary = (e) => {
    e.preventDefault();
    const parsedSalary = Math.round(Number(salaryAmount) * 100);
    if (!parsedSalary || parsedSalary <= 0) {
      setError('Please provide a valid salary amount.');
      return;
    }
    if (!salaryCreditDate || salaryCreditDate > todayIso) {
      setError('Salary credit date must be today or in the past.');
      return;
    }
    run(async () => {
      if (createdAccount?.id && accountType === 'bank') {
        try {
          await api.updateBankAccount(createdAccount.id, { accountType: accountSubtype });
        } catch (_) {
          // Non-blocking: the account kind is cosmetic
        }
      }
      const template = await api.saveSalaryTemplate({
        amount: parsedSalary,
        expectedCreditDay: creditDay,
        receivingAccountId: createdAccount?.id,
        periodType: 'salary_cycle',
        effectiveDate: salaryCreditDate
      });
      if (incomeMode === 'both') await api.updateSettings({ incomeMode: 'both' });
      setResult({ incomeMode, account: createdAccount, template });
      setStep('done');
    });
  };

  const amountField = (id, label, value, onChange) => (
    <label className="ob-row" htmlFor={id}>
      <span className="ob-row-label">{label}</span>
      <span className="ob-amount">
        <span className="ob-amount-prefix">{currencySymbol}</span>
        <input id={id} type="number" inputMode="decimal" step="any" autoComplete="off"
          className="ob-input tabular-nums" placeholder="0.00" value={value} onChange={(e) => onChange(e.target.value)} />
      </span>
    </label>
  );

  return (
    <div className="ob-screen" role="dialog" aria-modal="true" aria-labelledby="ob-title" data-step={step}>
      <div className="ob-card">
        <div className="ob-topbar">
          {back ? (
            <button type="button" className="ob-back" onClick={() => go(back)}>
              <ChevronLeftIcon size={18} /> <span>Back</span>
            </button>
          ) : <span />}
          {progress && (
            <div className="ob-dots" aria-label={`Step ${progress} of ${totalSteps}`} role="img">
              {Array.from({ length: totalSteps }, (_, i) => (
                <span key={i} className={`ob-dot ${i < progress ? 'on' : ''}`} />
              ))}
            </div>
          )}
          <span />
        </div>

        {step === 'welcome' && (
          <div className="ob-page ob-welcome">
            <div className="ob-appmark" aria-hidden="true"><SparklesIcon size={30} /></div>
            <h1 id="ob-title" className="ob-title">Welcome to Budget Planner</h1>
            <ul className="ob-features">
              {FEATURES.map(({ icon: Icon, title, desc }) => (
                <li key={title} className="ob-feature">
                  <span className="ob-feature-icon"><Icon size={22} /></span>
                  <span>
                    <span className="ob-feature-title">{title}</span>
                    <span className="ob-feature-desc">{desc}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="ob-footer">
              <button type="button" className="ob-primary" onClick={() => go('account')}>Get Started</button>
            </div>
          </div>
        )}

        {step === 'account' && (
          <form className="ob-page" autoComplete="off" onSubmit={submitAccount} noValidate>
            <h1 id="ob-title" className="ob-title">Add your main account</h1>
            <p className="ob-subtitle">Every transaction belongs to an account. You can add more later.</p>

            <div className="ob-segmented" role="radiogroup" aria-label="Account type">
              {[{ id: 'bank', label: 'Bank account', icon: BuildingLibraryIcon }, { id: 'wallet', label: 'Wallet', icon: WalletIcon }].map(({ id, label, icon: Icon }) => (
                <button key={id} type="button" role="radio" aria-checked={accountType === id}
                  disabled={Boolean(createdAccount)}
                  className={`ob-segment ${accountType === id ? 'on' : ''}`} onClick={() => setAccountType(id)}>
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>

            <div className="ob-group">
              <label className="ob-row" htmlFor="ob-account-name">
                <span className="ob-row-label">Name</span>
                <input id="ob-account-name" type="text" autoComplete="off" className="ob-input"
                  placeholder={accountType === 'bank' ? 'e.g. HDFC Salary' : 'e.g. Paytm'}
                  value={accountName} onChange={(e) => setAccountName(e.target.value)} />
              </label>
              {amountField('ob-opening-balance', 'Balance', openingBalance, setOpeningBalance)}
              <div className="ob-row">
                <span className="ob-row-label">As of</span>
                <span className="ob-row-control">
                  <DatePicker value={openingBalanceDate} onChange={setOpeningBalanceDate} maxDate={todayIso} placeholder="Select date" required />
                </span>
              </div>
            </div>
            <p className="ob-footnote">Enter what the account holds on that day. The app keeps it up to date from your transactions.</p>

            {error && <p className="ob-error" role="alert">{error}</p>}
            <div className="ob-footer">
              <button type="submit" className="ob-primary" disabled={loading}>{loading ? 'Saving…' : 'Continue'}</button>
            </div>
          </form>
        )}

        {step === 'income' && (
          <form className="ob-page" onSubmit={submitIncome}>
            <h1 id="ob-title" className="ob-title">How are you paid?</h1>
            <p className="ob-subtitle">This sets how each month is planned. You can change it in Settings.</p>
            <div className="ob-group" role="radiogroup" aria-label="Income">
              {INCOME_OPTIONS.map((o) => (
                <button key={o.id} type="button" role="radio" aria-checked={incomeMode === o.id}
                  className="ob-row ob-choice" onClick={() => setIncomeMode(o.id)}>
                  <span className="ob-choice-text">
                    <span className="ob-choice-label">{o.label}</span>
                    <span className="ob-choice-desc">{o.desc}</span>
                  </span>
                  <span className="ob-check" aria-hidden="true">{incomeMode === o.id && <CheckIcon size={18} strokeWidth={2.5} />}</span>
                </button>
              ))}
            </div>
            {error && <p className="ob-error" role="alert">{error}</p>}
            <div className="ob-footer">
              <button type="submit" className="ob-primary" disabled={loading}>
                {loading ? 'Saving…' : incomeMode === 'irregular' ? 'Finish' : 'Continue'}
              </button>
            </div>
          </form>
        )}

        {step === 'salary' && (
          <form className="ob-page" autoComplete="off" onSubmit={submitSalary} noValidate>
            <h1 id="ob-title" className="ob-title">Your salary</h1>
            <p className="ob-subtitle">Each month is planned from payday to payday.</p>
            <div className="ob-group">
              {amountField('ob-salary-amount', 'Amount', salaryAmount, setSalaryAmount)}
              <div className="ob-row">
                <span className="ob-row-label">Last paid on</span>
                <span className="ob-row-control">
                  <DatePicker id="ob-salary-date" value={salaryCreditDate} onChange={setSalaryCreditDate} maxDate={todayIso} placeholder="Select date" required />
                </span>
              </div>
            </div>
            <p className="ob-footnote">We’ll expect it around day {creditDay} each month, into {createdAccount?.name || 'this account'}.</p>

            {accountType === 'bank' && (
              <>
                <p className="ob-group-title">Account kind</p>
                <div className="ob-segmented" role="radiogroup" aria-label="Account kind">
                  {ACCOUNT_KINDS.map((k) => (
                    <button key={k.value} type="button" role="radio" aria-checked={accountSubtype === k.value}
                      className={`ob-segment ${accountSubtype === k.value ? 'on' : ''}`} onClick={() => setAccountSubtype(k.value)}>
                      {k.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {error && <p className="ob-error" role="alert">{error}</p>}
            <div className="ob-footer">
              <button type="submit" className="ob-primary" disabled={loading}>{loading ? 'Saving…' : 'Finish'}</button>
            </div>
          </form>
        )}

        {step === 'done' && (
          <div className="ob-page ob-welcome">
            <div className="ob-appmark ob-appmark-done" aria-hidden="true"><CheckCircleIcon size={34} /></div>
            <h1 id="ob-title" className="ob-title">You’re all set</h1>
            <p className="ob-subtitle ob-center">
              {result?.incomeMode === 'irregular'
                ? 'Log income as it arrives. Your runway shows how long your balance lasts.'
                : 'Your first month starts on your last payday. Add bills and spending as they come.'}
            </p>
            <div className="ob-footer">
              <button type="button" className="ob-primary" onClick={() => onCompleted?.(result)}>Start Planning</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
