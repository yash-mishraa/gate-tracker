/* ========================================
   GATE Tracker — Subjects Page (Enhanced)
   Shows revision count and total study hours
   ======================================== */

import { getAll, add, put, del } from '../db.js';
import { navigate } from '../router.js';
import { formatDuration } from '../db.js';

export async function subjectsPage() {
  const subjects = await getAll('subjects');
  const topics = await getAll('topics');
  const sessions = await getAll('studySessions');

  const subjectData = subjects.map(sub => {
    const subTopics = topics.filter(t => t.subjectId === sub.id);
    const completed = subTopics.filter(t => t.status === 'completed').length;
    const inProgress = subTopics.filter(t => t.status === 'in-progress').length;
    const total = subTopics.length;
    const totalMins = sessions.filter(s => s.subjectId === sub.id).reduce((a, s) => a + (s.duration || 0), 0);
    const revisionCount = sub.revisionCount || subTopics.reduce((a, t) => a + (t.revisionCount || 0), 0);
    return { ...sub, completed, inProgress, total, totalMins, revisionCount, percent: total > 0 ? Math.round((completed / total) * 100) : 0 };
  });

  // Global stats
  const totalTopics = topics.length;
  const totalCompleted = topics.filter(t => t.status === 'completed').length;
  const totalHrs = Math.round(sessions.reduce((a, s) => a + (s.duration || 0), 0) / 60 * 10) / 10;

  const html = `
    <div class="page-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap: var(--space-md);">
      <div>
        <h1 class="page-title">Subjects</h1>
        <p class="page-subtitle">${subjects.length} subjects · ${totalCompleted}/${totalTopics} topics completed · ${totalHrs}h total study</p>
      </div>
      <button class="btn btn-primary" id="add-subject-btn">+ Add Subject</button>
    </div>

    <div class="subjects-grid" id="subjects-grid">
      ${subjectData.map(s => `
        <div class="subject-card" data-id="${s.id}">
          <div class="subject-card-top" style="border-left: 4px solid ${s.color || '#6366f1'}">
            <div class="subject-card-icon">${s.icon || '📘'}</div>
            <div class="subject-card-info">
              <div class="subject-card-name">${s.name}</div>
              <div class="subject-card-meta">${s.total} topics · ${Math.round(s.totalMins / 60 * 10) / 10}h studied</div>
            </div>
            <div class="subject-card-actions">
              <button class="btn-icon edit-subject" data-id="${s.id}" title="Edit">✏️</button>
              <button class="btn-icon delete-subject" data-id="${s.id}" title="Delete">🗑️</button>
            </div>
          </div>
          <div class="subject-card-stats">
            <div class="subject-mini-stat">
              <span class="subject-mini-val">${s.completed}</span>
              <span class="subject-mini-lbl">Done</span>
            </div>
            <div class="subject-mini-stat">
              <span class="subject-mini-val">${s.inProgress}</span>
              <span class="subject-mini-lbl">In Progress</span>
            </div>
            <div class="subject-mini-stat">
              <span class="subject-mini-val">${s.revisionCount}</span>
              <span class="subject-mini-lbl">Revisions</span>
            </div>
            <div class="subject-mini-stat">
              <span class="subject-mini-val">${formatDuration(s.totalMins)}</span>
              <span class="subject-mini-lbl">Study Time</span>
            </div>
          </div>
          <div class="subject-card-bottom">
            <div class="progress-bar" style="height: 6px;">
              <div class="progress-fill" style="width: ${s.percent}%; background: ${s.color || 'var(--primary-500)'}"></div>
            </div>
            <div class="subject-card-pct">${s.percent}% · ${s.completed}/${s.total} done</div>
          </div>
          <button class="btn btn-sm btn-secondary view-topics-btn" data-id="${s.id}">View Topics →</button>
        </div>
      `).join('')}
    </div>

    <!-- Add/Edit Subject Modal -->
    <div class="modal-overlay" id="subject-modal" style="display:none">
      <div class="modal">
        <h2 class="modal-title" id="subject-modal-title">Add Subject</h2>
        <input type="hidden" id="subject-edit-id" />
        <div class="form-group">
          <label class="form-label">Subject Name</label>
          <input class="form-input" id="subject-name" placeholder="e.g., Data Structures & Algorithms" />
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Color</label>
            <input class="form-input" id="subject-color" type="color" value="#6366f1" />
          </div>
          <div class="form-group">
            <label class="form-label">Icon (emoji)</label>
            <input class="form-input" id="subject-icon" placeholder="📘" maxlength="2" />
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="cancel-subject">Cancel</button>
          <button class="btn btn-primary" id="save-subject">Save</button>
        </div>
      </div>
    </div>
  `;

  return {
    html,
    init: () => {
      const modal = document.getElementById('subject-modal');

      const openModal = (editSubject = null) => {
        document.getElementById('subject-modal-title').textContent = editSubject ? 'Edit Subject' : 'Add Subject';
        document.getElementById('subject-edit-id').value = editSubject?.id || '';
        document.getElementById('subject-name').value = editSubject?.name || '';
        document.getElementById('subject-color').value = editSubject?.color || '#6366f1';
        document.getElementById('subject-icon').value = editSubject?.icon || '';
        modal.style.display = 'flex';
      };

      document.getElementById('add-subject-btn').addEventListener('click', () => openModal());
      document.getElementById('cancel-subject').addEventListener('click', () => modal.style.display = 'none');
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

      document.getElementById('save-subject').addEventListener('click', async () => {
        const name = document.getElementById('subject-name').value.trim();
        if (!name) return;
        const editId = document.getElementById('subject-edit-id').value;
        const data = {
          name,
          color: document.getElementById('subject-color').value,
          icon: document.getElementById('subject-icon').value || '📘',
          revisionCount: 0,
          createdAt: new Date().toISOString(),
        };
        if (editId) {
          data.id = Number(editId);
          const existing = subjects.find(s => s.id === data.id);
          if (existing) data.revisionCount = existing.revisionCount || 0;
          await put('subjects', data);
        } else {
          await add('subjects', data);
        }
        location.reload();
      });

      // Edit
      document.querySelectorAll('.edit-subject').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = Number(btn.dataset.id);
          const subj = subjects.find(s => s.id === id);
          if (subj) openModal(subj);
        });
      });

      // Delete
      document.querySelectorAll('.delete-subject').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm('Delete this subject and all its topics?')) {
            const id = Number(btn.dataset.id);
            await del('subjects', id);
            const relatedTopics = topics.filter(t => t.subjectId === id);
            for (const t of relatedTopics) await del('topics', t.id);
            location.reload();
          }
        });
      });

      // View topics
      document.querySelectorAll('.view-topics-btn').forEach(btn => {
        btn.addEventListener('click', () => navigate('/topics/' + btn.dataset.id));
      });

      document.querySelectorAll('.subject-card').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('.btn-icon') || e.target.closest('.view-topics-btn')) return;
          navigate('/topics/' + card.dataset.id);
        });
      });
    }
  };
}
