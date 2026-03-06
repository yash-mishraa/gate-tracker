/* ========================================
   GATE Tracker — Topics Page (v4)
   + Question Practice Tracker & Strength
   ======================================== */

import { getAll, getById, add, put, del, todayStr, formatDate } from '../db.js';
import { navigate } from '../router.js';

const SPACED_INTERVALS = [1, 3, 7, 15, 30];

function getNextRevisionDate(lastDate, revCount) {
  if (!lastDate) return null;
  const idx = Math.min(revCount, SPACED_INTERVALS.length - 1);
  const days = SPACED_INTERVALS[idx];
  const d = new Date(lastDate + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(todayStr() + 'T00:00:00');
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

function revisionBadge(daysLeft) {
  if (daysLeft === null) return '';
  if (daysLeft < 0) return `<span class="badge badge-danger">Overdue ${Math.abs(daysLeft)}d</span>`;
  if (daysLeft === 0) return `<span class="badge badge-danger">Due Today</span>`;
  if (daysLeft <= 2) return `<span class="badge badge-warning">Due in ${daysLeft}d</span>`;
  return `<span class="badge badge-primary">Due in ${daysLeft}d</span>`;
}

// Determines if a topic is Strong, Average, or Weak
export function getTopicStrength(topic, topicMins) {
  let score = 50; // Base score
  
  // 1. Accuracy
  const acc = topic.questionsAttempted > 0 ? (topic.correctAnswers / topic.questionsAttempted) * 100 : null;
  if (acc !== null) {
    if (acc >= 80) score += 20;
    else if (acc >= 60) score += 5;
    else if (acc < 40) score -= 20;
    else score -= 10;
  }

  // 2. Time vs Completion
  if (topic.status !== 'completed' && topicMins > 120) score -= 15;
  if (topic.status === 'completed') score += 10;

  // 3. Revision
  const nextRev = topic.nextRevisionDate || getNextRevisionDate(topic.lastRevisionDate, topic.revisionCount || 0);
  const dl = daysUntil(nextRev);
  if (dl !== null && dl < 0) score -= 10; // Overdue
  if ((topic.revisionCount || 0) >= 3) score += 15;

  if (score >= 75) return { label: 'Strong', class: 'badge-success', color: 'var(--accent-500)' };
  if (score <= 40) return { label: 'Weak', class: 'badge-danger', color: 'var(--danger-500)' };
  return { label: 'Average', class: 'badge-warning', color: 'var(--warning-500)' };
}

export async function topicsPage(subjectId) {
  const sid = Number(subjectId);
  const subject = await getById('subjects', sid);
  if (!subject) {
    return {
      html: `<div class="empty-state"><div class="empty-state-icon">📘</div><p class="empty-state-text">Subject not found</p><button class="btn btn-primary" onclick="location.hash='/subjects'">← Back to Subjects</button></div>`,
      init: () => {}
    };
  }

  const allTopics = await getAll('topics');
  const topics = allTopics.filter(t => t.subjectId === sid);
  const sessions = await getAll('studySessions');
  const subjectSessions = sessions.filter(s => s.subjectId === sid);
  const subjectMins = subjectSessions.reduce((a, s) => a + (s.duration || 0), 0);
  const today = todayStr();

  const statusColors = {
    'not-started': 'var(--text-tertiary)',
    'in-progress': 'var(--primary-400)',
    'completed': 'var(--accent-400)',
    'revision': 'var(--warning-400)',
  };

  const statusLabels = {
    'not-started': 'Not Started',
    'in-progress': 'In Progress',
    'completed': 'Completed',
    'revision': 'Revision',
  };

  const difficultyLabels = {
    'easy': { label: 'Easy', color: 'var(--accent-400)' },
    'medium': { label: 'Medium', color: 'var(--warning-400)' },
    'hard': { label: 'Hard', color: 'var(--danger-400)' },
  };

  function renderStars(confidence = 0) {
    let s = '';
    for (let i = 1; i <= 5; i++) {
      s += `<span class="star ${i <= confidence ? 'filled' : ''}" data-val="${i}">★</span>`;
    }
    return s;
  }

  const completedCount = topics.filter(t => t.status === 'completed').length;
  const inProgressCount = topics.filter(t => t.status === 'in-progress').length;
  const revisionTotal = topics.reduce((a, t) => a + (t.revisionCount || 0), 0);
  const totalQuestions = topics.reduce((a, t) => a + (t.questionsAttempted || t.questionsSolved || 0), 0);
  const percent = topics.length > 0 ? Math.round((completedCount / topics.length) * 100) : 0;

  // Due revisions
  const dueRevisions = topics.filter(t => {
    const next = t.nextRevisionDate || getNextRevisionDate(t.lastRevisionDate, t.revisionCount || 0);
    if (!next) return false;
    return daysUntil(next) <= 0;
  });

  const html = `
    <div class="page-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap: var(--space-md);">
      <div>
        <button class="btn btn-sm btn-secondary" id="back-subjects" style="margin-bottom: var(--space-sm);">← Subjects</button>
        <h1 class="page-title">${subject.icon || '📘'} ${subject.name}</h1>
        <p class="page-subtitle">${completedCount}/${topics.length} topics completed · ${percent}%</p>
      </div>
      <button class="btn btn-primary" id="add-topic-btn">+ Add Topic</button>
    </div>

    <div class="progress-bar" style="margin-bottom: var(--space-md); height: 10px;">
      <div class="progress-fill" style="width: ${percent}%; background: ${subject.color || 'var(--primary-500)'}"></div>
    </div>

    <!-- Stats strip -->
    <div class="topic-stats-strip">
      <div class="topic-stat-chip">
        <span class="topic-stat-val">${topics.length}</span>
        <span class="topic-stat-lbl">Total</span>
      </div>
      <div class="topic-stat-chip">
        <span class="topic-stat-val" style="color:var(--accent-400)">${completedCount}</span>
        <span class="topic-stat-lbl">Done</span>
      </div>
      <div class="topic-stat-chip">
        <span class="topic-stat-val" style="color:var(--primary-400)">${inProgressCount}</span>
        <span class="topic-stat-lbl">In Progress</span>
      </div>
      <div class="topic-stat-chip">
        <span class="topic-stat-val" style="color:var(--warning-400)">${revisionTotal}</span>
        <span class="topic-stat-lbl">Revisions</span>
      </div>
      <div class="topic-stat-chip">
        <span class="topic-stat-val">${totalQuestions}</span>
        <span class="topic-stat-lbl">Questions</span>
      </div>
      <div class="topic-stat-chip">
        <span class="topic-stat-val">${Math.round(subjectMins / 60 * 10) / 10}h</span>
        <span class="topic-stat-lbl">Study Time</span>
      </div>
      <div class="topic-stat-chip ${dueRevisions.length > 0 ? 'topic-stat-alert' : ''}">
        <span class="topic-stat-val" style="color:var(--danger-400)">${dueRevisions.length}</span>
        <span class="topic-stat-lbl">Due Reviews</span>
      </div>
    </div>

    <!-- Revision Reminders -->
    ${dueRevisions.length > 0 ? `
    <div class="card revision-alert-card">
      <div class="card-header"><div class="card-title">🔔 Revision Reminders</div></div>
      <div class="revision-alert-list">
        ${dueRevisions.map(t => {
          const next = t.nextRevisionDate || getNextRevisionDate(t.lastRevisionDate, t.revisionCount || 0);
          const dl = daysUntil(next);
          return `<div class="revision-alert-item">
            <span>${t.name}</span>
            <div style="display:flex; gap:var(--space-sm); align-items:center;">
              ${revisionBadge(dl)}
              <button class="btn btn-sm btn-primary mark-revised-btn" data-id="${t.id}">✅ Mark Revised</button>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}

    <div class="topics-list" id="topics-list">
      ${topics.length === 0 ? '<div class="empty-state"><div class="empty-state-icon">📝</div><p class="empty-state-text">No topics yet. Add your first topic!</p></div>' :
        topics.map(t => {
          const diff = difficultyLabels[t.difficulty] || null;
          const nextRev = t.nextRevisionDate || getNextRevisionDate(t.lastRevisionDate, t.revisionCount || 0);
          const dl = daysUntil(nextRev);
          const tMins = subjectSessions.filter(s => s.topicId === t.id).reduce((a, s) => a + (s.duration || 0), 0) + (t.practiceTimeSpent || 0);
          const strength = getTopicStrength(t, tMins);
          const acc = t.questionsAttempted > 0 ? Math.round((t.correctAnswers / t.questionsAttempted) * 100) : null;
          
          return `
            <div class="topic-item" data-id="${t.id}">
              <div class="topic-status-dot" style="background: ${statusColors[t.status || 'not-started']}"></div>
              <div class="topic-info">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                  <div class="topic-name">${t.name}</div>
                  <span class="badge ${strength.class}" style="font-size:0.65rem">${strength.label}</span>
                </div>
                <div class="topic-meta">
                  <span class="badge" style="background: ${statusColors[t.status || 'not-started']}22; color: ${statusColors[t.status || 'not-started']}">${statusLabels[t.status || 'not-started']}</span>
                  ${diff ? `<span class="badge" style="background: ${diff.color}22; color: ${diff.color}">${diff.label}</span>` : ''}
                  ${t.questionsAttempted > 0 ? `<span class="topic-detail" title="C:${t.correctAnswers} W:${t.wrongAnswers}">✏️ ${t.questionsAttempted} Q (${acc}%)</span>` : ''}
                  ${t.pyqsAttempted > 0 ? `<span class="topic-detail" title="C:${t.pyqsCorrect} W:${t.pyqsWrong} Y:${t.pyqYearStr||'N/A'}">📜 ${t.pyqsAttempted} PYQs (${Math.round(t.pyqsCorrect/t.pyqsAttempted*100)}%)</span>` : ''}
                  ${(t.revisionCount || 0) > 0 ? `<span class="topic-detail">🔄 ${t.revisionCount} rev</span>` : ''}
                  ${tMins > 0 ? `<span class="topic-detail">⏱️ ${Math.round(tMins)}m</span>` : ''}
                  ${revisionBadge(dl)}
                  <span class="stars topic-stars" data-id="${t.id}">${renderStars(t.confidence)}</span>
                </div>
                ${t.notes ? `<div class="topic-notes-preview">📝 ${t.notes.slice(0, 80)}${t.notes.length > 80 ? '...' : ''}</div>` : ''}
              </div>
              <div class="topic-actions">
                <button class="btn-icon track-practice-btn" data-id="${t.id}" title="Practice Tracker">🎯</button>
                <button class="btn-icon track-pyq-btn" data-id="${t.id}" title="PYQ Tracker">📜</button>
                <button class="btn-icon edit-topic" data-id="${t.id}" title="Edit">✏️</button>
                <button class="btn-icon mark-revised-inline" data-id="${t.id}" title="Mark as Revised">🔄</button>
                <select class="topic-status-select" data-id="${t.id}">
                  <option value="not-started" ${(t.status || 'not-started') === 'not-started' ? 'selected' : ''}>Not Started</option>
                  <option value="in-progress" ${t.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
                  <option value="completed" ${t.status === 'completed' ? 'selected' : ''}>Completed</option>
                  <option value="revision" ${t.status === 'revision' ? 'selected' : ''}>Revision</option>
                </select>
                <button class="btn-icon delete-topic" data-id="${t.id}" title="Delete">🗑️</button>
              </div>
            </div>
          `;
        }).join('')}
    </div>

    <!-- PYQ Tracker Modal -->
    <div class="modal-overlay" id="pyq-modal" style="display:none">
      <div class="modal">
        <h2 class="modal-title">PYQ Tracker</h2>
        <p class="page-subtitle" id="pyq-topic-name" style="margin-top:-10px; margin-bottom:15px;"></p>
        <input type="hidden" id="pyq-topic-id" />
        
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">PYQs Attempted</label>
            <input class="form-input" id="pyq-attempted" type="number" min="0" value="0" />
          </div>
          <div class="form-group">
            <label class="form-label">Correct Answers</label>
            <input class="form-input" id="pyq-correct" type="number" min="0" value="0" />
          </div>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Wrong / Unanswered</label>
            <input class="form-input" id="pyq-wrong" type="number" min="0" value="0" readonly style="background:var(--bg-tertiary)" />
          </div>
          <div class="form-group">
            <label class="form-label">Accuracy (%)</label>
            <input class="form-input" id="pyq-accuracy" type="text" readonly style="background:var(--bg-tertiary)" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Years (e.g., 2018, 2019, 2021)</label>
          <input class="form-input" id="pyq-years" type="text" placeholder="Comma separated years..." />
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="cancel-pyq">Cancel</button>
          <button class="btn btn-primary" id="save-pyq">Save PYQs</button>
        </div>
      </div>
    </div>

    <!-- Practice Tracker Modal -->
    <div class="modal-overlay" id="practice-modal" style="display:none">
      <div class="modal">
        <h2 class="modal-title">Practice Tracker</h2>
        <p class="page-subtitle" id="practice-topic-name" style="margin-top:-10px; margin-bottom:15px;"></p>
        <input type="hidden" id="practice-topic-id" />
        
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Questions Attempted</label>
            <input class="form-input" id="prac-attempted" type="number" min="0" value="0" />
          </div>
          <div class="form-group">
            <label class="form-label">Correct Answers</label>
            <input class="form-input" id="prac-correct" type="number" min="0" value="0" />
          </div>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Wrong / Unanswered</label>
            <input class="form-input" id="prac-wrong" type="number" min="0" value="0" readonly style="background:var(--bg-tertiary)" />
          </div>
          <div class="form-group">
            <label class="form-label">Accuracy (%)</label>
            <input class="form-input" id="prac-accuracy" type="text" readonly style="background:var(--bg-tertiary)" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Time Spent (minutes)</label>
          <input class="form-input" id="prac-time" type="number" min="0" value="0" />
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="cancel-practice">Cancel</button>
          <button class="btn btn-primary" id="save-practice">Save Practice</button>
        </div>
      </div>
    </div>

    <!-- Add/Edit Topic Modal -->
    <div class="modal-overlay" id="topic-modal" style="display:none">
      <div class="modal">
        <h2 class="modal-title" id="topic-modal-title">Add Topic</h2>
        <input type="hidden" id="topic-edit-id" />
        <div class="form-group">
          <label class="form-label">Topic Name *</label>
          <input class="form-input" id="topic-name" placeholder="e.g., Binary Search Trees" />
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-input" id="topic-status">
              <option value="not-started">Not Started</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="revision">Revision</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Difficulty</label>
            <select class="form-input" id="topic-difficulty">
              <option value="">Not Set</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Revision Count</label>
            <input class="form-input" id="topic-revisions" type="number" min="0" value="0" />
          </div>
          <div class="form-group">
            <label class="form-label">Last Revision Date</label>
            <input class="form-input" id="topic-last-rev" type="date" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Next Revision Reminder (Optional override)</label>
          <input class="form-input" id="topic-next-rev" type="date" />
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea class="form-input" id="topic-notes" rows="3" placeholder="Key concepts..."></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="cancel-topic">Cancel</button>
          <button class="btn btn-primary" id="save-topic">Save</button>
        </div>
      </div>
    </div>
  `;

  return {
    html,
    init: () => {
      document.getElementById('back-subjects').addEventListener('click', () => navigate('/subjects'));

      const modal = document.getElementById('topic-modal');
      const practiceModal = document.getElementById('practice-modal');
      const pyqModal = document.getElementById('pyq-modal');

      function openModal(editTopic = null) {
        document.getElementById('topic-modal-title').textContent = editTopic ? 'Edit Topic' : 'Add Topic';
        document.getElementById('topic-edit-id').value = editTopic?.id || '';
        document.getElementById('topic-name').value = editTopic?.name || '';
        document.getElementById('topic-status').value = editTopic?.status || 'not-started';
        document.getElementById('topic-difficulty').value = editTopic?.difficulty || '';
        document.getElementById('topic-revisions').value = editTopic?.revisionCount || 0;
        document.getElementById('topic-last-rev').value = editTopic?.lastRevisionDate || '';
        document.getElementById('topic-next-rev').value = editTopic?.nextRevisionDate || '';
        document.getElementById('topic-notes').value = editTopic?.notes || '';
        modal.style.display = 'flex';
      }

      function openPracticeModal(topic) {
        document.getElementById('practice-topic-name').textContent = topic.name;
        document.getElementById('practice-topic-id').value = topic.id;
        document.getElementById('prac-attempted').value = topic.questionsAttempted || topic.questionsSolved || 0;
        document.getElementById('prac-correct').value = topic.correctAnswers || topic.questionsSolved || 0;
        updatePracticeCalc();
        practiceModal.style.display = 'flex';
      }

      function openPyqModal(topic) {
        document.getElementById('pyq-topic-name').textContent = topic.name;
        document.getElementById('pyq-topic-id').value = topic.id;
        document.getElementById('pyq-attempted').value = topic.pyqsAttempted || 0;
        document.getElementById('pyq-correct').value = topic.pyqsCorrect || 0;
        document.getElementById('pyq-years').value = topic.pyqYearStr || '';
        updatePyqCalc();
        pyqModal.style.display = 'flex';
      }

      function updatePracticeCalc() {
        const attempted = Number(document.getElementById('prac-attempted').value) || 0;
        const correct = Number(document.getElementById('prac-correct').value) || 0;
        const wrong = Math.max(0, attempted - correct);
        document.getElementById('prac-wrong').value = wrong;
        document.getElementById('prac-accuracy').value = attempted > 0 ? Math.round((correct / attempted) * 100) + '%' : '0%';
      }

      function updatePyqCalc() {
        const attempted = Number(document.getElementById('pyq-attempted').value) || 0;
        const correct = Number(document.getElementById('pyq-correct').value) || 0;
        const wrong = Math.max(0, attempted - correct);
        document.getElementById('pyq-wrong').value = wrong;
        document.getElementById('pyq-accuracy').value = attempted > 0 ? Math.round((correct / attempted) * 100) + '%' : '0%';
      }

      document.getElementById('prac-attempted').addEventListener('input', updatePracticeCalc);
      document.getElementById('prac-correct').addEventListener('input', updatePracticeCalc);
      document.getElementById('pyq-attempted').addEventListener('input', updatePyqCalc);
      document.getElementById('pyq-correct').addEventListener('input', updatePyqCalc);

      document.getElementById('add-topic-btn').addEventListener('click', () => openModal());
      document.getElementById('cancel-topic').addEventListener('click', () => modal.style.display = 'none');
      document.getElementById('cancel-practice').addEventListener('click', () => practiceModal.style.display = 'none');
      document.getElementById('cancel-pyq').addEventListener('click', () => pyqModal.style.display = 'none');
      
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
      practiceModal.addEventListener('click', (e) => { if (e.target === practiceModal) practiceModal.style.display = 'none'; });
      pyqModal.addEventListener('click', (e) => { if (e.target === pyqModal) pyqModal.style.display = 'none'; });

      document.getElementById('save-practice').addEventListener('click', async () => {
        const id = Number(document.getElementById('practice-topic-id').value);
        const topic = topics.find(t => t.id === id);
        if (!topic) return;

        topic.questionsAttempted = Number(document.getElementById('prac-attempted').value) || 0;
        topic.correctAnswers = Number(document.getElementById('prac-correct').value) || 0;
        topic.wrongAnswers = Number(document.getElementById('prac-wrong').value) || 0;
        topic.practiceTimeSpent = (topic.practiceTimeSpent || 0) + (Number(document.getElementById('prac-time').value) || 0);
        
        await put('topics', topic);
        navigate('/topics/' + sid);
      });

      document.getElementById('save-pyq').addEventListener('click', async () => {
        const id = Number(document.getElementById('pyq-topic-id').value);
        const topic = topics.find(t => t.id === id);
        if (!topic) return;

        topic.pyqsAttempted = Number(document.getElementById('pyq-attempted').value) || 0;
        topic.pyqsCorrect = Number(document.getElementById('pyq-correct').value) || 0;
        topic.pyqsWrong = Number(document.getElementById('pyq-wrong').value) || 0;
        topic.pyqYearStr = document.getElementById('pyq-years').value.trim();
        
        await put('topics', topic);
        navigate('/topics/' + sid);
      });

      document.getElementById('save-topic').addEventListener('click', async () => {
        const name = document.getElementById('topic-name').value.trim();
        if (!name) return;
        const editId = document.getElementById('topic-edit-id').value;
        const revCount = Number(document.getElementById('topic-revisions').value) || 0;
        const lastRev = document.getElementById('topic-last-rev').value;
        let nextRev = document.getElementById('topic-next-rev').value;
        if (lastRev && !nextRev) {
          nextRev = getNextRevisionDate(lastRev, revCount);
        }

        const data = {
          name,
          subjectId: sid,
          status: document.getElementById('topic-status').value,
          difficulty: document.getElementById('topic-difficulty').value,
          revisionCount: revCount,
          lastRevisionDate: lastRev || null,
          nextRevisionDate: nextRev || null,
          notes: document.getElementById('topic-notes').value.trim(),
          createdAt: new Date().toISOString(),
          // Preserve practice stats
          questionsAttempted: 0,
          correctAnswers: 0,
          wrongAnswers: 0,
          practiceTimeSpent: 0,
          confidence: 0
        };

        if (editId) {
          data.id = Number(editId);
          const existing = topics.find(t => t.id === data.id);
          if (existing) {
            data.confidence = existing.confidence || 0;
            data.questionsAttempted = existing.questionsAttempted || existing.questionsSolved || 0;
            data.correctAnswers = existing.correctAnswers || existing.questionsSolved || 0;
            data.wrongAnswers = existing.wrongAnswers || 0;
            data.practiceTimeSpent = existing.practiceTimeSpent || 0;
            data.pyqsAttempted = existing.pyqsAttempted || 0;
            data.pyqsCorrect = existing.pyqsCorrect || 0;
            data.pyqsWrong = existing.pyqsWrong || 0;
            data.pyqYearStr = existing.pyqYearStr || '';
          }
          await put('topics', data);
        } else {
          await add('topics', data);
        }
        navigate('/topics/' + sid);
      });

      // Edit & Practice & PYQ buttons
      document.querySelectorAll('.edit-topic').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const topic = topics.find(t => t.id === Number(btn.dataset.id));
          if (topic) openModal(topic);
        });
      });

      document.querySelectorAll('.track-practice-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const topic = topics.find(t => t.id === Number(btn.dataset.id));
          if (topic) openPracticeModal(topic);
        });
      });

      document.querySelectorAll('.track-pyq-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const topic = topics.find(t => t.id === Number(btn.dataset.id));
          if (topic) openPyqModal(topic);
        });
      });

      // Mark Revised
      async function markRevised(topicId) {
        const topic = topics.find(t => t.id === topicId);
        if (!topic) return;
        topic.revisionCount = (topic.revisionCount || 0) + 1;
        topic.lastRevisionDate = today;
        topic.nextRevisionDate = getNextRevisionDate(today, topic.revisionCount);
        if (topic.status !== 'revision' && topic.status !== 'completed') {
          topic.status = 'revision';
        }
        await put('topics', topic);
        navigate('/topics/' + sid);
      }

      document.querySelectorAll('.mark-revised-btn, .mark-revised-inline').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          markRevised(Number(btn.dataset.id));
        });
      });

      // Status change
      document.querySelectorAll('.topic-status-select').forEach(sel => {
        sel.addEventListener('change', async (e) => {
          const id = Number(sel.dataset.id);
          const topic = topics.find(t => t.id === id);
          if (topic) {
            const newStatus = e.target.value;
            if (newStatus === 'revision' && topic.status !== 'revision') {
              topic.revisionCount = (topic.revisionCount || 0) + 1;
              topic.lastRevisionDate = today;
              topic.nextRevisionDate = getNextRevisionDate(today, topic.revisionCount);
            }
            topic.status = newStatus;
            await put('topics', topic);
            navigate('/topics/' + sid);
          }
        });
      });

      // Delete
      document.querySelectorAll('.delete-topic').forEach(btn => {
        btn.addEventListener('click', async () => {
          await del('topics', Number(btn.dataset.id));
          navigate('/topics/' + sid);
        });
      });
    }
  };
}
