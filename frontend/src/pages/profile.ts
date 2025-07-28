// src/pages/profile.ts
import '../styles/profile.css';
import { resolveAvatar } from '../utils/resolveAvatar';
import { apiFetch } from '../utils/api';
import i18next from 'i18next';

// Import Chart.js - you'll need to install this
import {
  Chart,
  registerables,
  type ChartData,
  type ChartOptions
} from 'chart.js';

// Register Chart.js components
Chart.register(...registerables);

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */
async function safeJson(res: Response) {
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

/* Toast helper */
let toastTimer: number | null = null;
function showToast(
  message: string,
  type: 'error' | 'success' | 'info' = 'info',
  duration = 3000
) {
  const el = document.getElementById('toast');
  if (!el) {
    console.warn('Toast container missing');
    return;
  }
  el.textContent = message;
  el.className = `toast toast--visible toast--${type}`;
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  toastTimer = window.setTimeout(() => {
    el.classList.remove('toast--visible');
  }, duration);
}

function redirectToLogin() {
  showToast('Session expired — please log in again.', 'error', 3500);
  localStorage.removeItem('user');
  setTimeout(() => {
    location.hash = '#/login';
  }, 500);
  throw new Error('401 unauthorised');
}

/* ------------------------------------------------------------------ */
/* types                                                              */
/* ------------------------------------------------------------------ */
interface Friend {
  id: number;
  name: string;
  avatar: string;
  online: boolean;
}

interface MatchStats {
  wins: number;
  losses: number;
  totalMatches: number;
  winRate: number;
  recentForm: ('W' | 'L')[];
}

/* ------------------------------------------------------------------ */
/* Chart creation functions                                           */
/* ------------------------------------------------------------------ */
function createWinLossChart(canvas: HTMLCanvasElement, stats: MatchStats) {
  const data: ChartData<'doughnut'> = {
    labels: ['Wins', 'Losses'],
    datasets: [{
      data: [stats.wins, stats.losses],
      backgroundColor: [
        '#10B981', // Green for wins
        '#EF4444'  // Red for losses
      ],
      borderColor: [
        '#059669',
        '#DC2626'
      ],
      borderWidth: 2,
      hoverOffset: 10
    }]
  };

  const options: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          padding: 20,
          font: {
            size: 14,
            weight: 'bold'
          }
        }
      },
      tooltip: {
        callbacks: {
          label: function(context  ) {
            const label = context.label || '';
            const value = context.parsed;
            const percentage = stats.totalMatches > 0 
              ? ((value / stats.totalMatches) * 100).toFixed(1)
              : '0';
            return `${label}: ${value} (${percentage}%)`;
          }
        }
      }
    },
    cutout: '60%'
  };

  return new Chart(canvas, {
    type: 'doughnut',
    data: data,
    options: options
  });
}



/* ------------------------------------------------------------------ */
/* friend-profile popup                                               */
/* ------------------------------------------------------------------ */
function closeExistingFriendModal() {
  const existing = document.querySelector('.modal-overlay');
  if (existing) {
    existing.remove();
    document.body.classList.remove('modal-open');
  }
}

async function showFriendProfile(friend: Friend) {
  // Clean any existing modal first (prevents layout stacking issues)
  closeExistingFriendModal();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = '<p>Loading…</p>';

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  document.body.classList.add('modal-open');

  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      cleanupModal();
    }
  };

  function cleanupModal() {
    document.removeEventListener('keydown', escHandler);
    if (overlay.parentNode) {
      overlay.remove();
    }
    document.body.classList.remove('modal-open');
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      cleanupModal();
    }
  });

  try {
    const r = await apiFetch(`/api/matches/${encodeURIComponent(friend.name)}`);
    if (r.status === 401) return redirectToLogin();
    const matches: any[] = (await safeJson(r)) || [];

    let wins = 0;
    let losses = 0;
    matches.forEach((m) => {
      if (m.winner === friend.name) wins++;
      else if (m.player1 === friend.name || m.player2 === friend.name) losses++;
    });

    const historyHtml = matches
      .slice(0, 10)
      .map((m) => {
        const opponent = m.player1 === friend.name ? m.player2 : m.player1;
        const win = m.winner === friend.name;
        return `<li><strong>${new Date(m.date).toLocaleString()}</strong> vs
                ${opponent} – ${win ? '🏆 Win' : '❌ Loss'} (${m.score1}-${m.score2})</li>`;
      })
      .join('');

    modal.innerHTML = `
      <button class="close-btn" aria-label="Close">×</button>
      <div class="friend-profile">
        <img src="${resolveAvatar(friend.avatar)}" class="avatar-large" alt="avatar">
        <h2 class="friend-heading">${friend.name} ${friend.online ? '🟢' : '🔘'}</h2>
        <p class="friend-stats">Wins <strong>${wins}</strong> | Losses <strong>${losses}</strong></p>
        <h3 class="history-title">Recent Matches</h3>
        <ul class="friend-history">${historyHtml || '<li>No matches yet.</li>'}</ul>
      </div>
    `;

    modal.querySelector('.close-btn')!.addEventListener('click', cleanupModal);
    document.addEventListener('keydown', escHandler);
  } catch (err) {
    console.error(err);
    modal.innerHTML = `
      <button class="close-btn" aria-label="Close">×</button>
      <p class="error-text">Failed to load profile.</p>`;
    modal.querySelector('.close-btn')!.addEventListener('click', () => {
      closeExistingFriendModal();
    });
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

  container.innerHTML = `
    <button class="back-arrow" onclick="location.hash='#/home'">⬅ ${i18next.t('home')}</button>

    <div class="profile-container">
      <h1 class="profile-title">👤 ${i18next.t('myProfile')}</h1>

      <!-- avatar -->
      <div class="avatar-section">
        <img id="avatarPreview" class="avatar-img" src="${resolveAvatar(user.avatar)}" alt="avatar">
        <input type="file" id="avatarInput" accept="image/*">
      </div>

      <!-- editable info -->
      <div class="info-section">
        <h2>📝 ${i18next.t('updateInfo')}</h2>
        <label>${i18next.t('displayName')}</label>
        <input id="nameInput"  type="text"  value="${user.name}">
        <label>${i18next.t('email')}</label>
        <input id="emailInput" type="email" value="${user.email}">
        <label>${i18next.t('newPassword')}</label>
        <input id="passwordInput"        type="password" placeholder="${i18next.t('newPassword')}">
        <label>${i18next.t('confirmPassword')}</label>
        <input id="confirmPasswordInput" type="password" placeholder="${i18next.t('confirmPassword')}">
        <button id="saveProfileBtn">💾 ${i18next.t('saveChanges')}</button>
      </div>

      <!-- 2-FA -->
      <div class="twofa-section">
        <h2>🔐 ${i18next.t('twoFA')}</h2>
        <p>${i18next.t('twoFADesc')}</p>
        <button id="toggle2FA"
                data-enabled="${user.is2FAEnabled}"
                class="${user.is2FAEnabled ? 'disable' : 'enable'}">
          ${user.is2FAEnabled ? '❌ '+i18next.t('disable2FA') : '✅ '+i18next.t('enable2FA')}
        </button>
      </div>

      <!-- stats with charts -->
      <div class="stats-section">
        <h3>🏆 ${i18next.t('stats')}</h3>
        <div class="stats-grid">
          <div class="stat-card">
            <h4>Win/Loss Ratio</h4>
            <div class="chart-container">
              <canvas id="winLossChart"></canvas>
            </div>
            <div class="stat-summary">
              <div class="stat-item">
                <span class="stat-label">Total Matches:</span>
                <span id="totalMatches" class="stat-value">--</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Win Rate:</span>
                <span id="winRate" class="stat-value">--</span>
              </div>
            </div>
          </div>
          
          <div class="stat-card">
            
            <div class="form-legend">
              
            </div>
          </div>
        </div>
      </div>

      <!-- history -->
      <div class="match-history-section">
        <h3>📜 ${i18next.t('matchHistory')}</h3>
        <ul id="matchHistoryList"></ul>
      </div>

      <!-- friends -->
      <div class="friend-section">
        <h3>👥 ${i18next.t('friends')}</h3>
        <ul id="friendList"></ul>
      </div>

      <!-- add friend -->
      <div class="add-friend-section">
        <h3>➕ ${i18next.t('addFriend')}</h3>
        <input id="searchInput" placeholder="${i18next.t('enterName')}">
        <button id="searchBtn">${i18next.t('search')}</button>
        <ul id="searchResults"></ul>
      </div>

      <!-- incoming requests -->
      <div class="pending-section">
        <h3>🕓 ${i18next.t('pendingRequests')}</h3>
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
    const name = (container.querySelector('#nameInput') as HTMLInputElement).value.trim();
    const email = (container.querySelector('#emailInput') as HTMLInputElement).value.trim();
    const pw1 = (container.querySelector('#passwordInput') as HTMLInputElement).value;
    const pw2 = (container.querySelector('#confirmPasswordInput') as HTMLInputElement).value;
    if (pw1 && pw1 !== pw2) {
      showToast('Passwords do not match', 'error');
      return;
    }

    const fd = new FormData();
    fd.append('name', name);
    fd.append('email', email);
    if (pw1) fd.append('password', pw1);
    if (avatarInput.files?.[0]) fd.append('avatar', avatarInput.files[0]);

    const r = await apiFetch('/api/profile', { method: 'PATCH', body: fd });
    if (r.status === 401) return redirectToLogin();
    const j = await safeJson(r);
    if (!r.ok) {
      showToast(j?.error || 'Update failed', 'error');
      return;
    }

    localStorage.setItem('user', JSON.stringify(j.user));
    showToast('Profile updated!', 'success', 2500);
    setTimeout(() => location.reload(), 600);
  });

  /* ---------- 2-FA toggle ---------- */
  const toggleBtn = container.querySelector('#toggle2FA') as HTMLButtonElement;
  toggleBtn.addEventListener('click', async () => {
    const enabledNow = toggleBtn.dataset.enabled === 'true';

    const r = await apiFetch('/api/profile/2fa', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enable2FA: !enabledNow })
    });
    if (r.status === 401) return redirectToLogin();
    const j = await safeJson(r);
    if (!r.ok) {
      showToast(j?.error || 'Error toggling 2FA', 'error');
      return;
    }

    const stored = JSON.parse(localStorage.getItem('user') || '{}');
    stored.is2FAEnabled = !enabledNow;
    localStorage.setItem('user', JSON.stringify(stored));

    const enabledNew = !enabledNow;
    toggleBtn.dataset.enabled = String(enabledNew);
    toggleBtn.textContent = enabledNew ? '❌ Disable 2FA' : '✅ Enable 2FA';
    toggleBtn.classList.remove('enable', 'disable');
    toggleBtn.classList.add(enabledNew ? 'disable' : 'enable');
    showToast(enabledNew ? '2FA enabled' : '2FA disabled', 'info');
  });

  /* ---------- loaders ---------- */
  async function loadFriends() {
    const r = await apiFetch('/api/friends');
    if (r.status === 401) return redirectToLogin();
    const arr: any[] = (await safeJson(r)) || [];
    if (!Array.isArray(arr)) return;

    const list = container.querySelector('#friendList')!;
    list.innerHTML = '';
    arr.forEach((fr) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <img src="${resolveAvatar(fr.avatar)}" class="avatar-mini" alt="">
        <span class="friend-name">${fr.name}</span>
        <span class="online-indicator">${fr.online ? '🟢' : '🔘'}</span>
        <button class="remove-friend-btn" data-id="${fr.id}">❌ Remove</button>
      `;
      list.appendChild(li);

      li.querySelector('.friend-name')!
        .addEventListener('click', () => showFriendProfile(fr as Friend));

      li.querySelector('.remove-friend-btn')!
        .addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const r2 = await apiFetch(`/api/friends/${fr.id}`, { method: 'DELETE' });
          if (r2.status === 401) return redirectToLogin();
          loadFriends();
          loadPendingRequests();
          showToast('Friend removed', 'info', 1800);
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
    arr.forEach((rq) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <img src="${resolveAvatar(rq.avatar)}" class="avatar-mini" alt="">
        <span class="friend-name">${rq.name}</span>
        <button class="approve-btn" data-id="${rq.id}">✅</button>
        <button class="reject-btn"  data-id="${rq.id}">❌</button>
      `;
      list.appendChild(li);

      li.querySelector('.approve-btn')!
        .addEventListener('click', async () => {
          const r2 = await apiFetch(`/api/friends/approve/${rq.id}`, { method: 'PATCH' });
          if (r2.status === 401) return redirectToLogin();
          loadPendingRequests();
          loadFriends();
          showToast('Friend request approved', 'success', 1800);
        });

      li.querySelector('.reject-btn')!
        .addEventListener('click', async () => {
          const r2 = await apiFetch(`/api/friends/reject/${rq.id}`, { method: 'PATCH' });
          if (r2.status === 401) return redirectToLogin();
          loadPendingRequests();
          showToast('Request rejected', 'info', 1600);
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
    arr.forEach((m) => {
      const win = m.winner === user.name;
      const opponent = m.player1 === user.name ? m.player2 : m.player1;
      const li = document.createElement('li');
      li.className = win ? 'match-item win' : 'match-item loss';
      li.innerHTML = `<strong>${new Date(m.date).toLocaleString()}</strong> vs
        ${opponent} – ${win ? '🏆 Win' : '❌ Loss'}
        (${m.score1}-${m.score2})`;
      list.appendChild(li);
    });
  }

  // Store chart instances to clean them up when needed
  let winLossChart: Chart | null = null;


  async function calcStats() {
    const r = await apiFetch(`/api/matches/${encodeURIComponent(user.name)}`);
    if (r.status === 401) return redirectToLogin();
    const arr: any[] = (await safeJson(r)) || [];
    if (!Array.isArray(arr)) return;

    let wins = 0;
    let losses = 0;
    const recentForm: ('W' | 'L')[] = [];
    
    // Process matches to calculate stats
    arr.forEach((m) => {
      const win = m.winner === user.name;
      if (win) {
        wins++;
        recentForm.push('W');
      } else if (m.player1 === user.name || m.player2 === user.name) {
        losses++;
        recentForm.push('L');
      }
    });

    const totalMatches = wins + losses;
    const winRate = totalMatches > 0 ? ((wins / totalMatches) * 100) : 0;

    const stats: MatchStats = {
      wins,
      losses,
      totalMatches,
      winRate,
      recentForm: recentForm.reverse() // Most recent first
    };

    // Update summary displays
    (container.querySelector('#totalMatches') as HTMLElement).textContent = String(totalMatches);
    (container.querySelector('#winRate') as HTMLElement).textContent = `${winRate.toFixed(1)}%`;

    // Clean up existing charts
    if (winLossChart) {
      winLossChart.destroy();
    }
    
    // Create new charts
    const winLossCanvas = container.querySelector('#winLossChart') as HTMLCanvasElement;
    
    if (winLossCanvas) {
      winLossChart = createWinLossChart(winLossCanvas, stats);
    }
  }

  /* ---------- friend search ---------- */
  const searchBtn = container.querySelector('#searchBtn') as HTMLButtonElement;
  const searchInput = container.querySelector('#searchInput') as HTMLInputElement;
  const resultList = container.querySelector('#searchResults') as HTMLUListElement;

  searchBtn.addEventListener('click', async () => {
    const q = searchInput.value.trim();
    if (!q) return;
    const r = await apiFetch(`/api/friends/search?name=${encodeURIComponent(q)}`);
    if (r.status === 401) return redirectToLogin();
    const arr: any[] = (await safeJson(r)) || [];
    if (!Array.isArray(arr)) return;

    resultList.innerHTML = '';
    arr.forEach((u) => {
      const li = document.createElement('li');
      let badge = '';
      switch (u.friendship_status) {
        case 'friends':
          badge = '<span class="status-badge friends">✅ Friends</span>';
          break;
        case 'pending_sent':
          badge = '<span class="status-badge pending">⏳ Request Sent</span>';
          break;
        case 'pending_received':
          badge = '<span class="status-badge pending">📩 Pending Response</span>';
          break;
        default:
          badge = `<button class="add-friend-btn" data-id="${u.id}">Add Friend</button>`;
      }
      li.innerHTML = `<img src="${resolveAvatar(u.avatar)}" class="avatar-mini" alt="">
                      <span class="friend-name">${u.name}</span> ${badge}`;
      resultList.appendChild(li);

      li.querySelector('.add-friend-btn')?.addEventListener('click', async () => {
        const r2 = await apiFetch(`/api/friends/${u.id}`, { method: 'POST' });
        if (r2.status === 401) return redirectToLogin();
        searchBtn.click();
        loadPendingRequests();
        showToast('Friend request sent', 'success', 2000);
      });
    });
  });

  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchBtn.click();
  });

  /* ---------- initial parallel loads ---------- */
  await Promise.all([loadFriends(), loadPendingRequests(), loadMatchHistory()]);
  setTimeout(calcStats, 100); // Small delay to ensure DOM is ready

  return container;
}