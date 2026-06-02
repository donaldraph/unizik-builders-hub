import { CONFIG } from './config';

// Low-level call. Pass the id token explicitly so this stays a pure function.
async function call(path, { method = 'GET', token, body, query } = {}) {
  const url = new URL(path.replace(/^\//, ''), CONFIG.apiUrl);
  if (query) Object.entries(query).forEach(([k, v]) => v != null && url.searchParams.set(k, v));

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = new Error(data.error || `request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// The API surface, one method per backend route.
export const api = {
  getMe: (token) => call('/me', { token }),
  register: (token, profile) => call('/register', { method: 'POST', token, body: profile }),
  updateMe: (token, updates) => call('/me', { method: 'PUT', token, body: updates }),
  directory: (token, tag) => call('/directory', { token, query: { tag } }),
  avatarUrl: (token, contentType) => call('/me/avatar-url', { method: 'POST', token, query: { contentType } }),
  adminPending: (token) => call('/admin/pending', { token }),
  adminVerify: (token, sub, decision) => call('/admin/verify', { method: 'POST', token, body: { sub, decision } }),
};

// Upload a file straight to S3 using a presigned PUT URL (never through Lambda).
export async function uploadAvatar(token, file) {
  const { uploadUrl, key } = await api.avatarUrl(token, file.type);
  const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  if (!put.ok) throw new Error('avatar upload failed');
  return key;
}
