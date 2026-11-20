export const MFA_DAYS = 30;
export function mfaExpiresAt(session) {
  try {
    const part = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(part));
    const times = (claims.amr || []).filter(a => a.method === 'totp' && Number.isFinite(a.timestamp)).map(a => a.timestamp * 1000);
    return times.length ? Math.max(...times) + MFA_DAYS * 86400000 : 0;
  } catch { return 0; }
}
// This is a UI timer only. Migration 06 independently enforces signed AMR freshness in RLS.
