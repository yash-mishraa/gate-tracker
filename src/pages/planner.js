/* ========================================
   GATE Tracker — Daily Planner Page (Enhanced)
   Time-slot based study session planner
   ======================================== */

import { getAll, add, put, del, todayStr, formatDate, formatDuration } from '../db.js';

function getWeekDates(baseDate) {
  const d = new Date(baseDate);
  const day = d.getDay();
  const start = new Date(d);
  start.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(start);
    dt.setDate(start.getDate() + i);
    dates.push(dt.toISOString().slice(0, 10));
  }
  return dates;
}

const studyTypes = [
  { value: 'lecture', label: 'Lecture', icon: '📖', badge: 'badge-primary' },
  { value: 'practice', label: 'Practice', icon: '✏️', badge: 'badge-success' },
  { value: 'revision', label: 'Revision', icon: '🔄', badge: 'badge-warning' },
  { value: 'mock-test', label: 'Mock Test', icon: '📝', badge: 'badge-danger' },
];

function getStudyType(val) {
  return studyTypes.find(t => t.value === val) || studyTypes[0];
}

function timeDiffMins(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

export async function plannerPage() {
  const today = todayStr();
  let selectedDate = today;
  let weekDates = getWeekDates(today);
  const subjects = await getAll('subjects');
  const allTopics = await getAll('topics');
  const allTasks = await getAll('tasks');

  function renderWeek() {
    return weekDates.map(d => {
      const dt = new Date(d + 'T00:00:00');
      const dayName = dt.toLocaleDateString('en-IN', { weekday: 'short' });
      const dayNum = dt.getDate();
      const isToday = d === today;
      const isSelected = d === selectedDate;
      return `<button class="week-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-date="${d}">
        <span class="week-day-name">${dayName}</span>
        <span class="week-day-num">${dayNum}</span>
      </button>`;
    }).join('');
  }

  function subjectOptions(selectedId = '') {
    return `<option value="">— Select Subject —</option>` +
      subjects.map(s => `<option value="${s.id}" ${Number(selectedId) === s.id ? 'selected' : ''}>${s.icon || '📘'} ${s.name}</option>`).join('');
  }

  function topicOptions(subjectId, selectedId = '') {
    const filtered = allTopics.filter(t => t.subjectId === Number(subjectId));
    return `<option value="">— Select Topic —</option>` +
      filtered.map(t => `<option value="${t.id}" ${Number(selectedId) === t.id ? 'selected' : ''}>${t.name}</option>`).join('');
  }

  async function renderSessions() {
    const allSessions = await getAll('plannedSessions');
    const daySessions = allSessions
      .filter(s => s.date === selectedDate)
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

    const dayTasks = allTasks.filter(t => t.date === selectedDate && !t.completed);
    const completedToday = daySessions.filter(s => s.completed).length;
    const plannedMins = daySessions.reduce((a, s) => a + timeDiffMins(s.startTime, s.endTime), 0);
    const actualMins = daySessions.filter(s => s.completed).reduce((a, s) => a + (s.actualMinutes || timeDiffMins(s.startTime, s.endTime)), 0);

    const summaryHtml = `
      <div class="planner-summary">
        <div class="planner-summary-stat">
          <span class="planner-summary-val">${daySessions.length}</span>
          <span class="planner-summary-lbl">Sessions</span>
        </div>
        <div class="planner-summary-stat">
          <span class="planner-summary-val">${completedToday}/${daySessions.length}</span>
          <span class="planner-summary-lbl">Completed</span>
        </div>
        <div class="planner-summary-stat">
          <span class="planner-summary-val">${formatDuration(plannedMins)}</span>
          <span class="planner-summary-lbl">Planned</span>
        </div>
        <div class="planner-summary-stat">
          <span class="planner-summary-val">${formatDuration(actualMins)}</span>
          <span class="planner-summary-lbl">Actual</span>
        </div>
      </div>
    `;

    if (daySessions.length === 0 && dayTasks.length === 0) {
      return summaryHtml + `<div class="empty-state"><div class="empty-state-icon">📋</div><p class="empty-state-text">No sessions planned for ${formatDate(selectedDate)}</p><p class="empty-state-text" style="font-size:var(--text-xs); margin-top:-8px;">Click "+ Add Session" to create a study time slot</p></div>`;
    }

    let sessionsHtml = daySessions.map(s => {
      const subj = subjects.find(sub => sub.id === s.subjectId);
      const topic = allTopics.find(t => t.id === s.topicId);
      const type = getStudyType(s.studyType);
      const planned = timeDiffMins(s.startTime, s.endTime);
      const actual = s.actualMinutes || 0;

      return `
        <div class="planner-session ${s.completed ? 'completed' : ''}" data-id="${s.id}">
          <div class="planner-session-time">
            <span class="planner-time-start">${s.startTime || '—'}</span>
            <span class="planner-time-sep">→</span>
            <span class="planner-time-end">${s.endTime || '—'}</span>
            <span class="planner-time-dur">${formatDuration(planned)}</span>
          </div>
          <div class="planner-session-body" style="border-left: 3px solid ${subj?.color || 'var(--primary-500)'}">
            <div class="planner-session-header">
              <div class="planner-session-top">
                <input type="checkbox" class="session-check" data-id="${s.id}" ${s.completed ? 'checked' : ''} title="Mark completed" />
                <div class="planner-session-subject ${s.completed ? 'completed-text' : ''}">${subj ? `${subj.icon || '📘'} ${subj.name}` : 'No subject'}</div>
              </div>
              <div class="planner-session-badges">
                <span class="badge ${type.badge}">${type.icon} ${type.label}</span>
                ${s.completed && actual > 0 ? `<span class="badge badge-success">⏱ ${formatDuration(actual)} actual</span>` : ''}
              </div>
            </div>
            ${topic ? `<div class="planner-session-topic">📌 ${topic.name}</div>` : ''}
            ${s.notes ? `<div class="planner-session-notes">${s.notes}</div>` : ''}
            <div class="planner-session-actions">
              ${!s.completed ? `<button class="btn btn-sm btn-secondary edit-session-btn" data-id="${s.id}">✏️ Edit</button>` : ''}
              ${!s.completed ? `<button class="btn btn-sm btn-secondary log-actual-btn" data-id="${s.id}" data-planned="${planned}">⏱ Log Time</button>` : ''}
              <button class="btn btn-sm btn-secondary delete-session-btn" data-id="${s.id}">🗑️</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Also show legacy tasks if any
    if (dayTasks.length > 0) {
      sessionsHtml += `<div class="planner-legacy-tasks"><div class="card-title" style="margin-bottom:var(--space-sm); font-size:var(--text-xs); color:var(--text-tertiary);">QUICK TASKS</div>`;
      sessionsHtml += dayTasks.map(t => `
        <div class="planner-task" data-id="${t.id}">
          <div class="planner-task-left">
            <input type="checkbox" class="task-checkbox" data-id="${t.id}" ${t.completed ? 'checked' : ''} />
            <span class="${t.completed ? 'completed-text' : ''}">${t.title}</span>
          </div>
          <div class="planner-task-right">
            ${t.priority ? `<span class="badge badge-${t.priority === 'high' ? 'danger' : t.priority === 'medium' ? 'warning' : 'success'}">${t.priority}</span>` : ''}
            <button class="btn-icon delete-task-btn" data-id="${t.id}">🗑️</button>
          </div>
        </div>
      `).join('');
      sessionsHtml += '</div>';
    }

    return summaryHtml + sessionsHtml;
  }

  const html = `
    <div class="page-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap: var(--space-md);">
      <div>
        <h1 class="page-title">Daily Study Planner</h1>
        <p class="page-subtitle" id="planner-date-label">${formatDate(selectedDate)}</p>
      </div>
      <div style="display:flex; gap:var(--space-sm); flex-wrap:wrap;">
        <button class="btn btn-secondary" id="add-task-btn">+ Quick Task</button>
        <button class="btn btn-primary" id="add-session-btn">+ Add Session</button>
      </div>
    </div>

    <!-- Week strip -->
    <div class="week-strip" id="week-strip">
      <button class="week-nav" id="prev-week">‹</button>
      <div class="week-days" id="week-days">${renderWeek()}</div>
      <button class="week-nav" id="next-week">›</button>
    </div>

    <!-- Sessions -->
    <div class="planner-sessions-list" id="planner-sessions">
      ${await renderSessions()}
    </div>

    <!-- Add/Edit Session Modal -->
    <div class="modal-overlay" id="session-modal" style="display:none">
      <div class="modal">
        <h2 class="modal-title" id="session-modal-title">Add Study Session</h2>
        <input type="hidden" id="session-edit-id" />
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Start Time *</label>
            <input class="form-input" id="session-start" type="time" required />
          </div>
          <div class="form-group">
            <label class="form-label">End Time *</label>
            <input class="form-input" id="session-end" type="time" required />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Subject</label>
          <select class="form-input" id="session-subject">${subjectOptions()}</select>
        </div>
        <div class="form-group">
          <label class="form-label">Topic</label>
          <select class="form-input" id="session-topic" disabled><option value="">— Select Topic —</option></select>
        </div>
        <div class="form-group">
          <label class="form-label">Study Type</label>
          <select class="form-input" id="session-type">
            ${studyTypes.map(t => `<option value="${t.value}">${t.icon} ${t.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea class="form-input" id="session-notes" rows="2" placeholder="What will you focus on?"></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="cancel-session">Cancel</button>
          <button class="btn btn-primary" id="save-session">Save Session</button>
        </div>
      </div>
    </div>

    <!-- Log Actual Time Modal -->
    <div class="modal-overlay" id="actual-modal" style="display:none">
      <div class="modal" style="max-width:400px">
        <h2 class="modal-title">Log Actual Time</h2>
        <input type="hidden" id="actual-session-id" />
        <p style="font-size:var(--text-sm); color:var(--text-secondary); margin-bottom:var(--space-md);">How many minutes did you actually study?</p>
        <div class="form-group">
          <label class="form-label">Actual Minutes</label>
          <input class="form-input" id="actual-minutes" type="number" min="1" max="600" placeholder="25" />
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="cancel-actual">Cancel</button>
          <button class="btn btn-primary" id="save-actual">Save & Complete</button>
        </div>
      </div>
    </div>

    <!-- Quick Task Modal -->
    <div class="modal-overlay" id="task-modal" style="display:none">
      <div class="modal" style="max-width:450px">
        <h2 class="modal-title">Quick Task</h2>
        <div class="form-group">
          <label class="form-label">Title</label>
          <input class="form-input" id="task-title" placeholder="e.g., Review notes on graphs" />
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Time</label>
            <input class="form-input" id="task-time" type="time" />
          </div>
          <div class="form-group">
            <label class="form-label">Priority</label>
            <select class="form-input" id="task-priority">
              <option value="">None</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="cancel-task">Cancel</button>
          <button class="btn btn-primary" id="save-task">Save</button>
        </div>
      </div>
    </div>
  `;

  return {
    html,
    init: () => {
      const sessionModal = document.getElementById('session-modal');
      const actualModal = document.getElementById('actual-modal');
      const taskModal = document.getElementById('task-modal');
      const container = document.getElementById('planner-sessions');
      const weekDaysEl = document.getElementById('week-days');

      async function refresh() {
        container.innerHTML = await renderSessions();
        attachListeners();
      }

      function attachListeners() {
        // Session checkboxes
        document.querySelectorAll('.session-check').forEach(cb => {
          cb.addEventListener('change', async (e) => {
            const id = Number(e.target.dataset.id);
            const all = await getAll('plannedSessions');
            const session = all.find(s => s.id === id);
            if (session) {
              session.completed = e.target.checked;
              if (e.target.checked && !session.actualMinutes) {
                session.actualMinutes = timeDiffMins(session.startTime, session.endTime);
              }
              await put('plannedSessions', session);
              // Also log to studySessions for analytics
              if (e.target.checked) {
                await add('studySessions', {
                  date: session.date,
                  subjectId: session.subjectId || null,
                  topicId: session.topicId || null,
                  duration: session.actualMinutes || timeDiffMins(session.startTime, session.endTime),
                  type: session.studyType || 'study',
                  createdAt: new Date().toISOString(),
                });
              }
              refresh();
            }
          });
        });

        // Edit session
        document.querySelectorAll('.edit-session-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = Number(btn.dataset.id);
            const all = await getAll('plannedSessions');
            const session = all.find(s => s.id === id);
            if (session) openSessionModal(session);
          });
        });

        // Log actual time
        document.querySelectorAll('.log-actual-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            document.getElementById('actual-session-id').value = btn.dataset.id;
            document.getElementById('actual-minutes').value = btn.dataset.planned || '';
            actualModal.style.display = 'flex';
          });
        });

        // Delete session
        document.querySelectorAll('.delete-session-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            await del('plannedSessions', Number(btn.dataset.id));
            refresh();
          });
        });

        // Task checkboxes (legacy)
        document.querySelectorAll('.task-checkbox').forEach(cb => {
          cb.addEventListener('change', async (e) => {
            const id = Number(e.target.dataset.id);
            const task = allTasks.find(t => t.id === id);
            if (task) {
              task.completed = e.target.checked;
              await put('tasks', task);
              refresh();
            }
          });
        });

        document.querySelectorAll('.delete-task-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            await del('tasks', Number(btn.closest('.delete-task-btn').dataset.id));
            refresh();
          });
        });
      }

      function openSessionModal(editSession = null) {
        document.getElementById('session-modal-title').textContent = editSession ? 'Edit Study Session' : 'Add Study Session';
        document.getElementById('session-edit-id').value = editSession?.id || '';
        document.getElementById('session-start').value = editSession?.startTime || '';
        document.getElementById('session-end').value = editSession?.endTime || '';
        document.getElementById('session-subject').innerHTML = subjectOptions(editSession?.subjectId);
        document.getElementById('session-type').value = editSession?.studyType || 'lecture';
        document.getElementById('session-notes').value = editSession?.notes || '';

        // Load topics if subject selected
        const sid = editSession?.subjectId;
        const topicEl = document.getElementById('session-topic');
        if (sid) {
          topicEl.disabled = false;
          topicEl.innerHTML = topicOptions(sid, editSession?.topicId);
        } else {
          topicEl.disabled = true;
          topicEl.innerHTML = '<option value="">— Select Topic —</option>';
        }

        sessionModal.style.display = 'flex';
      }

      // Week day selection
      weekDaysEl.addEventListener('click', (e) => {
        const dayBtn = e.target.closest('.week-day');
        if (dayBtn) {
          selectedDate = dayBtn.dataset.date;
          weekDaysEl.innerHTML = renderWeek();
          document.getElementById('planner-date-label').textContent = formatDate(selectedDate);
          refresh();
        }
      });

      // Week nav
      document.getElementById('prev-week').addEventListener('click', () => {
        const first = new Date(weekDates[0] + 'T00:00:00');
        first.setDate(first.getDate() - 7);
        weekDates = getWeekDates(first.toISOString().slice(0, 10));
        weekDaysEl.innerHTML = renderWeek();
      });
      document.getElementById('next-week').addEventListener('click', () => {
        const first = new Date(weekDates[0] + 'T00:00:00');
        first.setDate(first.getDate() + 7);
        weekDates = getWeekDates(first.toISOString().slice(0, 10));
        weekDaysEl.innerHTML = renderWeek();
      });

      // Session modal
      document.getElementById('add-session-btn').addEventListener('click', () => openSessionModal());
      document.getElementById('cancel-session').addEventListener('click', () => sessionModal.style.display = 'none');
      sessionModal.addEventListener('click', (e) => { if (e.target === sessionModal) sessionModal.style.display = 'none'; });

      // Subject → Topic cascade in modal
      document.getElementById('session-subject').addEventListener('change', (e) => {
        const topicEl = document.getElementById('session-topic');
        const sid = e.target.value;
        if (!sid) {
          topicEl.disabled = true;
          topicEl.innerHTML = '<option value="">— Select Topic —</option>';
        } else {
          topicEl.disabled = false;
          topicEl.innerHTML = topicOptions(sid);
        }
      });

      // Save session
      document.getElementById('save-session').addEventListener('click', async () => {
        const startTime = document.getElementById('session-start').value;
        const endTime = document.getElementById('session-end').value;
        if (!startTime || !endTime) return;

        const editId = document.getElementById('session-edit-id').value;
        const data = {
          date: selectedDate,
          startTime,
          endTime,
          subjectId: Number(document.getElementById('session-subject').value) || null,
          topicId: Number(document.getElementById('session-topic').value) || null,
          studyType: document.getElementById('session-type').value,
          notes: document.getElementById('session-notes').value.trim(),
          completed: false,
          actualMinutes: 0,
          createdAt: new Date().toISOString(),
        };

        if (editId) {
          data.id = Number(editId);
          const existing = (await getAll('plannedSessions')).find(s => s.id === data.id);
          if (existing) {
            data.completed = existing.completed;
            data.actualMinutes = existing.actualMinutes;
          }
          await put('plannedSessions', data);
        } else {
          await add('plannedSessions', data);
        }
        sessionModal.style.display = 'none';
        refresh();
      });

      // Actual time modal
      document.getElementById('cancel-actual').addEventListener('click', () => actualModal.style.display = 'none');
      actualModal.addEventListener('click', (e) => { if (e.target === actualModal) actualModal.style.display = 'none'; });

      document.getElementById('save-actual').addEventListener('click', async () => {
        const id = Number(document.getElementById('actual-session-id').value);
        const mins = Number(document.getElementById('actual-minutes').value);
        if (!id || !mins) return;

        const all = await getAll('plannedSessions');
        const session = all.find(s => s.id === id);
        if (session) {
          session.actualMinutes = mins;
          session.completed = true;
          await put('plannedSessions', session);
          // Log to studySessions
          await add('studySessions', {
            date: session.date,
            subjectId: session.subjectId || null,
            topicId: session.topicId || null,
            duration: mins,
            type: session.studyType || 'study',
            createdAt: new Date().toISOString(),
          });
        }
        actualModal.style.display = 'none';
        refresh();
      });

      // Quick task modal
      document.getElementById('add-task-btn').addEventListener('click', () => taskModal.style.display = 'flex');
      document.getElementById('cancel-task').addEventListener('click', () => taskModal.style.display = 'none');
      taskModal.addEventListener('click', (e) => { if (e.target === taskModal) taskModal.style.display = 'none'; });

      document.getElementById('save-task').addEventListener('click', async () => {
        const title = document.getElementById('task-title').value.trim();
        if (!title) return;
        await add('tasks', {
          title,
          time: document.getElementById('task-time').value,
          priority: document.getElementById('task-priority').value,
          date: selectedDate,
          completed: false,
          createdAt: new Date().toISOString(),
        });
        taskModal.style.display = 'none';
        document.getElementById('task-title').value = '';
        allTasks.push({ title, date: selectedDate, completed: false }); // local update
        refresh();
      });

      attachListeners();
    }
  };
}
