// src/pages/signup.ts
import '../styles/master.css';
import { apiFetch } from '../utils/api';

export function renderSignup(): HTMLElement {
  const container = document.createElement('div');

  container.innerHTML = `
    <!-- Toast -->
    <div id="toast" class="toast" aria-live="polite" aria-atomic="true"></div>

    <div class="auth-center">
      <div class="ring">
        <!-- Animated borders (uncomment if desired)
        <i style="--clr:#ff357a;"></i>
        <i style="--clr:#fff172;"></i>
        <i style="--clr:#ff6fa3;"></i>
        -->
        <div class="login">
          <h2>Signup</h2>

          <div class="inputBx">
            <input id="email" type="email" placeholder="Email" required autocomplete="email">
          </div>
          <div class="inputBx">
            <input id="password" type="password" placeholder="Password" required autocomplete="new-password">
          </div>
          <div class="inputBx">
            <input id="confirmPassword" type="password" placeholder="Confirm Password" required autocomplete="new-password">
          </div>
          <div class="inputBx">
            <input id="name" type="text" placeholder="Name" required autocomplete="name">
          </div>
          <div class="inputBx">
            <input id="signupBtn" type="submit" value="Register">
          </div>

          <div class="links">
            <a href="#/login">Already have an account?</a>
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

  /* ---------- Form logic ---------- */
  const signupBtn = container.querySelector('#signupBtn') as HTMLInputElement;

  signupBtn.addEventListener('click', async (e) => {
    e.preventDefault();

    const emailEl           = container.querySelector<HTMLInputElement>('#email')!;
    const passwordEl        = container.querySelector<HTMLInputElement>('#password')!;
    const confirmPasswordEl = container.querySelector<HTMLInputElement>('#confirmPassword')!;
    const nameEl            = container.querySelector<HTMLInputElement>('#name')!;

    const email           = emailEl.value.trim();
    const password        = passwordEl.value.trim();
    const confirmPassword = confirmPasswordEl.value.trim();
    const name            = nameEl.value.trim();

    // Validation
    if (!email || !password || !confirmPassword || !name) {
      showToast('Please fill all fields', 'error'); return;
    }
    if (password !== confirmPassword) {
      showToast("Passwords don't match", 'error'); return;
    }
    if (password.length < 7) {
      showToast('Password must be at least 7 characters long', 'error'); return;
    }

    const btn = signupBtn;
    btn.disabled = true;
    const oldLabel = btn.value;
    btn.value = 'Registering...';

    try {
      const res = await apiFetch('/api/signup', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ email, password, name })
      });

      let data: any = null;
      try { data = await res.json(); } catch { /* ignore parse error */ }

      if (!res.ok) {
        showToast(data?.error || 'Signup failed', 'error');
      } else {
        showToast('Signup successful! Verify your email.', 'success');
        setTimeout(() => { location.hash = '#/login'; }, 2000);
      }
    } catch (err) {
      console.error(err);
      showToast('Error connecting to server', 'error');
    } finally {
      btn.disabled = false;
      btn.value = oldLabel;
    }
  });

  return container;
}
