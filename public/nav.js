async function initNavbar({ active = '' } = {}) {
  const root = document.getElementById('navbar-root');
  if (!root) return;

  const session = await getSession();
  if (!session) { window.location.href = '/login.html'; return; }
  const token = session.access_token;

  let profile = null;
  try {
    const r = await fetch('/api/profiles/me', { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) profile = await r.json();
  } catch (e) {}

  let msgUnread = 0, notifUnread = 0;
  try {
    const [nr, cr] = await Promise.all([
      fetch('/api/notifications/unread-count', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/messages/conversations',     { headers: { Authorization: `Bearer ${token}` } })
    ]);
    if (nr.ok) { const d = await nr.json(); notifUnread = d.count || 0; }
    if (cr.ok) { const d = await cr.json(); msgUnread = (d||[]).reduce((a,c) => a + (c.unread_count||0), 0); }
  } catch (e) {}

  const name = profile?.fullname || session.user.email || 'User';
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const links = [
    { href: '/browse.html',        icon: '🔍', label: 'Browse',        id: 'browse' },
    { href: '/favorites.html',     icon: '❤️',  label: 'Saved',         id: 'favorites' },
    { href: '/messages.html',      icon: '💬', label: 'Messages',      id: 'messages',       badge: msgUnread },
    { href: '/notifications.html', icon: '🔔', label: 'Alerts',        id: 'notifications',  badge: notifUnread },
    { href: '/chat.html',          icon: '🤖', label: 'AI Assistant',  id: 'chat' },
  ];

  root.innerHTML = `
    <nav class="navbar">
      <a href="/browse.html" class="nav-logo"><div class="nav-logo-icon">🏠</div>Estate49</a>
      <div class="nav-links">
        ${links.map(l => `
          <a href="${l.href}" class="nav-link ${active===l.id?'active':''}">
            ${l.icon} ${l.label}
            ${l.badge ? `<span class="nav-badge">${l.badge}</span>` : ''}
          </a>`).join('')}
      </div>
      <div class="nav-right">
        <a href="/list-property.html" class="nav-list-btn">+ <span class="lbl">List Property</span></a>
        <div class="nav-avatar-wrap" id="naw">
          <div class="nav-avatar" onclick="toggleDD()" tabindex="0">
            ${profile?.avatar_url ? `<img src="${profile.avatar_url}" alt="avatar"/>` : initials}
          </div>
          <div class="nav-dropdown">
            <div class="nav-dropdown-header">${name}</div>
            <div class="nav-dropdown-divider"></div>
            <a href="/profile.html"          class="nav-dd-item">👤 My Profile</a>
            <a href="/profile.html#listings" class="nav-dd-item">🏠 My Listings</a>
            <a href="/favorites.html"        class="nav-dd-item">❤️ Saved Properties</a>
            <div class="nav-dropdown-divider"></div>
            <button class="nav-dd-item danger" onclick="signOut()">🚪 Sign Out</button>
          </div>
        </div>
      </div>
    </nav>`;

  document.addEventListener('click', e => {
    if (!document.getElementById('naw')?.contains(e.target))
      document.getElementById('naw')?.classList.remove('open');
  });
}
function toggleDD() { document.getElementById('naw')?.classList.toggle('open'); }