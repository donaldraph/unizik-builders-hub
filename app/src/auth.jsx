import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { CONFIG } from './config';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const STORE_KEY = 'asbu.tokens';

// ---- PKCE helpers ----
function randomString(len = 64) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => ('0' + b.toString(16)).slice(-2)).join('');
}
async function sha256base64url(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeJwt(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(payload))));
  } catch {
    return {};
  }
}
function groupsFrom(claims) {
  const g = claims['cognito:groups'] || [];
  return Array.isArray(g) ? g : [g];
}

export function AuthProvider({ children }) {
  const [tokens, setTokens] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  const persist = (t) => {
    setTokens(t);
    if (t) localStorage.setItem(STORE_KEY, JSON.stringify(t));
    else localStorage.removeItem(STORE_KEY);
  };

  // Kick off the hosted-login redirect (optionally straight to Google).
  const login = useCallback(async (provider) => {
    const verifier = randomString();
    sessionStorage.setItem('asbu.pkce', verifier);
    const challenge = await sha256base64url(verifier);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CONFIG.clientId,
      redirect_uri: CONFIG.redirectUri,
      scope: 'openid email profile',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    if (provider) params.set('identity_provider', provider); // e.g. 'Google'
    window.location.href = `${CONFIG.cognitoDomain}/oauth2/authorize?${params}`;
  }, []);

  const loginWithGoogle = useCallback(() => login('Google'), [login]);

  // Exchange the ?code returned to /callback for tokens.
  const handleCallback = useCallback(async (code) => {
    const verifier = sessionStorage.getItem('asbu.pkce');
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CONFIG.clientId,
      code,
      redirect_uri: CONFIG.redirectUri,
      code_verifier: verifier || '',
    });
    const res = await fetch(`${CONFIG.cognitoDomain}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error('token exchange failed');
    const data = await res.json();
    sessionStorage.removeItem('asbu.pkce');
    persist({ idToken: data.id_token, accessToken: data.access_token, refreshToken: data.refresh_token });
  }, []);

  const logout = useCallback(() => {
    persist(null);
    const params = new URLSearchParams({ client_id: CONFIG.clientId, logout_uri: window.location.origin });
    window.location.href = `${CONFIG.cognitoDomain}/logout?${params}`;
  }, []);

  useEffect(() => { setLoading(false); }, []);

  const claims = tokens?.idToken ? decodeJwt(tokens.idToken) : {};
  const value = {
    tokens,
    idToken: tokens?.idToken || null,
    isAuthenticated: !!tokens?.idToken,
    sub: claims.sub || null,
    email: claims.email || null,
    name: claims.name || claims.given_name || null,
    isAdmin: groupsFrom(claims).includes('admin'),
    loading,
    login,
    loginWithGoogle,
    handleCallback,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
