import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const GateMark = () => (
  <svg className="gate-mark" viewBox="0 0 72 56" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="22" width="12" height="30" rx="2" fill="#1A4FAF" />
    <rect x="56" y="22" width="12" height="30" rx="2" fill="#1A4FAF" />
    <rect x="0" y="17" width="72" height="10" rx="5" fill="#FF9900" />
    <rect x="30" y="0" width="12" height="22" rx="2" fill="#232F3E" />
  </svg>
);

// The login / sign-up gate.
export function Gate() {
  const { login, loginWithGoogle } = useAuth();
  return (
    <div className="screen-center">
      <div className="center-card ds-animate-in">
        <GateMark />
        <p className="ds-eyebrow" style={{ marginBottom: 'var(--space-4)' }}>AWS Student Builders · UNIZIK</p>
        <h1>Join the builders.</h1>
        <p>Sign in to create your profile, find other builders, and become part of the club roster.</p>
        <div className="gate-providers">
          <button className="ds-btn ds-btn--primary ds-btn--block" onClick={() => login()}>
            Continue with email
          </button>
          <button className="btn-google" onClick={loginWithGoogle}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0012 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 010-4.2V7.06H2.18a11 11 0 000 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 002.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
            Continue with Google
          </button>
        </div>
        <p style={{ marginTop: 'var(--space-6)', fontSize: 'var(--text-xs)' }} className="ds-muted">
          New here? The same button creates your account.
        </p>
      </div>
    </div>
  );
}

// Handles the ?code redirect back from Cognito.
export function Callback() {
  const { handleCallback } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  // The ?code is single-use. React.StrictMode double-invokes effects in dev, which
  // would exchange the same code twice — the second call gets a 400 invalid_grant.
  // This guard ensures we run the exchange exactly once per mount.
  const exchanged = useRef(false);

  useEffect(() => {
    if (exchanged.current) return;
    exchanged.current = true;
    const code = new URLSearchParams(window.location.search).get('code');
    if (!code) { navigate('/', { replace: true }); return; }
    handleCallback(code)
      .then(() => navigate('/', { replace: true }))
      .catch(() => setError('Sign-in failed. Please try again.'));
  }, [handleCallback, navigate]);

  if (error) {
    return (
      <div className="screen-center">
        <div className="center-card">
          <h1>Something went wrong</h1>
          <p>{error}</p>
          <button className="ds-btn ds-btn--primary" onClick={() => navigate('/', { replace: true })}>Back to start</button>
        </div>
      </div>
    );
  }
  return <Loader label="Signing you in" />;
}

// Shown after registering, before an admin verifies the member.
export function Pending() {
  const { logout } = useAuth();
  return (
    <div className="screen-center">
      <div className="center-card ds-animate-in">
        <GateMark />
        <h1>You're on the list.</h1>
        <p>Your profile is in and waiting for a club admin to verify it. Once you're approved, you'll see the member directory and everything else. We'll email you.</p>
        <button className="ds-btn ds-btn--secondary" onClick={logout}>Sign out</button>
      </div>
    </div>
  );
}

export function Loader({ label = 'Loading' }) {
  return (
    <div className="screen-center">
      <div className="center-card">
        <div className="spinner spinner--dark" style={{ margin: '0 auto var(--space-4)' }} />
        <p className="ds-muted">{label}…</p>
      </div>
    </div>
  );
}

// The brand header used on dashboard/register, with logout.
export function Brand({ children }) {
  const { logout, name } = useAuth();
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <a className="ds-logo" href="/">
          <span className="ds-logo-mark">
            <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="4" y="18" width="7" height="16" fill="#1A4FAF"/>
              <rect x="29" y="18" width="7" height="16" fill="#1A4FAF"/>
              <rect x="2" y="15" width="36" height="6" rx="3" fill="#FF9900"/>
              <rect x="17" y="5" width="6" height="13" fill="rgba(255,255,255,0.9)"/>
              <polygon points="17,5 20,0 23,5" fill="#FF9900"/>
            </svg>
          </span>
          <span className="ds-logo-text"><span className="ds-logo-name"><span className="ds-logo-aws">AWS</span><span className="ds-logo-rest"> STUDENT BUILDERS</span></span><span className="ds-logo-sub">UNIZIK</span></span>
        </a>
        <div className="app-header-actions">
          {children}
          <button className="ds-btn ds-btn--ghost ds-btn--sm app-signout" onClick={logout}>Sign out</button>
        </div>
      </div>
    </header>
  );
}

// Tiny toast hook.
export function useToast() {
  const [msg, setMsg] = useState(null);
  const show = useCallback((m) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 3000);
  }, []);
  const node = msg ? <div className="toast">{msg}</div> : null;
  return [node, show];
}
