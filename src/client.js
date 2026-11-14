import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL || '';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
export const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url) && key.startsWith('sb_publishable_') && !key.includes('REPLACE');
// Session-only storage: no remembered login across closed browser sessions.
export const client = configured ? createClient(url, key, {
  auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
}) : null;
