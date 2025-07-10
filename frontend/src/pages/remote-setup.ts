/* ------------------------------------------------------------
 * Remote Setup page – generates or joins a room code for
 * remote Pong. No WebSocket logic lives here: that lives in
 * remote-game.ts.
 * ------------------------------------------------------------ */
import '../styles/remote-setup.css';
import i18next from 'i18next';

/**
 * Host & guest both save two keys in localStorage:
 *   - remoteGameCode : the 6-char room code
 *   - user           : the existing user JSON (after login)
 *
 * remote-game.ts will read those and connect to
 *   wss://<host>:3000/?code=CODE&name=PlayerName
 */

export function renderRemoteSetup(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'remote-setup-wrapper';

  container.innerHTML = `
    <div class="remote-setup-container">
      <h1>${i18next.t('remotePlayer')}</h1>
      <p>${i18next.t('chooseRemoteOption')}</p>

      <div class="remote-buttons">
        <button id="generateBtn"  class="action-btn">🔑 ${i18next.t('generateCode')}</button>

        <div id="generatedBlock" style="display:none;margin-top:15px;">
          <label>${i18next.t('yourGameCode')}:</label>
          <div class="code-display">
            <input id="generatedCode"  class="code-input" type="text" readonly>
            <button id="copyBtn" class="copy-btn">📋</button>
          </div>
          <button id="hostPlayBtn" class="start-game-btn" style="margin-top:12px;">🎮 ${i18next.t('startGame')}</button>
        </div>

        <div class="divider">${i18next.t('or')}</div>

        <button id="joinBtn" class="action-btn">🔗 ${i18next.t('joinWithCode')}</button>
      </div>

      <form id="joinForm" style="display:none;margin-top:20px;">
        <label for="joinCode">${i18next.t('enterGameCode')}:</label>
        <input id="joinCode" class="player-input"
               placeholder="${i18next.t('gameCode')}"
               required minlength="6" maxlength="6">
        <button class="start-game-btn" type="submit">🎮 ${i18next.t('joinGame')}</button>
      </form>

      <button id="backBtn" class="back-btn">⬅️ ${i18next.t('back')}</button>
    </div>`;

  /* ----------------- element refs ----------------- */
  const generateBtn    = container.querySelector('#generateBtn')  as HTMLButtonElement;
  const generatedBlock = container.querySelector('#generatedBlock') as HTMLElement;
  const generatedInput = container.querySelector('#generatedCode') as HTMLInputElement;
  const copyBtn        = container.querySelector('#copyBtn')      as HTMLButtonElement;
  const hostPlayBtn    = container.querySelector('#hostPlayBtn')  as HTMLButtonElement;
  const joinBtn        = container.querySelector('#joinBtn')      as HTMLButtonElement;
  const joinForm       = container.querySelector('#joinForm')     as HTMLFormElement;
  const joinCodeInput  = container.querySelector('#joinCode')     as HTMLInputElement;
  const backBtn        = container.querySelector('#backBtn')      as HTMLButtonElement;

  /* ----------------- host flow -------------------- */
  generateBtn.addEventListener('click', () => {
    const roomCode = generateCode();
    generatedInput.value  = roomCode;
    generatedBlock.style.display = 'block';
    generateBtn.style.display    = 'none';
    localStorage.setItem('remoteGameCode', roomCode);
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(generatedInput.value);
      copyBtn.textContent = '✅';
      setTimeout(() => (copyBtn.textContent = '📋'), 2000);
    } catch {
      generatedInput.select(); document.execCommand('copy');
    }
  });

  hostPlayBtn.addEventListener('click', () => {
    if (generatedInput.value) location.hash = '/remote-game';
  });

  /* ----------------- guest flow ------------------- */
  joinBtn.addEventListener('click', () => {
    joinForm.style.display = 'block';
    joinCodeInput.focus();
  });

  joinForm.addEventListener('submit', e => {
    e.preventDefault();
    const code = joinCodeInput.value.trim().toUpperCase();
    if (code.length !== 6) return alert(i18next.t('invalidCode'));
    localStorage.setItem('remoteGameCode', code);
    location.hash = '/remote-game';
  });

  /* ----------------- misc ------------------------- */
  backBtn.addEventListener('click', () => (location.hash = '/home'));

  return container;
}

/* util ------------------------------------------------------------------ */
function generateCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random()*chars.length)]).join('');
}