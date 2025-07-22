// src/pages/renderLogin.ts
import '../styles/master.css';
import { apiFetch } from '../utils/api';

export function renderLogin(): HTMLElement {
  const container = document.createElement('div');

  container.innerHTML = `
    <!-- Toast -->
    <div id="toast" class="toast" aria-live="polite" aria-atomic="true"></div>

    <div class="auth-center">
      <div class="ring">
        <i style="--clr:#00ff0a;"></i>
        <i style="--clr:#ff0057;"></i>
        <i style="--clr:#fffd44;"></i>

        <div class="login">
          <h2>Login</h2>

          <div class="inputBx">
            <input id="email" type="email" placeholder="Email" required autocomplete="email">
          </div>
          <div class="inputBx">
            <input id="password" type="password" placeholder="Password" required autocomplete="current-password">
          </div>
          <div class="inputBx">
            <input id="loginBtn" type="submit" value="Sign in">
          </div>

          <div class="oauth-wrapper">
            <button id="googleBtn" class="google-btn">
              <img src="https://developers.google.com/identity/images/g-logo.png" alt="Google" class="google-icon">
              Sign in with Google
            </button>
          </div>

          <div class="links">
            <a class="signup" href="#/signup">Signup</a>
          </div>
        </div>
      </div>
    </div>
  `;

  /* ---------- Toast helper ---------- */
  let toastTimer: number | null = null;
  function showToast(
    message: string,
    type: 'error' | 'success' | 'info' = 'info',
    duration = 3000
  ) {
    const el = container.querySelector<HTMLDivElement>('#toast')!;
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

  /* ---------- 2FA Modal (on demand) ---------- */
  function showTwoFAModal(email: string) {
    document.querySelector('.twofa-overlay')?.remove(); // cleanup existing

    const overlay = document.createElement('div');
    overlay.className = 'twofa-overlay';
    overlay.innerHTML = `
      <div class="twofa-modal" role="dialog" aria-modal="true" aria-labelledby="twofa-title">
        <button type="button" class="twofa-close" aria-label="Close">×</button>
        <h3 id="twofa-title" class="twofa-heading">Two-Factor Verification</h3>
        <p class="twofa-instructions">Enter the 2FA code sent to <strong>${email}</strong>.</p>
        <input id="twoFACode" class="twofa-code-input" type="text" autocomplete="one-time-code" inputmode="numeric" placeholder="2FA Code">
        <div class="twofa-actions">
          <button id="twoFABtn" class="twofa-btn primary">Verify Code</button>
        </div>
      </div>
    `;

    // Dismiss behaviors
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        enableLoginButton();
        showToast('2FA canceled.', 'info', 1800);
      }
    });
    overlay.querySelector('.twofa-close')!
      .addEventListener('click', () => {
        overlay.remove();
        enableLoginButton();
        showToast('2FA canceled.', 'info', 1800);
      });

    document.body.appendChild(overlay);

    const codeInput = overlay.querySelector<HTMLInputElement>('#twoFACode')!;
    const verifyBtn = overlay.querySelector<HTMLButtonElement>('#twoFABtn')!;
    codeInput.focus();

    // Key handlers
    codeInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') verifyBtn.click();
    });

    verifyBtn.addEventListener('click', () => verify2FA(email, codeInput, verifyBtn, overlay));

    // ESC to close
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', escHandler);
        if (document.body.contains(overlay)) {
          overlay.remove();
          enableLoginButton();
          showToast('2FA canceled.', 'info', 1600);
        }
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  async function verify2FA(
    email: string,
    codeInput: HTMLInputElement,
    btn: HTMLButtonElement,
    overlay: HTMLElement
  ) {
    const code = codeInput.value.trim();
    if (!code) { showToast('Enter the 2FA code', 'error'); return; }

    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Verifying…';

    try {
      const res = await apiFetch('/api/verify-2fa', {
        method      : 'POST',
        headers     : { 'Content-Type': 'application/json' },
        body        : JSON.stringify({ email, code }),
        credentials : 'include'
      });

      let data: any = null;
      try { data = await res.json(); } catch {}

      if (!res.ok) {
        showToast(data?.error || '2FA verification failed', 'error');
      } else {
        localStorage.setItem('user', JSON.stringify(data.user));
        showToast('2FA verified. Welcome!', 'success');
        overlay.remove();
        setTimeout(() => { location.hash = '#/home'; }, 600);
      }
    } catch (err) {
      console.error(err);
      showToast('Error connecting to server', 'error');
    } finally {
      if (document.body.contains(overlay)) {
        btn.disabled = false;
        btn.textContent = original || 'Verify Code';
      }
    }
  }

  function enableLoginButton() {
    loginBtn.disabled = false;
    loginBtn.value = 'Sign in';
  }

  /* ---------- OAuth query error ---------- */
  const urlParams  = new URLSearchParams(window.location.search);
  const oauthError = urlParams.get('error');
  if (oauthError === 'oauth_failed') {
    setTimeout(() => {
      showToast('Google authentication failed. Please try again.', 'error');
      window.history.replaceState({}, document.title, window.location.pathname + '#/login');
    }, 50);
  }

  /* ---------- Element refs ---------- */
  const loginBtn  = container.querySelector('#loginBtn') as HTMLInputElement;
  const googleBtn = container.querySelector('#googleBtn') as HTMLButtonElement;

  /* ---------- Email / Password login ---------- */
  loginBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const email    = (container.querySelector('#email') as HTMLInputElement).value.trim();
    const password = (container.querySelector('#password') as HTMLInputElement).value.trim();

    if (!email || !password) { showToast('Please fill all fields', 'error'); return; }

    loginBtn.disabled = true;
    const prevLabel = loginBtn.value;
    loginBtn.value = 'Signing in…';

    try {
      const res = await apiFetch('/api/login', {
        method      : 'POST',
        headers     : { 'Content-Type': 'application/json' },
        body        : JSON.stringify({ email, password }),
        credentials : 'include'
      });

      let data: any = null;
      try { data = await res.json(); } catch {}

      if (!res.ok) {
        showToast(data?.error || 'Login failed', 'error');
      } else {
        localStorage.setItem('user', JSON.stringify(data.user));
        if (data.user.is2FAEnabled) {
          showToast('2FA enabled: enter the code.', 'info', 3500);
          showTwoFAModal(email);
        } else {
          showToast('Login successful!', 'success');
          setTimeout(() => { location.hash = '#/home'; }, 600);
        }
      }
    } catch (err) {
      console.error(err);
      showToast('Error connecting to server', 'error');
    } finally {
      // If 2FA modal displayed, keep login disabled (modal handles flow)
      if (!document.querySelector('.twofa-overlay')) {
        loginBtn.disabled = false;
        loginBtn.value = prevLabel;
      }
    }
  });

  /* ---------- Google OAuth ---------- */
  googleBtn.addEventListener('click', () => {
    showToast('Redirecting to Google…', 'info', 2500);
    window.location.href = 'https://c1r4s7.42beirut.com:3000/api/auth/google';
  });

  return container;
}
