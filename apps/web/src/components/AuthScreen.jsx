import React, { useState } from 'react';
import { SparklesIcon } from './Icons.jsx';

/** Sign in / create account, in the same grouped style as first-run setup. */
export function AuthScreen({ onLogin, onRegister }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegister) await onRegister(email, password);
      else await onLogin(email, password);
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ob-screen">
      <div className="ob-card">
        <form className="ob-page ob-auth" onSubmit={handleSubmit}>
          <div className="ob-appmark ob-auth-mark" aria-hidden="true"><SparklesIcon size={30} /></div>
          <h1 className="ob-title">{isRegister ? 'Create your account' : 'Budget Planner'}</h1>
          <p className="ob-subtitle">
            {isRegister ? 'Plan your month and always know what’s safe to spend.' : 'Sign in to your planner.'}
          </p>

          <div className="ob-segmented" role="radiogroup" aria-label="Sign in or create account">
            {[['Sign in', false], ['Create account', true]].map(([label, reg]) => (
              <button key={label} type="button" role="radio" aria-checked={isRegister === reg}
                className={`ob-segment ${isRegister === reg ? 'on' : ''}`}
                onClick={() => { setIsRegister(reg); setError(''); }}>
                {label}
              </button>
            ))}
          </div>

          <div className="ob-group">
            <label className="ob-row" htmlFor="auth-email">
              <span className="ob-row-label">Email</span>
              <input id="auth-email" className="ob-input" type="email" autoComplete="username" required autoFocus
                placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="ob-row" htmlFor="auth-password">
              <span className="ob-row-label">Password</span>
              <input id="auth-password" className="ob-input" type="password" required
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                placeholder={isRegister ? 'At least 8 characters' : 'Required'}
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
          </div>

          {error && <p className="ob-error" role="alert" style={{ marginTop: 12 }}>{error}</p>}

          <div className="ob-footer">
            <button type="submit" className="ob-primary" disabled={loading}>
              {loading ? 'Please wait…' : isRegister ? 'Create Account' : 'Sign In'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
