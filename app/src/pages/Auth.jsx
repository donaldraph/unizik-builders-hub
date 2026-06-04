import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import {
  signUp, confirmSignUp, resendCode, signIn,
  forgotPassword, confirmForgotPassword,
  cognitoErrorMessage, isUnconfirmed,
} from '../cognito.js';

// The peaked-arch wordmark, matching the Brand logo in Shell.jsx.
// The per-part classes drive the one-shot "gate opening" entrance (see app.css);
// they're purely cosmetic and carry no behaviour.
const ArchMark = () => (
  <svg className="auth-mark" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect className="gate-leg gate-leg--l" x="4" y="18" width="7" height="16" fill="#1A4FAF" />
    <rect className="gate-leg gate-leg--r" x="29" y="18" width="7" height="16" fill="#1A4FAF" />
    <rect className="gate-lintel" x="2" y="15" width="36" height="6" rx="3" fill="#FF9900" />
    <rect className="gate-keystone" x="17" y="5" width="6" height="13" fill="rgba(255,255,255,0.9)" />
    <polygon className="gate-keystone" points="17,5 20,0 23,5" fill="#FF9900" />
  </svg>
);

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0012 23z" />
    <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 010-4.2V7.06H2.18a11 11 0 000 9.88l3.66-2.84z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 002.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
  </svg>
);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The story side — brand, mission, the community's reasons to be here.
function StoryPanel() {
  return (
    <aside className="auth-story" data-theme="dark">
      <div className="auth-story-inner">
        <p className="ds-eyebrow">// AWS Student Builders · UNIZIK</p>
        <h1 className="auth-story-title">Your cloud career starts on campus.</h1>
        <p className="auth-story-lede">
          We're the student builders of UNIZIK — a community of people who think like you and won't let you coast. We learn cloud, AI, and cloud security best practices together, but the real thing we're building is each other: pushing past the fear, onto a stage that's globally recognized, where your ability and who you are finally get seen. You don't rise here alone. You rise because the people around you refuse to let you stay small. No experience needed, no permission required. Just show up and build. From nothing, to everything.
        </p>
        <ul className="auth-story-points">
          <li><span className="auth-point-icon auth-point-icon--wrench" aria-hidden="true" /> Hands-on AWS projects, study groups & certs</li>
          <li><span className="auth-point-icon auth-point-icon--teams" aria-hidden="true" /> A verified directory of builders to learn with</li>
          <li><span className="auth-point-icon auth-point-icon--bolt" aria-hidden="true" /> Events, mentorship, and a launchpad for your career</li>
        </ul>
        <p className="auth-story-foot">One account. Your profile, the roster, and everything the club ships.</p>
      </div>
    </aside>
  );
}

export default function Auth() {
  const { setSession, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const [view, setView] = useState('signin'); // signin | signup | verify | forgot | reset
  const [form, setForm] = useState({ name: '', email: '', password: '', code: '', newPassword: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);   // top-level banner
  const [notice, setNotice] = useState(null); // success/info banner
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const go = (next) => { setView(next); setError(null); setFieldErrors({}); };

  // After we already hold tokens from a direct sign-in, hand off to the existing
  // Home → getMe routing (register / pending / dashboard) — same as hosted UI.
  const enter = (tokens) => { setSession(tokens); navigate('/', { replace: true }); };

  const validate = () => {
    const e = {};
    if (['signin', 'signup', 'verify', 'forgot', 'reset'].includes(view) && !EMAIL_RE.test(form.email.trim()))
      e.email = 'Enter a valid email address';
    if (view === 'signup' && !form.name.trim()) e.name = 'Tell us your name';
    if ((view === 'signin' || view === 'signup') && form.password.length < 8)
      e.password = 'At least 8 characters';
    if ((view === 'verify' || view === 'reset') && !/^\d{4,8}$/.test(form.code.trim()))
      e.code = 'Enter the code we emailed you';
    if (view === 'reset' && form.newPassword.length < 8) e.newPassword = 'At least 8 characters';
    setFieldErrors(e);
    return Object.keys(e).length === 0;
  };

  async function run(fn) {
    setError(null); setNotice(null);
    if (!validate()) return;
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      // Surface the raw error to the operator (e.g. SRP-not-enabled) and a
      // friendly message to the user.
      console.error('[auth]', err);
      if (isUnconfirmed(err)) {
        // Bounce an unverified sign-in straight to verification with a fresh code.
        try { await resendCode({ email: form.email.trim() }); } catch { /* best effort */ }
        setNotice("Your email isn't verified yet. We've sent you a new code.");
        go('verify');
      } else {
        setError(cognitoErrorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  const onSignUp = () => run(async () => {
    const { userConfirmed } = await signUp({
      email: form.email.trim(), password: form.password, name: form.name.trim(),
    });
    if (userConfirmed) {
      const tokens = await signIn({ email: form.email.trim(), password: form.password });
      enter(tokens);
    } else {
      setNotice(`We sent a verification code to ${form.email.trim()}.`);
      go('verify');
    }
  });

  const onVerify = () => run(async () => {
    await confirmSignUp({ email: form.email.trim(), code: form.code.trim() });
    // We still hold the password from sign-up → sign them straight in.
    if (form.password) {
      const tokens = await signIn({ email: form.email.trim(), password: form.password });
      enter(tokens);
    } else {
      setNotice('Email verified — sign in to continue.');
      go('signin');
    }
  });

  const onResend = () => run(async () => {
    await resendCode({ email: form.email.trim() });
    setNotice('A new code is on its way.');
  });

  const onSignIn = () => run(async () => {
    const tokens = await signIn({ email: form.email.trim(), password: form.password });
    enter(tokens);
  });

  const onForgot = () => run(async () => {
    await forgotPassword({ email: form.email.trim() });
    setNotice(`We sent a reset code to ${form.email.trim()}.`);
    go('reset');
  });

  const onReset = () => run(async () => {
    await confirmForgotPassword({
      email: form.email.trim(), code: form.code.trim(), newPassword: form.newPassword,
    });
    const tokens = await signIn({ email: form.email.trim(), password: form.newPassword });
    enter(tokens);
  });

  const submit = (e) => {
    e.preventDefault();
    ({ signin: onSignIn, signup: onSignUp, verify: onVerify, forgot: onForgot, reset: onReset }[view])();
  };

  const titles = {
    signin: ['Welcome back', 'Sign in to your builder account.'],
    signup: ['Create your account', 'Join the UNIZIK builders roster.'],
    verify: ['Verify your email', `Enter the code we sent to ${form.email.trim() || 'your inbox'}.`],
    forgot: ['Reset your password', "Enter your email and we'll send a reset code."],
    reset: ['Set a new password', 'Enter the code and choose a new password.'],
  };
  const [title, subtitle] = titles[view];

  const field = (key, label, props = {}) => (
    <div className="field">
      <label className="ds-label" htmlFor={key}>{label}</label>
      <input
        id={key} className="ds-input" value={form[key]} onChange={set(key)}
        disabled={busy} {...props}
      />
      {fieldErrors[key] && <p className="auth-field-error">{fieldErrors[key]}</p>}
    </div>
  );

  return (
    <div className="auth-split">
      {/* Single brand mark straddling the seam — bridges the dark and light halves. */}
      <div className="auth-logo"><ArchMark /></div>
      <StoryPanel />
      <main className="auth-form-panel">
        <div className="auth-form-inner ds-animate-in">
          <h2 className="auth-form-title">{title}</h2>
          <p className="auth-form-subtitle">{subtitle}</p>

          {error && <div className="auth-banner auth-banner--error" role="alert">{error}</div>}
          {notice && <div className="auth-banner auth-banner--notice">{notice}</div>}

          {(view === 'signin' || view === 'signup') && (
            <>
              <button type="button" className="btn-google" onClick={loginWithGoogle} disabled={busy}>
                <GoogleIcon /> Continue with Google
              </button>
              <div className="auth-divider"><span>or</span></div>
            </>
          )}

          <form onSubmit={submit} noValidate>
            {view === 'signup' && field('name', 'Full name', { type: 'text', placeholder: 'Ada Builder', autoComplete: 'name' })}

            {(view === 'signin' || view === 'signup' || view === 'forgot') &&
              field('email', 'Email', { type: 'email', placeholder: 'you@unizik.edu.ng', autoComplete: 'email' })}

            {(view === 'verify' || view === 'reset') &&
              field('email', 'Email', { type: 'email', placeholder: 'you@unizik.edu.ng', autoComplete: 'email' })}

            {(view === 'verify' || view === 'reset') &&
              field('code', 'Verification code', { type: 'text', inputMode: 'numeric', placeholder: '123456', autoComplete: 'one-time-code' })}

            {(view === 'signin' || view === 'signup') &&
              field('password', 'Password', { type: 'password', placeholder: '••••••••', autoComplete: view === 'signin' ? 'current-password' : 'new-password' })}

            {view === 'reset' &&
              field('newPassword', 'New password', { type: 'password', placeholder: '••••••••', autoComplete: 'new-password' })}

            <button type="submit" className="ds-btn ds-btn--primary ds-btn--block" disabled={busy}>
              {busy ? 'Working…' : {
                signin: 'Sign in', signup: 'Create account', verify: 'Verify email',
                forgot: 'Send reset code', reset: 'Reset password',
              }[view]}
            </button>
          </form>

          <div className="auth-links">
            {view === 'signin' && (
              <>
                <button type="button" className="auth-link" onClick={() => go('forgot')}>Forgot password?</button>
                <span>New here? <button type="button" className="auth-link auth-link--strong" onClick={() => go('signup')}>Create an account</button></span>
              </>
            )}
            {view === 'signup' && (
              <span>Already have an account? <button type="button" className="auth-link auth-link--strong" onClick={() => go('signin')}>Sign in</button></span>
            )}
            {view === 'verify' && (
              <>
                <button type="button" className="auth-link" onClick={onResend} disabled={busy}>Resend code</button>
                <button type="button" className="auth-link" onClick={() => go('signin')}>Back to sign in</button>
              </>
            )}
            {(view === 'forgot' || view === 'reset') && (
              <button type="button" className="auth-link" onClick={() => go('signin')}>Back to sign in</button>
            )}
          </div>

          <p className="auth-fallback">
            <Link to="/">← Use the original sign-in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
