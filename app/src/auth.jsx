import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { CONFIG } from './config';
import { setTokenProvider } from './api';

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
// True if the id token is missing or expired. The skew margin makes us refresh
// just *before* it lapses, so a request doesn't 401 on a token that died a
// second ago.
function isExpired(idToken, skewSeconds = 60) {
  const { exp } = decodeJwt(idToken);
  if (!exp) return true;
  return Date.now() >= exp * 1000 - skewSeconds * 1000;
}

export function AuthProvider({ children }) {
  const [tokens, setTokens] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  const persist = useCallback((t) => {
    setTokens(t);
    if (t) localStorage.setItem(STORE_KEY, JSON.stringify(t));
    else localStorage.removeItem(STORE_KEY);
  }, []);

  // Mirror tokens into a ref so the refresh logic always reads the latest set
  // without those callbacks having to be re-created on every token change.
  const tokensRef = useRef(tokens);
  useEffect(() => { tokensRef.current = tokens; }, [tokens]);

  // Holds the in-flight refresh promise so concurrent callers (e.g. getMe +
  // directory both 401 at once) share a single network round-trip.
  const refreshingRef = useRef(null);

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
    if (!res.ok) {
      // Surface the real OAuth error body (e.g. {"error":"invalid_grant"}) so a
      // 400 from /oauth2/token is diagnosable instead of an opaque message.
      const detail = await res.text().catch(() => '');
      console.error('[auth] token exchange failed', res.status, detail);
      throw new Error('token exchange failed');
    }
    const data = await res.json();
    sessionStorage.removeItem('asbu.pkce');
    persist({ idToken: data.id_token, accessToken: data.access_token, refreshToken: data.refresh_token });
  }, []);

  // Used by the custom auth screens: after a direct (SRP) Cognito sign-in we
  // already hold the JWTs, so we store them the same way the PKCE callback does.
  // This is purely additive — the hosted-UI flow above is unchanged.
  const setSession = useCallback((t) => persist(t), [persist]);

  // Swap the stored refresh token for a fresh id/access token. Uses the same
  // /oauth2/token endpoint and public-client (no-secret) shape as the PKCE
  // callback above. The refresh grant does NOT return a new refresh token, so
  // we carry the existing one forward. If the refresh token itself is dead, the
  // session is cleared so the UI falls back to the sign-in gate.
  const doRefresh = useCallback(async () => {
    if (refreshingRef.current) return refreshingRef.current;
    const current = tokensRef.current;
    if (!current?.refreshToken) { persist(null); return null; }

    const run = (async () => {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CONFIG.clientId,
        refresh_token: current.refreshToken,
      });
      const res = await fetch(`${CONFIG.cognitoDomain}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.error('[auth] token refresh failed', res.status, detail);
        persist(null);
        return null;
      }
      const data = await res.json();
      persist({
        idToken: data.id_token,
        accessToken: data.access_token,
        refreshToken: data.refresh_token || current.refreshToken,
      });
      return data.id_token;
    })();

    refreshingRef.current = run;
    try { return await run; } finally { refreshingRef.current = null; }
  }, [persist]);

  // Hand the API layer a usable id token, refreshing first if it's expired (or
  // when a 401 forces it). Returns null when there's no session to refresh.
  const getFreshIdToken = useCallback(async ({ forceRefresh = false } = {}) => {
    const current = tokensRef.current;
    if (!current?.idToken) return null;
    if (forceRefresh || isExpired(current.idToken)) return doRefresh();
    return current.idToken;
  }, [doRefresh]);

  const logout = useCallback(() => {
    persist(null);
    const params = new URLSearchParams({ client_id: CONFIG.clientId, logout_uri: window.location.origin });
    window.location.href = `${CONFIG.cognitoDomain}/logout?${params}`;
  }, []);

  // Let api.js fetch a fresh token and force a refresh-and-retry on a 401.
  useEffect(() => {
    setTokenProvider(getFreshIdToken);
    return () => setTokenProvider(null);
  }, [getFreshIdToken]);

  // On load, if the stored token is already stale, refresh before we render
  // protected content so the first API calls don't 401. A dead refresh token
  // clears the session inside doRefresh, so the gate shows instead.
  useEffect(() => {
    (async () => {
      const current = tokensRef.current;
      if (current?.idToken && isExpired(current.idToken)) await doRefresh();
      setLoading(false);
    })();
    // Mount-only: doRefresh is stable and we deliberately read tokens via ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While the app stays open, proactively refresh ~1 min before expiry, then
  // re-arm off the new token. Keeps long sessions alive without a 401 round-trip.
  useEffect(() => {
    if (!tokens?.idToken) return;
    const { exp } = decodeJwt(tokens.idToken);
    if (!exp) return;
    const msUntilRefresh = exp * 1000 - Date.now() - 60_000;
    if (msUntilRefresh <= 0) { doRefresh(); return; }
    const id = setTimeout(() => doRefresh(), msUntilRefresh);
    return () => clearTimeout(id);
  }, [tokens, doRefresh]);

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
    setSession,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
