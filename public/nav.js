// nav.js — inject navbar into any page
// Usage: <div id="navbar-root"></div> <script src="/nav.js"></script>

async function initNavbar({ active = '' } = {}) {
  const root = document.getElementById('navbar-root');
  if (!root) return;

  root.innerHTML = `
    <nav id="main-nav">
      <div class="nav-left">
        <a class="nav-logo" href="/">
          <div class="nav-logo-icon">🏠</div>
          <span class="nav-logo-text">Estate49</span>
        </a>
        <div class="nav-links">
          <a class="nav-link ${active==='browse'?'active':''}"        href="/browse.html">Browse</a>
          <a class="nav-link ${active==='chat'?'active':''}"          href="/chat.html">AI Chat</a>
          <a class="nav-link ${active==='list'?'active':''}"          href="/list-property.html">List Property</a>
        </div>
      </div>
      <div class="nav-right">
        <a class="nav-icon-btn ${active==='favorites'?'active':''}" href="/favorites.html" title="Favorites">
          ❤️
          <span class="nav-badge" id="fav-count" style="display:none"></span>
        </a>
        <a class="nav-icon-btn ${active==='messages'?'active':''}" href="/messages.html" title="Messages">
          💬
          <span class="nav-badge" id="msg-count" style="display:none"></span>
        </a>
        <a class="nav-icon-btn ${active==='notifications'?'active':''}" href="/notifications.html" title="Notifications">
          🔔
          <span class="nav-badge" id="notif-count" style="display:none"></span>
        </a>
        <a class="nav-avatar-btn ${active==='profile'?'active':''}" href="/profile.html" id="nav-avatar-btn" title="Profile">
          <div class="nav-avatar" id="nav-avatar">👤</div>
        </a>
      </div>
    </nav>
    <style>
      #main-nav {
        background: white; border-bottom: 1px solid #e5e5e5;
        padding: 0 32px; height: 60px;
        display: flex; align-items: center; justify-content: space-between;
        position: sticky; top: 0; z-index: 100;
        box-shadow: 0 1px 8px rgba(0,0,0,0.05);
        font-family: 'Inter', sans-serif;
      }
      .nav-left  { display: flex; align-items: center; gap: 24px; }
      .nav-right { display: flex; align-items: center; gap: 6px; }
      .nav-logo  { display: flex; align-items: center; gap: 8px; text-decoration: none; }
      .nav-logo-icon { width: 32px; height: 32px; background: #c0392b; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
      .nav-logo-text { font-size: 17px; font-weight: 800; color: #c0392b; }
      .nav-links { display: flex; align-items: center; gap: 2px; }
      .nav-link  { padding: 6px 12px; border-radius: 8px; font-size: 13px; font-weight: 500; color: #6e6e80; text-decoration: none; transition: all 0.2s; }
      .nav-link:hover  { background: #f7f7f8; color: #0d0d0d; }
      .nav-link.active { background: #fadbd8; color: #c0392b; font-weight: 600; }
      .nav-icon-btn {
        position: relative; width: 38px; height: 38px;
        display: flex; align-items: center; justify-content: center;
        border-radius: 10px; text-decoration: none; font-size: 18px;
        transition: background 0.2s; cursor: pointer;
      }
      .nav-icon-btn:hover  { background: #f7f7f8; }
      .nav-icon-btn.active { background: #fadbd8; }
      .nav-badge {
        position: absolute; top: 4px; right: 4px;
        min-width: 16px; height: 16px; padding: 0 4px;
        background: #c0392b; color: white;
        border-radius: 10px; font-size: 10px; font-weight: 700;
        display: flex; align-items: center; justify-content: center;
        border: 2px solid white; line-height: 1;
      }
      .nav-avatar-btn { text-decoration: none; border-radius: 50%; }
      .nav-avatar {
        width: 34px; height: 34px; border-radius: 50%;
        background: #c0392b; color: white;
        display: flex; align-items: center; justify-content: center;
        font-size: 13px; font-weight: 700; cursor: pointer;
        border: 2px solid transparent; transition: border-color 0.2s;
      }
      .nav-avatar-btn:hover .nav-avatar { border-color: #c0392b; }
      .nav-avatar-btn.active .nav-avatar { border-color: #c0392b; background: #a93226; }
      @media (max-width: 768px) {
        #main-nav { padding: 0 14px; }
        .nav-links { display: none; }
      }
    </style>`;

  // Load user + badge counts
  try {
    const session = await getSession();
    if (!session) return;

    const user = session.user;
    const name = user.user_metadata?.full_name || user.email.split('@')[0];
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    document.getElementById('nav-avatar').textContent = initials;

    // Load notification + message counts
    const userId = user.id;
    loadBadges(userId);
  } catch(e) {}
}

async function loadBadges(userId) {
  try {
    // Unread notifications
    const nr = await fetch(`/api/notifications/${userId}/unread`);
    const nd = await nr.json();
    const nc = document.getElementById('notif-count');
    if (nd.count > 0) { nc.textContent = nd.count > 9 ? '9+' : nd.count; nc.style.display = 'flex'; }

    // Unread messages
    const mr = await fetch(`/api/messages/inbox/${userId}`);
    const md = await mr.json();
    const unreadMsgs = (md || []).reduce((a, t) => a + (t.unread || 0), 0);
    const mc = document.getElementById('msg-count');
    if (unreadMsgs > 0) { mc.textContent = unreadMsgs > 9 ? '9+' : unreadMsgs; mc.style.display = 'flex'; }
  } catch(e) {}
}