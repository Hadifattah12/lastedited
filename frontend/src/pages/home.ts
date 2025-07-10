// src/pages/home.ts
import '../styles/home.css';
import i18next from 'i18next';

export function renderHome(): HTMLElement {
  // NEW – get saved language (or default to 'en') and tell i18next
  const savedLang = localStorage.getItem('lang') || 'en';
  i18next.changeLanguage(savedLang);

  const container = document.createElement('div');

  const userData = localStorage.getItem('user');
  const user = userData ? JSON.parse(userData) : null;

  container.innerHTML = `
    <div class="home-wrapper">
      <div class="home-container">
        <header class="home-header">
          <h1 class="home-title">${i18next.t('welcome')}</h1>
          <div class="header-right">
            <div class="dropdown">
              <button class="dropdown-toggle" id="dropdownToggle">
                <span class="user-icon">${i18next.t('profile')}</span>
              </button>
              <div class="dropdown-menu" id="dropdownMenu" style="display: none;">
                <button class="dropdown-item" id="profileBtn">⚙️ ${i18next.t('profile')}</button>
                <button class="dropdown-item" id="logoutBtn">🚪 ${i18next.t('logout')}</button>
              </div>
            </div>
            <select id="langSelect" class="language-selector">
              <!-- NEW – show “En” (capital E, lower-case n) -->
              <option value="en">En</option>
              <option value="fr">Fr</option>
              <option value="ar">Ar</option>
            </select>
          </div>
        </header>
        ${user ? `<h2 class="welcome-msg">${i18next.t('hello')} <span class="username">${user.name}</span>!</h2>` : ''}
        <main class="home-main">
          <div class="game-mode-cards">
            <div class="game-card">
              <h2>🎯 1v1 Game</h2>
              <p>${i18next.t('startMatch')}</p>
              <button class="action-btn" id="playBtn">▶️ ${i18next.t('startMatch')}</button>
              <form id="playerForm" class="player-form" style="display: none;">
                <div class="form-group">
                  <label for="player2">${i18next.t('enterSecondPlayer')}</label>
                  <input type="text" id="player2" class="player-input" placeholder="${i18next.t('player2Name')}" required />
                </div>
                <div class="form-buttons">
                  <button type="submit" class="start-game-btn">🎮 ${i18next.t('startGame')}</button>
                  <button type="button" class="cancel-btn" id="cancelBtn">❌ ${i18next.t('cancel')}</button>
                </div>
              </form>
            </div>
            <div class="game-card">
              <h2>🏆 ${i18next.t('tournament')}</h2>
              <p>${i18next.t('joinTournament')}</p>
              <button class="action-btn" id="tournamentBtn">🚀 ${i18next.t('tournament')}</button>
            </div>
            <div class="game-card">
              <h2>🤖 ${i18next.t('playWithAI')}</h2>
              <p>${i18next.t('playWithAI')}</p>
              <button class="action-btn" id="aiBtn">🧠 ${i18next.t('playWithAI')}</button>
              <form id="aiLevelForm" style="display: none; margin-top: 10px;">
                <label style="color: white;">${i18next.t('chooseLevel')}</label>
                <select id="aiLevelSelect" class="player-input">
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
                <button type="submit" class="start-game-btn">🎮 ${i18next.t('startGame')}</button>
              </form>
            </div>
            <div class="game-card">
              <h2>🌐 ${i18next.t('remotePlayer')}</h2>
              <p>${i18next.t('startRemote')}</p>
              <button class="action-btn" id="remoteBtn">🔗 ${i18next.t('setupRemote')}</button>
            </div>
          </div>
        </main>
      </div>
    </div>
  `;

  const dropdownToggle = container.querySelector('#dropdownToggle')!;
  const dropdownMenu = container.querySelector('#dropdownMenu')!;
  const logoutBtn = container.querySelector('#logoutBtn');
  const profileBtn = container.querySelector('#profileBtn');
  const playBtn = container.querySelector('#playBtn');
  const tournamentBtn = container.querySelector('#tournamentBtn');
  const aiBtn = container.querySelector('#aiBtn');
  const aiLevelForm = container.querySelector('#aiLevelForm') as HTMLFormElement;
  const aiLevelSelect = container.querySelector('#aiLevelSelect') as HTMLSelectElement;
  const form = container.querySelector('#playerForm') as HTMLFormElement;
  const input = container.querySelector('#player2') as HTMLInputElement;
  const cancelBtn = container.querySelector('#cancelBtn');
  const langSelect = container.querySelector('#langSelect') as HTMLSelectElement;
  const remoteBtn = container.querySelector('#remoteBtn');

  // NEW – reflect saved language in the <select>
  langSelect.value = savedLang;

  langSelect.addEventListener('change', (e) => {
    const newLang = (e.target as HTMLSelectElement).value;
    localStorage.setItem('lang', newLang);                 // NEW – persist choice
    i18next.changeLanguage(newLang).then(() => location.reload());
  });

  dropdownToggle.addEventListener('click', () => {
    (dropdownMenu as HTMLElement).style.display =
      (dropdownMenu as HTMLElement).style.display === 'block' ? 'none' : 'block';
  });

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('https://localhost:3000/api/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }
        });
      } catch (err) {
        console.error('Logout API failed:', err);
      }
      // Notice we do NOT remove the 'lang' key here
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      location.hash = '/login';
    });
  }

  if (profileBtn) profileBtn.addEventListener('click', () => (location.hash = '/profile'));

  if (playBtn) {
    playBtn.addEventListener('click', () => {
      form.style.display = 'block';
      input.focus();
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      form.style.display = 'none';
      input.value = '';
    });
  }

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const player2Name = input.value.trim();
      if (player2Name) {
        const gameData = {
          player1: user?.name || 'Player 1',
          player2: player2Name
        };
        localStorage.setItem('gameData', JSON.stringify(gameData));
        location.hash = '/pong';
      }
    });
  }

  if (tournamentBtn) tournamentBtn.addEventListener('click', () => (location.hash = '/tournament'));

  if (aiBtn && aiLevelForm && aiLevelSelect) {
    aiBtn.addEventListener('click', () => (aiLevelForm.style.display = 'block'));

    aiLevelForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const level = aiLevelSelect.value;
      const userData = user || { name: 'Player1' };
      localStorage.setItem('gameData', JSON.stringify({ player1: userData.name, player2: 'AI', aiLevel: level }));
      location.hash = '/pong-ai';
    });
  }

  if (remoteBtn) remoteBtn.addEventListener('click', () => (location.hash = '/remote-setup'));

  return container;
}