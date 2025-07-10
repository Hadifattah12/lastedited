// router.ts

import { renderHome } from './pages/home';
import { renderGame } from './pages/pong';
import { renderLogin } from './pages/login';
import { renderSignup } from './pages/signup';
import { renderProfile } from './pages/profile'; // import new page
import { renderTournament } from './pages/tournament';
import { renderPongAI } from './pages/pong-ai';
import { handleOAuthCallback } from './pages/oauth-callback';
import { renderRemoteSetup } from './pages/remote-setup';
import { renderRemoteGame } from './pages/remote-game';

// Early check: if we’re on the special hash, handle it and bail
if (window.location.hash.startsWith('#/oauth-callback')) {
  handleOAuthCallback();
  // the function will redirect to #/home; no further routing needed now
}


interface Route {
  path: string;
  component: () => HTMLElement | Promise<HTMLElement>;
  requiresAuth?: boolean;
}

const routes: Route[] = [
  { path: '/', component: renderLogin },
  { path: '/login', component: renderLogin },
  { path: '/signup', component: renderSignup },
  { path: '/home', component: renderHome, requiresAuth: true },
  { path: '/pong', component: renderGame, requiresAuth: true },
  { path: '/profile', component: renderProfile, requiresAuth: true },
  { path: '/tournament', component: renderTournament, requiresAuth: true },
  { path: '/pong-ai', component: renderPongAI, requiresAuth: true },
  { path: '/remote-setup', component: renderRemoteSetup, requiresAuth: true },
  { path: '/remote-game', component: renderRemoteGame, requiresAuth: true }
];

function getCurrentRoute(): string {
  return window.location.hash.slice(1) || '/';
}

function isAuthenticated(): boolean {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  return !!(token && user);
}

async function navigateToRoute(path: string) {
  const route = routes.find(r => r.path === path);

  if (!route) {
    const fallback = isAuthenticated() ? '/home' : '/login';
    window.location.hash = fallback;
    return;
  }

  if (route.requiresAuth && !isAuthenticated()) {
    window.location.hash = '/login';
    return;
  }

  if ((path === '/login' || path === '/signup') && isAuthenticated()) {
    window.location.hash = '/home';
    return;
  }

  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = '';

    // Await async component
    const component = await route.component();
    if (component instanceof HTMLElement) {
      app.appendChild(component);
    } else {
      console.error('Component is not a valid HTMLElement:', component);
    }
  }
}


function handleRouteChange() {
  const currentPath = getCurrentRoute();
  navigateToRoute(currentPath);
}

// Exported router initializer
export function initRouter() {
  // Initial route render
  handleRouteChange();

  // Hash-based navigation
  window.addEventListener('hashchange', handleRouteChange);
}

// Optional programmatic navigation
export function navigateTo(path: string) {
  window.location.hash = path;
}
