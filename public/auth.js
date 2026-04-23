// auth.js — Estate49
// Handles Supabase session: normal login, Google OAuth callback, email confirmation

const SUPABASE_URL = 'https://qbbxdtbfxlliqxxlaoed.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFiYnhkdGJmeGxsaXF4eGxhb2VkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MzY0MzUsImV4cCI6MjA5MTUxMjQzNX0.g86SW28zVacKDKzb0bZcsJvGTQ1N7Ahy3Ib3_DRNL90';

const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

// expose as `sb` so callback.html can also use it
const sb = _sb;

// ── getSession ──────────────────────────────────────────────────────────────
async function getSession() {
  const { data: { session }, error } = await _sb.auth.getSession();

  if (session) {
    return { user: session.user, access_token: session.access_token };
  }

  // PKCE flow — exchange ?code= from URL
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (code) {
    try {
      const { data, error: exchErr } = await _sb.auth.exchangeCodeForSession(code);
      if (data?.session) {
        window.history.replaceState({}, '', window.location.pathname);
        return { user: data.session.user, access_token: data.session.access_token };
      }
    } catch (e) {}
  }

  return null;
}

// ── signInWithGoogle ────────────────────────────────────────────────────────
// Uses window.location.origin so it works on BOTH estate49.com AND www.estate49.com
async function signInWithGoogle() {
  const { error } = await _sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/auth/callback'  // ✅ Dynamic — works on www and non-www
    }
  });
  if (error) throw error;
}

// ── signUpEmail ─────────────────────────────────────────────────────────────
async function signUpEmail(email, password) {
  const { data, error } = await _sb.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin + '/auth/callback'
    }
  });
  if (error) throw error;
  return data;
}

// ── signInEmail ─────────────────────────────────────────────────────────────
async function signInEmail(email, password) {
  const { data, error } = await _sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { user: data.session.user, access_token: data.session.access_token };
}

// ── signOut ──────────────────────────────────────────────────────────────────
async function signOut() {
  await _sb.auth.signOut();
  window.location.href = '/login.html';
}