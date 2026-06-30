import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { api } from './api.js';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Auth from './pages/Auth.jsx';
import Privacy from './pages/Privacy.jsx';
import { Callback, Pending, Loader, Brand } from './pages/Shell.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/callback" element={<Callback />} />
      <Route path="/register" element={<Guard><Register /></Guard>} />
      <Route path="/pending" element={<Guard><Pending /></Guard>} />
      <Route path="/dashboard" element={<Guard><Dashboard /></Guard>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// Only lets authenticated users through; bounces the rest to the gate.
function Guard({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <Loader label="Loading" />;
  if (!isAuthenticated) return <Navigate to="/auth" replace />;
  return children;
}

// The front door. If you're signed in, it figures out where you belong.
function Home() {
  const { isAuthenticated, idToken, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (loading || !isAuthenticated) return;
    let cancelled = false;
    setChecking(true);
    api.getMe(idToken)
      .then((res) => {
        if (cancelled) return;
        if (!res.registered) navigate('/register', { replace: true });
        else if (res.profile.status === 'VERIFIED') navigate('/dashboard', { replace: true });
        else navigate('/pending', { replace: true });
      })
      .catch(() => !cancelled && navigate('/register', { replace: true }))
      .finally(() => !cancelled && setChecking(false));
    return () => { cancelled = true; };
  }, [isAuthenticated, idToken, loading, navigate, location.key]);

  if (loading || checking) return <Loader label="Getting you in" />;
  if (isAuthenticated) return <Loader label="Getting you in" />;
  // Custom /auth is now the primary sign-in. The old hosted-UI Gate is retired
  // (kept in Shell.jsx for reference); the old gate route redirects here so any
  // existing links/bookmarks to "/" still reach a working sign-in.
  return <Navigate to="/auth" replace />;
}
