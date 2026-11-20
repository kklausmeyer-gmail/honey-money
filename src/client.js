import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL || '';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
export const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url) && key.startsWith('sb_publishable_') && !key.includes('REPLACE');
// Existing session-only tokens are left alone; new logins explicitly choose personal/shared storage.
const rememberKey = 'honey-money-remember';
export function setRememberDevice(remember) {
  window.localStorage.setItem(rememberKey, remember ? 'yes' : 'no');
}
function activeStorage() { return window.localStorage.getItem(rememberKey) === 'yes' ? window.localStorage : window.sessionStorage; }
const authStorage = {
  getItem: key => activeStorage().getItem(key),
  setItem(key, value) {
    const active = activeStorage();
    const other = active === window.localStorage ? window.sessionStorage : window.localStorage;
    other.removeItem(key); active.setItem(key, value);
  },
  removeItem(key) { window.localStorage.removeItem(key); window.sessionStorage.removeItem(key); },
};
export const client = configured ? createClient(url, key, {
  auth: { storage: authStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
}) : null;
