// src/pages/profile.ts
import '../styles/profile.css';
import { resolveAvatar } from '../utils/resolveAvatar';
import { apiFetch }      from '../utils/api';

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */
async function safeJson(res: Response) {
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

function redirectToLogin() {
  alert('Session expired — please log in again.');
  localStorage.removeItem('user');
  location.hash = '#/login';
  throw new Error('401 unauthorised');
}

/* ------------------------------------------------------------------ */
/* types                                                              */
/* ------------------------------------------------------------------ */
interface Friend { id:number; name:string; avatar:string; online:boolean; }

/* ------------------------------------------------------------------ */
/* modal-style injector                                               */
/* ------------------------------------------------------------------ */
function injectModalStyles() {
  if (document.getElementById('friend-modal-style')) return;
  const style = document.createElement('style');
  style.id = 'friend-modal-style';
  style.textContent = `
    .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);
      display:flex;align-items:center;justify-content:center;z-index:10000;}
    .modal{background:#fff;border-radius:8px;max-width:500px;width:90%;
      max-height:90vh;overflow:auto;padding:24px 32px;position:relative;
      box-shadow:0 10px 25px rgba(0,0,0,.25);}
    .close-btn{position:absolute;top:8px;right:12px;font-size:24px;
      background:none;border:none;cursor:pointer;}
    .avatar-large{width:120px;height:120px;border-radius:50%;object-fit:cover;
      display:block;margin:0 auto 12px;}
    .friend-name{cursor:pointer;text-decoration:underline;}
  `;
  document.head.appendChild(style);
}

/* ------------------------------------------------------------------ */
/* friend-profile popup                                               */
/* ------------------------------------------------------------------ */
async function showFriendProfile(friend: Friend) {
  injectModalStyles();
  const overlay = Object.assign(document.createElement('div'),
                   { className: 'modal-overlay' });
  const modal   = Object.assign(document.createElement('div'),
                   { className: 'modal', innerHTML: '<p>Loading…</p>' });
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  try {
    const r = await apiFetch(`/api/matches/${encodeURIComponent(friend.name)}`);
    if (r.status === 401) return redirectToLogin();
    const matches: any[] = (await safeJson(r)) || [];

    let wins = 0, losses = 0;
    matches.forEach(m => {
      if (m.winner === friend.name) wins++;
      else if (m.player1 === friend.name || m.player2 === friend.name) losses++;
    });

    const historyHtml = matches.slice(0, 10).map(m => {
      const opponent = m.player1 === friend.name ? m.player2 : m.player1;
      const win      = m.winner === friend.name;
      return `<li><strong>${new Date(m.date).toLocaleString()}</strong> vs
              ${opponent} – ${win ? '🏆 Win' : '❌ Loss'} (${m.score1}-${m.score2})</li>`;
    }).join('');

    modal.innerHTML = `
      <button class="close-btn">×</button>
      <div class="friend-profile">
        <img src="${resolveAvatar(friend.avatar)}" class="avatar-large">
        <h2 style="text-align:center;">${friend.name} ${friend.online ? '🟢' : '🔘'}</h2>
        <p style="text-align:center;">Wins <strong>${wins}</strong> |
           Losses <strong>${losses}</strong></p>
        <h3>Recent Matches</h3>
        <ul class="friend-history">${historyHtml || '<li>No matches yet.</li>'}</ul>
      </div>`;
    modal.querySelector('.close-btn')!.addEventListener('click', () => overlay.remove());
  } catch {
    modal.innerHTML = `<p style="color:red;">Failed to load profile.</p>`;
  }
}

/* ------------------------------------------------------------------ */
/* main component                                                     */
/* ------------------------------------------------------------------ */
export async function renderProfile(): Promise<HTMLElement> {
  const raw = localStorage.getItem('user');
  if (!raw) redirectToLogin();
  const user = JSON.parse(raw!);

  const container = document.createElement('div');
  container.className = 'profile-wrapper';
  document.body.className = '';

  /* ---------- markup ---------- */
  container.innerHTML = `
    <button class="back-arrow" onclick="location.hash='#/home'">⬅ Home</button>

    <div class="profile-container">
      <h1 class="profile-title">👤 My Profile</h1>

      <!-- avatar -->
      <div class="avatar-section">
        <img id="avatarPreview" class="avatar-img" src="${resolveAvatar(user.avatar)}" alt="avatar">
        <input type="file" id="avatarInput" accept="image/*">
      </div>

      <!-- editable info -->
      <div class="info-section">
        <h2>📝 Update Info</h2>
        <label>Display Name:</label>
        <input id="nameInput"  type="text"  value="${user.name}">
        <label>Email:</label>
        <input id="emailInput" type="email" value="${user.email}">
        <label>New Password:</label>
        <input id="passwordInput"        type="password" placeholder="New password">
        <label>Confirm Password:</label>
        <input id="confirmPasswordInput" type="password" placeholder="Confirm password">
        <button id="saveProfileBtn">💾 Save Changes</button>
      </div>

      <!-- 2-FA -->
      <div class="twofa-section">
        <h2>🔐 Two-Factor Authentication</h2>
        <p>Secure your account with an e-mail code on login.</p>
        <button id="toggle2FA"
                data-enabled="${user.is2FAEnabled}"
                class="${user.is2FAEnabled ? 'disable' : 'enable'}">
          ${user.is2FAEnabled ? '❌ Disable 2FA' : '✅ Enable 2FA'}
        </button>
      </div>

      <!-- stats -->
      <div class="stats-section">
        <h3>🏆 Stats</h3>
        <p>Wins:   <span id="wins">--</span></p>
        <p>Losses: <span id="losses">--</span></p>
      </div>

      <!-- history -->
      <div class="match-history-section">
        <h3>📜 Match History</h3>
        <ul id="matchHistoryList"></ul>
      </div>

      <!-- friends -->
      <div class="friend-section">
        <h3>👥 Friends</h3>
        <ul id="friendList"></ul>
      </div>

      <!-- add friend -->
      <div class="add-friend-section">
        <h3>➕ Add Friend</h3>
        <input id="searchInput" placeholder="Enter name…">
        <button id="searchBtn">Search</button>
        <ul id="searchResults"></ul>
      </div>

      <!-- incoming requests -->
      <div class="pending-section">
        <h3>🕓 Pending Requests</h3>
        <ul id="pendingList"></ul>
      </div>
    </div>`;

  /* ---------- avatar preview ---------- */
  const avatarInput = container.querySelector('#avatarInput') as HTMLInputElement;
  const avatarPreview = container.querySelector('#avatarPreview') as HTMLImageElement;
  avatarInput.addEventListener('change', () => {
    const f = avatarInput.files?.[0];
    if (f) avatarPreview.src = URL.createObjectURL(f);
  });

  /* ---------- save profile ---------- */
  container.querySelector('#saveProfileBtn')!.addEventListener('click', async () => {
    const name  = (container.querySelector('#nameInput')  as HTMLInputElement).value.trim();
    const email = (container.querySelector('#emailInput') as HTMLInputElement).value.trim();
    const pw1   = (container.querySelector('#passwordInput')        as HTMLInputElement).value;
    const pw2   = (container.querySelector('#confirmPasswordInput') as HTMLInputElement).value;
    if (pw1 && pw1 !== pw2) return alert('Passwords do not match');

    const fd = new FormData();
    fd.append('name', name); fd.append('email', email);
    if (pw1) fd.append('password', pw1);
    if (avatarInput.files?.[0]) fd.append('avatar', avatarInput.files[0]);

    const r = await apiFetch('/api/profile', { method:'PATCH', body:fd });
    if (r.status === 401) return redirectToLogin();
    const j = await safeJson(r);
    if (!r.ok) return alert(j?.error || 'Update failed');

    localStorage.setItem('user', JSON.stringify(j.user));   // persist changes
    alert('Profile updated!'); location.reload();
  });

  /* ---------- 2-FA toggle ---------- */
  const toggleBtn = container.querySelector('#toggle2FA') as HTMLButtonElement;

  toggleBtn.addEventListener('click', async () => {
    const enabledNow = toggleBtn.dataset.enabled === 'true';
    if (!confirm(enabledNow ? 'Disable 2FA?' : 'Enable 2FA?')) return;

    const r = await apiFetch('/api/profile/2fa', {
      method : 'PATCH',
      headers: { 'Content-Type':'application/json' },
      body   : JSON.stringify({ enable2FA: !enabledNow })
    });
    if (r.status === 401) return redirectToLogin();
    const j = await safeJson(r);
    if (!r.ok) return alert(j?.error || 'Error toggling 2FA');

    /* ---- persist new 2FA state locally ---- */
    const stored = JSON.parse(localStorage.getItem('user') || '{}');
    stored.is2FAEnabled = !enabledNow;
    localStorage.setItem('user', JSON.stringify(stored));

    /* ---- immediate UI update ---- */
    const enabledNew = !enabledNow;
    toggleBtn.dataset.enabled = String(enabledNew);
    toggleBtn.textContent     = enabledNew ? '❌ Disable 2FA' : '✅ Enable 2FA';
    toggleBtn.classList.remove('enable','disable');
    toggleBtn.classList.add(enabledNew ? 'disable' : 'enable');
  });

  /* ---------- loaders (friends / requests / matches / stats) -------- */
  async function loadFriends() {
    const r = await apiFetch('/api/friends');
    if (r.status === 401) return redirectToLogin();
    const arr: any[] = (await safeJson(r)) || [];
    if (!Array.isArray(arr)) return;

    const list = container.querySelector('#friendList')!;
    list.innerHTML = '';
    arr.forEach(fr => {
      const li = document.createElement('li');
      li.innerHTML = `
        <img src="${resolveAvatar(fr.avatar)}" class="avatar-mini">
        <span class="friend-name">${fr.name}</span>
        <span class="online-indicator">${fr.online ? '🟢' : '🔘'}</span>
        <button class="remove-friend-btn" data-id="${fr.id}">❌ Remove</button>`;
      list.appendChild(li);

      li.querySelector('.friend-name')!
        .addEventListener('click', () => showFriendProfile(fr as Friend));

      li.querySelector('.remove-friend-btn')!
        .addEventListener('click', async ev => {
          ev.stopPropagation();
          if (!confirm(`Remove ${fr.name}?`)) return;
          const r2 = await apiFetch(`/api/friends/${fr.id}`, { method:'DELETE' });
          if (r2.status === 401) return redirectToLogin();
          loadFriends(); loadPendingRequests();
        });
    });
  }

  async function loadPendingRequests() {
    const r = await apiFetch('/api/friends/requests');
    if (r.status === 401) return redirectToLogin();
    const arr: any[] = (await safeJson(r)) || [];
    if (!Array.isArray(arr)) return;

    const list = container.querySelector('#pendingList')!;
    list.innerHTML = '';
    arr.forEach(rq => {
      const li = document.createElement('li');
      li.innerHTML = `
        <img src="${resolveAvatar(rq.avatar)}" class="avatar-mini">
        <span class="friend-name">${rq.name}</span>
        <button class="approve-btn" data-id="${rq.id}">✅</button>
        <button class="reject-btn"  data-id="${rq.id}">❌</button>`;
      list.appendChild(li);

      li.querySelector('.approve-btn')!
        .addEventListener('click', async () => {
          const r2 = await apiFetch(`/api/friends/approve/${rq.id}`, { method:'PATCH' });
          if (r2.status === 401) return redirectToLogin();
          loadPendingRequests(); loadFriends();
        });

      li.querySelector('.reject-btn')!
        .addEventListener('click', async () => {
          const r2 = await apiFetch(`/api/friends/reject/${rq.id}`, { method:'PATCH' });
          if (r2.status === 401) return redirectToLogin();
          loadPendingRequests();
        });
    });
  }

  async function loadMatchHistory() {
    const r = await apiFetch(`/api/matches/${encodeURIComponent(user.name)}`);
    if (r.status === 401) return redirectToLogin();
    const arr: any[] = (await safeJson(r)) || [];
    if (!Array.isArray(arr)) return;

    const list = container.querySelector('#matchHistoryList')!;
    list.innerHTML = arr.length ? '' : '<li>No match history yet.</li>';
    arr.forEach(m => {
      const win      = m.winner === user.name;
      const opponent = m.player1 === user.name ? m.player2 : m.player1;
      const li = document.createElement('li');
      li.className = win ? 'match-item win' : 'match-item loss';
      li.innerHTML = `<strong>${new Date(m.date).toLocaleString()}</strong> vs
        ${opponent} – ${win ? '🏆 Win' : '❌ Loss'}
        (${m.score1}-${m.score2})`;
      list.appendChild(li);
    });
  }

  async function calcStats() {
    const r = await apiFetch(`/api/matches/${encodeURIComponent(user.name)}`);
    if (r.status === 401) return redirectToLogin();
    const arr: any[] = (await safeJson(r)) || [];
    if (!Array.isArray(arr)) return;

    let wins = 0, losses = 0;
    arr.forEach(m => {
      if (m.winner === user.name) wins++;
      else if (m.player1 === user.name || m.player2 === user.name) losses++;
    });
    (container.querySelector('#wins')!   as HTMLElement).textContent = String(wins);
    (container.querySelector('#losses')! as HTMLElement).textContent = String(losses);
  }

  /* ---------- friend search ---------- */
  const searchBtn   = container.querySelector('#searchBtn')   as HTMLButtonElement;
  const searchInput = container.querySelector('#searchInput') as HTMLInputElement;
  const resultList  = container.querySelector('#searchResults') as HTMLUListElement;

  searchBtn.addEventListener('click', async () => {
    const q = searchInput.value.trim();
    if (!q) return;
    const r = await apiFetch(`/api/friends/search?name=${encodeURIComponent(q)}`);
    if (r.status === 401) return redirectToLogin();
    const arr: any[] = (await safeJson(r)) || [];
    if (!Array.isArray(arr)) return;

    resultList.innerHTML = '';
    arr.forEach(u => {
      const li = document.createElement('li');
      let badge = '';
      switch (u.friendship_status) {
        case 'friends':          badge = '<span class="status-badge friends">✅ Friends</span>'; break;
        case 'pending_sent':     badge = '<span class="status-badge pending">⏳ Request Sent</span>'; break;
        case 'pending_received': badge = '<span class="status-badge pending">📩 Pending Response</span>'; break;
        default:
          badge = `<button class="add-friend-btn" data-id="${u.id}">Add Friend</button>`;
      }
      li.innerHTML = `<img src="${resolveAvatar(u.avatar)}" class="avatar-mini">
                      <span class="friend-name">${u.name}</span> ${badge}`;
      resultList.appendChild(li);

      li.querySelector('.add-friend-btn')?.addEventListener('click', async () => {
        const r2 = await apiFetch(`/api/friends/${u.id}`, { method:'POST' });
        if (r2.status === 401) return redirectToLogin();
        searchBtn.click(); loadPendingRequests();
      });
    });
  });
  searchInput.addEventListener('keypress', e => { if (e.key==='Enter') searchBtn.click(); });

  /* ---------- initial parallel loads ---------- */
  await Promise.all([
    loadFriends(),
    loadPendingRequests(),
    loadMatchHistory()
  ]);
  setTimeout(calcStats, 0);

  return container;
}
