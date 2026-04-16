// nav.js — Estate49 shared navbar (clean SVG icons)

async function initNavbar(opts = {}) {
  const root = document.getElementById('navbar-root');
  if (!root) return;

  let user = null, token = null;
  try {
    const session = await getSession();
    if (session) { user = session.user; token = session.access_token; }
  } catch (e) {}

  const active   = opts.active || '';
  const initials = user
    ? (user.user_metadata?.full_name || user.email || '')
        .split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'
    : '';

  root.innerHTML = `
  <style>
    .e49-nav {
      background: #fff;
      border-bottom: 1px solid #e5e5e5;
      position: sticky; top: 0; z-index: 300;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
      font-family: 'Inter', sans-serif;
    }
    .e49-inner {
      max-width: 1280px; margin: 0 auto;
      padding: 0 28px; height: 56px;
      display: flex; align-items: center; gap: 6px;
    }
    .e49-logo {
      display: flex; align-items: center; gap: 8px;
      text-decoration: none; margin-right: 10px; flex-shrink: 0;
    }
    .e49-logo-box {
      width: 32px; height: 32px; background: #c0392b;
      border-radius: 9px; display: flex; align-items: center;
      justify-content: center;
    }
    .e49-logo-box svg { width: 18px; height: 18px; fill: white; stroke: none; }
    .e49-logo-text { font-size: 17px; font-weight: 800; color: #c0392b; letter-spacing: -0.3px; }
    .e49-links { display: flex; align-items: center; gap: 2px; flex: 1; }
    .e49-link {
      padding: 6px 13px; border-radius: 9px; text-decoration: none;
      font-size: 13px; font-weight: 500; color: #6e6e80;
      transition: all 0.18s; white-space: nowrap;
    }
    .e49-link:hover  { background: #f7f7f8; color: #0d0d0d; }
    .e49-link.active { color: #c0392b; background: #fadbd8; font-weight: 600; }
    .e49-spacer { flex: 1; }
    .e49-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
    .e49-ibtn {
      position: relative; width: 36px; height: 36px;
      border-radius: 10px; background: transparent; border: none;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; text-decoration: none; transition: background 0.18s; color: #6e6e80;
    }
    .e49-ibtn:hover { background: #f7f7f8; color: #0d0d0d; }
    .e49-ibtn svg {
      width: 20px; height: 20px; stroke: currentColor; fill: none;
      stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
    }
    .e49-badge {
      position: absolute; top: 2px; right: 2px;
      background: #c0392b; color: #fff; font-size: 9px; font-weight: 700;
      min-width: 15px; height: 15px; border-radius: 8px;
      padding: 0 3px; display: none; align-items: center; justify-content: center;
    }
    .e49-avatar {
      width: 34px; height: 34px; border-radius: 50%;
      background: #c0392b; color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; cursor: pointer; border: none;
      font-family: 'Inter', sans-serif; transition: opacity 0.2s;
      flex-shrink: 0; letter-spacing: 0.5px;
    }
    .e49-avatar:hover { opacity: 0.82; }
    .e49-signin {
      padding: 7px 16px; border-radius: 9px; background: #c0392b; color: white;
      text-decoration: none; font-size: 13px; font-weight: 600; transition: background 0.18s;
    }
    .e49-signin:hover { background: #a93226; }
    @media (max-width: 700px) {
      .e49-inner { padding: 0 14px; }
      .e49-links  { display: none; }
      .e49-logo-text { display: none; }
    }
  </style>

  <nav class="e49-nav" id="e49-navbar">
    <div class="e49-inner">
      <a href="/" class="e49-logo">
        <div class="e49-logo-box">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>
        </div>
        <span class="e49-logo-text">Estate49</span>
      </a>

      <div class="e49-links">
        <a href="/browse.html"        class="e49-link ${active==='browse' ?'active':''}">Browse</a>
        <a href="/chat.html"          class="e49-link ${active==='chat'   ?'active':''}">AI Chat</a>
        <a href="/list-property.html" class="e49-link ${active==='list'   ?'active':''}">List Property</a>
      </div>

      <div class="e49-spacer"></div>

      <div class="e49-actions">
        <a href="/favorites.html" class="e49-ibtn" title="Saved Properties">
          <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
        </a>

        <a href="/messages.html" class="e49-ibtn" id="e49-msg-btn" title="Messages">
          <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          <span class="e49-badge" id="e49-msg-badge"></span>
        </a>

        <a href="/notifications.html" class="e49-ibtn" id="e49-notif-btn" title="Notifications">
          <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
          <span class="e49-badge" id="e49-notif-badge"></span>
        </a>

        ${user
          ? `<button class="e49-avatar" onclick="window.location.href='/profile.html'" title="My Profile">${initials}</button>`
          : `<a href="/login.html" class="e49-signin">Sign In</a>`
        }
      </div>
    </div>
  </nav>`;

  if (user && token) _loadNavBadges(user.id, token).catch(() => {});
}

async function _loadNavBadges(userId, token) {
  const h = { Authorization: `Bearer ${token}` };

  // Notifications unread count
  try {
    const r = await fetch(`/api/notifications/${userId}`, { headers: h });
    if (r.ok) {
      const arr = await r.json();
      const unread = Array.isArray(arr) ? arr.filter(n => !n.is_read).length : 0;
      _setBadge('e49-notif-badge', unread);
    }
  } catch (_) {}

  // Messages unread count
  try {
    const r = await fetch(`/api/messages/inbox/${userId}`, { headers: h });
    if (r.ok) {
      const arr = await r.json();
      const unread = Array.isArray(arr)
        ? arr.reduce((sum, c) => sum + (c.unread_count || 0), 0)
        : 0;
      _setBadge('e49-msg-badge', unread);
    }
  } catch (_) {}
}

function _setBadge(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  if (count > 0) {
    el.textContent = count > 9 ? '9+' : String(count);
    el.style.display = 'flex';
  } else {
    el.style.display = 'none';
  }
}