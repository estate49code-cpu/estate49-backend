// auth.js — Estate49

const SUPABASE_URL = 'https://qbbxdtbfxlliqxxlaoed.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFiYnhkdGJmeGxsaXF4eGxhb2VkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MzY0MzUsImV4cCI6MjA5MTUxMjQzNX0.g86SW28zVacKDKzb0bZcsJvGTQ1N7Ahy3Ib3_DRNL90';

const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: window.localStorage   // ✅ ADDED: persist across browser close/reopen until manual logout
  }
});

// expose globally so callback.html and other scripts can use it
const sb = _sb;

// ── Global session cache — shared across ALL callers ──────────────────────
let _sessionCache = null;
let _sessionPromise = null;

async function getSession() {
  // Return cached session immediately if available
  if (_sessionCache) return _sessionCache;

  // If a session fetch is already in progress, wait for it
  if (_sessionPromise) return _sessionPromise;

  _sessionPromise = (async () => {
    try {
      // Step 1: Try existing session
      const { data: { session } } = await _sb.auth.getSession();
      if (session) {
        _sessionCache = { user: session.user, access_token: session.access_token };
        return _sessionCache;
      }

      // Step 2: PKCE — exchange ?code= from URL
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      if (code) {
        try {
          const { data } = await _sb.auth.exchangeCodeForSession(code);
          if (data?.session) {
            window.history.replaceState({}, '', window.location.pathname);
            _sessionCache = { user: data.session.user, access_token: data.session.access_token };
            return _sessionCache;
          }
        } catch (e) {}
      }

      return null;
    } finally {
      _sessionPromise = null;
    }
  })();

  return _sessionPromise;
}

// Clear cache on auth state change (logout / token refresh)
_sb.auth.onAuthStateChange((event, session) => {
  if (session) {
    _sessionCache = { user: session.user, access_token: session.access_token };
  } else {
    _sessionCache = null;
  }
});

// ── signInWithGoogle ────────────────────────────────────────────────────────
async function signInWithGoogle() {
  const { error } = await _sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/auth/callback'
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
  _sessionCache = { user: data.session.user, access_token: data.session.access_token };
  return _sessionCache;
}

// ── signOut ──────────────────────────────────────────────────────────────────
async function signOut() {
  _sessionCache = null;
  await _sb.auth.signOut();
  localStorage.clear();            // ✅ ADDED: wipe stored session from this browser completely
  window.location.href = '/login.html';
}