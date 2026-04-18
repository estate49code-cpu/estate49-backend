const SUPABASE_URL  = 'https://qbbxdtbfxlliqxxlaoed.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFiYnhkdGJmeGxsaXF4eGxhb2VkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MzY0MzUsImV4cCI6MjA5MTUxMjQzNX0.g86SW28zVacKDKzb0bZcsJvGTQ1N7Ahy3Ib3DRNL90';

const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }
});

// ─── GET SESSION ───────────────────────────────────────────────
async function getSession() {
  try {
    const { data } = await _supabase.auth.getSession();
    if (data?.session) return data.session;
    const stored = localStorage.getItem('e49_session');
    if (stored) {
      const s = JSON.parse(stored);
      if ((s.expires_at || 0) > Date.now() / 1000) return s;
      const { data: d2 } = await _supabase.auth.refreshSession({ refresh_token: s.refresh_token });
      if (d2?.session) { localStorage.setItem('e49_session', JSON.stringify(d2.session)); return d2.session; }
    }
    return null;
  } catch(e) { return null; }
}

// ─── GOOGLE SIGN IN ────────────────────────────────────────────
async function signInWithGoogle() {
  const { error } = await _supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/auth/callback'
    }
  });
  if (error) alert('Google sign in failed: ' + error.message);
}

// ─── EMAIL SIGN IN ─────────────────────────────────────────────
async function signInWithEmail(email, password) {
  const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (data?.session) {
    localStorage.setItem('e49_session', JSON.stringify(data.session));
    return data.session;
  }
  throw new Error('No session returned');
}

// ─── EMAIL SIGN UP ─────────────────────────────────────────────
async function signUpWithEmail(email, password, fullname) {
  const { data, error } = await _supabase.auth.signUp({
    email, password,
    options: { data: { fullname } }
  });
  if (error) throw error;
  return data;
}

// ─── SIGN OUT ──────────────────────────────────────────────────
async function signOut() {
  await _supabase.auth.signOut();
  localStorage.removeItem('e49_session');
  window.location.href = '/login.html';
}