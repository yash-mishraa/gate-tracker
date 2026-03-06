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

import { registerRoute, initRouter } from './router.js';
import { seedIfEmpty } from './db.js';

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

// ── Bootstrap ──
async function init() {
  await seedIfEmpty();

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
}

init();
