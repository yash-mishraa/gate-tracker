/* ========================================
   GATE Tracker — Study Timer Page (v3)
   Pomodoro + Stopwatch + Focus Mode
   ======================================== */

import { getAll, add, todayStr, formatDuration } from '../db.js';

export async function timerPage() {
  const subjects = await getAll('subjects');
  const topics = await getAll('topics');

  // Check URL params for auto-starting focus mode
  const urlParams = new URL(window.location.href.replace('#', '?')).searchParams;
  const initialMode = urlParams.get('mode') === 'focus' ? 'focus' : 'pomodoro';

  const html = `
    <div class="page-header" id="timer-page-header">
      <h1 class="page-title">Study Timer</h1>
      <p class="page-subtitle">Track your deep work sessions</p>
    </div>

    <!-- Focus Mode Overlay UI hidden by default -->
    <div id="focus-overlay-header" style="display:none; text-align:center; padding-top:2rem; margin-bottom:2rem;">
      <h1 style="font-size:3rem; font-weight:800; color:var(--primary-400); letter-spacing:0.1em; text-transform:uppercase;">Focus Mode</h1>
      <p style="font-size:1.2rem; color:var(--text-secondary); margin-top:0.5rem;" id="focus-target-text">Stay locked in.</p>
    </div>

    <div class="timer-layout">
      <div class="timer-main card" id="timer-main-card" style="transition: all 0.3s ease;">
        <!-- Mode Tabs -->
        <div class="timer-mode-tabs" id="timer-mode-tabs">
          <button class="timer-mode-tab ${initialMode === 'pomodoro' ? 'active' : ''}" data-mode="pomodoro">🍅 Pomodoro</button>
          <button class="timer-mode-tab" data-mode="stopwatch">⏱️ Stopwatch</button>
          <button class="timer-mode-tab ${initialMode === 'focus' ? 'active' : ''}" data-mode="focus" style="color:var(--accent-500)">🧠 Focus</button>
        </div>

        <div class="timer-display">
          <svg class="timer-ring" viewBox="0 0 200 200">
            <circle class="timer-ring-bg" cx="100" cy="100" r="90" />
            <circle class="timer-ring-fill" id="timer-ring-fill" cx="100" cy="100" r="90" />
          </svg>
          <div class="timer-text">
            <div class="timer-time" id="timer-time">25:00</div>
            <div class="timer-label" id="timer-label">Focus</div>
          </div>
        </div>

        <div class="timer-controls">
          <button class="btn btn-secondary btn-timer" id="timer-reset" title="Reset">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
          </button>
          <button class="btn btn-primary btn-timer btn-timer-main" id="timer-toggle">
            <svg id="play-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            <svg id="pause-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="display:none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          </button>
          <button class="btn btn-secondary btn-timer" id="timer-stop" title="Stop & Save">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
          </button>
        </div>

        <div class="timer-sessions" id="timer-sessions">
          <span class="timer-dot active"></span>
          <span class="timer-dot"></span>
          <span class="timer-dot"></span>
          <span class="timer-dot"></span>
        </div>

        <div class="timer-log-msg" id="timer-log-msg" style="display:none"></div>
      </div>

      <div class="timer-sidebar" id="timer-sidebar">
        <div class="card" id="session-setup-card">
          <div class="card-header">
            <div class="card-title">Session Setup</div>
          </div>
          <div class="form-group">
            <label class="form-label">Subject *</label>
            <select class="form-input" id="timer-subject">
              <option value="">Select subject...</option>
              ${subjects.map(s => `<option value="${s.id}">${s.icon || '📘'} ${s.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Topic</label>
            <select class="form-input" id="timer-topic" disabled>
              <option value="">Select topic...</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Study Type</label>
            <select class="form-input" id="timer-study-type">
              <option value="lecture">📖 Lecture</option>
              <option value="practice">✏️ Practice</option>
              <option value="revision">🔄 Revision</option>
              <option value="mock-test">📝 Mock Test</option>
            </select>
          </div>
          <div id="focus-warning" style="display:none; color:var(--danger-400); font-size:var(--text-xs); margin-top:var(--space-sm);">
            * Subject & Topic are required for Focus Mode.
          </div>
        </div>

        <div class="card" id="pomodoro-settings">
          <div class="card-header">
            <div class="card-title">Pomodoro Settings</div>
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">Focus</label>
              <input class="form-input" id="focus-duration" type="number" value="25" min="1" max="120" />
            </div>
            <div class="form-group">
              <label class="form-label">Break</label>
              <input class="form-input" id="break-duration" type="number" value="5" min="1" max="30" />
            </div>
          </div>
        </div>

        <div class="card" id="stats-card">
          <div class="card-header">
            <div class="card-title">Today's Stats</div>
          </div>
          <div id="today-timer-stats"></div>
        </div>
      </div>
    </div>
  `;

  return {
    html,
    init: () => {
      let mode = initialMode; // 'pomodoro' | 'stopwatch' | 'focus'
      let focusDuration = 25;
      let breakDuration = 5;
      let longBreakDuration = 15;
      let timeLeft = focusDuration * 60;
      let totalTime = focusDuration * 60;
      let isRunning = false;
      let isFocus = true;
      let sessionCount = 0;
      let intervalId = null;
      let sessionStartTime = null;
      let stopwatchElapsed = 0;

      const timeEl = document.getElementById('timer-time');
      const labelEl = document.getElementById('timer-label');
      const ringFill = document.getElementById('timer-ring-fill');
      const playIcon = document.getElementById('play-icon');
      const pauseIcon = document.getElementById('pause-icon');
      const logMsg = document.getElementById('timer-log-msg');
      const circumference = 2 * Math.PI * 90;
      ringFill.style.strokeDasharray = circumference;

      // Fullscreen elements
      const mainCard = document.getElementById('timer-main-card');
      const sidebar = document.getElementById('timer-sidebar');
      const header = document.getElementById('timer-page-header');
      const overHeader = document.getElementById('focus-overlay-header');
      const modeTabs = document.getElementById('timer-mode-tabs');

      function updateDisplay() {
        if (mode === 'pomodoro' || mode === 'focus') {
          const m = Math.floor(timeLeft / 60);
          const s = timeLeft % 60;
          timeEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
          const progress = 1 - (timeLeft / totalTime);
          ringFill.style.strokeDashoffset = circumference * (1 - progress);
        } else {
          const m = Math.floor(stopwatchElapsed / 60);
          const s = stopwatchElapsed % 60;
          const h = Math.floor(m / 60);
          if (h > 0) {
            timeEl.textContent = `${h}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
          } else {
            timeEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
          }
          const progress = (stopwatchElapsed % 3600) / 3600;
          ringFill.style.strokeDashoffset = circumference * (1 - progress);
        }
      }

      function updateUIForMode() {
        const pomoSettings = document.getElementById('pomodoro-settings');
        const sessionDots = document.getElementById('timer-sessions');
        const warning = document.getElementById('focus-warning');

        if (mode === 'pomodoro') {
          pomoSettings.style.display = '';
          sessionDots.style.display = '';
          warning.style.display = 'none';
          labelEl.textContent = 'Focus';
          timeLeft = focusDuration * 60;
          totalTime = focusDuration * 60;
        } else if (mode === 'stopwatch') {
          pomoSettings.style.display = 'none';
          sessionDots.style.display = 'none';
          warning.style.display = 'none';
          labelEl.textContent = 'Stopwatch';
          stopwatchElapsed = 0;
        } else if (mode === 'focus') {
          pomoSettings.style.display = 'none';
          sessionDots.style.display = 'none';
          warning.style.display = 'block';
          labelEl.textContent = 'Deep Focus';
          stopwatchElapsed = 0; // we use stopwatch logic for Focus Mode
        }
        updateDisplay();
      }

      function activateFocusModeFullscreen() {
        document.body.classList.add('focus-mode-active');
        sidebar.style.display = 'none';
        header.style.display = 'none';
        modeTabs.style.display = 'none';
        overHeader.style.display = 'block';
        
        const subjName = document.getElementById('timer-subject').selectedOptions[0]?.textContent || '';
        const topicName = document.getElementById('timer-topic').selectedOptions[0]?.textContent || '';
        document.getElementById('focus-target-text').textContent = `Target: ${subjName} - ${topicName}`;
        
        mainCard.style.boxShadow = '0 0 50px rgba(99, 102, 241, 0.4)';
        mainCard.style.border = '2px solid var(--primary-500)';
        mainCard.style.transform = 'scale(1.1)';
        mainCard.style.marginTop = '4rem';
      }

      function deactivateFocusModeFullscreen() {
        document.body.classList.remove('focus-mode-active');
        sidebar.style.display = 'flex';
        header.style.display = 'flex';
        modeTabs.style.display = 'flex';
        overHeader.style.display = 'none';
        
        mainCard.style.boxShadow = '';
        mainCard.style.border = '';
        mainCard.style.transform = '';
        mainCard.style.marginTop = '';
      }

      function updateSessionDots() {
        const dots = document.querySelectorAll('.timer-dot');
        dots.forEach((dot, i) => {
          dot.className = 'timer-dot' + (i < sessionCount ? ' completed' : '') + (i === sessionCount ? ' active' : '');
        });
      }

      function showLogMsg(msg) {
        logMsg.textContent = msg;
        logMsg.style.display = 'block';
        setTimeout(() => { logMsg.style.display = 'none'; }, 3000);
      }

      async function saveSession(durationMins) {
        if (durationMins < 1) return;
        const subjectId = Number(document.getElementById('timer-subject').value) || null;
        const topicId = Number(document.getElementById('timer-topic').value) || null;
        const studyType = document.getElementById('timer-study-type').value;
        await add('studySessions', {
          date: todayStr(),
          subjectId,
          topicId,
          duration: durationMins,
          type: studyType,
          timerMode: mode,
          createdAt: new Date().toISOString(),
        });
        showLogMsg(`✅ Saved: ${formatDuration(durationMins)} study session`);
        updateTodayStats();
      }

      async function updateTodayStats() {
        const sessions = await getAll('studySessions');
        const today = todayStr();
        const todaySessions = sessions.filter(s => s.date === today);
        const totalMins = todaySessions.reduce((a, s) => a + (s.duration || 0), 0);
        const statsEl = document.getElementById('today-timer-stats');
        if (statsEl) {
          statsEl.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:var(--space-sm);">
              <span style="color:var(--text-tertiary); font-size:var(--text-sm);">Sessions</span>
              <span style="font-weight:600;">${todaySessions.length}</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:var(--space-sm);">
              <span style="color:var(--text-tertiary); font-size:var(--text-sm);">Total Time</span>
              <span style="font-weight:600;">${formatDuration(totalMins)}</span>
            </div>
          `;
        }
      }

      function playBeep() {
        try {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 800;
          gain.gain.value = 0.1;
          osc.start();
          setTimeout(() => osc.stop(), 200);
        } catch(e) {}
      }

      function pomodoroTick() {
        if (timeLeft <= 0) {
          clearInterval(intervalId);
          isRunning = false;
          playIcon.style.display = '';
          pauseIcon.style.display = 'none';
          playBeep();

          if (isFocus) {
            const durationMins = Math.round((Date.now() - sessionStartTime) / 60000);
            saveSession(durationMins > 0 ? durationMins : focusDuration);
            sessionCount++;
            updateSessionDots();

            if (sessionCount % 4 === 0) {
              timeLeft = longBreakDuration * 60;
              totalTime = longBreakDuration * 60;
              labelEl.textContent = 'Long Break';
            } else {
              timeLeft = breakDuration * 60;
              totalTime = breakDuration * 60;
              labelEl.textContent = 'Break';
            }
          } else {
            timeLeft = focusDuration * 60;
            totalTime = focusDuration * 60;
            labelEl.textContent = 'Focus';
          }
          isFocus = !isFocus;
          updateDisplay();
          return;
        }
        timeLeft--;
        updateDisplay();
      }

      function stopwatchTick() {
        stopwatchElapsed++;
        updateDisplay();
      }

      // ── Mode tabs ──
      document.querySelectorAll('.timer-mode-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          if (isRunning) return; // Don't switch while running
          mode = tab.dataset.mode;
          document.querySelectorAll('.timer-mode-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          updateUIForMode();
        });
      });

      // ── Toggle (start / pause) ──
      document.getElementById('timer-toggle').addEventListener('click', () => {
        if (isRunning) {
          clearInterval(intervalId);
          isRunning = false;
          playIcon.style.display = '';
          pauseIcon.style.display = 'none';
        } else {
          if (mode === 'focus') {
            const subj = document.getElementById('timer-subject').value;
            const top = document.getElementById('timer-topic').value;
            if (!subj || !top) {
              alert('Please select both Subject and Topic to enter Focus Mode.');
              return;
            }
            if (stopwatchElapsed === 0) sessionStartTime = Date.now();
            intervalId = setInterval(stopwatchTick, 1000);
            activateFocusModeFullscreen();
          } else if (mode === 'pomodoro') {
            if (isFocus && timeLeft === focusDuration * 60) sessionStartTime = Date.now();
            intervalId = setInterval(pomodoroTick, 1000);
          } else {
            if (stopwatchElapsed === 0) sessionStartTime = Date.now();
            intervalId = setInterval(stopwatchTick, 1000);
          }
          isRunning = true;
          playIcon.style.display = 'none';
          pauseIcon.style.display = '';
        }
      });

      // ── Reset ──
      document.getElementById('timer-reset').addEventListener('click', () => {
        clearInterval(intervalId);
        isRunning = false;
        playIcon.style.display = '';
        pauseIcon.style.display = 'none';

        if (mode === 'pomodoro') {
          isFocus = true;
          timeLeft = focusDuration * 60;
          totalTime = focusDuration * 60;
          labelEl.textContent = 'Focus';
        } else {
          stopwatchElapsed = 0;
          labelEl.textContent = mode === 'focus' ? 'Deep Focus' : 'Stopwatch';
          if (mode === 'focus') deactivateFocusModeFullscreen();
        }
        updateDisplay();
      });

      // ── Stop & Save ──
      document.getElementById('timer-stop').addEventListener('click', () => {
        if (!sessionStartTime) return;
        clearInterval(intervalId);
        isRunning = false;
        playIcon.style.display = '';
        pauseIcon.style.display = 'none';

        const durationMins = Math.round((Date.now() - sessionStartTime) / 60000);
        if (durationMins >= 1) {
          saveSession(durationMins);
          if (mode === 'pomodoro') {
            sessionCount++;
            updateSessionDots();
          }
        } else {
          showLogMsg('⚠️ Session too short (< 1 min)');
        }

        // Reset
        sessionStartTime = null;
        if (mode === 'pomodoro') {
          isFocus = true;
          timeLeft = focusDuration * 60;
          totalTime = focusDuration * 60;
          labelEl.textContent = 'Focus';
        } else {
          stopwatchElapsed = 0;
          labelEl.textContent = mode === 'focus' ? 'Deep Focus' : 'Stopwatch';
          if (mode === 'focus') deactivateFocusModeFullscreen();
        }
        updateDisplay();
      });

      // ── Pomodoro Settings ──
      document.getElementById('focus-duration').addEventListener('change', (e) => {
        focusDuration = Number(e.target.value) || 25;
        if (!isRunning && isFocus && mode === 'pomodoro') { timeLeft = focusDuration * 60; totalTime = focusDuration * 60; updateDisplay(); }
      });
      document.getElementById('break-duration').addEventListener('change', (e) => {
        breakDuration = Number(e.target.value) || 5;
      });

      // ── Subject → Topic filter ──
      document.getElementById('timer-subject').addEventListener('change', (e) => {
        const sid = Number(e.target.value);
        const topicSelect = document.getElementById('timer-topic');
        if (!sid) {
          topicSelect.disabled = true;
          topicSelect.innerHTML = '<option value="">Select topic...</option>';
          return;
        }
        const filtered = topics.filter(t => t.subjectId === sid);
        topicSelect.disabled = false;
        topicSelect.innerHTML = '<option value="">Select topic...</option>' +
          filtered.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
      });

      updateUIForMode();
      updateTodayStats();

      return () => {
        if (intervalId) clearInterval(intervalId);
        document.body.classList.remove('focus-mode-active');
      };
    }
  };
}
