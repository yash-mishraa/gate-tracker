/* ========================================
   GATE Tracker — Hash Router
   ======================================== */

const routes = {};
let currentCleanup = null;

export function registerRoute(path, handler) {
  routes[path] = handler;
}

export function navigate(path) {
  if (window.location.hash === '#' + path || window.location.hash === path) {
    handleRoute();
  } else {
    window.location.hash = path;
  }
}

export function getCurrentRoute() {
  return window.location.hash.slice(1) || '/dashboard';
}

export async function handleRoute() {
  const path = getCurrentRoute();
  const container = document.getElementById('page-content');
  if (!container) return;

  // Run cleanup from previous page
  if (currentCleanup && typeof currentCleanup === 'function') {
    currentCleanup();
    currentCleanup = null;
  }

  // Find matching route
  let handler = routes[path];

  // Check for parameterised routes like /topics/:id
  if (!handler) {
    for (const [pattern, h] of Object.entries(routes)) {
      if (pattern.includes(':')) {
        const regex = new RegExp('^' + pattern.replace(/:([^/]+)/g, '([^/]+)') + '$');
        const match = path.match(regex);
        if (match) {
          handler = () => h(match[1]);
          break;
        }
      }
    }
  }

  if (!handler) handler = routes['/dashboard'];

  try {
    const result = await handler();
    if (result && result.html) {
      container.innerHTML = result.html;
      if (result.init) {
        currentCleanup = await result.init();
      }
    }
  } catch (err) {
    console.error('Route error:', err);
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><p>Something went wrong loading this page.</p></div>`;
  }

  // Update active nav link
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('data-route');
    link.classList.toggle('active', href === path || (path.startsWith(href) && href !== '/dashboard'));
  });
}

export function initRouter() {
  window.addEventListener('hashchange', handleRoute);
  // Initial route
  if (!window.location.hash) {
    window.location.hash = '/dashboard';
  } else {
    handleRoute();
  }
}
