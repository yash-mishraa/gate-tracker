/* ========================================
   GATE Tracker — Notes Page
   ======================================== */

import { getAll, add, put, del, getById } from '../db.js';

export async function notesPage() {
  const notes = await getAll('notes');
  const subjects = await getAll('subjects');

  const sortedNotes = [...notes].sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));

  function renderNoteCard(n) {
    const subj = subjects.find(s => s.id === n.subjectId);
    const preview = (n.content || '').slice(0, 120).replace(/\n/g, ' ');
    const dateStr = new Date(n.updatedAt || n.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return `
      <div class="note-card" data-id="${n.id}">
        <div class="note-card-header">
          <div class="note-card-title">${n.title || 'Untitled'}</div>
          <button class="btn-icon delete-note" data-id="${n.id}" title="Delete">🗑️</button>
        </div>
        <div class="note-card-preview">${preview || 'Empty note...'}</div>
        <div class="note-card-footer">
          ${subj ? `<span class="badge badge-primary">${subj.icon || '📘'} ${subj.name}</span>` : ''}
          <span class="note-card-date">${dateStr}</span>
        </div>
      </div>
    `;
  }

  const html = `
    <div class="page-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap: var(--space-md);">
      <div>
        <h1 class="page-title">Notes</h1>
        <p class="page-subtitle">${notes.length} notes</p>
      </div>
      <div style="display:flex; gap:var(--space-sm); align-items:center; flex-wrap: wrap;">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input type="text" id="notes-search" placeholder="Search notes..." />
        </div>
        <select class="form-input" id="notes-filter" style="width:auto;">
          <option value="">All Subjects</option>
          ${subjects.map(s => `<option value="${s.id}">${s.icon || '📘'} ${s.name}</option>`).join('')}
        </select>
        <button class="btn btn-primary" id="add-note-btn">+ New Note</button>
      </div>
    </div>

    <div class="notes-grid" id="notes-grid">
      ${sortedNotes.length === 0 ? '<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">📝</div><p class="empty-state-text">No notes yet. Create your first note!</p></div>' :
        sortedNotes.map(n => renderNoteCard(n)).join('')}
    </div>

    <!-- Note Editor Modal -->
    <div class="modal-overlay" id="note-modal" style="display:none">
      <div class="modal" style="max-width:700px">
        <h2 class="modal-title" id="note-modal-title">New Note</h2>
        <input type="hidden" id="note-edit-id" />
        <div class="form-group">
          <label class="form-label">Title</label>
          <input class="form-input" id="note-title" placeholder="Note title..." />
        </div>
        <div class="form-group">
          <label class="form-label">Subject (optional)</label>
          <select class="form-input" id="note-subject">
            <option value="">No subject</option>
            ${subjects.map(s => `<option value="${s.id}">${s.icon || '📘'} ${s.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Content</label>
          <textarea class="form-input note-textarea" id="note-content" rows="12" placeholder="Write your notes here... Supports plain text."></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="cancel-note">Cancel</button>
          <button class="btn btn-primary" id="save-note">Save</button>
        </div>
      </div>
    </div>
  `;

  return {
    html,
    init: () => {
      const modal = document.getElementById('note-modal');
      const grid = document.getElementById('notes-grid');

      function openEditor(note = null) {
        document.getElementById('note-modal-title').textContent = note ? 'Edit Note' : 'New Note';
        document.getElementById('note-edit-id').value = note?.id || '';
        document.getElementById('note-title').value = note?.title || '';
        document.getElementById('note-subject').value = note?.subjectId || '';
        document.getElementById('note-content').value = note?.content || '';
        modal.style.display = 'flex';
      }

      function attachListeners() {
        // Click card to edit
        document.querySelectorAll('.note-card').forEach(card => {
          card.addEventListener('click', async (e) => {
            if (e.target.closest('.delete-note')) return;
            const id = Number(card.dataset.id);
            const note = await getById('notes', id);
            if (note) openEditor(note);
          });
        });

        // Delete
        document.querySelectorAll('.delete-note').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm('Delete this note?')) {
              await del('notes', Number(btn.dataset.id));
              location.hash = '/notes';
              location.reload();
            }
          });
        });
      }

      document.getElementById('add-note-btn').addEventListener('click', () => openEditor());
      document.getElementById('cancel-note').addEventListener('click', () => modal.style.display = 'none');
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

      document.getElementById('save-note').addEventListener('click', async () => {
        const title = document.getElementById('note-title').value.trim();
        const content = document.getElementById('note-content').value.trim();
        if (!title && !content) return;
        const editId = document.getElementById('note-edit-id').value;
        const data = {
          title: title || 'Untitled',
          content,
          subjectId: Number(document.getElementById('note-subject').value) || null,
          updatedAt: new Date().toISOString(),
        };
        if (editId) {
          data.id = Number(editId);
          const existing = await getById('notes', data.id);
          data.createdAt = existing?.createdAt || data.updatedAt;
          await put('notes', data);
        } else {
          data.createdAt = data.updatedAt;
          await add('notes', data);
        }
        location.hash = '/notes';
        location.reload();
      });

      // Search
      document.getElementById('notes-search').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll('.note-card').forEach(card => {
          const text = card.textContent.toLowerCase();
          card.style.display = text.includes(query) ? '' : 'none';
        });
      });

      // Filter by subject
      document.getElementById('notes-filter').addEventListener('change', (e) => {
        const sid = Number(e.target.value);
        document.querySelectorAll('.note-card').forEach(card => {
          if (!sid) { card.style.display = ''; return; }
          const id = Number(card.dataset.id);
          const note = sortedNotes.find(n => n.id === id);
          card.style.display = (note?.subjectId === sid) ? '' : 'none';
        });
      });

      attachListeners();
    }
  };
}
