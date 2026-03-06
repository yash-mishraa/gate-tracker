/* ========================================
   GATE Tracker — Main Entry Point
   ======================================== */

import './styles/variables.css';
import './styles/global.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/pages/dashboard.css';
import './styles/pages/planner.css';
import './styles/pages/subjects.css';
import './styles/pages/topics.css';
import './styles/pages/timer.css';
import './styles/pages/analytics.css';
import './styles/pages/tests.css';
import './styles/pages/notes.css';
import './styles/pages/reflection.css';
import './styles/pages/calendar.css';

import './styles/auth.css';

import { registerRoute, initRouter } from './router.js';
import { seedIfEmpty, setUserId } from './db.js';
import { observeAuth, logIn, signUp, logOut } from './auth.js';

import { dashboardPage } from './pages/dashboard.js';
import { plannerPage } from './pages/planner.js';
import { subjectsPage } from './pages/subjects.js';
import { topicsPage } from './pages/topics.js';
import { timerPage } from './pages/timer.js';
import { reflectionPage } from './pages/reflection.js';
import { analyticsPage } from './pages/analytics.js';
import { testsPage } from './pages/tests.js';
import { notesPage } from './pages/notes.js';
import { calendarPage } from './pages/calendar.js';

// ── Theme ──
function initTheme() {
  const saved = localStorage.getItem('gate-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeUI(saved);

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('gate-theme', next);
    updateThemeUI(next);
  });
}

function updateThemeUI(theme) {
  const darkIcon = document.getElementById('theme-icon-dark');
  const lightIcon = document.getElementById('theme-icon-light');
  const label = document.getElementById('theme-label');
  if (theme === 'dark') {
    darkIcon.style.display = '';
    lightIcon.style.display = 'none';
    label.textContent = 'Dark';
  } else {
    darkIcon.style.display = 'none';
    lightIcon.style.display = '';
    label.textContent = 'Light';
  }
}

// ── Mobile Sidebar ──
function initMobileSidebar() {
  const hamburger = document.getElementById('hamburger-btn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  const close = () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
  };

  hamburger.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('open');
  });

  overlay.addEventListener('click', close);

  // Close sidebar on nav click (mobile)
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 768) close();
    });
  });
}

// ── Auth Flow ──
function initAuthFlow() {
  const authScreen = document.getElementById('auth-screen');
  const appScreen = document.getElementById('app');
  const authForm = document.getElementById('auth-form');
  const authToggleLink = document.getElementById('auth-toggle-link');
  const authToggleText = document.getElementById('auth-toggle-text');
  const authSubmitBtn = document.getElementById('auth-submit-btn');
  const errorMsg = document.getElementById('auth-error-msg');
  const loader = document.getElementById('auth-loader');

  let mode = 'login'; // 'login' or 'signup'

  authToggleLink.addEventListener('click', () => {
    mode = mode === 'login' ? 'signup' : 'login';
    if (mode === 'signup') {
      authSubmitBtn.textContent = 'Sign Up';
      authToggleText.innerHTML = `Already have an account? <a id="auth-toggle-link">Log In</a>`;
    } else {
      authSubmitBtn.textContent = 'Log In';
      authToggleText.innerHTML = `Don't have an account? <a id="auth-toggle-link">Sign Up</a>`;
    }
    errorMsg.style.display = 'none';
    
    // Re-attach listener to newly created anchor tag
    document.getElementById('auth-toggle-link').addEventListener('click', () => authToggleLink.click());
  });

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const pwd = document.getElementById('auth-password').value;
    
    loader.style.display = 'flex';
    errorMsg.style.display = 'none';

    try {
      if (mode === 'login') {
        await logIn(email, pwd);
      } else {
        await signUp(email, pwd);
      }
      // Success is handled by observeAuth
    } catch (err) {
      errorMsg.textContent = err.message.replace('Firebase: ', '');
      errorMsg.style.display = 'block';
      loader.style.display = 'none';
    }
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await logOut();
  });

  let routerInitialized = false;

  observeAuth(async (user) => {
    loader.style.display = 'none';
    if (user) {
      // Logged in
      authScreen.style.display = 'none';
      appScreen.style.display = 'flex';
      
      // Partition local DB
      setUserId(user.uid);
      await seedIfEmpty();

      if (!routerInitialized) {
        registerRoute('/dashboard', dashboardPage);
        registerRoute('/planner', plannerPage);
        registerRoute('/subjects', subjectsPage);
        registerRoute('/topics/:id', topicsPage);
        registerRoute('/timer', timerPage);
        registerRoute('/reflection', reflectionPage);
        registerRoute('/analytics', analyticsPage);
        registerRoute('/tests', testsPage);
        registerRoute('/notes', notesPage);
        registerRoute('/calendar', calendarPage);

        initTheme();
        initMobileSidebar();
        initRouter();
        routerInitialized = true;
      } else {
        // If they logged out and logged back in during the same session,
        // force router to re-render the current view with the new user's DB.
        window.dispatchEvent(new Event('hashchange'));
      }
    } else {
      // Logged out
      authScreen.style.display = 'flex';
      appScreen.style.display = 'none';
      document.getElementById('auth-password').value = '';
    }
  });
}

// ── Bootstrap ──
function init() {
  initAuthFlow();
}

init();
