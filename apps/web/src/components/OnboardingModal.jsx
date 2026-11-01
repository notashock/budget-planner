import React, { useState, useRef, useMemo } from 'react';
import { api } from '../api.js';
import { DatePicker } from './DatePicker.jsx';
import { CustomSelect } from './CustomSelect.jsx';
import {
  BuildingLibraryIcon,
  WalletIcon,
  CheckIcon,
  ArrowRightIcon,
  CalendarIcon,
  TrendingUpIcon,
  SparklesIcon
} from './Icons.jsx';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

function getTodayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const ACCOUNT_TYPES = [
  {
    id: 'bank',
    label: 'Bank Account',
    desc: 'Salary, savings & checking accounts',
    icon: BuildingLibraryIcon
  },
  {
    id: 'wallet',
    label: 'Digital Wallet',
    desc: 'UPI, prepaid cards & digital wallets',
    icon: WalletIcon
  }
];

const INCOME_OPTIONS = [
  {
    id: 'salary',
    label: 'Regular Salary',
    desc: 'Pre-schedules recurring credits with auto-budget cycles',
    badge: 'Predictable',
    icon: CalendarIcon
  },
  {
    id: 'irregular',
    label: 'Variable / Freelance',
    desc: 'Freelance, seasonal, or harvest revenue with runway tracking',
    badge: 'Runway',
    icon: TrendingUpIcon
  },
  {
    id: 'both',
    label: 'Hybrid / Both',
    desc: 'Base recurring salary plus variable spot deposits',
    badge: 'Dual Flow',
    icon: SparklesIcon
  }
];

const ACCOUNT_SUBTYPE_OPTIONS = [
  { value: 'salary', label: 'Salary Account' },
  { value: 'savings', label: 'Savings Account' },
  { value: 'checking', label: 'Checking Account' },
  { value: 'other', label: 'Other Account' }
];

export function OnboardingModal({ currencySymbol = '₹', onCompleted }) {
  const todayIso = useMemo(() => getTodayIso(), []);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1 Form State
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState('bank'); // 'bank' | 'wallet'
  const [openingBalance, setOpeningBalance] = useState('');
  const [openingBalanceDate, setOpeningBalanceDate] = useState(todayIso);

  // Created Account
  const [createdAccount, setCreatedAccount] = useState(null);

  // Step 2 Form State
  const [incomeMode, setIncomeMode] = useState('salary'); // 'salary' | 'irregular' | 'both'
  const [accountSubtype, setAccountSubtype] = useState('salary'); // Requirement 2: default to salary account
  const [salaryAmount, setSalaryAmount] = useState('');
  // Salary credit date strictly in past or today
  const [salaryCreditDate, setSalaryCreditDate] = useState(todayIso);

  const modalCardRef = useRef(null);

  useGSAP(() => {
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    if (modalCardRef.current) {
      gsap.fromTo(
        modalCardRef.current,
        { opacity: 0, scale: 0.98, y: 12 },
        { opacity: 1, scale: 1, y: 0, duration: 0.32, ease: 'power2.out' }
      );

      const items = modalCardRef.current.querySelectorAll('.gsap-onboarding-item');
      if (items.length > 0) {
        gsap.fromTo(
          items,
          { opacity: 0, y: 6 },
          { opacity: 1, y: 0, duration: 0.28, stagger: 0.04, ease: 'power2.out', delay: 0.05 }
        );
      }
    }
  }, { scope: modalCardRef, dependencies: [step] });

  // Real-time formatted balance string for ledger preview (Requirement 1: handles exact decimals e.g. 150.02 and large numbers 19,799)
  const formattedBalancePreview = useMemo(() => {
    if (!openingBalance || isNaN(Number(openingBalance))) return `${currencySymbol} 0.00`;
    const num = Number(openingBalance);
    const hasDecimals = openingBalance.includes('.');
    const minFrac = hasDecimals ? (openingBalance.split('.')[1]?.length || 2) : 0;
    return `${currencySymbol} ${num.toLocaleString(undefined, { minimumFractionDigits: Math.min(2, minFrac), maximumFractionDigits: 2 })}`;
  }, [openingBalance, currencySymbol]);

  // Derive credit day of month from the selected salary credit date (1 - 31)
  const creditDay = useMemo(() => {
    if (!salaryCreditDate) return 1;
    const parts = salaryCreditDate.split('-');
    return parts.length === 3 ? parseInt(parts[2], 10) || 1 : 1;
  }, [salaryCreditDate]);

  const handleStep1Submit = async (e) => {
    e.preventDefault();
    if (!accountName.trim()) {
      setError('Please provide an account name.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      // Requirement 1: Store exact value in minor units (cents) so 150.02 -> 15002, 19799 -> 1979900
      const parsedBalance = openingBalance ? Math.round(Number(openingBalance) * 100) : 0;
      const payload = {
        name: accountName.trim(),
        type: accountType,
        accountType: accountType === 'wallet' ? 'digital' : 'salary',
        openingBalance: parsedBalance,
        openingBalanceDate: openingBalanceDate || todayIso,
        isPrimary: true
      };

      const account = await api.createAccount(payload);
      setCreatedAccount(account);
      // Pre-seed salary credit date with opening balance date if valid past date
      if (openingBalanceDate && openingBalanceDate <= todayIso) {
        setSalaryCreditDate(openingBalanceDate);
      }
      setStep(2);
    } catch (err) {
      console.error('Failed to create initial account:', err);
      setError(err.message || 'Failed to create initial account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleStep2Submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Update account subtype in background if user adjusted it on Step 2
      if (createdAccount?.id && accountSubtype) {
        try {
          await api.updateBankAccount(createdAccount.id, {
            accountType: accountSubtype
          });
        } catch (_) {
          // Non-blocking update
        }
      }

      if (incomeMode === 'irregular') {
        // Irregular: save profile setting, no month created, direct entry to app
        await api.updateSettings({ incomeMode: 'irregular' });
        onCompleted({ incomeMode: 'irregular', account: createdAccount });
      } else {
        // Requirement 1: store salary amount as minor units (cents) so 150.02 -> 15002, 19799 -> 1979900
        const parsedSalary = Math.round(Number(salaryAmount) * 100);
        if (!parsedSalary || parsedSalary <= 0) {
          setError('Please provide a valid salary amount.');
          setLoading(false);
          return;
        }

        if (!salaryCreditDate) {
          setError('Please select a valid salary credit date.');
          setLoading(false);
          return;
        }

        if (salaryCreditDate > todayIso) {
          setError('Salary credit date must be today or in the past.');
          setLoading(false);
          return;
        }

        const template = await api.saveSalaryTemplate({
          amount: parsedSalary,
          expectedCreditDay: creditDay,
          receivingAccountId: createdAccount?.id,
          periodType: 'salary_cycle',
          effectiveDate: salaryCreditDate
        });

        if (incomeMode === 'both') {
          await api.updateSettings({ incomeMode: 'both' });
        }

        onCompleted({ incomeMode, account: createdAccount, template });
      }
    } catch (err) {
      console.error('Failed to complete onboarding setup:', err);
      setError(err.message || 'Failed to finish setup. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="onboarding-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div
        ref={modalCardRef}
        className="onboarding-card"
      >
        {/* Step Indicator Header with Unified Horizontal Baseline */}
        <header className="onboarding-header">
          <div className="onboarding-top-meta">
            <div className="onboarding-step-pill">
              <span className="onboarding-step-indicator-dot" />
              Step {step} of 2
            </div>

            <div className="onboarding-stepper-bars" aria-hidden="true">
              <div className={`onboarding-step-bar ${step >= 1 ? 'active' : ''}`} />
              <div className={`onboarding-step-bar ${step >= 2 ? 'active' : ''}`} />
            </div>
          </div>

          <h2 id="onboarding-title" className="onboarding-title">
            {step === 1 ? 'Set Up Your Initial Account' : 'Income Configuration'}
          </h2>
          <p className="onboarding-subtitle">
            {step === 1
              ? 'Every transaction belongs to an account. Connect your primary bank account or digital wallet to enter the app.'
              : 'Select how you receive income to configure your automated cashflow cycle and planning periods.'}
          </p>
        </header>

        {error && (
          <div className="onboarding-error-banner" role="alert">
            <span>{error}</span>
          </div>
        )}

        {step === 1 && (
          <form onSubmit={handleStep1Submit} className="onboarding-form">
            {/* Account Type Selector */}
            <div className="onboarding-field-group gsap-onboarding-item">
              <label className="onboarding-field-label">
                ACCOUNT TYPE
              </label>
              <div className="onboarding-card-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }} role="radiogroup" aria-label="Account Type">
                {ACCOUNT_TYPES.map((t) => {
                  const Icon = t.icon;
                  const isSelected = accountType === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setAccountType(t.id)}
                      className={`onboarding-account-card ${isSelected ? 'selected' : ''}`}
                    >
                      <div className="onboarding-account-card-header">
                        <div className="onboarding-card-icon-badge">
                          <Icon size={16} strokeWidth={isSelected ? 2 : 1.75} />
                        </div>
                        <div className="onboarding-radio-dot">
                          {isSelected && <CheckIcon size={10} strokeWidth={3} />}
                        </div>
                      </div>

                      <div>
                        <div className="onboarding-card-label">
                          {t.label}
                        </div>
                        <div className="onboarding-card-desc">
                          {t.desc}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Account Name */}
            <div className="onboarding-field-group gsap-onboarding-item">
              <label
                htmlFor="onboarding-account-name"
                className="onboarding-field-label"
              >
                ACCOUNT NAME *
              </label>
              <input
                id="onboarding-account-name"
                type="text"
                required
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder={
                  accountType === 'bank'
                    ? 'e.g. HDFC Salary Account / Main Checking'
                    : 'e.g. Apple Pay / Paytm'
                }
                className="onboarding-input"
              />
            </div>

            {/* Opening Balance & Balance Date (Symmetrical 2-Column Grid) */}
            <div className="onboarding-two-col gsap-onboarding-item">
              <div className="onboarding-field-group">
                <label
                  htmlFor="onboarding-opening-balance"
                  className="onboarding-field-label"
                >
                  OPENING BALANCE ({currencySymbol})
                </label>
                <div className="onboarding-input-wrap">
                  <span className="onboarding-input-prefix">
                    {currencySymbol}
                  </span>
                  <input
                    id="onboarding-opening-balance"
                    type="number"
                    step="any"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    placeholder="0.00"
                    className="onboarding-input has-prefix tabular-nums"
                  />
                </div>
              </div>

              <div className="onboarding-field-group">
                <label className="onboarding-field-label">
                  BALANCE DATE
                </label>
                <div className="onboarding-datepicker-wrapper">
                  <DatePicker
                    value={openingBalanceDate}
                    onChange={(d) => setOpeningBalanceDate(d)}
                    maxDate={todayIso}
                    placeholder="Select balance date"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Signature Domain Ledger Preview Strip */}
            <div className="onboarding-ledger-strip gsap-onboarding-item">
              <div className="onboarding-ledger-strip-meta">
                <span className="onboarding-ledger-strip-tag">Ledger Anchor</span>
                <span>{accountName.trim() || 'New Account'}</span>
              </div>
              <div className="onboarding-ledger-strip-amount">
                {formattedBalancePreview}
              </div>
            </div>

            {/* Submit CTA */}
            <div className="onboarding-actions gsap-onboarding-item">
              <button
                type="submit"
                disabled={loading}
                id="onboarding-step1-submit"
                className="onboarding-btn-submit"
              >
                <span>{loading ? 'Creating Account...' : 'Continue to Step 2'}</span>
                <ArrowRightIcon size={16} />
              </button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleStep2Submit} className="onboarding-form">
            {/* Step 2 Income Model Cards */}
            <div className="onboarding-field-group gsap-onboarding-item">
              <label className="onboarding-field-label">
                INCOME MODEL
              </label>
              <div className="onboarding-income-grid" role="radiogroup" aria-label="Income Model">
                {INCOME_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = incomeMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setIncomeMode(opt.id)}
                      className={`onboarding-income-card-v2 ${isSelected ? 'selected' : ''}`}
                    >
                      <div className="onboarding-income-card-v2-header">
                        <div className="onboarding-card-icon-badge">
                          <Icon size={16} strokeWidth={isSelected ? 2 : 1.75} />
                        </div>
                        <div className="onboarding-radio-dot">
                          {isSelected && <CheckIcon size={10} strokeWidth={3} />}
                        </div>
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                          <span className="onboarding-card-label" style={{ marginBottom: 0 }}>
                            {opt.label}
                          </span>
                        </div>
                        <div className="onboarding-card-desc">
                          {opt.desc}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Refined Salary Settings subpanel */}
            {(incomeMode === 'salary' || incomeMode === 'both') && (
              <div className="onboarding-subpanel gsap-onboarding-item">
                <div className="onboarding-subpanel-header">
                  <span className="onboarding-field-label" style={{ marginBottom: 0 }}>
                    Recurring Salary Parameters
                  </span>
                  <span className="onboarding-subpanel-badge">
                    Day {creditDay} Cadence
                  </span>
                </div>

                {/* Requirement 2: Account Type included in Step 2, defaulted to Salary Account */}
                <div className="onboarding-field-group">
                  <label className="onboarding-field-label" htmlFor="onboarding-account-subtype">
                    ACCOUNT TYPE / CLASSIFICATION
                  </label>
                  <CustomSelect
                    id="onboarding-account-subtype"
                    value={accountSubtype}
                    onChange={(e) => setAccountSubtype(e.target.value)}
                    options={ACCOUNT_SUBTYPE_OPTIONS}
                    placeholder="Select account classification"
                  />
                </div>

                <div className="onboarding-two-col">
                  {/* Expected Salary Amount */}
                  <div className="onboarding-field-group">
                    <label
                      htmlFor="onboarding-salary-amount"
                      className="onboarding-field-label"
                    >
                      EXPECTED AMOUNT ({currencySymbol}) *
                    </label>
                    <div className="onboarding-input-wrap">
                      <span className="onboarding-input-prefix">
                        {currencySymbol}
                      </span>
                      <input
                        id="onboarding-salary-amount"
                        type="number"
                        step="any"
                        required
                        value={salaryAmount}
                        onChange={(e) => setSalaryAmount(e.target.value)}
                        placeholder="0.00"
                        className="onboarding-input has-prefix tabular-nums"
                      />
                    </div>
                  </div>

                  {/* Last Salary Credit Date */}
                  <div className="onboarding-field-group">
                    <label
                      htmlFor="onboarding-salary-credit-date"
                      className="onboarding-field-label"
                    >
                      LAST SALARY CREDIT DATE (PAST / TODAY) *
                    </label>
                    <div className="onboarding-datepicker-wrapper">
                      <DatePicker
                        id="onboarding-salary-credit-date"
                        value={salaryCreditDate}
                        onChange={(d) => setSalaryCreditDate(d)}
                        maxDate={todayIso}
                        placeholder="Select past salary date"
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2 Actions */}
            <div className="onboarding-actions gsap-onboarding-item">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="onboarding-btn-back"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                id="onboarding-finish-btn"
                className="onboarding-btn-submit"
              >
                <span>{loading ? 'Finalizing Setup...' : 'Complete Setup & Enter App'}</span>
                <CheckIcon size={16} strokeWidth={2.5} />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
