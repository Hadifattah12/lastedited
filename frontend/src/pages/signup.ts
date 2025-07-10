// src/pages/signup.ts
import '../styles/master.css';
import { apiFetch } from '../utils/api';

export function renderSignup(): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = `
    <div class="ring">
      <div class="login">
        <h2>Signup</h2>

        <div class="inputBx"><input id="email"           type="email"    placeholder="Email"             required></div>
        <div class="inputBx"><input id="password"        type="password" placeholder="Password"          required></div>
        <div class="inputBx"><input id="confirmPassword" type="password" placeholder="Confirm Password"  required></div>
        <div class="inputBx"><input id="name"            type="text"     placeholder="Name"              required></div>
        <div class="inputBx"><input id="signupBtn"       type="submit"   value="Register"></div>

        <div class="links"><a href="#/login">Already have an account?</a></div>
      </div>
    </div>
  `;

  const signupBtn = container.querySelector('#signupBtn')!;

  signupBtn.addEventListener('click', async () => {
    const email           = (container.querySelector('#email')           as HTMLInputElement).value.trim();
    const password        = (container.querySelector('#password')        as HTMLInputElement).value.trim();
    const confirmPassword = (container.querySelector('#confirmPassword') as HTMLInputElement).value.trim();
    const name            = (container.querySelector('#name')            as HTMLInputElement).value.trim();

    if (!email || !password || !confirmPassword || !name) {
      alert('Please fill all fields'); return;
    }
    if (password !== confirmPassword) {
      alert("Passwords don't match");  return;
    }
    if (password.length < 7) {
      alert('Password must be at least 7 characters long'); return;
    }

    try {
      const res  = await apiFetch('/api/signup', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ email, password, name })
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Signup failed'); return;
      }

      alert('Signup successful! Please check your email to verify your account.');
      location.hash = '#/login';

    } catch (err) {
      console.error(err);
      alert('Error connecting to server');
    }
  });

  return container;
}
