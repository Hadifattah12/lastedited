import '../styles/profile.css';
import { resolveAvatar } from '../utils/resolveAvatar';
import { apiFetch }      from '../utils/api';

/* ------------------------------------------------------------------ */
/* helper: safely parse JSON (survives 204 / empty body)              */
/* ------------------------------------------------------------------ */
async function safeJson(res: Response) {
  const txt = await res.text();
  if (!txt) return null;
  try { return JSON.parse(txt); } catch { return null; }
}

/* ------------------------------------------------------------------ */
/* additional types                                                   */
/* ------------------------------------------------------------------ */
interface Friend {
  id: number;
  name: string;
  avatar: string;
  online: boolean;
}

/* ------------------------------------------------------------------ */
/* modal-styling helper (injected once)                               */
/* ------------------------------------------------------------------ */
function injectModalStyles() {
  if (document.getElementById('friend-modal-style')) return;    // already there
  const style = document.createElement('style');
  style.id     = 'friend-modal-style';
  style.textContent = `
    .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:10000;}
    .modal{background:#fff;border-radius:8px;max-width:500px;width:90%;max-height:90vh;overflow:auto;padding:24px 32px;position:relative;box-shadow:0 10px 25px rgba(0,0,0,.25);}  
    .close-btn{position:absolute;top:8px;right:12px;font-size:24px;line-height:1;background:none;border:none;cursor:pointer;}
    .avatar-large{width:120px;height:120px;border-radius:50%;object-fit:cover;display:block;margin:0 auto 12px;}
    .friend-history{margin-top:12px;padding-left:22px;}
    .friend-name{cursor:pointer;text-decoration:underline;}
  `;
  document.head.appendChild(style);
}

/* ------------------------------------------------------------------ */
/* popup: detailed friend profile                                     */
/* ------------------------------------------------------------------ */
async function showFriendProfile(friend: Friend) {
  injectModalStyles();

  /* overlay + modal skeleton */
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay';
  const modal   = document.createElement('div'); modal.className   = 'modal';
  modal.innerHTML = '<p>Loading…</p>';
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  /* close on [×] or overlay-click */
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  try {
    /* fetch match history to compute wins / losses */
    const r   = await apiFetch(`/api/matches/${encodeURIComponent(friend.name)}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    const matches = await safeJson(r) || [];

    let wins = 0, losses = 0;
    matches.forEach((m:any) => {
      if (m.winner === friend.name) wins++;
      else if (m.player1 === friend.name || m.player2 === friend.name) losses++;
    });

    const historyHtml = matches.slice(0, 10).map((m:any) => {
      const opponent = m.player1 === friend.name ? m.player2 : m.player1;
      const win      = m.winner === friend.name;
      return `<li><strong>${new Date(m.date).toLocaleString()}</strong> vs ${opponent} – ${win ? '🏆 Win' : '❌ Loss'} (${m.score1} - ${m.score2})</li>`;
    }).join('');

    modal.innerHTML = `
      <button class="close-btn">×</button>
      <div class="friend-profile">
        <img src="${resolveAvatar(friend.avatar)}" class="avatar-large" alt="avatar of ${friend.name}">
        <h2 style="text-align:center;">${friend.name} ${friend.online ? '🟢' : '🔘'}</h2>
        <p style="text-align:center;">Wins: <strong>${wins}</strong> &nbsp;|&nbsp; Losses: <strong>${losses}</strong></p>
        <h3>Recent Matches</h3>
        <ul class="friend-history">${historyHtml || '<li>No matches yet.</li>'}</ul>
      </div>`;

    modal.querySelector('.close-btn')!.addEventListener('click', () => overlay.remove());
  } catch (e:any) {
    modal.innerHTML = `<p style="color:red;">${e.message || 'Failed to load profile.'}</p>`;
  }
}

/* ------------------------------------------------------------------ */
/* main export                                                        */
/* ------------------------------------------------------------------ */
export async function renderProfile(): Promise<HTMLElement> {
  const stored = localStorage.getItem('user');
  const user   = stored ? JSON.parse(stored) : null;

  const container = document.createElement('div');
  container.className = 'profile-wrapper';
  document.body.className = '';

  /* ---------------------------------------------------------------- */
  /* markup                                                           */
  /* ---------------------------------------------------------------- */
  container.innerHTML = `
    <button class="back-arrow" onclick="location.hash='/home'">⬅ Home</button>

    <div class="profile-container">
      <h1 class="profile-title">👤 My Profile</h1>

      <!-- avatar -->
      <div class="avatar-section">
        <img  id="avatarPreview" class="avatar-img"
              src="${resolveAvatar(user?.avatar)}" alt="Avatar">
        <input type="file" id="avatarInput" accept="image/*">
      </div>

      <!-- editable info -->
      <div class="info-section">
        <h2>📝 Update Info</h2>
        <label>Display Name:</label>
        <input id="nameInput"  type="text"  value="${user?.name  ?? ''}">
        <label>Email:</label>
        <input id="emailInput" type="email" value="${user?.email ?? ''}">
        <label>New Password:</label>
        <input id="passwordInput"        type="password" placeholder="New password">
        <label>Confirm Password:</label>
        <input id="confirmPasswordInput" type="password" placeholder="Confirm password">
        <button id="saveProfileBtn">💾 Save Changes</button>
      </div>

      <!-- 2-FA toggle (rendered immediately) -->
      <div class="twofa-section">
        <h2>🔐 Two-Factor Authentication</h2>
        <p>Secure your account with an e-mail code on login.</p>
        <button id="toggle2FA"
                data-enabled="${user?.is2FAEnabled ? 'true' : 'false'}"
                class="${user?.is2FAEnabled ? 'disable' : 'enable'}">
          ${user?.is2FAEnabled ? '❌ Disable 2FA' : '✅ Enable 2FA'}
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
        <input id="searchInput" type="text" placeholder="Enter name…">
        <button id="searchBtn">Search</button>
        <ul id="searchResults"></ul>
      </div>

      <!-- requests -->
      <div class="pending-section">
        <h3>🕓 Pending Requests (Incoming)</h3>
        <ul id="pendingList"></ul>
      </div>

    </div>`;

  /* ---------------------------------------------------------------- */
  /* avatar preview                                                   */
  /* ---------------------------------------------------------------- */
  const avatarInput   = container.querySelector('#avatarInput')   as HTMLInputElement;
  const avatarPreview = container.querySelector('#avatarPreview') as HTMLImageElement;
  avatarInput.addEventListener('change', () => {
    const f = avatarInput.files?.[0];
    if (f) avatarPreview.src = URL.createObjectURL(f);
  });

  /* ---------------------------------------------------------------- */
  /* save profile                                                     */
  /* ---------------------------------------------------------------- */
  container.querySelector('#saveProfileBtn')!.addEventListener('click', async () => {
    const name  = (container.querySelector('#nameInput')  as HTMLInputElement).value.trim();
    const email = (container.querySelector('#emailInput') as HTMLInputElement).value.trim();
    const pw1   = (container.querySelector('#passwordInput')        as HTMLInputElement).value;
    const pw2   = (container.querySelector('#confirmPasswordInput') as HTMLInputElement).value;
    if (pw1 && pw1 !== pw2) return alert('Passwords do not match');

    const fd = new FormData();
    fd.append('name',  name);
    fd.append('email', email);
    if (pw1)                    fd.append('password', pw1);
    if (avatarInput.files?.[0]) fd.append('avatar', avatarInput.files[0]);

    try {
      const r = await apiFetch('/api/profile', {
        method : 'PATCH',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body   : fd
      });
      const j = await safeJson(r);
      if (!r.ok) throw new Error(j?.error || r.statusText);
      localStorage.setItem('user', JSON.stringify(j.user));
      alert('Profile updated!'); location.reload();
    } catch (e:any) { alert(e.message || 'Update failed'); }
  });

  /* ---------------------------------------------------------------- */
  /* 2-FA toggle                                                      */
  /* ---------------------------------------------------------------- */
  const toggleBtn = container.querySelector('#toggle2FA') as HTMLButtonElement;

  toggleBtn.addEventListener('click', async () => {
    const enabled = toggleBtn.dataset.enabled === 'true';
    if (!confirm(enabled ? 'Disable 2FA?' : 'Enable 2FA?')) return;

    try {
      const r = await apiFetch('/api/profile/2fa', {
        method : 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization : `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ enable2FA: !enabled })
      });
      const j = await safeJson(r);
      if (!r.ok) throw new Error(j?.error || r.statusText);
      alert(j?.message || '2FA updated');

      toggleBtn.dataset.enabled = (!enabled).toString();
      toggleBtn.textContent     = !enabled ? '❌ Disable 2FA' : '✅ Enable 2FA';
      toggleBtn.classList.toggle('enable',  !enabled);
      toggleBtn.classList.toggle('disable',  enabled);
    } catch { alert('Server error updating 2FA'); }
  });

  /* background sanity-check (keep button honest) */
  (async () => {
    try {
      const r = await apiFetch('/api/profile', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const j = await safeJson(r);
      const sEnabled = !!j?.user?.is2FAEnabled;
      toggleBtn.dataset.enabled = sEnabled.toString();
      toggleBtn.textContent     = sEnabled ? '❌ Disable 2FA' : '✅ Enable 2FA';
      toggleBtn.classList.toggle('enable',  !sEnabled);
      toggleBtn.classList.toggle('disable',  sEnabled);
    } catch {/* ignore */ }
  })();

  /* ---------------------------------------------------------------- */
  /* friends list                                                     */
  /* ---------------------------------------------------------------- */
  async function loadFriends() {
    try {
      const r   = await apiFetch('/api/friends', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const arr = await safeJson(r) || [];
      const list = container.querySelector('#friendList')!;
      list.innerHTML = '';

      arr.forEach((fr:any) => {
        const li = document.createElement('li');
        li.innerHTML = `
          <img src="${resolveAvatar(fr.avatar)}" class="avatar-mini">
          <span class="friend-name">${fr.name}</span>
          <span class="online-indicator">${fr.online ? '🟢' : '🔘'}</span>
          <button class="remove-friend-btn" data-id="${fr.id}">❌ Remove</button>`;
        list.appendChild(li);

        /* click-to-view popup */
        const nameSpan = li.querySelector('.friend-name') as HTMLElement;
        nameSpan.style.cursor = 'pointer';
        nameSpan.addEventListener('click', () => showFriendProfile(fr as Friend));
      });

      /* remove buttons */
      list.querySelectorAll('.remove-friend-btn').forEach(btn => {
        btn.addEventListener('click', async (ev) => {
          ev.stopPropagation();                      //   ← stops popup
          const id   = (btn as HTMLButtonElement).dataset.id;
          const name = (btn.parentElement!.querySelector('.friend-name') as HTMLElement).textContent;
          if (!confirm(`Remove ${name}?`)) return;

          try {
            const r = await apiFetch(`/api/friends/${id}`, {
              method : 'DELETE',
              headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            const j = await safeJson(r);
            if (!r.ok) throw new Error(j?.error || r.statusText);
            alert(j?.message || 'Friend removed');
            loadFriends(); loadSentRequests();
          } catch { alert('Failed to remove friend'); }
        });
      });
    } catch (err) { console.error('loadFriends', err); }
  }

  /* incoming (pending) requests */
  async function loadPendingRequests() {
    try {
      const r   = await apiFetch('/api/friends/requests', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const arr = await safeJson(r) || [];
      const list = container.querySelector('#pendingList')!;
      list.innerHTML = '';

      arr.forEach((rq:any) => {
        const li = document.createElement('li');
        li.innerHTML = `
          <img src="${resolveAvatar(rq.avatar)}" class="avatar-mini">
          <span class="friend-name">${rq.name}</span>
          <span class="request-text">wants to be friends</span>
          <button class="approve-btn" data-id="${rq.id}">✅</button>
          <button class="reject-btn"  data-id="${rq.id}">❌</button>`;
        list.appendChild(li);
      });

      list.querySelectorAll('.approve-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = (btn as HTMLButtonElement).dataset.id;
          try {
            const r = await apiFetch(`/api/friends/approve/${id}`, {
              method : 'PATCH',
              headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            const j = await safeJson(r);
            alert(j?.message || 'Friend approved');
            loadPendingRequests(); loadFriends(); loadSentRequests();
          } catch { alert('Failed to approve'); }
        });
      });

      list.querySelectorAll('.reject-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = (btn as HTMLButtonElement).dataset.id;
          try {
            const r = await apiFetch(`/api/friends/reject/${id}`, {
              method : 'PATCH',
              headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            const j = await safeJson(r);
            alert(j?.message || 'Friend rejected');
            loadPendingRequests();
          } catch { alert('Failed to reject'); }
        });
      });
    } catch (err) { console.error('loadPending', err); }
  }

  /* outgoing (sent) requests */
  async function loadSentRequests() {
    try {
      const r   = await apiFetch('/api/friends/requests/sent', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const arr = await safeJson(r) || [];
      const list = container.querySelector('#sentList')!;
      list.innerHTML = '';

      arr.forEach((rq:any) => {
        const li = document.createElement('li');
        li.innerHTML = `
          <img src="${resolveAvatar(rq.avatar)}" class="avatar-mini">
          <span class="friend-name">${rq.name}</span>
          <span class="request-text">⏳ awaiting approval</span>`;
        list.appendChild(li);
      });
    } catch (err) { console.error('loadSent', err); }
  }

  /* match history */
  async function loadMatchHistory() {
    try {
      const r   = await apiFetch(`/api/matches/${encodeURIComponent(user.name)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const arr = await safeJson(r) || [];
      const list = container.querySelector('#matchHistoryList') as HTMLUListElement;
      list.innerHTML = arr.length ? '' : '<li>No match history yet.</li>';

      arr.forEach((m:any) => {
        const win      = m.winner === user.name;
        const opponent = m.player1 === user.name ? m.player2 : m.player1;
        const li       = document.createElement('li');
        li.className   = 'match-item';
        li.innerHTML   = `
          <strong>${new Date(m.date).toLocaleString()}</strong>
          vs <span class="opponent">${opponent}</span> –
          <span class="${win ? 'win' : 'loss'}">${win ? '🏆 Win' : '❌ Loss'}</span>
          (${m.score1} - ${m.score2})`;
        list.appendChild(li);
      });
    } catch (err) { console.error('loadHistory', err); }
  }

  /* stats */
  async function calcStats() {
    try {
      const r   = await apiFetch(`/api/matches/${encodeURIComponent(user.name)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const arr = await safeJson(r) || [];
      let wins = 0, losses = 0;
      arr.forEach((m:any) => {
        if (m.winner === user.name) wins++;
        else if (m.player1 === user.name || m.player2 === user.name) losses++;
      });
      (document.getElementById('wins')   as HTMLElement).textContent = wins.toString();
      (document.getElementById('losses') as HTMLElement).textContent = losses.toString();
    } catch (err) { console.error('calcStats', err); }
  }

  /* ---------------------------------------------------------------- */
  /* friend search + add                                              */
  /* ---------------------------------------------------------------- */
  const searchBtn   = container.querySelector('#searchBtn')   as HTMLButtonElement;
  const searchInput = container.querySelector('#searchInput') as HTMLInputElement;
  const resultList  = container.querySelector('#searchResults') as HTMLUListElement;

  searchBtn.addEventListener('click', async () => {
    const query = searchInput.value.trim();
    if (!query) return;

    try {
      const r   = await apiFetch(`/api/friends/search?name=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const arr = await safeJson(r) || [];
      resultList.innerHTML = '';

      arr.forEach((u:any) => {
        const li = document.createElement('li');
        let badge = '';

        switch (u.friendship_status) {
          case 'friends':
            badge = `<span class="status-badge friends">✅ Friends</span>`; break;
          case 'pending_sent':
            badge = `<span class="status-badge pending">⏳ Request Sent</span>`; break;
          case 'pending_received':
            badge = `<span class="status-badge pending">📩 Pending Response</span>`; break;
          default:
            badge = `<button class="add-friend-btn" data-id="${u.id}">Add Friend</button>`;
        }

        li.innerHTML = `
          <img src="${resolveAvatar(u.avatar)}" class="avatar-mini">
          <span class="friend-name">${u.name}</span>
          ${badge}`;
        resultList.appendChild(li);
      });

      /* add-friend buttons */
      resultList.querySelectorAll('.add-friend-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = (btn as HTMLButtonElement).dataset.id;
          try {
            const r = await apiFetch(`/api/friends/${id}`, {
              method : 'POST',
              headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            const j = await safeJson(r);
            if (!r.ok) throw new Error(j?.error || r.statusText);
            alert(j?.message || 'Request sent!');
            searchBtn.click();           // refresh badges
            loadSentRequests();
          } catch { alert('Failed to send request'); }
        });
      });
    } catch (err) { console.error('search', err); }
  });
  searchInput.addEventListener('keypress', e => { if (e.key === 'Enter') searchBtn.click(); });

  /* ---------------------------------------------------------------- */
  /* initial data loads                                               */
  /* ---------------------------------------------------------------- */
  await Promise.all([
    loadFriends(),
    loadPendingRequests(),
    loadSentRequests(),
    loadMatchHistory()
  ]);
  setTimeout(calcStats, 0);

  return container;
}
