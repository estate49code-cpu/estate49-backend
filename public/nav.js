async function initNavbar({ active = '' } = {}) {
  const root = document.getElementById('navbar-root');
  if (!root) return;
  root.innerHTML = `
    <div class="e49-bar">
      <a class="e49-logo" href="/">
        <div class="e49-logo-icon">🏠</div>
        <span>Estate49</span>
      </a>
      <div class="e49-links">
        <a class="e49-link ${active==='browse'?'e49-act':''}" href="/browse.html">Browse</a>
        <a class="e49-link ${active==='chat'?'e49-act':''}" href="/chat.html">AI Chat</a>
        <a class="e49-link ${active==='list'?'e49-act':''}" href="/list-property.html">List Property</a>
      </div>
      <div class="e49-actions">
        <a class="e49-btn ${active==='favorites'?'e49-act':''}" href="/favorites.html" title="Favorites">
          ❤️<span class="e49-badge" id="fav-badge" style="display:none"></span>
        </a>
        <a class="e49-btn ${active==='messages'?'e49-act':''}" href="/messages.html" title="Messages">
          💬<span class="e49-badge" id="msg-badge" style="display:none"></span>
        </a>
        <a class="e49-btn ${active==='notifications'?'e49-act':''}" href="/notifications.html" title="Notifications">
          🔔<span class="e49-badge" id="notif-badge" style="display:none"></span>
        </a>
        <a class="e49-avatar-btn ${active==='profile'?'e49-act':''}" href="/profile.html" title="Profile">
          <div class="e49-avatar" id="nav-avatar">👤</div>
        </a>
      </div>
    </div>
    <style>
      .e49-bar {
        display:flex;align-items:center;justify-content:space-between;
        padding:0 24px;height:52px;background:white;
        border-bottom:1px solid #e5e5e5;position:sticky;top:0;z-index:200;
        box-shadow:0 1px 6px rgba(0,0,0,0.06);font-family:'Inter',sans-serif;
      }
      .e49-logo { display:flex;align-items:center;gap:8px;text-decoration:none;font-weight:800;font-size:16px;color:#c0392b; }
      .e49-logo-icon { width:30px;height:30px;background:#c0392b;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:15px; }
      .e49-links { display:flex;align-items:center;gap:2px; }
      .e49-link { padding:6px 12px;border-radius:8px;font-size:13px;font-weight:500;color:#6e6e80;text-decoration:none;transition:all .2s; }
      .e49-link:hover { background:#f7f7f8;color:#0d0d0d; }
      .e49-link.e49-act { background:#fadbd8;color:#c0392b;font-weight:600; }
      .e49-actions { display:flex;align-items:center;gap:2px; }
      .e49-btn {
        position:relative;width:38px;height:38px;
        display:flex;align-items:center;justify-content:center;
        border-radius:10px;text-decoration:none;font-size:17px;transition:background .18s;
      }
      .e49-btn:hover { background:#f7f7f8; }
      .e49-btn.e49-act { background:#fadbd8; }
      .e49-badge {
        position:absolute;top:4px;right:4px;min-width:15px;height:15px;padding:0 3px;
        background:#c0392b;color:white;border-radius:10px;font-size:9px;font-weight:700;
        display:flex;align-items:center;justify-content:center;border:2px solid white;
      }
      .e49-avatar-btn { text-decoration:none;margin-left:4px; }
      .e49-avatar {
        width:34px;height:34px;border-radius:50%;background:#c0392b;color:white;
        display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;
        border:2px solid transparent;transition:border-color .2s;
      }
      .e49-avatar-btn:hover .e49-avatar,.e49-avatar-btn.e49-act .e49-avatar { border-color:#c0392b; }
      @media(max-width:768px){
        .e49-links { display:none; }
        .e49-logo span { display:none; }
        .e49-bar { padding:0 14px; }
      }
    </style>`;

  try {
    const session = await getSession();
    if (!session) return;
    const user = session.user;
    const name = user.user_metadata?.full_name || user.email.split('@')[0];
    const initials = name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
    const av = document.getElementById('nav-avatar');
    if (av) av.textContent = initials;
    _loadBadges(user.id);
  } catch(e) {}
}

async function _loadBadges(userId) {
  try {
    const nr = await fetch(`/api/notifications/${userId}/unread`);
    if (nr.ok) {
      const nd = await nr.json();
      if ((nd.count||0) > 0) {
        const el = document.getElementById('notif-badge');
        if (el) { el.textContent = nd.count>9?'9+':nd.count; el.style.display='flex'; }
      }
    }
  } catch(e) {}
  try {
    const mr = await fetch(`/api/messages/inbox/${userId}`);
    if (mr.ok) {
      const md = await mr.json();
      const unread = (md||[]).reduce((a,t)=>a+(t.unread||0),0);
      if (unread > 0) {
        const el = document.getElementById('msg-badge');
        if (el) { el.textContent = unread>9?'9+':unread; el.style.display='flex'; }
      }
    }
  } catch(e) {}
}