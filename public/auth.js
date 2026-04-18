const SUPABASE_URL  = 'https://qbbxdtbfxlliqxxlaoed.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFiYnhkdGJmeGxsaXF4eGxhb2VkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MzY0MzUsImV4cCI6MjA5MTUxMjQzNX0.g86SW28zVacKDKzb0bZcsJvGTQ1N7Ahy3Ib3DRNL90';

const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  }
});

async function getSession() {
  try {
    // First try Supabase native session
    const { data, error } = await _supabase.auth.getSession();
    if (!error && data?.session) return data.session;

    // Fallback: manually stored session
    const stored = localStorage.getItem('estate49_session');
    if (stored) {
      const session = JSON.parse(stored);
      // Check if token expired
      const exp = session.expires_at || 0;
      if (Date.now() / 1000 < exp) return session;
      // Try refresh
      const { data: d2 } = await _supabase.auth.refreshSession({ refresh_token: session.refresh_token });
      if (d2?.session) {
        localStorage.setItem('estate49_session', JSON.stringify(d2.session));
        return d2.session;
      }
    }
    return null;
  } catch(e) {
    return null;
  }
}

async function signOut() {
  await _supabase.auth.signOut();
  localStorage.removeItem('estate49_session');
  window.location.href = '/login.html';
}