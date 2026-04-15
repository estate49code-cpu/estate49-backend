// nav.js — Estate49 shared navigation bar

async function initNavbar(opts = {}) {
  const root = document.getElementById('navbar-root');
  if (!root) return;

  let user = null;
  let token = null;

  try {
    const session = await getSession();
    if (session) {
      user   = session.user;
      token  = session.access_token;
    }
  } catch (e) {}

  const active = opts.active || '';

  const initials = user
    ? (user.user_metadata?.full_name || user.email || '')
        .split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'
    : '';

  root.innerHTML = `
    <style>
      .e49-nav {
        background: #fff;
        border-bottom: 1px solid #e5e5e5;
        position: sticky; top: 0; z-index: 200;
        box-shadow: 0 1px 6px rgba(0,0,0,0.06);
        font-family: 'Inter', sans-serif;
      }
      .e49-nav-inner {
        max-width: 1280px; margin: 0 auto;
        padding: 0 32px; height: 56px;
        display: flex; align-items: center; gap: 20px;
      }
      .e49-logo {
        display: flex; align-items: center; gap: 8px;
        text-decoration: none; color: #c0392b;
        font-weight: 800; font-size: 17px; flex-shrink: 0;
      }
      .e49-logo-box {
        width: 30px; height: 30px; background: #c0392b;
        border-radius: 8px; display: flex; align-items: center;
        justify-content: center; font-size: 15px;
      }
      .e49-links { display: flex; align-items: center; gap: 2px; flex: 1; }
      .e49-link {
        padding: 6px 14px; border-radius: 9px;
        text-decoration: none; font-size: 14px; font-weight: 500;
        color: #6e6e80; transition: all 0.2s; white-space: nowrap;
      }
      .e49-link:hover  { background: #f7f7f8; color: #0d0d0d; }
      .e49-link.active { color: #c0392b; background: #fadbd8; font-weight: 600; }
      .e49-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
      .e49-ibtn {
        position: relative; width: 36px; height: 36px;
        border-radius: 10px; background: #f7f7f8; border: none;
        display: flex; align-items: center; justify-content: center;
        font-size: 17px; cursor: pointer; text-decoration: none;
        transition: background 0.2s; color: inherit;
      }
      .e49-ibtn:hover { background: #fadbd8; }
      .e49-badge {
        position: absolute; top: -3px; right: -3px;
        background: #c0392b; color: #fff;
        font-size: 10px; font-weight: 700;
        min-width: 16px; height: 16px; border-radius: 8px;
        padding: 0 3px; display: none; align-items: center;
        justify-content: center; font-family: 'Inter', sans-serif;
      }
      .e49-avatar {
        width: 34px; height: 34px; border-radius: 50%;
        background: #c0392b; color: #fff;
        display: flex; align-items: center; justify-content: center;
        font-size: 13px; font-weight: 700; cursor: pointer;
        border: none; transition: opacity 0.2s; flex-shrink: 0;
      }
      .e49-avatar:hover { opacity: 0.82; }
      @media (max-width: 768px) {
        .e49-nav-inner { padding: 0 14px; gap: 10px; }
        .e49-links { display: none; }
        .e49-logo span { display: none; }
      }
    </style>

    <nav class="e49-nav" id="e49-navbar">
      <div class="e49-nav-inner">
        <a href="/" class="e49-logo">
          <div class="e49-logo-box">🏠</div>
          <span>Estate49</span>
        </a>

        <div class="e49-links">
          <a href="/browse.html"        class="e49-link ${active==='browse'   ? 'active' : ''}">Browse</a>
          <a href="/chat.html"          class="e49-link ${active==='chat'     ? 'active' : ''}">AI Chat</a>
          <a href="/list-property.html" class="e49-link ${active==='list'     ? 'active' : ''}">List Property</a>
        </div>

        <div class="e49-actions">
          <a href="/favorites.html"      class="e49-ibtn" title="Favourites">❤️</a>

          <a href="/messages.html"       class="e49-ibtn" id="e49-msg-btn" title="Messages">
            💬
            <span class="e49-badge" id="e49-msg-badge"></span>
          </a>

          <a href="/notifications.html"  class="e49-ibtn" id="e49-notif-btn" title="Notifications">
            🔔
            <span class="e49-badge" id="e49-notif-badge"></span>
          </a>

          ${user
            ? `<button class="e49-avatar" onclick="window.location.href='/profile.html'" title="Profile">${initials}</button>`
            : `<a href="/login.html" class="e49-link">Sign In</a>`
          }
        </div>
      </div>
    </nav>
  `;

  // Load counts silently — never crash the page if these fail
  if (user && token) {
    _loadNavCounts(user.id, token).catch(() => {});
  }
}

async function _loadNavCounts(userId, token) {
  const headers = { Authorization: `Bearer ${token}` };

  // Notifications count
  try {
    const r = await fetch(`/api/notifications/${userId}`, { headers });
    if (r.ok) {
      const arr = await r.json();
      const unread = Array.isArray(arr) ? arr.filter(n => !n.read).length : 0;
      _setNavBadge('e49-notif-badge', unread);
    }
  } catch (_) {}

  // Messages unread count
  try {
    const r = await fetch(`/api/messages/inbox/${userId}`, { headers });
    if (r.ok) {
      const arr = await r.json();
      const unread = Array.isArray(arr)
        ? arr.filter(m => !m.read && m.receiver_id === userId).length
        : 0;
      _setNavBadge('e49-msg-badge', unread);
    }
  } catch (_) {}
}

function _setNavBadge(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  if (count > 0) {
    el.textContent = count > 9 ? '9+' : count;
    el.style.display = 'flex';
  } else {
    el.style.display = 'none';
  }
}