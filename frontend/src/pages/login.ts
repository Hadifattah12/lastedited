// src/pages/renderLogin.ts
import '../styles/master.css';
import { apiFetch, BACKEND_BASE } from '../utils/api';
export function renderLogin(): HTMLElement {
  const container = document.createElement('div');
  document.body.className = 'login-page';

  /* ------------------------------------------------------------------ */
  /* OAuth-related error in the query-string?                            */
  /* ------------------------------------------------------------------ */
  const urlParams  = new URLSearchParams(window.location.search);
  const oauthError = urlParams.get('error');
  if (oauthError === 'oauth_failed') {
    setTimeout(() => {
      alert('Google authentication failed. Please try again.');
      window.history.replaceState({}, document.title, window.location.pathname + '#/login');
    }, 100);
  }

  /* ------------------------------------------------------------------ */
  /* Mark-up                                                             */
  /* ------------------------------------------------------------------ */
  container.innerHTML = `
    <div class="ring">
      <i style="--clr:#00ff0a;"></i>https://localhost:5173/
      <i style="--clr:#ff0057;"></i>
      <i style="--clr:#fffd44;"></i>
      <div class="login">
        <h2>Login</h2>

        <div class="inputBx">
          <input id="email" type="email" placeholder="Email" required>
        </div>
        <div class="inputBx">
          <input id="password" type="password" placeholder="Password" required>
        </div>
        <div class="inputBx">
          <input id="loginBtn" type="submit" value="Sign in">
        </div>

        <div style="text-align:center; margin-top:1rem;">
          <button id="googleBtn" style="
            background:#fff; border:1px solid #ccc; padding:0.5rem 1rem;
            display:flex; align-items:center; gap:0.5rem; cursor:pointer;
            font-size:1rem; margin:0 auto; border-radius:4px;">
            <img src="https://developers.google.com/identity/images/g-logo.png"
                 alt="Google" style="width:20px; height:20px;">
            Sign in with Google
          </button>
        </div>

        <!-- 2FA verification -->
        <div id="twoFASection" style="display:none;">
          <p>Enter the 2FA code sent to your email:</p>
          <input id="twoFACode" type="text" placeholder="2FA Code">
          <button id="twoFABtn">Verify Code</button>
        </div>

        <div class="links">
          <a class="signup" href="#/signup">Signup</a>
        </div>
      </div>
    </div>
  `;

  /* ------------------------------------------------------------------ */
  /* Element handles                                                     */
  /* ------------------------------------------------------------------ */
  const loginBtn      = container.querySelector('#loginBtn')  as HTMLInputElement;
  const twoFASection  = container.querySelector('#twoFASection') as HTMLElement;
  const twoFABtn      = container.querySelector('#twoFABtn')  as HTMLButtonElement;
  const googleBtn     = container.querySelector('#googleBtn') as HTMLButtonElement;

  /* ------------------------------------------------------------------ */
  /* Traditional e-mail / password login                                 */
  /* ------------------------------------------------------------------ */
  loginBtn.addEventListener('click', async () => {
    const email    = (container.querySelector('#email') as HTMLInputElement).value.trim();
    const password = (container.querySelector('#password') as HTMLInputElement).value.trim();
    if (!email || !password) { alert('Please fill all fields'); return; }https://localhost:5173/

    try {
      const res  = await apiFetch('/api/login', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Login failed'); return; }

      localStorage.setItem('user',  JSON.stringify(data.user));

      if (data.user.is2FAEnabled) {
        twoFASection.style.display = 'block';
        loginBtn.disabled = true;
      } else {
        localStorage.setItem('token', data.token);
        location.hash = '/home';
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to server');
    }
  });

  /* ------------------------------------------------------------------ */
  /* 2-Factor verification                                               */
  /* ------------------------------------------------------------------ */
  twoFABtn.addEventListener('click', async () => {
    const email = (container.querySelector('#email') as HTMLInputElement).value.trim();
    const code  = (container.querySelector('#twoFACode') as HTMLInputElement).value.trim();
    if (!code) { alert('Please enter the 2FA code'); return; }

    try {
      const res  = await await apiFetch('/api/verify-2fa', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ email, code })
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || '2FA verification failed'); return; }

      localStorage.setItem('token', data.token);
      location.hash = '/home';
    } catch (err) {
      console.error(err);
      alert('Error connecting to server');
    }
  });

  /* ------------------------------------------------------------------ */
  /* Google Sign-In                                                      */
  /* ------------------------------------------------------------------ */
  googleBtn.addEventListener('click', () => {
    // No fetch call – just follow the redirect:
    window.location.href = 'https://localhost:3000/api/auth/google';
  });

  return container;
}
