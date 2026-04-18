const SUPABASE_URL  = 'https://qbbxdtbfxlliqxxlaoed.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFiYnhkdGJmeGxsaXF4eGxhb2VkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MzY0MzUsImV4cCI6MjA5MTUxMjQzNX0.g86SW28zVacKDKzb0bZcsJvGTQ1N7Ahy3Ib3_DRNL90';

const _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,   // ← must be true for implicit flow
    flowType: 'implicit'        // ← force implicit flow
  }
});

async function getSession() {
  try {
    const { data } = await _sb.auth.getSession();
    if (data?.session) return data.session;
    const stored = localStorage.getItem('e49_session');
    if (stored) {
      const s = JSON.parse(stored);
      if ((s.expires_at || 0) > Date.now() / 1000) return s;
      const { data: d2 } = await _sb.auth.refreshSession({ refresh_token: s.refresh_token });
      if (d2?.session) {
        localStorage.setItem('e49_session', JSON.stringify(d2.session));
        return d2.session;
      }
    }
    return null;
  } catch(e) { return null; }
}

async function signInWithGoogle() {
  const { error } = await _sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/auth/callback',
      queryParams: { access_type: 'offline', prompt: 'consent' }
    }
  });
  if (error) alert('Google sign in failed: ' + error.message);
}

async function signInWithEmail(email, password) {
  const { data, error } = await _sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (data?.session) {
    localStorage.setItem('e49_session', JSON.stringify(data.session));
    return data.session;
  }
  throw new Error('No session returned');
}

async function signUpWithEmail(email, password, fullname) {
  const { data, error } = await _sb.auth.signUp({
    email, password,
    options: { data: { fullname } }
  });
  if (error) throw error;
  return data;
}

async function signOut() {
  await _sb.auth.signOut();
  localStorage.removeItem('e49_session');
  window.location.href = '/login.html';
}