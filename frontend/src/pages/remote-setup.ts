/* ------------------------------------------------------------
 * Remote Setup page – generates or joins a room code for
 * remote Pong. No WebSocket logic lives here: that lives in
 * remote-game.ts.
 * ------------------------------------------------------------ */
import '../styles/remote-setup.css';
import i18next from 'i18next';

export function renderRemoteSetup(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'remote-setup-wrapper';

  container.innerHTML = `
    <!-- Toast -->
    <div id="toast" class="toast" aria-live="polite" aria-atomic="true"></div>

    <div class="remote-setup-container">
      <h1>${i18next.t('remote Player')}</h1>
      <p>${i18next.t('choose Remote Option')}</p>

      <div class="remote-buttons">
        <button id="generateBtn"  class="action-btn">🔑 ${i18next.t('generateCode')}</button>

        <div id="generatedBlock" style="display:none;margin-top:15px;">
          <label>${i18next.t('yourGameCode')}:</label>
          <div class="code-display">
            <input id="generatedCode"  class="code-input" type="text" readonly>
            <button id="copyBtn" class="copy-btn" aria-label="${i18next.t('copy')}">📋</button>
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
               required minlength="6" maxlength="6"
               autocomplete="off" autocapitalize="characters" />
        <button class="start-game-btn" type="submit">🎮 ${i18next.t('joinGame')}</button>
      </form>

      <button id="backBtn" class="back-btn">⬅️ ${i18next.t('back')}</button>
    </div>`;

  /* ----------------- Toast helper ----------------- */
  let toastTimer: number | null = null;
  function showToast(msg: string, type: 'error' | 'success' | 'info' = 'info', duration = 2500) {
    const el = container.querySelector<HTMLDivElement>('#toast')!;
    el.textContent = msg;
    el.className = `toast toast--visible toast--${type}`;
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    toastTimer = window.setTimeout(() => {
      el.classList.remove('toast--visible');
    }, duration);
  }

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
    showToast(i18next.t('codeGenerated') || 'Code generated', 'success');
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(generatedInput.value);
      copyBtn.textContent = '✅';
      showToast(i18next.t('copied') || 'Copied!', 'info', 1500);
      setTimeout(() => (copyBtn.textContent = '📋'), 1600);
    } catch {
      generatedInput.select();
      document.execCommand('copy');
      showToast(i18next.t('copied') || 'Copied!', 'info', 1500);
    }
  });

  hostPlayBtn.addEventListener('click', () => {
    if (generatedInput.value) {
      showToast(i18next.t('startingGame') || 'Starting…', 'info', 1200);
      setTimeout(() => { location.hash = '/remote-game'; }, 500);
    }
  });

  /* ----------------- guest flow ------------------- */
  joinBtn.addEventListener('click', () => {
    joinForm.style.display = 'block';
    joinCodeInput.focus();
  });

  joinCodeInput.addEventListener('input', () => {
    joinCodeInput.value = joinCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  joinForm.addEventListener('submit', e => {
    e.preventDefault();
    const code = joinCodeInput.value.trim().toUpperCase();
    if (code.length !== 6) {
      showToast(i18next.t('invalidCode') || 'Invalid code', 'error');
      return;
    }
    localStorage.setItem('remoteGameCode', code);
    showToast(i18next.t('joiningGame') || 'Joining…', 'info', 1200);
    setTimeout(() => { location.hash = '/remote-game'; }, 400);
  });

  /* ----------------- misc ------------------------- */
  backBtn.addEventListener('click', () => {
    location.hash = '/home';
  });

  return container;
}

/* util ------------------------------------------------------------------ */
function generateCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random()*chars.length)]).join('');
}
