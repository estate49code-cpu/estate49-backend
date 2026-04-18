const SUPABASE_URL = 'https://qbbxdtbfxlliqxxlaoed.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFiYnhkdGJmeGxsaXF4eGxhb2VkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MzY0MzUsImV4cCI6MjA5MTUxMjQzNX0.g86SW28zVacKDKzb0bZcsJvGTQ1N7Ahy3Ib3DRNL90';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function getSession() {
  const { data: { session } } = await sb.auth.getSession();
  return session;
}
async function getUser() {
  const { data: { user } } = await sb.auth.getUser();
  return user;
}
async function signInWithGoogle() {
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/auth/callback' }
  });
  if (error) alert('Google sign-in failed: ' + error.message);
}
async function signUpWithEmail(email, password, fullName) {
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: {
      data: { fullname: fullName, full_name: fullName },
      emailRedirectTo: window.location.origin + '/auth/callback'
    }
  });
  if (error) return { success: false, message: error.message };
  return { success: true, message: 'Check your email to confirm your account!', user: data.user };
}
async function signInWithEmail(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { success: false, message: error.message };
  return { success: true, user: data.user, session: data.session };
}
async function signOut() {
  await sb.auth.signOut();
  window.location.href = '/login.html';
}
async function resetPassword(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/reset-password.html'
  });
  if (error) return { success: false, message: error.message };
  return { success: true, message: 'Reset link sent! Check your email.' };
}