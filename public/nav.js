// nav.js — Estate49 shared navigation: desktop topbar + mobile bottom nav


async function initNavbar({ active = '' } = {}) {
  const root = document.getElementById('navbar-root');
  if (!root) return;


  let userName = '', userInitials = '?', userEmail = '';
  try {
    const s = await getSession();
    if (s) {
      const n = s.user.user_metadata?.full_name || s.user.email || '';
      userName = n;
      userInitials = n.split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2) || '?';
      userEmail = s.user.email || '';
    }
  } catch(e) {}


  const navLinks = [
    { key: 'browse',  href: '/browse.html',        label: 'Browse' },
    { key: 'chat',    href: '/chat.html',           label: 'AI Chat' },
    { key: 'list',    href: '/list-property.html',  label: 'List Property' },
    { key: 'support', href: '/support.html',        label: '🎧 Support' },
  ];


  root.innerHTML = `
    <nav id="main-nav">
      <a class="nav-logo" href="/index.html">
        <div class="nav-logo-icon">🏠</div>
        <span class="nav-logo-text">Estate49</span>
      </a>
      <div class="nav-links-center">
        ${navLinks.map(p => `<a class="nav-link${active===p.key?' nav-link-active':''}" href="${p.href}">${p.label}</a>`).join('')}
      </div>
      <div class="nav-right">
        <a class="nav-icon-btn" href="/messages.html" title="Messages" id="nav-msg-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        </a>
        <a class="nav-icon-btn" href="/notifications.html" title="Alerts" id="nav-notif-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
        </a>
        <a class="nav-icon-btn" href="/chat.html" title="AI Chat">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        </a>
        <div class="nav-user-wrap">
          <div class="nav-avatar" id="nb-avatar" onclick="toggleNavDropdown()">${userInitials}</div>
          <div class="nav-dropdown" id="nav-dropdown">
            <div class="nav-dd-name">${userName}</div>
            <div class="nav-dd-email">${userEmail}</div>
            <a class="nav-dd-item" href="/profile.html">👤 Profile</a>
            <a class="nav-dd-item" href="/profile.html?tab=listings">🏠 My Listings</a>
            <a class="nav-dd-item" href="/favorites.html">❤️ Saved</a>
            <a class="nav-dd-item" href="/messages.html">✉️ Messages</a>
            <a class="nav-dd-item" href="/notifications.html">🔔 Alerts</a>
            <a class="nav-dd-item" href="/support.html">🎧 Support</a>
            <button class="nav-dd-item nav-dd-signout" onclick="signOut()">↩ Sign Out</button>
          </div>
        </div>
      </div>
    </nav>
  `;


  if (!document.getElementById('nav-shared-style')) {
    const st = document.createElement('style');
    st.id = 'nav-shared-style';
    st.textContent = `
      :root { --nav-h: 60px; }
      #main-nav {
        height: var(--nav-h); display: flex; align-items: center;
        padding: 0 32px; background: #fff;
        border-bottom: 1px solid #e5e5e5;
        position: sticky; top: 0; z-index: 200;
        box-shadow: 0 1px 8px rgba(0,0,0,0.04); gap: 16px;
      }
      .nav-logo { display:flex; align-items:center; gap:8px; text-decoration:none; flex-shrink:0; }
      .nav-logo-icon { width:36px;height:36px;background:#c0392b;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px; }
      .nav-logo-text { font-size:18px;font-weight:800;color:#c0392b; }
      .nav-links-center { display:flex; align-items:center; gap:4px; flex:1; }
      .nav-link { padding:7px 12px; border-radius:8px; font-size:13px; font-weight:500; color:#6e6e80; text-decoration:none; transition:all 0.2s; }
      .nav-link:hover { background:#f7f7f8; color:#0d0d0d; }
      .nav-link-active { color:#c0392b; background:#fadbd8; }
      .nav-right { display:flex; align-items:center; gap:4px; margin-left:auto; }
      .nav-icon-btn { width:38px;height:38px;border-radius:10px;border:none;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#6e6e80;transition:all 0.2s;text-decoration:none;position:relative; }
      .nav-icon-btn:hover { background:#f7f7f8; color:#0d0d0d; }
      .nav-badge-dot { position:absolute;top:6px;right:6px;width:8px;height:8px;background:#c0392b;border-radius:50%;border:2px solid #fff; }
      .nav-user-wrap { position:relative; }
      .nav-avatar { width:34px;height:34px;border-radius:50%;background:#c0392b;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;cursor:pointer;border:2px solid #fadbd8;transition:box-shadow 0.2s; }
      .nav-avatar:hover { box-shadow:0 0 0 3px rgba(192,57,43,0.2); }
      .nav-dropdown { display:none;position:absolute;top:calc(100% + 8px);right:0;background:#fff;border:1px solid #e5e5e5;border-radius:14px;padding:8px;min-width:200px;box-shadow:0 8px 24px rgba(0,0,0,0.12);z-index:300; }
      .nav-dropdown.open { display:block; }
      .nav-dd-name { padding:8px 12px 2px;font-size:13px;font-weight:600;color:#0d0d0d; }
      .nav-dd-email { padding:0 12px 8px;font-size:11px;color:#6e6e80;border-bottom:1px solid #e5e5e5;margin-bottom:6px; }
      .nav-dd-item { display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:8px;font-size:13px;color:#6e6e80;cursor:pointer;transition:all 0.2s;border:none;background:none;width:100%;text-align:left;text-decoration:none; }
      .nav-dd-item:hover { background:#f7f7f8;color:#0d0d0d; }
      .nav-dd-signout { color:#c0392b; }
      .nav-dd-signout:hover { background:#fadbd8; }


      /* ===== BOTTOM NAV (mobile only) ===== */
      #bottom-nav {
        display: none;
        position: fixed; bottom:0; left:0; right:0;
        height: 62px; background:#fff;
        border-top:1px solid #e5e5e5;
        z-index:300;
        padding-bottom: env(safe-area-inset-bottom,0);
        box-shadow: 0 -2px 16px rgba(0,0,0,0.07);
      }
      .bn-item {
        flex:1; display:flex; flex-direction:column; align-items:center;
        justify-content:center; gap:3px; padding:6px 2px;
        color:#6e6e80; text-decoration:none;
        font-size:10px; font-weight:500; font-family:inherit;
        transition:color 0.18s; position:relative; min-width:0;
      }
      .bn-icon { font-size:20px; line-height:1; }
      .bn-item.active { color:#c0392b; }
      .bn-badge { position:absolute;top:4px;right:calc(50% - 16px);background:#c0392b;color:#fff;font-size:9px;font-weight:700;min-width:16px;height:16px;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:0 4px;border:2px solid #fff; }


      @media(max-width:768px){
        #main-nav { padding:0 14px; height:54px; }
        .nav-links-center { display:none; }
        #bottom-nav { display:flex !important; align-items:stretch; }
        body { padding-bottom: calc(62px + env(safe-area-inset-bottom,0px)); }
        .toast { bottom:72px !important; }
      }
    `;
    document.head.appendChild(st);
  }


  // Inject bottom nav
  document.getElementById('bottom-nav')?.remove();
  const bnPages = [
    { key:'home',     href:'/index.html',         icon:'🏠', label:'Home' },
    { key:'browse',   href:'/browse.html',        icon:'🔍', label:'Browse' },
    { key:'chat',     href:'/chat.html',          icon:'💬', label:'AI Chat' },
    { key:'messages', href:'/messages.html',      icon:'✉️',  label:'Messages', id:'bn-msg' },
    { key:'support',  href:'/support.html',       icon:'🎧', label:'Support' },
  ];
  const bn = document.createElement('nav');
  bn.id = 'bottom-nav';
  bn.innerHTML = bnPages.map(p => `
    <a href="${p.href}" class="bn-item${active===p.key?' active':''}" ${p.id?`id="${p.id}"`:''}  aria-label="${p.label}">
      <span class="bn-icon">${p.icon}</span>
      <span>${p.label}</span>
    </a>`).join('');
  document.body.appendChild(bn);


  // Close dropdown on outside click
  document.addEventListener('click', e => {
    const wrap = document.querySelector('.nav-user-wrap');
    if (wrap && !wrap.contains(e.target)) document.getElementById('nav-dropdown')?.classList.remove('open');
  });


  // Load unread badges
  try {
    const s = await getSession();
    if (s) {
      const tok = s.access_token;
      Promise.allSettled([
        fetch('/api/messages/unread-count',      { headers: { Authorization: `Bearer ${tok}` } }),
        fetch('/api/notifications/unread-count', { headers: { Authorization: `Bearer ${tok}` } })
      ]).then(([mr, nr]) => {
        if (mr.status==='fulfilled' && mr.value.ok) mr.value.json().then(d => { if(d.count>0){ setBadge('bn-msg',d.count); setBadge('nav-msg-icon',d.count,'dot'); }});
        if (nr.status==='fulfilled' && nr.value.ok) nr.value.json().then(d => { if(d.count>0){ setBadge('bn-notif',d.count); setBadge('nav-notif-icon',d.count,'dot'); }});
      });
    }
  } catch(e) {}
}


function toggleNavDropdown() {
  document.getElementById('nav-dropdown')?.classList.toggle('open');
}


function setBadge(id, count, type='count') {
  const el = document.getElementById(id); if (!el) return;
  el.querySelector('.bn-badge,.nav-badge-dot')?.remove();
  const b = document.createElement('span');
  if (type === 'dot') {
    b.className = 'nav-badge-dot';
  } else {
    b.className = 'bn-badge';
    b.textContent = count > 9 ? '9+' : count;
  }
  el.appendChild(b);
}